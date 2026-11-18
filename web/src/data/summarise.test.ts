import { describe, expect, it } from 'vitest';
import { summarise } from './expenses';

/**
 * What a month comes to, once salaries count as spending.
 *
 * The case that matters is the third one: an accounts user cannot read
 * /salaryPayments, and a refusal must not arrive as a zero. A zero would say
 * "no salaries were paid", which is a different claim from "you cannot see
 * them" — and the second is the true one.
 */
describe('summarise', () => {
  it('takes vouchers AND salaries off the money collected', () => {
    expect(summarise('2026-11', 50_000, 5_700, 30_000)).toEqual({
      month: '2026-11', income: 50_000, expense: 5_700, salary: 30_000, net: 14_300,
    });
  });

  it('is just income minus vouchers when nothing was paid in salary', () => {
    expect(summarise('2026-11', 50_000, 5_700, 0).net).toBe(44_300);
  });

  it('keeps "not visible" as null rather than letting it read as zero', () => {
    const got = summarise('2026-11', 50_000, 5_700, null);
    expect(got.salary).toBeNull();
    expect(got.net).toBe(44_300);     // the honest partial figure
  });

  it('tells the two apart: nothing paid and not allowed to look', () => {
    expect(summarise('2026-11', 0, 0, 0).salary).toBe(0);
    expect(summarise('2026-11', 0, 0, null).salary).toBeNull();
  });

  it('goes negative when a month spends more than it takes', () => {
    expect(summarise('2026-06', 1_000, 2_000, 9_000).net).toBe(-10_000);
  });

  it('is zero all round for a month with nothing in it', () => {
    expect(summarise('2026-01', 0, 0, 0)).toEqual({
      month: '2026-01', income: 0, expense: 0, salary: 0, net: 0,
    });
  });
});
