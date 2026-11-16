import { describe, expect, it } from 'vitest';
import type { Status } from './attendance';
import {
  belowThreshold,
  daysInMonth,
  kindOf,
  monthlySheet,
  weekdayOf,
  workingDays,
} from './attendanceReports';

/** The same cases exist in android/.../AttendanceReportsTest.kt. */

const WEEKEND = ['FRI', 'SAT'];

describe('weekdayOf', () => {
  it('reads the day in UTC, so a device clock cannot shift it', () => {
    expect(weekdayOf('2026-11-16')).toBe('MON');
    expect(weekdayOf('2026-11-20')).toBe('FRI');
    expect(weekdayOf('2026-11-21')).toBe('SAT');
  });
});

describe('daysInMonth', () => {
  it('ends on the real last day', () => {
    expect(daysInMonth('2026-11')).toHaveLength(30);
    expect(daysInMonth('2026-02')).toHaveLength(28);
    expect(daysInMonth('2028-02')).toHaveLength(29);
  });
});

describe('kindOf', () => {
  const holidays = new Map([['2026-11-16', 'Test holiday']]);

  it('tells a holiday, a weekend and a working day apart', () => {
    expect(kindOf('2026-11-16', WEEKEND, holidays)).toBe('holiday');
    expect(kindOf('2026-11-20', WEEKEND, holidays)).toBe('weekend');
    expect(kindOf('2026-11-17', WEEKEND, holidays)).toBe('working');
  });

  it('calls a holiday a holiday even when it falls on a weekend', () => {
    const onFriday = new Map([['2026-11-20', 'Falls on a Friday']]);
    expect(kindOf('2026-11-20', WEEKEND, onFriday)).toBe('holiday');
  });
});

describe('workingDays', () => {
  it('drops weekends and holidays, counting a holiday on a weekend only once', () => {
    const noHolidays = workingDays('2026-11', WEEKEND, new Map());
    // November 2026 has 30 days; 8 of them are Fri/Sat
    expect(noHolidays).toHaveLength(22);

    const withWeekdayHoliday = workingDays('2026-11', WEEKEND, new Map([['2026-11-17', 'x']]));
    expect(withWeekdayHoliday).toHaveLength(21);

    const withWeekendHoliday = workingDays('2026-11', WEEKEND, new Map([['2026-11-20', 'x']]));
    expect(withWeekendHoliday).toHaveLength(22);   // already not a working day
  });
});

describe('monthlySheet', () => {
  const students = [
    { studentId: '1', fullName: 'A', rollNo: 1 },
    { studentId: '2', fullName: 'B', rollNo: 2 },
    { studentId: '3', fullName: 'C', rollNo: 3 },
  ];
  const mark = (studentId: string, date: string, status: Status) => ({ studentId, date, status });
  const marks = [
    mark('1', '2026-11-16', 'P'), mark('1', '2026-11-17', 'L'), mark('1', '2026-11-18', 'A'),
    mark('2', '2026-11-16', 'A'), mark('2', '2026-11-17', 'A'), mark('2', '2026-11-18', 'E'),
  ];
  const rows = monthlySheet(students, marks);

  it('counts late as present', () => {
    expect(rows[0].present).toBe(2);
    expect(rows[0].absent).toBe(1);
    expect(rows[0].percent).toBe(66.7);
  });

  it('counts leave separately from absence', () => {
    expect(rows[1].leave).toBe(1);
    expect(rows[1].absent).toBe(2);
    expect(rows[1].present).toBe(0);
    expect(rows[1].percent).toBe(0);
  });

  it('gives no percentage at all to a student with nothing marked', () => {
    expect(rows[2].marked).toBe(0);
    expect(rows[2].percent).toBeNull();
  });

  it('keeps each day so the grid can be drawn', () => {
    expect(rows[0].byDay['2026-11-17']).toBe('L');
  });
});

describe('belowThreshold', () => {
  const rows = monthlySheet(
    [
      { studentId: '1', fullName: 'A', rollNo: 1 },
      { studentId: '2', fullName: 'B', rollNo: 2 },
      { studentId: '3', fullName: 'C', rollNo: 3 },
    ],
    [
      { studentId: '1', date: '2026-11-16', status: 'P' as Status },
      { studentId: '2', date: '2026-11-16', status: 'A' as Status },
    ],
  );

  it('lists the worst first', () => {
    expect(belowThreshold(rows, 75).map((r) => r.studentId)).toEqual(['2']);
  });

  it('leaves out a student with nothing marked — unmarked is not absent', () => {
    // student 3 has no marks at all; even at a threshold nothing can pass,
    // they must not appear, while the one on 0% must
    const listed = belowThreshold(rows, 100).map((r) => r.studentId);
    expect(listed).toContain('2');
    expect(listed).not.toContain('3');
  });

  it('does not list a student who is exactly on the threshold', () => {
    // student 1 is on 100%, which is not BELOW 100
    expect(belowThreshold(rows, 100).map((r) => r.studentId)).not.toContain('1');
  });
});
