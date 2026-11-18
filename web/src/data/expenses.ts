/**
 * Expenses, and the income-versus-expense report.
 *
 * Voucher numbers come from a counter in a transaction, exactly as receipt
 * numbers do — in Oracle this was a virtual column deriving EXP-000001 from
 * the id, which Firestore has no equivalent of, so the counter does it.
 *
 * An expense is never deleted. One entered wrongly is corrected by another
 * entry, so the ledger still adds up to what was actually spent.
 */
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { SCHOOL_ID, db } from '../firebase';
import { type Payment, paymentsBetween } from './fees';
import { salariesPaidBetween } from './payroll';

const school = () => doc(db, 'schools', SCHOOL_ID);
const stamp = <T extends object>(d: T) => ({ ...d, updatedAt: serverTimestamp() });

export type ExpenseHead = {
  expenseHeadId: string;
  headCode: string;
  headName: string;
  active: boolean;
  sortOrder: number;
};

export type Expense = {
  voucherNo: string;
  expenseHeadId: string;
  headName: string;
  amount: number;
  expenseDate: string;    // YYYY-MM-DD
  paidTo?: string;
  method: string;
  remarks?: string;
  enteredBy: string;
};

export const headIdFor = (code: string) =>
  code.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export async function listExpenseHeads(): Promise<ExpenseHead[]> {
  const snap = await getDocs(query(collection(school(), 'expenseHeads'), orderBy('sortOrder')));
  return snap.docs.map((d) => ({
    expenseHeadId: d.id,
    ...(d.data() as Omit<ExpenseHead, 'expenseHeadId'>),
  }));
}

export async function saveExpenseHead(h: Omit<ExpenseHead, 'expenseHeadId'> & { expenseHeadId?: string }) {
  const id = h.expenseHeadId ?? headIdFor(h.headCode);
  await setDoc(doc(school(), 'expenseHeads', id), stamp({
    headCode: h.headCode.trim().toUpperCase(),
    headName: h.headName.trim(),
    active: h.active,
    sortOrder: h.sortOrder,
  }), { merge: true });
  return id;
}

/**
 * Records one expense. The voucher number and the entry are written in one
 * transaction, and the document id IS the voucher number, so a retry cannot
 * produce a second voucher for the same spend.
 */
export async function recordExpense(input: {
  head: ExpenseHead;
  amount: number;
  expenseDate: string;
  paidTo?: string;
  method: string;
  remarks?: string;
  enteredBy: string;
}): Promise<string> {
  const counterRef = doc(school(), 'counters', 'vouchers');

  return runTransaction(db, async (tx) => {
    const counter = await tx.get(counterRef);
    const next = counter.exists() ? (counter.data().next as number) : 1;
    const voucherNo = `EXP-${String(next).padStart(6, '0')}`;

    const expense: Expense = {
      voucherNo,
      expenseHeadId: input.head.expenseHeadId,
      headName: input.head.headName,
      amount: Number(input.amount) || 0,
      expenseDate: input.expenseDate,
      paidTo: input.paidTo?.trim() || undefined,
      method: input.method,
      remarks: input.remarks?.trim() || undefined,
      enteredBy: input.enteredBy,
    };

    tx.set(doc(school(), 'expenses', voucherNo), {
      ...Object.fromEntries(Object.entries(expense).filter(([, v]) => v !== undefined)),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    tx.set(counterRef, { next: next + 1 }, { merge: true });

    return voucherNo;
  });
}

export async function expensesBetween(from: string, to: string): Promise<Expense[]> {
  const snap = await getDocs(query(
    collection(school(), 'expenses'),
    where('expenseDate', '>=', from),
    where('expenseDate', '<=', to),
    orderBy('expenseDate', 'desc'),
  ));
  return snap.docs.map((d) => d.data() as Expense);
}

export function expenseBreakdown(rows: Expense[]) {
  const byHead = new Map<string, { headName: string; amount: number }>();
  let total = 0;
  for (const e of rows) {
    total += e.amount;
    const cur = byHead.get(e.expenseHeadId) ?? { headName: e.headName, amount: 0 };
    cur.amount += e.amount;
    byHead.set(e.expenseHeadId, cur);
  }
  return {
    total,
    count: rows.length,
    byHead: [...byHead.entries()]
      .map(([expenseHeadId, v]) => ({ expenseHeadId, ...v }))
      .sort((a, b) => b.amount - a.amount),
  };
}

// ---------------------------------------------------------------------------
// income versus expense

export type MonthSummary = {
  month: string;        // YYYY-MM
  income: number;
  expense: number;      // vouchers from the expense register
  /**
   * Salaries paid in the month — or NULL, meaning "not visible to whoever is
   * looking", which is not the same as nothing having been paid.
   *
   * /salaryPayments is the head's alone: an accounts user may read fees and
   * vouchers but not what each teacher earns. Rather than quietly widen that,
   * the report says so, because two people seeing different totals for the
   * same month with no explanation is worse than one of them seeing less.
   */
  salary: number | null;
  net: number;
};

/**
 * What a month comes to.
 *
 * Salaries count as spending when they are visible. When they are not, `net`
 * is still income minus vouchers — an honest partial figure, labelled as one
 * by the screen, rather than a total that silently omits the largest cost a
 * school has.
 */
export function summarise(
  month: string,
  income: number,
  expense: number,
  salary: number | null,
): MonthSummary {
  return { month, income, expense, salary, net: income - expense - (salary ?? 0) };
}

export const monthRange = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
};

/**
 * Income is what was actually COLLECTED in the period, not what was charged:
 * a dues figure is a hope, and putting it beside real spending would make the
 * school look solvent on money nobody has handed over.
 */
export async function incomeExpense(months: string[]): Promise<MonthSummary[]> {
  const out: MonthSummary[] = [];
  for (const month of months) {
    const { from, to } = monthRange(month);
    const [payments, expenses, salaries] = await Promise.all([
      paymentsBetween(from, to).catch(() => [] as Payment[]),
      expensesBetween(from, to).catch(() => [] as Expense[]),
      // A refusal here is the ordinary answer for an accounts user, so it
      // becomes null -- "not visible" -- rather than an empty month.
      salariesPaidBetween(from, to).catch(() => null),
    ]);
    const income = payments.reduce((t, p) => t + (p.totalAmount || 0), 0);
    const expense = expenses.reduce((t, e) => t + (e.amount || 0), 0);
    // null, not 0, when the read was refused: see MonthSummary.salary
    const salary = salaries === null
      ? null
      : salaries.reduce((t, x) => t + (x.net || 0), 0);
    out.push(summarise(month, income, expense, salary));
  }
  return out;
}

/** The last n months, oldest first, ending with the one containing `today`. */
export function lastMonths(today: string, n: number): string[] {
  const [y, m] = today.split('-').map(Number);
  const months: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}
