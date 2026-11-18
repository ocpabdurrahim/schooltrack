import { describe, expect, it } from 'vitest';
import type { Status } from './attendance';
import {
  belowThreshold,
  daysInMonth,
  kindOf,
  monthlySheet,
  studentMonth,
  weekdayOf,
  workingDays,
  attendanceTotals,
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

describe("one student's month, as a parent is shown it", () => {
  // November 2026: Fri 13 / Sat 14 are the weekend, and the 16th is a holiday
  const holidays = new Map([['2026-11-16', 'Victory Day']]);
  const marks = [
    { date: '2026-11-10', status: 'P' as Status },
    { date: '2026-11-11', status: 'A' as Status },
    { date: '2026-11-12', status: 'L' as Status },
    { date: '2026-11-17', status: 'E' as Status },
  ];

  const month = studentMonth('2026-11', marks, WEEKEND, holidays);

  it('lays out every day of the month, in order', () => {
    expect(month.days).toHaveLength(30);
    expect(month.days[0].date).toBe('2026-11-01');
    expect(month.days[29].date).toBe('2026-11-30');
  });

  it('counts a late as present, and also as late', () => {
    expect(month.present).toBe(2);    // the P and the L
    expect(month.late).toBe(1);
    expect(month.absent).toBe(1);
    expect(month.leave).toBe(1);
    expect(month.marked).toBe(4);
    expect(month.percent).toBe(50);   // 2 present of 4 marked
  });

  it('marks the weekend and names the holiday', () => {
    const byDate = (d: string) => month.days.find((x) => x.date === d)!;
    expect(byDate('2026-11-13').kind).toBe('weekend');
    expect(byDate('2026-11-16').kind).toBe('holiday');
    expect(byDate('2026-11-16').holiday).toBe('Victory Day');
    expect(byDate('2026-11-17').kind).toBe('working');
  });

  it('reports the working days nobody marked instead of calling them absences', () => {
    // 30 days, 8 weekend days, 1 holiday => 21 working days, 4 of them marked
    expect(month.workingDays).toBe(21);
    expect(month.notMarked).toBe(21 - 4);
    expect(month.absent).toBe(1);
  });

  it('gives no percentage at all for a month with nothing marked', () => {
    const empty = studentMonth('2026-11', [], WEEKEND, holidays);
    expect(empty.percent).toBeNull();
    expect(empty.marked).toBe(0);
    expect(empty.notMarked).toBe(21);
  });

  it('still counts a mark made on a holiday — the register is the truth', () => {
    const onHoliday = studentMonth(
      '2026-11',
      [{ date: '2026-11-16', status: 'P' as Status }],
      WEEKEND,
      holidays,
    );
    expect(onHoliday.marked).toBe(1);
    expect(onHoliday.percent).toBe(100);
    expect(onHoliday.workingDays).toBe(21);   // the holiday is still a holiday
  });
});

// ---------------------------------------------------------------------------
// the figure on the student list

describe('attendanceTotals', () => {
  const students = [{ studentId: 'a' }, { studentId: 'b' }, { studentId: 'c' }];

  it('counts present and late as present, the same as everywhere else', () => {
    const got = attendanceTotals(students, [
      { studentId: 'a', status: 'P' as const },
      { studentId: 'a', status: 'L' as const },
      { studentId: 'a', status: 'A' as const },
      { studentId: 'a', status: 'E' as const },
    ]);
    expect(got.get('a')).toEqual({ present: 2, marked: 4, percent: 50 });
  });

  it('is of the days MARKED, not of the days in the range', () => {
    // A week nobody took the register is not a week of truancy.
    const got = attendanceTotals(students, [{ studentId: 'b', status: 'P' as const }]);
    expect(got.get('b')).toEqual({ present: 1, marked: 1, percent: 100 });
  });

  it('gives a student with nothing marked no percentage at all', () => {
    const got = attendanceTotals(students, []);
    expect(got.get('c')).toEqual({ present: 0, marked: 0, percent: null });
  });

  it('has a row for every student, marked or not', () => {
    expect([...attendanceTotals(students, []).keys()]).toEqual(['a', 'b', 'c']);
  });

  it('ignores a mark belonging to somebody not on this list', () => {
    const got = attendanceTotals(students, [
      { studentId: 'a', status: 'P' as const },
      { studentId: 'zzz', status: 'A' as const },
    ]);
    expect(got.size).toBe(3);
    expect(got.get('a')?.marked).toBe(1);
  });
});
