/**
 * Fees: what is charged, what was collected, what is still owed.
 *
 * Three things here are not negotiable, and the rules enforce all three:
 *
 *   1. A RECEIPT NUMBER IS HANDED OUT BY A COUNTER, IN A TRANSACTION.
 *      Never by counting documents — two cashiers collecting at the same
 *      moment would read the same count and issue the same receipt number.
 *   2. A RECEIPT IS NEVER EDITED OR DELETED. Money taken wrongly is corrected
 *      with another document, the way the paper ledger does it.
 *   3. EVERY LINE IS A SNAPSHOT. grossAmount and discountAmount are what the
 *      fee was when it was collected, so raising a rate next year cannot
 *      rewrite last year's receipt.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { SCHOOL_ID, db } from '../firebase';
import { todayInDhaka } from './attendance';
import type { StudentDetail } from './people';
import { netRate, waiverOn } from './privileges';

const school = () => doc(db, 'schools', SCHOOL_ID);
const stamp = <T extends object>(d: T) => ({ ...d, updatedAt: serverTimestamp() });

export type Frequency = 'MONTHLY' | 'ONE_TIME' | 'EXAM';

export type FeeHead = {
  feeHeadId: string;
  headCode: string;
  headName: string;
  frequency: Frequency;
  active: boolean;
  sortOrder: number;
};

export type StructureRow = {
  id: string;
  feeHeadId: string;
  className: string;
  sessionYear: string;
  amount: number;
};

export type PaymentLine = {
  feeHeadId: string;
  headName: string;
  sessionYear: string;
  periodLabel: string;
  grossAmount: number;
  discountAmount: number;
  amountPaid: number;
};

export type Payment = {
  receiptNo: string;
  studentId: string;
  studentName: string;
  classLabel: string;
  rollNo: number;
  paymentDate: string;
  totalAmount: number;
  method: string;
  remarks?: string;
  lines: PaymentLine[];
  createdBy: string;
};

export const MONTHS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

/** The Oracle period format, kept exactly: JAN-2026, SESSION-2026. */
export const monthPeriod = (monthIndex: number, year: string) =>
  `${MONTHS[monthIndex]}-${year}`;
export const sessionPeriod = (year: string) => `SESSION-${year}`;

export const currentYear = () => todayInDhaka().slice(0, 4);
export const currentMonthIndex = () => Number(todayInDhaka().slice(5, 7)) - 1;

export const money = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// ---------------------------------------------------------------------------
// what is charged

export async function listFeeHeads(): Promise<FeeHead[]> {
  const snap = await getDocs(query(collection(school(), 'feeHeads'), orderBy('sortOrder')));
  return snap.docs.map((d) => ({ feeHeadId: d.id, ...(d.data() as Omit<FeeHead, 'feeHeadId'>) }));
}

/** The id is the head code — TUITION, EXAM, ADMISSION — so a receipt line
 *  stays readable years later without another lookup. */
export const feeHeadIdFor = (code: string) =>
  code.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export async function saveFeeHead(h: Omit<FeeHead, 'feeHeadId'> & { feeHeadId?: string }) {
  const feeHeadId = h.feeHeadId ?? feeHeadIdFor(h.headCode);
  await setDoc(
    doc(school(), 'feeHeads', feeHeadId),
    stamp({
      headCode: h.headCode.trim().toUpperCase(),
      headName: h.headName.trim(),
      frequency: h.frequency,
      active: h.active,
      sortOrder: h.sortOrder,
    }),
    { merge: true },
  );
  return feeHeadId;
}

export async function listStructure(): Promise<StructureRow[]> {
  const snap = await getDocs(collection(school(), 'feeStructure'));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StructureRow, 'id'>) }));
}

/** Keyed by head + class + session, so one rate can exist per combination and
 *  saving the same one twice corrects it rather than adding a second. */
export const structureId = (feeHeadId: string, className: string, sessionYear: string) =>
  `${feeHeadId}_${className}_${sessionYear}`.replace(/\s+/g, '-');

export async function saveStructure(r: Omit<StructureRow, 'id'>) {
  const id = structureId(r.feeHeadId, r.className, r.sessionYear);
  await setDoc(
    doc(school(), 'feeStructure', id),
    stamp({
      feeHeadId: r.feeHeadId,
      className: r.className,
      sessionYear: r.sessionYear,
      amount: Number(r.amount) || 0,
    }),
    { merge: true },
  );
  return id;
}

// ---------------------------------------------------------------------------
// collecting

export type Collectable = {
  head: FeeHead;
  periodLabel: string;
  /**
   * What THIS student is charged for this period: the card rate, less
   * whatever their privilege waives. The receipt line snapshots this figure,
   * so a rate change later never rewrites what was billed.
   */
  grossAmount: number;
  /**
   * Taken off the card rate by the student's privilege, for the screen to
   * show. It is NOT a discount: it never reaches a receipt as one, because a
   * waiver counted twice is a waiver that leaves nothing owing.
   */
  waived: number;
  paid: number;          // money already taken for this head + period
  discount: number;      // discount already allowed on it
};

/**
 * What is left to pay. A DISCOUNT SETTLES ITS SHARE: 500 billed, 100 allowed
 * and 400 taken leaves nothing owing. Treating the discount as unpaid left
 * every discounted month showing a residue for ever, which is how a dues list
 * turns into a list nobody believes.
 */
export const outstanding = (c: Collectable) =>
  Math.max(0, c.grossAmount - c.paid - c.discount);

/**
 * What this student could be asked to pay this session, with anything already
 * collected subtracted.
 *
 * MONTHLY heads are expected up to the current month only — billing a parent
 * in March for December is how a dues list loses its credibility. EXAM heads
 * are not predicted at all: until the exams module exists nothing here knows
 * how many exams there will be, so they are offered as an extra line the
 * collector names, never as an automatic due.
 */
export async function collectablesFor(
  student: StudentDetail,
  sessionYear: string,
): Promise<Collectable[]> {
  const [heads, structure, settled] = await Promise.all([
    listFeeHeads(),
    listStructure(),
    settledByPeriod(student.studentId),
  ]);

  const thisYear = sessionYear === currentYear();
  const lastMonth = thisYear ? currentMonthIndex() : 11;
  const out: Collectable[] = [];
  const already = (feeHeadId: string, periodLabel: string) =>
    settled.get(`${feeHeadId}|${periodLabel}`) ?? { paid: 0, discount: 0 };

  /**
   * One period of one head, charged at this student's own rate.
   *
   * A period their privilege wipes out entirely is NOT offered: there is
   * nothing to take, and a row of noughts only invites somebody to type into
   * it. It does still appear when money was taken against it before the
   * privilege was granted, so nothing already paid can vanish from the page.
   */
  const add = (head: FeeHead, periodLabel: string, cardRate: number) => {
    const waived = waiverOn(head.feeHeadId, cardRate, student.privilege);
    const charge = Math.max(0, cardRate - waived);
    const taken = already(head.feeHeadId, periodLabel);
    if (charge <= 0 && !taken.paid && !taken.discount) return;
    out.push({ head, periodLabel, grossAmount: charge, waived, ...taken });
  };

  for (const head of heads.filter((h) => h.active !== false)) {
    const row = structure.find(
      (r) => r.feeHeadId === head.feeHeadId &&
             r.className === student.className &&
             r.sessionYear === sessionYear,
    );
    if (!row || !row.amount) continue;

    if (head.frequency === 'MONTHLY') {
      for (let m = 0; m <= lastMonth; m++) add(head, monthPeriod(m, sessionYear), row.amount);
    } else if (head.frequency === 'ONE_TIME') {
      add(head, sessionPeriod(sessionYear), row.amount);
    }
  }

  return out;
}

/**
 * What has already been settled for one student, per head+period — money taken
 * and discount allowed kept apart, because only one of them is income.
 */
export async function settledByPeriod(
  studentId: string,
): Promise<Map<string, { paid: number; discount: number }>> {
  const snap = await getDocs(query(
    collection(school(), 'payments'),
    where('studentId', '==', studentId),
  ));

  const sums = new Map<string, { paid: number; discount: number }>();
  for (const d of snap.docs) {
    for (const line of (d.data().lines ?? []) as PaymentLine[]) {
      const key = `${line.feeHeadId}|${line.periodLabel}`;
      const cur = sums.get(key) ?? { paid: 0, discount: 0 };
      cur.paid += Number(line.amountPaid) || 0;
      cur.discount += Number(line.discountAmount) || 0;
      sums.set(key, cur);
    }
  }
  return sums;
}

/**
 * Takes the money. The receipt number and the receipt itself are written in
 * ONE transaction: if the counter cannot move, no receipt exists, and no two
 * receipts can ever carry the same number.
 *
 * The document id IS the receipt number, so a retry cannot produce a second
 * copy of the same receipt.
 */
export async function collectPayment(input: {
  student: StudentDetail;
  lines: PaymentLine[];
  method: string;
  paymentDate: string;
  remarks?: string;
  createdBy: string;
}): Promise<string> {
  const total = input.lines.reduce((t, l) => t + (Number(l.amountPaid) || 0), 0);
  if (!input.lines.length) throw new Error('nothing to collect');

  const counterRef = doc(school(), 'counters', 'receipts');

  return runTransaction(db, async (tx) => {
    const counter = await tx.get(counterRef);
    const next = counter.exists() ? (counter.data().next as number) : 1;
    const receiptNo = `RCPT-${String(next).padStart(6, '0')}`;

    const payment: Payment = {
      receiptNo,
      studentId: input.student.studentId,
      studentName: input.student.fullName,
      classLabel: `${input.student.className} - ${input.student.section}`,
      rollNo: input.student.rollNo,
      paymentDate: input.paymentDate,
      totalAmount: total,
      method: input.method,
      remarks: input.remarks?.trim() || undefined,
      lines: input.lines,
      createdBy: input.createdBy,
    };

    tx.set(doc(school(), 'payments', receiptNo), {
      ...payment,
      ...(payment.remarks ? {} : { remarks: null }),
      // Which sessions this receipt pays for, denormalised so dues can be
      // answered with ONE query. Without it the only handle is paymentDate,
      // and a fee for next session paid in advance in December would be
      // counted against the wrong year.
      sessionYears: [...new Set(input.lines.map((l) => l.sessionYear))],
      createdAt: serverTimestamp(),
    });
    tx.set(counterRef, { next: next + 1 }, { merge: true });

    return receiptNo;
  });
}

// ---------------------------------------------------------------------------
// reading back

export async function getPayment(receiptNo: string): Promise<Payment | null> {
  const snap = await getDoc(doc(school(), 'payments', receiptNo));
  return snap.exists() ? (snap.data() as Payment) : null;
}

export async function paymentsBetween(from: string, to: string): Promise<Payment[]> {
  const snap = await getDocs(query(
    collection(school(), 'payments'),
    where('paymentDate', '>=', from),
    where('paymentDate', '<=', to),
    orderBy('paymentDate', 'desc'),
  ));
  return snap.docs.map((d) => d.data() as Payment);
}

export async function paymentsFor(studentId: string): Promise<Payment[]> {
  const snap = await getDocs(query(
    collection(school(), 'payments'),
    where('studentId', '==', studentId),
  ));
  return snap.docs
    .map((d) => d.data() as Payment)
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
}

export async function paymentsForSession(sessionYear: string): Promise<Payment[]> {
  const snap = await getDocs(query(
    collection(school(), 'payments'),
    where('sessionYears', 'array-contains', sessionYear),
  ));
  return snap.docs.map((d) => d.data() as Payment);
}

export type Dues = {
  student: StudentDetail;
  expected: number;
  paid: number;        // money taken
  discount: number;    // allowed, and therefore not owed
  due: number;
};

/**
 * Dues for a whole section in THREE queries, not three per student: the rate
 * card and every receipt for the session are fetched once and matched up in
 * memory. A page that costs one read per student is the kind that quietly
 * becomes unusable at 400 students.
 *
 * Expected follows the same rule as the collect screen — monthly heads up to
 * the current month only, exam heads never predicted — so the two screens can
 * never disagree about what a parent owes.
 */
export async function duesFor(
  students: StudentDetail[],
  sessionYear: string,
): Promise<Dues[]> {
  const [heads, structure, payments] = await Promise.all([
    listFeeHeads(),
    listStructure(),
    paymentsForSession(sessionYear),
  ]);

  const perStudent = new Map<string, { paid: number; discount: number }>();
  for (const p of payments) {
    for (const l of p.lines ?? []) {
      if (l.sessionYear !== sessionYear) continue;
      const cur = perStudent.get(p.studentId) ?? { paid: 0, discount: 0 };
      cur.paid += Number(l.amountPaid) || 0;
      cur.discount += Number(l.discountAmount) || 0;
      perStudent.set(p.studentId, cur);
    }
  }

  const thisYear = sessionYear === currentYear();
  const months = (thisYear ? currentMonthIndex() : 11) + 1;

  return students.map((student) => {
    let expected = 0;
    for (const head of heads.filter((h) => h.active !== false)) {
      const row = structure.find(
        (r) => r.feeHeadId === head.feeHeadId &&
               r.className === student.className &&
               r.sessionYear === sessionYear,
      );
      if (!row?.amount) continue;
      // The student's OWN rate: a privilege is a standing change to what they
      // are charged, so it belongs in the expectation, not in the allowances.
      const rate = netRate(head.feeHeadId, row.amount, student.privilege);
      if (head.frequency === 'MONTHLY') expected += rate * months;
      else if (head.frequency === 'ONE_TIME') expected += rate;
    }

    // A discount is not a debt: it reduces what is owed, exactly as it does
    // on the collect screen, so the two can never disagree.
    const { paid, discount } = perStudent.get(student.studentId) ?? { paid: 0, discount: 0 };
    return { student, expected, paid, discount, due: Math.max(0, expected - paid - discount) };
  });
}

/** One day's takings, broken down by fee head — the Daily Collection report. */
export function breakdown(payments: Payment[]) {
  const byHead = new Map<string, { headName: string; amount: number }>();
  const byMethod = new Map<string, number>();
  let total = 0;

  for (const p of payments) {
    byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.totalAmount);
    total += p.totalAmount;
    for (const l of p.lines ?? []) {
      const cur = byHead.get(l.feeHeadId) ?? { headName: l.headName, amount: 0 };
      cur.amount += Number(l.amountPaid) || 0;
      byHead.set(l.feeHeadId, cur);
    }
  }

  return {
    total,
    receipts: payments.length,
    byHead: [...byHead.entries()].map(([feeHeadId, v]) => ({ feeHeadId, ...v }))
      .sort((a, b) => b.amount - a.amount),
    byMethod: [...byMethod.entries()].map(([method, amount]) => ({ method, amount })),
  };
}

// ---------------------------------------------------------------------------
// one student's fee position, for the student page

export type StudentFees = {
  receipts: Payment[] | null;   // null = not allowed to see them
  expected: number | null;      // null = the rate card is not readable
  paid: number;
  discount: number;
  due: number | null;
};

/**
 * Deliberately tolerant about denials, because three different people open
 * this: an accounts user sees everything; a teacher may read neither receipts
 * nor the rate card; a GUARDIAN may read their own child's receipts but NOT
 * the fee heads, so they can be shown what was paid but never a computed due.
 * Each part is fetched separately and a refusal just means that part is null.
 */
// ---------------------------------------------------------------------------
// one student's fees, head by head -- what a parent is shown

export type FeeLine = {
  feeHeadId: string;
  headName: string;
  frequency: Frequency | null;   // null = the head is gone from the rate card
  /** Per period for THIS student: the class rate less any privilege waiver.
   *  null = no rate is set for the class. */
  rate: number | null;
  periods: number;               // how many periods are counted so far
  charged: number;
  /** Taken off the class rate across those periods by the privilege. */
  waived: number;
  paid: number;
  discount: number;
  balance: number;
};

export type FeeStatement = {
  sessionYear: string;
  lines: FeeLine[];
  charged: number;
  /** What the privilege took off the bill this session, over every line. */
  waived: number;
  paid: number;
  discount: number;
  outstanding: number;
};

/**
 * What this student owes and has paid, head by head.
 *
 * Three rules carried from the dues screen, because a parent and the office
 * must never be shown different arithmetic:
 *
 *   1. A MONTHLY fee is counted up to the month the school has reached, never
 *      to the end of the year. Nobody owes December in August.
 *   2. A ONE-TIME fee is counted once.
 *   3. AN EXAM FEE IS NEVER PREDICTED. It is charged when the exam happens, so
 *      it appears here only once something has actually been paid against it.
 *
 * A head that has payments but no rate for this class still gets a line — an
 * exam fee, or a head since removed from the card — so every taka a parent has
 * handed over is accounted for somewhere. The balance of such a line is 0:
 * money paid against nothing owed is not a debt.
 *
 * Outstanding is the sum of the line balances, not charged minus paid: paying
 * two months of tuition in advance does not settle an unpaid admission fee,
 * and showing it as though it did would tell a parent they owe nothing.
 */
export function feeStatement(
  heads: FeeHead[],
  structure: StructureRow[],
  receipts: Payment[],
  className: string,
  sessionYear: string,
  monthsCounted: number,
  /** The student's standing arrangement. Required, not defaulted: a caller
   *  that forgets it would bill a free place the full rate. */
  privilege: string | null | undefined,
): FeeStatement {
  const paidByHead = new Map<string, { headName: string; paid: number; discount: number }>();
  for (const p of receipts) {
    for (const l of p.lines ?? []) {
      if (l.sessionYear !== sessionYear) continue;
      const at = paidByHead.get(l.feeHeadId) ?? { headName: l.headName, paid: 0, discount: 0 };
      at.paid += Number(l.amountPaid) || 0;
      at.discount += Number(l.discountAmount) || 0;
      paidByHead.set(l.feeHeadId, at);
    }
  }

  const lines: FeeLine[] = [];

  for (const head of heads.filter((h) => h.active !== false)) {
    const row = structure.find(
      (r) => r.feeHeadId === head.feeHeadId &&
             r.className === className &&
             r.sessionYear === sessionYear,
    );
    const money = paidByHead.get(head.feeHeadId);
    paidByHead.delete(head.feeHeadId);
    if (!row?.amount && !money) continue;   // not charged to this class, nothing paid

    const cardRate = row?.amount ?? null;
    const rate = cardRate === null ? null : netRate(head.feeHeadId, cardRate, privilege);
    const periods = rate === null ? 0
      : head.frequency === 'MONTHLY' ? monthsCounted
      : head.frequency === 'ONE_TIME' ? 1
      : 0;                                   // EXAM: never predicted
    const charged = rate === null ? 0 : rate * periods;
    const waived = cardRate === null ? 0 : (cardRate - (rate ?? 0)) * periods;
    const paid = money?.paid ?? 0;
    const discount = money?.discount ?? 0;

    lines.push({
      feeHeadId: head.feeHeadId,
      headName: head.headName,
      frequency: head.frequency,
      rate,
      periods,
      charged,
      waived,
      paid,
      discount,
      balance: Math.max(0, charged - paid - discount),
    });
  }

  // whatever was paid against a head that is no longer on the card
  for (const [feeHeadId, money] of paidByHead) {
    lines.push({
      feeHeadId,
      headName: money.headName || feeHeadId,
      frequency: null,
      rate: null,
      periods: 0,
      charged: 0,
      waived: 0,
      paid: money.paid,
      discount: money.discount,
      balance: 0,
    });
  }

  return {
    sessionYear,
    lines,
    charged: lines.reduce((t, l) => t + l.charged, 0),
    waived: lines.reduce((t, l) => t + l.waived, 0),
    paid: lines.reduce((t, l) => t + l.paid, 0),
    discount: lines.reduce((t, l) => t + l.discount, 0),
    outstanding: lines.reduce((t, l) => t + l.balance, 0),
  };
}

/** The months of the session counted so far: all twelve for a past year. */
export const monthsCountedFor = (sessionYear: string) =>
  (sessionYear === currentYear() ? currentMonthIndex() : 11) + 1;

/** The rate card and the receipts a fees report is built from. */
export async function feeReport(
  student: StudentDetail,
  sessionYear: string,
): Promise<{ statement: FeeStatement; receipts: Payment[] } | null> {
  try {
    const [heads, structure, receipts] = await Promise.all([
      listFeeHeads(),
      listStructure(),
      paymentsFor(student.studentId),
    ]);
    return {
      statement: feeStatement(
        heads, structure, receipts, student.className, sessionYear,
        monthsCountedFor(sessionYear), student.privilege,
      ),
      receipts,
    };
  } catch {
    return null;   // a teacher may read none of this; the page says so
  }
}

export async function studentFees(
  student: StudentDetail,
  sessionYear: string,
): Promise<StudentFees> {
  const receipts = await paymentsFor(student.studentId).catch(() => null);

  // The same arithmetic as the fees report, from the same function: the
  // student page and a parent's statement must never disagree.
  let expected: number | null = null;
  try {
    const [heads, structure] = await Promise.all([listFeeHeads(), listStructure()]);
    expected = feeStatement(
      heads, structure, receipts ?? [], student.className, sessionYear,
      monthsCountedFor(sessionYear), student.privilege,
    ).charged;
  } catch {
    expected = null;
  }

  let paid = 0;
  let discount = 0;
  for (const p of receipts ?? []) {
    for (const l of p.lines ?? []) {
      if (l.sessionYear !== sessionYear) continue;
      paid += Number(l.amountPaid) || 0;
      discount += Number(l.discountAmount) || 0;
    }
  }

  return {
    receipts,
    expected,
    paid,
    discount,
    due: expected === null ? null : Math.max(0, expected - paid - discount),
  };
}
