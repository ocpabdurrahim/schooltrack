import { describe, expect, it } from 'vitest';
import {
  type FeeHead,
  type Payment,
  type PaymentLine,
  type StructureRow,
  feeStatement,
} from './fees';

/** The same cases exist in android/.../FeesTest.kt. */

const head = (id: string, name: string, frequency: FeeHead['frequency']): FeeHead => ({
  feeHeadId: id, headCode: id, headName: name, frequency, active: true, sortOrder: 0,
});

const HEADS = [
  head('TUITION', 'Tuition fee', 'MONTHLY'),
  head('ADMISSION', 'Admission fee', 'ONE_TIME'),
  head('EXAM', 'Exam fee', 'EXAM'),
];

const rate = (feeHeadId: string, amount: number, className = 'Class 6', sessionYear = '2026'): StructureRow => ({
  id: `${feeHeadId}_${className}_${sessionYear}`, feeHeadId, className, sessionYear, amount,
});

const STRUCTURE = [rate('TUITION', 300), rate('ADMISSION', 1000), rate('EXAM', 200)];

const line = (
  feeHeadId: string,
  amountPaid: number,
  discountAmount = 0,
  sessionYear = '2026',
): PaymentLine => ({
  feeHeadId,
  headName: HEADS.find((h) => h.feeHeadId === feeHeadId)?.headName ?? feeHeadId,
  sessionYear,
  periodLabel: 'JAN-2026',
  grossAmount: amountPaid + discountAmount,
  discountAmount,
  amountPaid,
});

const receipt = (receiptNo: string, lines: PaymentLine[]): Payment => ({
  receiptNo, studentId: '76', studentName: 'Ayesha', classLabel: 'Class 6 - A', rollNo: 1,
  paymentDate: '2026-08-08', totalAmount: lines.reduce((t, l) => t + l.amountPaid, 0),
  method: 'Cash', lines, createdBy: 'accounts@test.local',
});

const statement = (receipts: Payment[], months = 8, privilege = 'Regular') =>
  feeStatement(HEADS, STRUCTURE, receipts, 'Class 6', '2026', months, privilege);

describe('feeStatement', () => {
  it('counts a monthly fee up to the month reached, never to the year end', () => {
    // Nobody owes December in August.
    const s = statement([], 8);
    const tuition = s.lines.find((l) => l.feeHeadId === 'TUITION')!;
    expect(tuition.periods).toBe(8);
    expect(tuition.charged).toBe(2400);
  });

  it('counts a one-time fee once', () => {
    const admission = statement([]).lines.find((l) => l.feeHeadId === 'ADMISSION')!;
    expect(admission.periods).toBe(1);
    expect(admission.charged).toBe(1000);
  });

  it('never predicts an exam fee, but still names its rate', () => {
    // The line is there, because a parent is entitled to know an exam fee
    // exists and what it costs. What it is NOT is a debt: charged stays 0
    // until the exam happens and the office takes the money.
    const exam = statement([]).lines.find((l) => l.feeHeadId === 'EXAM')!;
    expect(exam.rate).toBe(200);
    expect(exam.periods).toBe(0);
    expect(exam.charged).toBe(0);
    expect(exam.balance).toBe(0);
    expect(statement([]).outstanding).toBe(2400 + 1000);   // tuition and admission only
  });

  it('shows an exam fee once something has been paid against it, owing nothing', () => {
    const s = statement([receipt('RCPT-1', [line('EXAM', 200)])]);
    const exam = s.lines.find((l) => l.feeHeadId === 'EXAM')!;
    expect(exam.paid).toBe(200);
    expect(exam.charged).toBe(0);
    expect(exam.balance).toBe(0);
  });

  it('nets payments and discounts off the head they were paid against', () => {
    const s = statement([receipt('RCPT-1', [line('TUITION', 1500, 300)])]);
    const tuition = s.lines.find((l) => l.feeHeadId === 'TUITION')!;
    expect(tuition.paid).toBe(1500);
    expect(tuition.discount).toBe(300);
    expect(tuition.balance).toBe(2400 - 1500 - 300);
  });

  it('never shows a negative balance for an overpayment', () => {
    const s = statement([receipt('RCPT-1', [line('TUITION', 5000)])]);
    expect(s.lines.find((l) => l.feeHeadId === 'TUITION')!.balance).toBe(0);
  });

  it('does not let one head settle another', () => {
    // Two months of tuition paid in advance do not settle the admission fee,
    // and a total that said so would tell a parent they owe nothing.
    const s = statement([receipt('RCPT-1', [line('TUITION', 5000)])]);
    expect(s.outstanding).toBe(1000);        // the admission fee, still owed
    expect(s.charged - s.paid).toBeLessThan(0);
  });

  it('ignores lines from another session', () => {
    const s = statement([receipt('RCPT-1', [line('TUITION', 900, 0, '2025')])]);
    expect(s.paid).toBe(0);
    expect(s.lines.find((l) => l.feeHeadId === 'TUITION')!.balance).toBe(2400);
  });

  it('still accounts for money paid against a head that has left the card', () => {
    const s = feeStatement(
      HEADS, STRUCTURE,
      [receipt('RCPT-1', [{ ...line('LIBRARY', 150), headName: 'Library fee' }])],
      'Class 6', '2026', 8, 'Regular',
    );
    const library = s.lines.find((l) => l.feeHeadId === 'LIBRARY')!;
    expect(library.headName).toBe('Library fee');
    expect(library.paid).toBe(150);
    expect(library.balance).toBe(0);
    expect(s.paid).toBe(150);
  });

  it('leaves out a head this class is not charged for', () => {
    const s = feeStatement(HEADS, [rate('TUITION', 300)], [], 'Class 6', '2026', 8, 'Regular');
    expect(s.lines.map((l) => l.feeHeadId)).toEqual(['TUITION']);
    expect(s.charged).toBe(2400);
  });

  it('adds the totals up from the lines', () => {
    const s = statement([
      receipt('RCPT-1', [line('TUITION', 1200), line('ADMISSION', 1000, 100)]),
    ]);
    expect(s.charged).toBe(2400 + 1000);
    expect(s.paid).toBe(2200);
    expect(s.discount).toBe(100);
    expect(s.outstanding).toBe(1200);        // tuition only; admission is settled
  });

  it('charges a half-fee student half the tuition, and the rest in full', () => {
    const s = statement([], 8, 'Half fee');
    const tuition = s.lines.find((l) => l.feeHeadId === 'TUITION')!;
    expect(tuition.rate).toBe(150);          // the card says 300
    expect(tuition.charged).toBe(1200);      // 150 x 8, not 2400
    expect(tuition.waived).toBe(1200);
    const admission = s.lines.find((l) => l.feeHeadId === 'ADMISSION')!;
    expect(admission.waived).toBe(0);        // only tuition is ever waived
    expect(admission.charged).toBe(1000);
  });

  it('charges a donor family and a scholarship no tuition at all', () => {
    for (const p of ['Donor family', 'Scholarship']) {
      const s = statement([], 8, p);
      const tuition = s.lines.find((l) => l.feeHeadId === 'TUITION')!;
      expect(tuition.charged).toBe(0);
      expect(tuition.waived).toBe(2400);
      expect(s.charged).toBe(1000);          // the admission fee, in full
      expect(s.outstanding).toBe(1000);
    }
  });

  it('reads a blank privilege as the full rate, never as a free place', () => {
    for (const p of ['', null, undefined]) {
      expect(statement([], 8, p as unknown as string).charged).toBe(3400);
    }
  });

  it('settles a privileged month with the smaller payment, leaving nothing owing', () => {
    // A half-fee student hands over 150 for January: that month is done.
    const s = statement([receipt('RCPT-1', [line('TUITION', 150)])], 1, 'Half fee');
    const tuition = s.lines.find((l) => l.feeHeadId === 'TUITION')!;
    expect(tuition.charged).toBe(150);
    expect(tuition.paid).toBe(150);
    expect(tuition.balance).toBe(0);
  });
});
