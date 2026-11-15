import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { SCHOOL_ID, db } from '../firebase';

export type Status = 'P' | 'A' | 'L' | 'E';
export const STATUS_LABEL: Record<Status, string> = {
  P: 'Present', A: 'Absent', L: 'Late', E: 'Leave',
};

export type Student = {
  studentId: string;
  fullName: string;
  rollNo: number;
  classId: string;
  className: string;
  section: string;
};

export type Mark = {
  studentId: string;
  status: Status;
  markedVia: 'SCAN' | 'MANUAL';
  markedBy: string;
  classId: string;
  rollNo: number;
};

/** Student plus today's mark, if any. No mark means absent (see below). */
export type RegisterRow = Student & { status: Status; via?: 'SCAN' | 'MANUAL' };

const schoolRef = () => doc(db, 'schools', SCHOOL_ID);
/** Flat, school-scoped: one document per student per day, id `date_studentId`.
 *  See firestore.rules — a nested subcollection would force collection-group
 *  queries, which cannot be scoped to one school in the rules. */
const marksRef = () => collection(schoolRef(), 'attendanceMarks');
const markId = (date: string, studentId: string) => `${date}_${studentId}`;

/** 2026-11-15 in Dhaka, regardless of where the device thinks it is. */
export function todayInDhaka(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export type SchoolClass = {
  classId: string;
  className: string;
  section: string;
  displayName: string;
  sortOrder: number;
};

export async function listClasses(): Promise<SchoolClass[]> {
  const snap = await getDocs(query(collection(schoolRef(), 'classes'), orderBy('sortOrder')));
  return snap.docs.map((d) => ({
    ...(d.data() as Omit<SchoolClass, 'classId'>),
    classId: d.id,   // the document id wins: it is the Oracle CLASS_ID
  }));
}

export async function listStudents(classId: string | null): Promise<Student[]> {
  const base = collection(schoolRef(), 'students');
  const q = classId
    ? query(base, where('status', '==', 'A'), where('classId', '==', classId), orderBy('rollNo'))
    : query(base, where('status', '==', 'A'), orderBy('rollNo'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ studentId: d.id, ...(d.data() as Omit<Student, 'studentId'>) }));
}

/**
 * The register for one day.
 *
 * A student with NO mark document is Absent. That is deliberate: it keeps a
 * half-finished register honest (exactly why the APEX version seeded everyone
 * Absent first) without writing a document per student per day. The session
 * doc below is what distinguishes "nobody marked yet" from "everyone absent".
 */
export async function loadRegister(classId: string | null, date: string): Promise<RegisterRow[]> {
  const [students, markSnap] = await Promise.all([
    listStudents(classId),
    getDocs(classId
      ? query(marksRef(), where('date', '==', date), where('classId', '==', classId))
      : query(marksRef(), where('date', '==', date))),
  ]);

  const marks = new Map<string, Mark>();
  markSnap.docs.forEach((d) => { const m = d.data() as Mark; marks.set(m.studentId, m); });

  return students.map((s) => {
    const m = marks.get(s.studentId);
    return { ...s, status: m?.status ?? 'A', via: m?.markedVia };
  });
}

/** Was attendance opened for this day at all? */
export async function sessionOpened(date: string): Promise<boolean> {
  const d = await getDoc(doc(schoolRef(), 'attendance', date));
  return d.exists();
}

export async function openSession(date: string, email: string) {
  await setDoc(
    doc(schoolRef(), 'attendance', date),
    { date, openedBy: email, openedAt: serverTimestamp(), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/**
 * Writes one mark. Every field the rules insist on is set here — class,
 * section, roll, who and when — because they are a SNAPSHOT of the moment
 * (data-model.md §4). Reading them back off the student later would re-label
 * the whole register the day a promotion runs.
 */
export async function mark(student: Student, date: string, status: Status,
                           via: 'SCAN' | 'MANUAL', email: string) {
  await setDoc(doc(marksRef(), markId(date, student.studentId)), {
    studentId: student.studentId,
    classId: student.classId,
    className: student.className,
    section: student.section,
    rollNo: student.rollNo,
    date,
    status,
    markedVia: via,
    markedBy: email,
    markedAt: serverTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// scanning

export type ScanResult =
  | { ok: true; status: Status; message: string; student: Student; already: boolean }
  | { ok: false; message: string };

/** 'SMS-STU-76' from a printed card, or a bare '76' typed by hand. */
export function parseCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  const m = /^SMS-STU-(\d+)$/.exec(code);
  if (m) return m[1];
  return /^\d+$/.test(code) ? code : null;
}

/**
 * The Firestore counterpart of fn_scan_mark. Same refusals, same wording, so
 * whoever is on the gate sees what they are used to:
 *   not a card · unknown or left · wrong section · already marked.
 *
 * classId null = gate mode: any active student is accepted and recorded
 * against their OWN class.
 */
export async function scan(raw: string, classId: string | null, date: string,
                           email: string, lateAfter?: string): Promise<ScanResult> {
  const studentId = parseCode(raw);
  if (!studentId) return { ok: false, message: 'That is not a student card.' };

  const snap = await getDoc(doc(schoolRef(), 'students', studentId));
  if (!snap.exists() || snap.data().status !== 'A') {
    return { ok: false, message: `No active student has card number ${studentId}.` };
  }
  const student = { studentId, ...(snap.data() as Omit<Student, 'studentId'>) };

  if (classId && student.classId !== classId) {
    return {
      ok: false,
      message: `${student.fullName} is in ${student.className} - ${student.section}, not this section.`,
    };
  }

  const existing = await getDoc(doc(marksRef(), markId(date, studentId)));
  const who = `${student.fullName} (${classId ? '' : `${student.className} - ${student.section}, `}Roll ${student.rollNo})`;

  if (existing.exists() && ['P', 'L'].includes(existing.data().status)) {
    return {
      ok: true, already: true, student,
      status: existing.data().status as Status,
      message: `${who} was already marked.`,
    };
  }

  const status: Status =
    lateAfter && date === todayInDhaka() && nowHHMM() > lateAfter ? 'L' : 'P';

  await mark(student, date, status, 'SCAN', email);
  return {
    ok: true, already: false, student, status,
    message: `${who} — ${status === 'L' ? 'LATE' : 'Present'}`,
  };
}

function nowHHMM(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
}
