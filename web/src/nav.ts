import type { Access } from './auth';

/**
 * What the navigation contains.
 *
 * Kept as data, apart from the component that draws it, for two reasons: the
 * role filtering is the same rule the routes enforce and is worth testing
 * directly, and a flat list of twenty-five links had no structure to test at
 * all — it just grew until it scrolled off the side of the screen.
 *
 * A group with nothing in it for this person is not rendered. That is how a
 * teacher's bar ends up with four menus rather than seven empty ones.
 */

export type Need = 'staff' | 'admin' | 'money' | 'records';

export type NavItem = {
  label: string;
  to: string;
  needs: Need;
  /** A line under the label in the menu, where the label alone is not enough. */
  hint?: string;
};

export type NavGroup = { label: string; items: NavItem[] };

export const HOME = { label: 'Home', to: '/' };

const ALL: NavGroup[] = [
  {
    label: 'Students',
    items: [
      { label: 'All students', to: '/students', needs: 'staff', hint: 'search by name, roll or class' },
      { label: 'Add a student', to: '/students/new', needs: 'records' },
      { label: 'ID cards', to: '/id-cards', needs: 'records', hint: 'printed sheet, with the QR code' },
      { label: 'Certificates', to: '/certificates', needs: 'records', hint: 'testimonial, transfer, character' },
    ],
  },
  {
    label: 'Attendance',
    items: [
      { label: "Today's register", to: '/attendance', needs: 'staff' },
      { label: 'Scan ID cards', to: '/scan', needs: 'staff', hint: 'at the gate' },
      { label: 'Monthly sheet', to: '/attendance/monthly', needs: 'staff' },
      { label: 'Low attendance', to: '/attendance/low', needs: 'staff' },
      { label: 'Holidays', to: '/attendance/holidays', needs: 'admin', hint: 'the calendar every percentage counts from' },
    ],
  },
  {
    label: 'Exams',
    items: [
      { label: 'Enter marks', to: '/marks', needs: 'staff' },
      { label: 'Results', to: '/results', needs: 'staff', hint: 'result sheet and tabulation' },
      { label: 'Seat plan', to: '/exams/seat-plan', needs: 'staff' },
      { label: 'Admit cards', to: '/exams/admit-cards', needs: 'records' },
      { label: 'Exam routine', to: '/exams/routine', needs: 'admin' },
      { label: 'Exams and subjects', to: '/exams', needs: 'admin' },
    ],
  },
  {
    label: 'Fees',
    items: [
      { label: 'Collect a fee', to: '/fees/collect', needs: 'money' },
      { label: 'Receipts', to: '/fees/receipts', needs: 'money', hint: "a day's collection" },
      { label: 'Dues', to: '/fees/dues', needs: 'money' },
      { label: 'Fee setup', to: '/fees/setup', needs: 'admin', hint: 'heads and what each class pays' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Expenses', to: '/expenses', needs: 'money' },
      { label: 'Income and expense', to: '/reports/income-expense', needs: 'money', hint: 'month by month' },
      { label: 'Pay salary', to: '/payroll/pay', needs: 'admin' },
      { label: 'Salary register', to: '/payroll/register', needs: 'admin' },
      { label: 'Salary structure', to: '/payroll', needs: 'admin', hint: 'scale, increments, deductions' },
    ],
  },
  {
    label: 'Setup',
    items: [
      { label: 'Classes and sections', to: '/classes', needs: 'admin' },
      { label: 'Staff', to: '/staff', needs: 'admin' },
      { label: 'Who can sign in', to: '/users', needs: 'admin', hint: 'staff roles and guardians' },
      { label: 'School setup', to: '/setup', needs: 'admin', hint: 'name, session, weekend' },
    ],
  },
];

/** The same rules the route guards use — written once, read by both. */
export function allows(access: Access, needs: Need): boolean {
  if (access.kind !== 'staff') return false;
  switch (needs) {
    case 'staff': return true;
    case 'admin': return access.role === 'ADMIN';
    // a teacher cannot read a payment at all, so the screen would only refuse
    case 'money': return access.role === 'ADMIN' || access.role === 'ACCOUNTS';
    // student records are the office's work as much as the head's
    case 'records': return access.role === 'ADMIN' || access.role === 'OFFICE';
  }
}

export function menuFor(access: Access): NavGroup[] {
  return ALL
    .map((g) => ({ ...g, items: g.items.filter((i) => allows(access, i.needs)) }))
    .filter((g) => g.items.length > 0);
}

/**
 * Whether a path is inside a menu entry.
 *
 * Prefix matching on a path BOUNDARY, never a bare startsWith: '/students'
 * must not light up for a route like '/students-archive', and a receipt at
 * '/fees/receipts/RCPT-000001' must light up Receipts.
 */
export function covers(to: string, pathname: string): boolean {
  if (to === '/') return pathname === '/';
  return pathname === to || pathname.startsWith(`${to}/`);
}

/**
 * The entry a path belongs to — the LONGEST match wins, so '/students/new'
 * is "Add a student" rather than "All students", which both cover it.
 */
export function activeItem(groups: NavGroup[], pathname: string): { group: NavGroup; item: NavItem } | null {
  let best: { group: NavGroup; item: NavItem } | null = null;
  for (const group of groups) {
    for (const item of group.items) {
      if (covers(item.to, pathname) && (best === null || item.to.length > best.item.to.length)) {
        best = { group, item };
      }
    }
  }
  return best;
}
