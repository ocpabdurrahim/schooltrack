import { describe, expect, it } from 'vitest';
import {
  type SalaryStructure,
  applyIncrement,
  computeSalary,
  dueForIncrement,
  emptyStructure,
  monthsBetween,
  paymentId,
} from './payroll';

/**
 * The same cases exist in android/.../PayrollTest.kt. Two apps must not
 * disagree about what someone is owed.
 */

const structure = (over: Partial<SalaryStructure> = {}): SalaryStructure => ({
  ...emptyStructure('7', 'A Teacher'),
  basic: 20000, houseRent: 8000, medical: 1000, transport: 500,
  providentFund: 2000, tax: 500,
  ...over,
});

describe('computeSalary', () => {
  it('adds the allowances and takes off the deductions', () => {
    expect(computeSalary(structure())).toEqual({
      gross: 29500, totalDeduction: 2500, net: 27000,
    });
  });

  it('treats missing figures as zero rather than NaN', () => {
    const s = { ...emptyStructure('1', 'New'), basic: 1000 } as SalaryStructure;
    expect(computeSalary(s)).toEqual({ gross: 1000, totalDeduction: 0, net: 1000 });
  });

  it('never returns a negative net', () => {
    const s = structure({ basic: 1000, houseRent: 0, medical: 0, transport: 0, tax: 9000 });
    expect(computeSalary(s).net).toBe(0);
  });
});

describe('monthsBetween', () => {
  it('counts whole months only', () => {
    expect(monthsBetween('2025-01-15', '2026-01-15')).toBe(12);
    expect(monthsBetween('2025-01-15', '2026-01-14')).toBe(11);  // a day short
    expect(monthsBetween('2025-01-15', '2026-02-01')).toBe(12);
    expect(monthsBetween('2026-01-01', '2026-01-01')).toBe(0);
  });
});

describe('dueForIncrement', () => {
  it('is due twelve months after the last one, not in January', () => {
    const joinedNovember = structure({ incrementAmount: 1000, lastIncrementDate: '2025-11-20' });
    expect(dueForIncrement(joinedNovember, '2026-01-31')).toBe(false);
    expect(dueForIncrement(joinedNovember, '2026-11-19')).toBe(false);
    expect(dueForIncrement(joinedNovember, '2026-11-20')).toBe(true);
  });

  it('is due at once when no increment has ever been given', () => {
    expect(dueForIncrement(structure({ incrementAmount: 500 }), '2026-11-16')).toBe(true);
  });

  it('is never due when there is no increment to give', () => {
    expect(dueForIncrement(structure({ incrementAmount: 0 }), '2030-01-01')).toBe(false);
  });
});

describe('applyIncrement', () => {
  it('raises the basic and records the date', () => {
    const before = structure({ incrementAmount: 1500, lastIncrementDate: '2025-11-20' });
    const after = applyIncrement(before, '2026-11-20');
    expect(after.basic).toBe(21500);
    expect(after.lastIncrementDate).toBe('2026-11-20');
    // the allowances are untouched: they are amounts, not percentages
    expect(after.houseRent).toBe(before.houseRent);
  });

  it('is not due again straight afterwards', () => {
    const after = applyIncrement(structure({ incrementAmount: 1500 }), '2026-11-20');
    expect(dueForIncrement(after, '2026-11-21')).toBe(false);
  });
});

describe('paymentId', () => {
  it('is one per person per month, so a repeat corrects rather than pays twice', () => {
    expect(paymentId('7', '2026-11')).toBe('7_2026-11');
    expect(paymentId('7', '2026-11')).toBe(paymentId('7', '2026-11'));
    expect(paymentId('7', '2026-12')).not.toBe(paymentId('7', '2026-11'));
  });
});
