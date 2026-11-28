import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { SCHOOL_ID, db } from '../firebase';
import { type Status, todayInDhaka } from './attendance';

export type StudentDetail = {
  studentId: string;
  fullName: string;
  rollNo: number;
  regNo?: string;
  classId: string;
  className: string;
  section: string;
  groupName?: string;
  /**
   * Islam, Hindu or Other, as the school's own table has it. It decides which
   * religion paper the student sits, so it is a marks field, not a detail.
   */
  religion?: string;
  /**
   * The standing fee arrangement: Regular, Scholarship, Donor family or Half
   * fee. It changes the tuition this student is charged every month, so it is
   * a money field, not a detail. Missing means Regular — see privileges.ts.
   */
  privilege?: string;
  /**
   * The optional (4th) paper this student takes — Higher Maths or Agriculture
   * here. It decides which papers they sit, so it belongs beside the group and
   * the religion rather than among the contact details.
   */
  optionalSubjectId?: string;
  gender?: string;
  dob?: string;
  fatherName?: string;
  motherName?: string;
  bloodGroup?: string;
  mobileNo?: string;
  status: 'A' | 'I';
};

const school = () => doc(db, 'schools', SCHOOL_ID);

export async function getStudent(studentId: string): Promise<StudentDetail | null> {
  const snap = await getDoc(doc(school(), 'students', studentId));
  if (!snap.exists()) return null;
  return { studentId, ...(snap.data() as Omit<StudentDetail, 'studentId'>) };
}

/**
 * Students for the browser list.
 *
 * Firestore has no "contains" search, so the name filter is applied in the
 * browser over the section's students. That is fine at this size — a section
 * is tens of rows — and it keeps the query simple and index-free. If the roll
 * grows into the thousands, this is the thing to replace, not the data model.
 */
export async function findStudents(classId: string | null, text: string, includeLeft = false) {
  const base = collection(school(), 'students');
  const q = classId
    ? query(base, where('classId', '==', classId), orderBy('rollNo'))
    : query(base, orderBy('className'), orderBy('rollNo'));

  const snap = await getDocs(q);
  const needle = text.trim().toLowerCase();

  return snap.docs
    .map((d) => ({ studentId: d.id, ...(d.data() as Omit<StudentDetail, 'studentId'>) }))
    .filter((s) => includeLeft || s.status === 'A')
    .filter((s) =>
      !needle ||
      s.fullName.toLowerCase().includes(needle) ||
      String(s.rollNo) === needle ||
      s.studentId === needle ||
      (s.regNo ?? '').toLowerCase().includes(needle));
}

// ---------------------------------------------------------------------------
// attendance history for one student

export type DayMark = { date: string; status: Status; markedVia?: string };

export type AttendanceSummary = {
  marked: number;
  present: number;
  percent: number | null;
  recent: DayMark[];
};

/**
 * One student's attendance from `from` onwards.
 *
 * The percentage divides by DAYS MARKED, not by the calendar's working days —
 * the same choice as v_attendance_monthly in the APEX app. A class that only
 * started marking in March would otherwise show every student as hopeless.
 */
export async function attendanceFor(studentId: string, from: string): Promise<AttendanceSummary> {
  const snap = await getDocs(query(
    collection(school(), 'attendanceMarks'),
    where('studentId', '==', studentId),
    where('date', '>=', from),
    orderBy('date', 'desc'),
    limit(400),
  ));

  const days = snap.docs.map((d) => d.data() as DayMark);
  const present = days.filter((d) => d.status === 'P' || d.status === 'L').length;

  return {
    marked: days.length,
    present,
    percent: days.length ? Math.round((present / days.length) * 1000) / 10 : null,
    recent: days.slice(0, 12),
  };
}

export const startOfYear = () => `${todayInDhaka().slice(0, 4)}-01-01`;
export const startOfMonth = () => `${todayInDhaka().slice(0, 7)}-01`;

// ---------------------------------------------------------------------------
// dashboard numbers

export type SchoolStats = {
  students: number | null;
  staff: number | null;
  classes: number | null;
  markedToday: number | null;
  presentToday: number | null;
  takenToday: boolean;
};

/**
 * Counted with aggregation queries, so the dashboard costs a handful of reads
 * rather than one per student. Firestore bills count() far below reading the
 * documents, which is what makes this affordable to leave open all day.
 *
 * EVERY COUNT IS INDEPENDENT AND MAY COME BACK NULL. A teacher is not allowed
 * to read the staff collection, so that one number is denied for them — and a
 * denial must not blank the rest of the dashboard or, worse, be reported as
 * "you have no access". The caller renders whatever came back.
 */
async function count(run: () => Promise<number>): Promise<number | null> {
  try { return await run(); } catch { return null; }
}

export async function schoolStats(): Promise<SchoolStats> {
  const today = todayInDhaka();
  const marks = collection(school(), 'attendanceMarks');

  const [students, staff, classes, marked, present, session] = await Promise.all([
    count(async () =>
      (await getCountFromServer(query(collection(school(), 'students'), where('status', '==', 'A')))).data().count),
    count(async () =>
      (await getCountFromServer(query(collection(school(), 'staff'), where('staffStatus', 'in', ['ACTIVE', 'ON_LEAVE'])))).data().count),
    count(async () =>
      (await getCountFromServer(collection(school(), 'classes'))).data().count),
    count(async () =>
      (await getCountFromServer(query(marks, where('date', '==', today)))).data().count),
    count(async () =>
      (await getCountFromServer(query(marks, where('date', '==', today), where('status', 'in', ['P', 'L'])))).data().count),
    getDoc(doc(school(), 'attendance', today)).catch(() => null),
  ]);

  return {
    students, staff, classes,
    markedToday: marked,
    presentToday: present,
    takenToday: session?.exists() ?? false,
  };
}
