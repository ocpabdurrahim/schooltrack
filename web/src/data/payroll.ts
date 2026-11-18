/**
 * Payroll: what each member of staff is paid, and the record of paying them.
 *
 * Two integrity rules, both enforced by the document id rather than by hope:
 *
 *   1. ONE PAYMENT PER PERSON PER MONTH. The id is staffId_YYYY-MM, so paying
 *      the same month twice corrects the record instead of paying twice.
 *   2. A PAYSLIP IS A SNAPSHOT. Every figure is copied onto the payment, so
 *      raising someone's basic next year cannot rewrite last year's payslip.
 *
 * Only an ADMIN may read any of this — the rules keep salaries away from
 * teachers and the accounts user alike.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { SCHOOL_ID, db } from '../firebase';

const school = () => doc(db, 'schools', SCHOOL_ID);
const stamp = <T extends object>(d: T) => ({ ...d, updatedAt: serverTimestamp() });

export type SalaryStructure = {
  staffId: string;
  staffName: string;
  designation?: string;
  basic: number;
  houseRent: number;
  medical: number;
  transport: number;
  otherAllowance: number;
  providentFund: number;
  tax: number;
  otherDeduction: number;
  /** the annual increment, in taka, added to the basic once a year */
  incrementAmount: number;
  lastIncrementDate?: string;   // YYYY-MM-DD
};

export const emptyStructure = (staffId: string, staffName: string): SalaryStructure => ({
  staffId, staffName,
  basic: 0, houseRent: 0, medical: 0, transport: 0, otherAllowance: 0,
  providentFund: 0, tax: 0, otherDeduction: 0,
  incrementAmount: 0,
});

export type Salary = { gross: number; totalDeduction: number; net: number };

/** Gross, deductions and net. Allowances are amounts, not percentages: a
 *  percentage silently recalculates old payslips when the basic changes. */
export function computeSalary(s: SalaryStructure): Salary {
  const gross = n(s.basic) + n(s.houseRent) + n(s.medical) + n(s.transport) + n(s.otherAllowance);
  const totalDeduction = n(s.providentFund) + n(s.tax) + n(s.otherDeduction);
  return { gross, totalDeduction, net: Math.max(0, gross - totalDeduction) };
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Is this person due their annual increment?
 *
 * Twelve months after the last one, not "in January": staff join in different
 * months, and an increment that lands on everyone in January quietly gives a
 * teacher who joined in November a thirteen-month first year.
 */
export function dueForIncrement(s: SalaryStructure, today: string): boolean {
  if (!s.incrementAmount) return false;
  if (!s.lastIncrementDate) return true;
  return monthsBetween(s.lastIncrementDate, today) >= 12;
}

export function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;     // not a full month yet
  return months;
}

/** Applies the increment to the basic and records when it happened. */
export function applyIncrement(s: SalaryStructure, today: string): SalaryStructure {
  return { ...s, basic: n(s.basic) + n(s.incrementAmount), lastIncrementDate: today };
}

// ---------------------------------------------------------------------------
// structures

export async function listStructures(): Promise<SalaryStructure[]> {
  const snap = await getDocs(collection(school(), 'salaryStructure'));
  return snap.docs.map((d) => ({ staffId: d.id, ...(d.data() as Omit<SalaryStructure, 'staffId'>) }));
}

export async function saveStructure(s: SalaryStructure) {
  await setDoc(doc(school(), 'salaryStructure', s.staffId), stamp({
    staffName: s.staffName,
    designation: s.designation ?? null,
    basic: n(s.basic),
    houseRent: n(s.houseRent),
    medical: n(s.medical),
    transport: n(s.transport),
    otherAllowance: n(s.otherAllowance),
    providentFund: n(s.providentFund),
    tax: n(s.tax),
    otherDeduction: n(s.otherDeduction),
    incrementAmount: n(s.incrementAmount),
    lastIncrementDate: s.lastIncrementDate ?? null,
  }), { merge: true });
}

// ---------------------------------------------------------------------------
// payments

export type SalaryPayment = SalaryStructure & Salary & {
  month: string;        // YYYY-MM
  paidOn: string;       // YYYY-MM-DD
  method: string;
  paidBy: string;
  remarks?: string;
};

export const paymentId = (staffId: string, month: string) => `${staffId}_${month}`;

export async function paymentsForMonth(month: string): Promise<SalaryPayment[]> {
  const snap = await getDocs(query(
    collection(school(), 'salaryPayments'),
    where('month', '==', month),
  ));
  return snap.docs.map((d) => d.data() as SalaryPayment);
}

/**
 * Salaries PAID between two dates.
 *
 * By `paidOn`, not by `month`: this school pays a month's salary in the month
 * that follows, and the income side of the report is what was actually
 * collected. Counting October's salary as October spending against November's
 * fee income would make both months lie.
 *
 * ADMIN ONLY, like everything in /salaryPayments — see the rules. A refusal
 * here is a normal answer for the accounts user, not a fault, and the caller
 * is expected to treat it as "not visible" rather than "zero".
 */
export async function salariesPaidBetween(from: string, to: string): Promise<SalaryPayment[]> {
  const snap = await getDocs(query(
    collection(school(), 'salaryPayments'),
    where('paidOn', '>=', from),
    where('paidOn', '<=', to),
  ));
  return snap.docs.map((d) => d.data() as SalaryPayment);
}

export async function getPayment(id: string): Promise<SalaryPayment | null> {
  const snap = await getDoc(doc(school(), 'salaryPayments', id));
  return snap.exists() ? (snap.data() as SalaryPayment) : null;
}

export async function paymentsForStaff(staffId: string): Promise<SalaryPayment[]> {
  const snap = await getDocs(query(
    collection(school(), 'salaryPayments'),
    where('staffId', '==', staffId),
  ));
  return snap.docs
    .map((d) => d.data() as SalaryPayment)
    .sort((a, b) => b.month.localeCompare(a.month));
}

/**
 * Pays a month's salaries in one batch. Each document id is staffId_month, so
 * running it twice for the same month corrects rather than pays again — and
 * the screen that calls this shows who has already been paid, so the second
 * run is a deliberate correction rather than an accident.
 */
export async function paySalaries(input: {
  month: string;
  paidOn: string;
  method: string;
  paidBy: string;
  structures: SalaryStructure[];
  remarks?: string;
}) {
  const batch = writeBatch(db);
  for (const s of input.structures) {
    const salary = computeSalary(s);
    const id = paymentId(s.staffId, input.month);
    batch.set(doc(school(), 'salaryPayments', id), {
      ...s,
      designation: s.designation ?? null,
      lastIncrementDate: s.lastIncrementDate ?? null,
      ...salary,
      month: input.month,
      paidOn: input.paidOn,
      method: input.method,
      paidBy: input.paidBy,
      remarks: input.remarks ?? null,
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

export const monthLabel = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  const names = ['January', 'February', 'March', 'April', 'May', 'June',
                 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${names[(m || 1) - 1]} ${y}`;
};

export const thisMonth = (today: string) => today.slice(0, 7);
