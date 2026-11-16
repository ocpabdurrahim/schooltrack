import { collection, doc, getCountFromServer, query, where } from 'firebase/firestore';
import { SCHOOL_ID, db } from '../firebase';
import { getSettings } from './admin';
import { todayInDhaka } from './attendance';
import { type DayKind, holidayMap, kindOf, listHolidays } from './attendanceReports';
import { type Expense, expensesBetween, monthRange } from './expenses';
import { type Payment, paymentsBetween } from './fees';

/**
 * The figures behind the dashboard.
 *
 * EVERY FIGURE IS BEST EFFORT AND INDEPENDENT, the same rule schoolStats
 * follows. A teacher may not read a payment and a guardian may not read the
 * settings; one refusal must never blank the rest of the screen, and must
 * never be shown as "you have no access". Each call catches its own denial and
 * returns null, and the dashboard simply leaves that panel out.
 *
 * The counts come from aggregation queries, which Firestore bills far below
 * reading the documents — that is what makes a screen somebody leaves open all
 * day affordable.
 */

const school = () => doc(db, 'schools', SCHOOL_ID);

// ---------------------------------------------------------------------------
// dates (pure)

/** The n days ending with `today`, oldest first. UTC, so no clock can shift it. */
export function lastDays(today: string, n: number): string[] {
  const [y, m, d] = today.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const t = new Date(Date.UTC(y, m - 1, d - (n - 1 - i)));
    return [
      t.getUTCFullYear(),
      String(t.getUTCMonth() + 1).padStart(2, '0'),
      String(t.getUTCDate()).padStart(2, '0'),
    ].join('-');
  });
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Monday, 16 November 2026" — for the one place a date is read, not sorted. */
export function longDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return `${DAY_NAMES[t.getUTCDay()]}, ${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

/** "November 2026". */
export function longMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

// ---------------------------------------------------------------------------
// attendance over the last few days

export type TrendDay = {
  date: string;
  kind: DayKind;
  marked: number;
  present: number;
  percent: number | null;
};

/**
 * Present out of MARKED, never out of enrolled.
 *
 * A section nobody has marked yet would otherwise drag the figure down and
 * read as truancy. Nothing marked means no percentage at all, not zero.
 */
export function percentOf(present: number, marked: number): number | null {
  if (marked <= 0) return null;
  return Math.round((present / marked) * 100);
}

export type TrendSummary = {
  taken: number;          // working days with at least one mark
  working: number;        // working days in the window
  missed: string[];       // working days with nothing marked
  average: number | null; // present of marked across the whole window
};

/**
 * The window's figure is total present over total marked — NOT the mean of the
 * daily percentages. Averaging percentages lets a day where one child was
 * marked count as much as a day where four hundred were, which is how a
 * dashboard ends up flattering a school that stopped taking attendance.
 */
export function trendSummary(days: TrendDay[]): TrendSummary {
  const working = days.filter((d) => d.kind === 'working');
  const taken = working.filter((d) => d.marked > 0);
  return {
    taken: taken.length,
    working: working.length,
    missed: working.filter((d) => d.marked === 0).map((d) => d.date),
    average: percentOf(
      taken.reduce((t, d) => t + d.present, 0),
      taken.reduce((t, d) => t + d.marked, 0),
    ),
  };
}

export async function attendanceTrend(days = 7): Promise<TrendDay[] | null> {
  const today = todayInDhaka();
  const dates = lastDays(today, days);
  const marks = collection(school(), 'attendanceMarks');

  // Both of these are allowed to fail: without them the bars are still right,
  // they just lose the weekend and holiday shading.
  const settings = await getSettings();
  const weekendDays = settings?.weekendDays?.length ? settings.weekendDays : ['FRI', 'SAT'];
  const holidays = holidayMap(await listHolidays(dates[0], today).catch(() => []));

  try {
    return await Promise.all(dates.map(async (date) => {
      const [all, here] = await Promise.all([
        getCountFromServer(query(marks, where('date', '==', date))),
        getCountFromServer(query(marks, where('date', '==', date), where('status', 'in', ['P', 'L']))),
      ]);
      const marked = all.data().count;
      const present = here.data().count;
      return { date, kind: kindOf(date, weekendDays, holidays), marked, present, percent: percentOf(present, marked) };
    }));
  } catch {
    return null;   // a role that cannot read marks gets no chart, not an error
  }
}

// ---------------------------------------------------------------------------
// money this month

export type MoneySnapshot = {
  month: string;
  collectedToday: number;
  collectedMonth: number;
  spentMonth: number | null;   // null = this role may not read expenses
  net: number | null;
  receipts: number;            // receipts written this month
  latest: Payment[];           // newest first, at most five
};

/**
 * One read of the month's payments answers today, the month and the latest
 * receipts, so the panel costs two queries rather than five.
 *
 * Income is what was COLLECTED, never what was charged — a dues figure is a
 * hope, and standing it beside real spending makes a school look solvent on
 * money nobody has handed over. (Same rule as the income/expense report.)
 */
export async function moneySnapshot(): Promise<MoneySnapshot | null> {
  const today = todayInDhaka();
  const month = today.slice(0, 7);
  const { from, to } = monthRange(month);

  let payments: Payment[];
  try {
    payments = await paymentsBetween(from, to);
  } catch {
    return null;   // a teacher cannot read a payment: no money panel for them
  }

  const expenses: Expense[] | null = await expensesBetween(from, to).catch(() => null);
  const collectedMonth = payments.reduce((t, p) => t + (p.totalAmount || 0), 0);
  const spentMonth = expenses === null ? null : expenses.reduce((t, e) => t + (e.amount || 0), 0);

  return {
    month,
    collectedToday: payments
      .filter((p) => p.paymentDate === today)
      .reduce((t, p) => t + (p.totalAmount || 0), 0),
    collectedMonth,
    spentMonth,
    net: spentMonth === null ? null : collectedMonth - spentMonth,
    receipts: payments.length,
    latest: [...payments]
      .sort((a, b) =>
        b.paymentDate.localeCompare(a.paymentDate) || b.receiptNo.localeCompare(a.receiptNo))
      .slice(0, 5),
  };
}
