/**
 * The attendance reports: the monthly sheet, the low-attendance list and the
 * holidays those two depend on.
 *
 * A working day is a day that is neither a weekend nor a holiday. Getting
 * that wrong makes every percentage wrong, which is why it is computed in one
 * place and tested on both sides.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { SCHOOL_ID, db } from '../firebase';
import type { Status } from './attendance';

const school = () => doc(db, 'schools', SCHOOL_ID);

export type Holiday = { date: string; name: string; source?: string };

export const WEEKDAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** The weekday code for a date, read in UTC so a device's clock cannot shift it. */
export function weekdayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return WEEKDAY_CODES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function daysInMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) =>
    `${month}-${String(i + 1).padStart(2, '0')}`);
}

export type DayKind = 'working' | 'weekend' | 'holiday';

export function kindOf(
  date: string,
  weekendDays: string[],
  holidays: Map<string, string>,
): DayKind {
  if (holidays.has(date)) return 'holiday';
  if (weekendDays.includes(weekdayOf(date))) return 'weekend';
  return 'working';
}

/**
 * The working days of a month.
 *
 * A holiday that falls on a weekend is counted once, not twice — it is simply
 * not a working day either way, and double-counting it would quietly shrink
 * the month a school is measured against.
 */
export function workingDays(
  month: string,
  weekendDays: string[],
  holidays: Map<string, string>,
): string[] {
  return daysInMonth(month).filter((d) => kindOf(d, weekendDays, holidays) === 'working');
}

// ---------------------------------------------------------------------------
// holidays

export async function listHolidays(from?: string, to?: string): Promise<Holiday[]> {
  const base = collection(school(), 'holidays');
  const q = from && to
    ? query(base, where('date', '>=', from), where('date', '<=', to), orderBy('date'))
    : query(base, orderBy('date'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Holiday);
}

export async function saveHoliday(h: Holiday) {
  await setDoc(
    doc(school(), 'holidays', h.date),
    { date: h.date, name: h.name.trim(), source: h.source ?? 'SCHOOL', updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/** Holidays are the one thing here that CAN be deleted: a day wrongly marked
 *  as a holiday has to come back, and nothing else points at the record. */
export async function removeHoliday(date: string) {
  await deleteDoc(doc(school(), 'holidays', date));
}

export const holidayMap = (holidays: Holiday[]) =>
  new Map(holidays.map((h) => [h.date, h.name]));

// ---------------------------------------------------------------------------
// the monthly sheet

export type MonthlyRow = {
  studentId: string;
  fullName: string;
  rollNo: number;
  byDay: Record<string, Status>;
  present: number;     // P and L both count as present
  absent: number;
  leave: number;
  marked: number;
  percent: number | null;
};

export async function marksForMonth(classId: string, month: string) {
  const days = daysInMonth(month);
  const snap = await getDocs(query(
    collection(school(), 'attendanceMarks'),
    where('classId', '==', classId),
    where('date', '>=', days[0]),
    where('date', '<=', days[days.length - 1]),
  ));
  return snap.docs.map((d) => d.data() as {
    studentId: string; date: string; status: Status;
  });
}

/**
 * Every mark for one section between two dates.
 *
 * The same shape and the same index as marksForMonth — the section first, the
 * date range second — so a year costs one query rather than one per student,
 * which is what makes a figure per student affordable on a list of 78.
 */
export async function marksBetween(classId: string, from: string, to: string) {
  const snap = await getDocs(query(
    collection(school(), 'attendanceMarks'),
    where('classId', '==', classId),
    where('date', '>=', from),
    where('date', '<=', to),
  ));
  return snap.docs.map((d) => d.data() as {
    studentId: string; date: string; status: Status;
  });
}

export type AttendanceTotal = {
  present: number;     // P and L both count as present, as everywhere here
  marked: number;
  percent: number | null;
};

/**
 * How much of what was marked each student was there for.
 *
 * Of the days MARKED, not of the working days: a week nobody took the register
 * must not read as a week of truancy on a list the office acts on. A student
 * with nothing marked has no percentage at all rather than a zero.
 */
export function attendanceTotals(
  students: { studentId: string }[],
  marks: { studentId: string; status: Status }[],
): Map<string, AttendanceTotal> {
  const out = new Map<string, AttendanceTotal>();
  for (const s of students) out.set(s.studentId, { present: 0, marked: 0, percent: null });

  for (const m of marks) {
    const row = out.get(m.studentId);
    if (!row) continue;                       // a mark for somebody not on this list
    row.marked += 1;
    if (m.status === 'P' || m.status === 'L') row.present += 1;
  }

  for (const row of out.values()) {
    row.percent = row.marked ? Math.round((row.present / row.marked) * 1000) / 10 : null;
  }
  return out;
}

/**
 * One section's month.
 *
 * The percentage is of days MARKED, the same rule as everywhere else in this
 * app — not of the working days in the month. A section that was not marked
 * for a fortnight would otherwise show every child as a truant.
 */
export function monthlySheet(
  students: { studentId: string; fullName: string; rollNo: number }[],
  marks: { studentId: string; date: string; status: Status }[],
): MonthlyRow[] {
  return students.map((s) => {
    const mine = marks.filter((m) => m.studentId === s.studentId);
    const byDay: Record<string, Status> = {};
    for (const m of mine) byDay[m.date] = m.status;

    const present = mine.filter((m) => m.status === 'P' || m.status === 'L').length;
    const absent = mine.filter((m) => m.status === 'A').length;
    const leave = mine.filter((m) => m.status === 'E').length;
    const marked = mine.length;

    return {
      ...s,
      byDay,
      present,
      absent,
      leave,
      marked,
      percent: marked ? Math.round((present / marked) * 1000) / 10 : null,
    };
  });
}

// ---------------------------------------------------------------------------
// one student's month -- what a parent is shown

export type DayCell = {
  date: string;
  kind: DayKind;
  holiday?: string;
  status: Status | null;   // null = nothing was marked that day
};

export type StudentMonth = {
  month: string;
  days: DayCell[];
  present: number;      // P and L both count as present, as everywhere here
  late: number;         // and L is also counted on its own, for the parent
  absent: number;
  leave: number;
  marked: number;
  workingDays: number;
  notMarked: number;    // working days the school recorded nothing at all
  percent: number | null;
};

/**
 * One student, one month, day by day.
 *
 * The percentage is of the days MARKED, the same rule as every other figure in
 * this app. A fortnight nobody marked would otherwise read as a fortnight of
 * truancy on a parent's screen, which is a serious thing to tell a parent
 * wrongly. The days the school marked nothing are reported separately instead.
 *
 * A mark on a weekend or a holiday still counts as marked: if the school opened
 * and took attendance, the child was either there or not, and hiding it would
 * make the figures disagree with the register.
 */
export function studentMonth(
  month: string,
  marks: { date: string; status: Status }[],
  weekendDays: string[],
  holidays: Map<string, string>,
): StudentMonth {
  const byDay = new Map(marks.map((m) => [m.date, m.status]));

  const days: DayCell[] = daysInMonth(month).map((date) => ({
    date,
    kind: kindOf(date, weekendDays, holidays),
    holiday: holidays.get(date),
    status: byDay.get(date) ?? null,
  }));

  const count = (...of: Status[]) => days.filter((d) => d.status !== null && of.includes(d.status)).length;
  const marked = days.filter((d) => d.status !== null).length;
  const present = count('P', 'L');

  return {
    month,
    days,
    present,
    late: count('L'),
    absent: count('A'),
    leave: count('E'),
    marked,
    workingDays: days.filter((d) => d.kind === 'working').length,
    notMarked: days.filter((d) => d.kind === 'working' && d.status === null).length,
    percent: marked ? Math.round((present / marked) * 1000) / 10 : null,
  };
}

/** One student's marks for a month. Ordered to match the index the per-student
 *  history already uses (studentId, date DESC); the sheet sorts its own days. */
export async function marksForStudentMonth(studentId: string, month: string) {
  const days = daysInMonth(month);
  const snap = await getDocs(query(
    collection(school(), 'attendanceMarks'),
    where('studentId', '==', studentId),
    where('date', '>=', days[0]),
    where('date', '<=', days[days.length - 1]),
    orderBy('date', 'desc'),
  ));
  return snap.docs.map((d) => d.data() as { date: string; status: Status });
}

/** Everyone below the threshold, worst first. Students with nothing marked
 *  are left out: they are not absentees, they are unmarked. */
export function belowThreshold(rows: MonthlyRow[], threshold: number) {
  return rows
    .filter((r) => r.percent !== null && r.percent < threshold)
    .sort((a, b) => (a.percent ?? 0) - (b.percent ?? 0));
}
