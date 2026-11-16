import { describe, expect, it } from 'vitest';
import type { Access, Role } from './auth';
import { activeItem, covers, menuFor } from './nav';

const staffAs = (role: Role): Access => ({ kind: 'staff', role, name: role, email: `${role}@test.local` });
const GUARDIAN: Access = { kind: 'guardian', name: 'Parent', email: 'p@test.local', studentIds: ['76'] };
const NONE: Access = { kind: 'none', email: 'nobody@test.local' };

const labels = (access: Access) => menuFor(access).map((g) => g.label);
const items = (access: Access, group: string) =>
  menuFor(access).find((g) => g.label === group)?.items.map((i) => i.label) ?? [];

describe('who sees which menus', () => {
  it('gives an administrator everything', () => {
    expect(labels(staffAs('ADMIN')))
      .toEqual(['Students', 'Attendance', 'Exams', 'Fees', 'Finance', 'Setup']);
  });

  it('gives a teacher no money and no setup at all', () => {
    // Not an empty Fees menu — no Fees menu. A teacher cannot read a payment,
    // so every item in it would refuse.
    expect(labels(staffAs('TEACHER'))).toEqual(['Students', 'Attendance', 'Exams']);
    expect(items(staffAs('TEACHER'), 'Students')).toEqual(['All students']);
    expect(items(staffAs('TEACHER'), 'Attendance')).not.toContain('Holidays');
    expect(items(staffAs('TEACHER'), 'Exams')).toEqual(['Enter marks', 'Results', 'Seat plan']);
  });

  it('gives the accounts user the money screens but not the records', () => {
    expect(labels(staffAs('ACCOUNTS'))).toEqual(['Students', 'Attendance', 'Exams', 'Fees', 'Finance']);
    expect(items(staffAs('ACCOUNTS'), 'Fees')).toEqual(['Collect a fee', 'Receipts', 'Dues']);
    expect(items(staffAs('ACCOUNTS'), 'Finance')).toEqual(['Expenses', 'Income and expense']);
    expect(items(staffAs('ACCOUNTS'), 'Students')).toEqual(['All students']);
  });

  it('gives the office the student records but no money', () => {
    expect(labels(staffAs('OFFICE'))).toEqual(['Students', 'Attendance', 'Exams']);
    expect(items(staffAs('OFFICE'), 'Students'))
      .toEqual(['All students', 'Add a student', 'ID cards', 'Certificates']);
  });

  it('gives a guardian and an unknown account no menus whatsoever', () => {
    expect(menuFor(GUARDIAN)).toEqual([]);
    expect(menuFor(NONE)).toEqual([]);
  });
});

describe('covers', () => {
  it('matches a path on a boundary, never halfway through a word', () => {
    expect(covers('/students', '/students')).toBe(true);
    expect(covers('/students', '/students/76')).toBe(true);
    expect(covers('/students', '/students-archive')).toBe(false);
  });

  it('matches Home only exactly', () => {
    expect(covers('/', '/')).toBe(true);
    expect(covers('/', '/students')).toBe(false);
  });
});

describe('activeItem', () => {
  const menu = menuFor(staffAs('ADMIN'));

  it('lights up the entry a deep page belongs to', () => {
    // the receipt a collection opens is still Receipts, not Collect a fee
    expect(activeItem(menu, '/fees/receipts/RCPT-000001')?.item.label).toBe('Receipts');
    expect(activeItem(menu, '/students/76')?.item.label).toBe('All students');
    expect(activeItem(menu, '/payroll/payslip/abc')?.item.label).toBe('Salary structure');
  });

  it('prefers the longest match, so a child route beats its parent', () => {
    expect(activeItem(menu, '/students/new')?.item.label).toBe('Add a student');
    expect(activeItem(menu, '/attendance/monthly')?.item.label).toBe('Monthly sheet');
    expect(activeItem(menu, '/attendance')?.item.label).toBe("Today's register");
    expect(activeItem(menu, '/exams/routine')?.item.label).toBe('Exam routine');
    expect(activeItem(menu, '/exams')?.item.label).toBe('Exams and subjects');
  });

  it('names the menu a page sits under, which is what the bar highlights', () => {
    expect(activeItem(menu, '/fees/dues')?.group.label).toBe('Fees');
    expect(activeItem(menu, '/reports/income-expense')?.group.label).toBe('Finance');
  });

  it('is null for a page outside the menu', () => {
    expect(activeItem(menu, '/')).toBeNull();
    expect(activeItem(menu, '/report/half-yearly-2026/76')).toBeNull();
  });
});
