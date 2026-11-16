import { describe, expect, it } from 'vitest';
import { type Expense, expenseBreakdown, headIdFor, lastMonths, monthRange } from './expenses';

/** The same cases exist in android/.../ExpensesTest.kt. */

const e = (headId: string, headName: string, amount: number): Expense => ({
  voucherNo: 'EXP-000001', expenseHeadId: headId, headName, amount,
  expenseDate: '2026-11-16', method: 'Cash', enteredBy: 'x@y.z',
});

describe('monthRange', () => {
  it('ends on the real last day of the month', () => {
    expect(monthRange('2026-11')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('knows February in a leap year', () => {
    expect(monthRange('2028-02').to).toBe('2028-02-29');
  });
});

describe('lastMonths', () => {
  it('ends with the month containing today, oldest first', () => {
    expect(lastMonths('2026-11-16', 3)).toEqual(['2026-09', '2026-10', '2026-11']);
  });

  it('crosses the year boundary', () => {
    expect(lastMonths('2026-02-01', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});

describe('expenseBreakdown', () => {
  it('totals by head, biggest first', () => {
    const b = expenseBreakdown([
      e('SALARY', 'Salary', 1000),
      e('REPAIR', 'Repair', 2500),
      e('SALARY', 'Salary', 500),
    ]);
    expect(b.total).toBe(4000);
    expect(b.count).toBe(3);
    expect(b.byHead.map((x) => [x.expenseHeadId, x.amount])).toEqual([
      ['REPAIR', 2500],
      ['SALARY', 1500],
    ]);
  });

  it('copes with nothing spent', () => {
    expect(expenseBreakdown([])).toEqual({ total: 0, count: 0, byHead: [] });
  });
});

describe('headIdFor', () => {
  it('makes a readable, stable id', () => {
    expect(headIdFor('repair')).toBe('REPAIR');
    expect(headIdFor('Office & stationery')).toBe('OFFICE_STATIONERY');
    expect(headIdFor('  tiffin  ')).toBe('TIFFIN');
  });
});
