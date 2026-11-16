/**
 * Exams, subjects and marks.
 *
 * Marks are stored; grades, GPA and position are NOT. They are computed from
 * the marks every time by data/grading.ts, so correcting a mark corrects the
 * sheet, the progress report and the student page together. Publishing an
 * exam freezes nothing numerically — it records that the result is final and
 * stops the app offering mark entry.
 */
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
  writeBatch,
} from 'firebase/firestore';
import { SCHOOL_ID, db } from '../firebase';
import { type SubjectMark, type Tabulation, tabulate } from './grading';
import type { StudentDetail } from './people';

const school = () => doc(db, 'schools', SCHOOL_ID);
const stamp = <T extends object>(d: T) => ({ ...d, updatedAt: serverTimestamp() });

export type Exam = {
  examId: string;
  examName: string;
  examYear: string;
  periodLabel: string;     // HALF_YEARLY_EXAM-2026 — the fee module matches on this
  published: boolean;
};

export type Subject = {
  subjectId: string;
  subjectName: string;
  subjectCode?: string;
  classNames: string[];    // which classes sit this subject
  fullMarks: number;
  isOptional: boolean;     // the 4th subject
  sortOrder: number;
};

export type ResultRow = {
  examId: string;
  studentId: string;
  subjectId: string;
  subjectName: string;
  marks: number | null;
  absent: boolean;
  classId: string;
  rollNo: number;
  fullMarks: number;
  isOptional: boolean;
};

// ---------------------------------------------------------------------------
// exams

/** JULY_EXAM-2026 — upper case, underscores, year appended, as in Oracle. */
export const periodLabelFor = (examName: string, examYear: string) =>
  `${examName.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')}-${examYear}`;

export const examIdFor = (examName: string, examYear: string) =>
  periodLabelFor(examName, examYear).toLowerCase().replace(/_/g, '-');

export async function listExams(): Promise<Exam[]> {
  const snap = await getDocs(query(collection(school(), 'exams'), orderBy('examYear', 'desc')));
  return snap.docs.map((d) => ({ examId: d.id, ...(d.data() as Omit<Exam, 'examId'>) }));
}

export async function saveExam(e: Omit<Exam, 'examId' | 'periodLabel'> & { examId?: string }) {
  const examId = e.examId ?? examIdFor(e.examName, e.examYear);
  await setDoc(
    doc(school(), 'exams', examId),
    stamp({
      examName: e.examName.trim(),
      examYear: e.examYear.trim(),
      periodLabel: periodLabelFor(e.examName, e.examYear),
      published: e.published,
    }),
    { merge: true },
  );
  return examId;
}

export async function publishExam(examId: string, published: boolean) {
  await setDoc(doc(school(), 'exams', examId), stamp({ published }), { merge: true });
}

// ---------------------------------------------------------------------------
// subjects

export const subjectIdFor = (name: string) =>
  name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export async function listSubjects(): Promise<Subject[]> {
  const snap = await getDocs(query(collection(school(), 'subjects'), orderBy('sortOrder')));
  return snap.docs.map((d) => ({
    subjectId: d.id,
    ...(d.data() as Omit<Subject, 'subjectId'>),
    classNames: (d.data().classNames ?? []) as string[],
  }));
}

export async function saveSubject(s: Omit<Subject, 'subjectId'> & { subjectId?: string }) {
  const subjectId = s.subjectId ?? subjectIdFor(s.subjectName);
  await setDoc(
    doc(school(), 'subjects', subjectId),
    stamp({
      subjectName: s.subjectName.trim(),
      subjectCode: s.subjectCode?.trim() || null,
      classNames: s.classNames,
      fullMarks: Number(s.fullMarks) || 100,
      isOptional: s.isOptional,
      sortOrder: s.sortOrder,
    }),
    { merge: true },
  );
  return subjectId;
}

export const subjectsForClass = (subjects: Subject[], className: string) =>
  subjects.filter((s) => (s.classNames ?? []).includes(className));

// ---------------------------------------------------------------------------
// marks
//
// The document id is examId_studentId_subjectId, so saving the same sheet
// twice corrects it rather than adding a second set of marks.

export const resultId = (examId: string, studentId: string, subjectId: string) =>
  `${examId}_${studentId}_${subjectId}`;

export async function marksForExam(examId: string, classId?: string): Promise<ResultRow[]> {
  const base = collection(school(), 'results');
  const q = classId
    ? query(base, where('examId', '==', examId), where('classId', '==', classId))
    : query(base, where('examId', '==', examId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as ResultRow);
}

export async function marksForStudent(studentId: string): Promise<ResultRow[]> {
  const snap = await getDocs(query(
    collection(school(), 'results'),
    where('studentId', '==', studentId),
  ));
  return snap.docs.map((d) => d.data() as ResultRow);
}

/**
 * Saves one subject's marks for a whole section in a single batch — one round
 * trip for forty students, and all of it lands or none of it does.
 *
 * A blank mark is written as null rather than skipped: "not entered" has to be
 * storable, otherwise clearing a mark typed by mistake would be impossible.
 */
export async function saveMarks(rows: ResultRow[]) {
  const batch = writeBatch(db);
  for (const r of rows) {
    batch.set(
      doc(school(), 'results', resultId(r.examId, r.studentId, r.subjectId)),
      {
        ...r,
        marks: r.marks === null || Number.isNaN(r.marks) ? null : Number(r.marks),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }
  await batch.commit();
}

// ---------------------------------------------------------------------------
// the sheet

export type StudentResult = {
  student: StudentDetail;
  tabulation: Tabulation;
  position: number | null;     // null while the result is incomplete
};

/**
 * One section's result for one exam, ranked.
 *
 * Position is computed, not stored, and an incomplete result has no position
 * at all — ranking a student whose maths mark has not been entered would put
 * them last for no reason. Equal GPAs share a position, and the next position
 * skips accordingly (1, 2, 2, 4), the way a result sheet has always done it.
 */
export function sheetFor(
  students: StudentDetail[],
  subjects: Subject[],
  marks: ResultRow[],
  examId: string,
): StudentResult[] {
  const byStudent = new Map<string, ResultRow[]>();
  for (const m of marks) {
    if (m.examId !== examId) continue;
    byStudent.set(m.studentId, [...(byStudent.get(m.studentId) ?? []), m]);
  }

  const rows = students.map((student) => {
    const mine = byStudent.get(student.studentId) ?? [];
    const subjectMarks: SubjectMark[] = subjectsForClass(subjects, student.className).map((s) => {
      const got = mine.find((m) => m.subjectId === s.subjectId);
      return {
        subjectId: s.subjectId,
        subjectName: s.subjectName,
        fullMarks: s.fullMarks,
        marks: got ? got.marks : null,
        absent: got?.absent ?? false,
        isOptional: s.isOptional,
      };
    });
    return { student, tabulation: tabulate(subjectMarks), position: null as number | null };
  });

  const ranked = rows
    .filter((r) => !r.tabulation.incomplete && r.tabulation.gpa !== null)
    .sort((a, b) => (b.tabulation.gpa ?? 0) - (a.tabulation.gpa ?? 0));

  let position = 0;
  let lastGpa: number | null = null;
  ranked.forEach((r, i) => {
    if (r.tabulation.gpa !== lastGpa) {
      position = i + 1;
      lastGpa = r.tabulation.gpa;
    }
    r.position = position;
  });

  return rows.sort((a, b) => a.student.rollNo - b.student.rollNo);
}

/** Everything one student has sat, newest exam first. */
export async function resultsForStudent(
  student: StudentDetail,
  exams: Exam[],
  subjects: Subject[],
): Promise<{ exam: Exam; tabulation: Tabulation }[]> {
  const marks = await marksForStudent(student.studentId);
  return exams
    .map((exam) => {
      const mine = marks.filter((m) => m.examId === exam.examId);
      if (!mine.length) return null;
      const subjectMarks: SubjectMark[] = subjectsForClass(subjects, student.className).map((s) => {
        const got = mine.find((m) => m.subjectId === s.subjectId);
        return {
          subjectId: s.subjectId,
          subjectName: s.subjectName,
          fullMarks: s.fullMarks,
          marks: got ? got.marks : null,
          absent: got?.absent ?? false,
          isOptional: s.isOptional,
        };
      });
      return { exam, tabulation: tabulate(subjectMarks) };
    })
    .filter(Boolean) as { exam: Exam; tabulation: Tabulation }[];
}

export async function getExam(examId: string): Promise<Exam | null> {
  const snap = await getDoc(doc(school(), 'exams', examId));
  return snap.exists() ? ({ examId, ...(snap.data() as Omit<Exam, 'examId'>) }) : null;
}
