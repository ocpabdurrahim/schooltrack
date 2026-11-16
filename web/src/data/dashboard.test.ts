import { describe, expect, it } from 'vitest';
import {
  type TrendDay,
  lastDays,
  longDate,
  longMonth,
  percentOf,
  trendSummary,
} from './dashboard';

const day = (date: string, marked: number, present: number, kind: TrendDay['kind'] = 'working'): TrendDay =>
  ({ date, kind, marked, present, percent: percentOf(present, marked) });

describe('lastDays', () => {
  it('ends with today and runs oldest first', () => {
    expect(lastDays('2026-11-16', 7)).toEqual([
      '2026-11-10', '2026-11-11', '2026-11-12',
      '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16',
    ]);
  });

  it('crosses a month boundary', () => {
    expect(lastDays('2026-03-02', 4)).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
  });

  it('crosses a leap day and a year', () => {
    expect(lastDays('2028-03-01', 2)).toEqual(['2028-02-29', '2028-03-01']);
    expect(lastDays('2027-01-01', 2)).toEqual(['2026-12-31', '2027-01-01']);
  });
});

describe('percentOf', () => {
  it('is present out of marked', () => {
    expect(percentOf(18, 24)).toBe(75);
    expect(percentOf(24, 24)).toBe(100);
  });

  it('gives no percentage when nothing was marked — unmarked is not absent', () => {
    expect(percentOf(0, 0)).toBeNull();
  });
});

describe('trendSummary', () => {
  it('weighs the window by children marked, not by days', () => {
    // One child marked present on Monday must not count as much as four
    // hundred on Tuesday: the mean of the daily percentages would say 75%.
    const days = [day('2026-11-16', 1, 1), day('2026-11-17', 400, 200)];
    expect(trendSummary(days).average).toBe(50);
  });

  it('ignores weekends and holidays entirely', () => {
    const days = [
      day('2026-11-20', 0, 0, 'weekend'),
      day('2026-11-21', 0, 0, 'holiday'),
      day('2026-11-22', 10, 9),
    ];
    const s = trendSummary(days);
    expect(s.working).toBe(1);
    expect(s.taken).toBe(1);
    expect(s.missed).toEqual([]);
    expect(s.average).toBe(90);
  });

  it('names the working days nobody marked', () => {
    const days = [day('2026-11-16', 0, 0), day('2026-11-17', 20, 20)];
    const s = trendSummary(days);
    expect(s.missed).toEqual(['2026-11-16']);
    expect(s.taken).toBe(1);
    expect(s.working).toBe(2);
    expect(s.average).toBe(100);
  });

  it('has no figure at all for a window with nothing marked', () => {
    expect(trendSummary([day('2026-11-16', 0, 0)]).average).toBeNull();
  });
});

describe('longDate and longMonth', () => {
  it('read the date in UTC', () => {
    expect(longDate('2026-11-16')).toBe('Monday, 16 November 2026');
    expect(longDate('2026-01-01')).toBe('Thursday, 1 January 2026');
    expect(longMonth('2026-11')).toBe('November 2026');
  });
});
