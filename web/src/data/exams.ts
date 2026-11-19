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
import {
  type Component,
  type Parts,
  type SubjectMark,
  type Tabulation,
  combineUnits,
  marksTotal,
  tabulate,
} from './grading';
import { normalGroup } from './groups';
import { normalReligion } from './religions';
import { type Sitting, satAs } from './sitting';
import { sortSubjects } from './subjectorder';
import type { StudentDetail } from './people';

const school = () => doc(db, 'schools', SCHOOL_ID);
const stamp = <T extends object>(d: T) => ({ ...d, updatedAt: serverTimestamp() });

export type Exam = {
  examId: string;
  examName: string;
  examYear: string;
  periodLabel: string;     // HALF_YEARLY_EXAM-2026 — the fee module matches on this
  published: boolean;
  /**
   * Where this exam sits in the school's year: 1 for the first, 2 for the
   * next. Exams carry no date, and the name does not order them — "Annual"
   * sorts before "Half yearly" alphabetically but comes after it in the year.
   * Default 0, which falls back to the old behaviour rather than inventing an
   * order for exams entered before this field existed.
   */
  sortOrder: number;
  /**
   * The last exam of the year for the classes that sit it: Annual for most,
   * Test for Class Ten. Publishing it is what makes moving the class up
   * possible — the merit list of this exam decides next year's roll numbers.
   *
   * A tick rather than a guess from the name or the sort order. "Annual Exam
   * 2027" typed slightly differently, or an exam added after the last one,
   * would otherwise silently change which exam promotes the school.
   */
  isFinal?: boolean;
};

export type Subject = {
  subjectId: string;
  subjectName: string;
  subjectCode?: string;
  classNames: string[];    // which classes sit this subject
  fullMarks: number;
  isOptional: boolean;     // the 4th subject
  sortOrder: number;
  /**
   * How the paper is marked. Empty means one mark out of fullMarks, which is
   * what every subject looked like before components existed and what a
   * school that does not split its papers still wants.
   */
  components?: Component[];
  /**
   * Papers sharing a group are graded as ONE subject: Bangla first and second
   * paper make a single grade out of 200. Null for a paper that stands alone.
   */
  combineGroup?: string | null;
  /**
   * Which streams sit this paper — Science, Humanities, Business Studies, as
   * Oracle's `subject_group` records it. Empty means the whole class sits it.
   */
  groupNames?: string[];
  /**
   * Which religions sit this paper. Empty for all but the two religion
   * papers, which Oracle splits in enroll_student_subjects rather than in a
   * table: Islam & Moral Education for Islam, Hindu Religion for Hindu, and
   * neither for a student recorded as Other.
   */
  religions?: string[];
};

export type ResultRow = {
  examId: string;
  studentId: string;
  subjectId: string;
  subjectName: string;
  /**
   * The subject total. When the paper is marked in parts this is their sum,
   * worked out by the caller with subjectTotal() so that one rule decides it
   * everywhere, and stored as well as the parts so that every screen which
   * already reads `marks` keeps working untouched.
   */
  marks: number | null;
  /** What was entered per component. Absent entirely on a paper marked whole. */
  parts?: Parts | null;
  absent: boolean;
  classId: string;
  rollNo: number;
  fullMarks: number;
  isOptional: boolean;
  /**
   * When this mark was last saved, epoch ms. Read only — the server sets it on
   * every save, and the quick-entry list reads it to put the rows just keyed
   * in at the top, where a mistyped mark is still worth catching.
   */
  updatedAt?: number | null;
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
  // NOT ordered by sortOrder in the query: Firestore drops documents that lack
  // the field, so every exam saved before this field existed would vanish from
  // the list. Sorted here instead, newest first, which is what the pickers want.
  return snap.docs
    .map((d) => ({
      examId: d.id,
      ...(d.data() as Omit<Exam, 'examId' | 'sortOrder'>),
      sortOrder: (d.data().sortOrder as number) ?? 0,
      isFinal: d.data().isFinal === true,
    }))
    .sort((a, b) =>
      b.examYear.localeCompare(a.examYear) ||
      b.sortOrder - a.sortOrder ||
      b.examId.localeCompare(a.examId));
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
      sortOrder: Number(e.sortOrder) || 0,
      isFinal: e.isFinal === true,
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

/**
 * Every subject the school has, in the school's own order.
 *
 * NOT ordered by sortOrder in the query, for two reasons. Firestore drops
 * documents that lack the field it is ordering by, so one subject saved
 * without a sortOrder would vanish from every screen rather than appear in
 * the wrong place. And the order is sortSubjects()'s to decide — see
 * subjectorder.ts, which is where the order shown anywhere in the app comes
 * from, because every screen reads its subjects through this one function.
 */
export async function listSubjects(): Promise<Subject[]> {
  const snap = await getDocs(query(collection(school(), 'subjects')));
  return sortSubjects(snap.docs.map((d) => ({
    subjectId: d.id,
    ...(d.data() as Omit<Subject, 'subjectId'>),
    sortOrder: (d.data().sortOrder as number) ?? 0,
    classNames: (d.data().classNames ?? []) as string[],
    groupNames: (d.data().groupNames ?? []) as string[],
    religions: (d.data().religions ?? []) as string[],
  })));
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
      components: s.components ?? [],
      combineGroup: s.combineGroup ?? null,
      groupNames: s.groupNames ?? [],
      religions: s.religions ?? [],
    }),
    { merge: true },
  );
  return subjectId;
}

export const subjectsForClass = (subjects: Subject[], className: string) =>
  subjects.filter((s) => (s.classNames ?? []).includes(className));

/**
 * Everything about a student that decides which papers they sit.
 *
 * A record rather than three arguments because the group and the religion are
 * both plain strings: passing them the wrong way round would compile, run, and
 * quietly give a whole class the wrong subjects. StudentDetail already has
 * these three fields, so a student can be passed straight in.
 */
export type Sitter = {
  className: string;
  groupName?: string | null;
  religion?: string | null;
};

/**
 * Does this student sit this paper?
 *
 * Two things narrow a class's subject list. Classes 9 and 10 stream into
 * GROUPS, and the groups sit different papers: Physics for Science,
 * Accounting for Business Studies. And the two RELIGION papers go to the
 * students of that religion — Oracle does this in enroll_student_subjects
 * rather than in a table, which is why it is written out here.
 *
 * A subject naming neither is sat by the whole class — Bangla, English,
 * Mathematics — which is how every subject behaved before either was recorded
 * here, so nothing already set up changes meaning.
 *
 * A student with NOTHING recorded sits everything the class sits. That looks
 * wrong until you consider the alternative: dropping those papers from their
 * result would quietly produce a GPA out of seven subjects instead of ten, and
 * nobody would see it. Expecting every paper leaves the result openly
 * incomplete instead, which is what gets the missing record filled in. (Oracle
 * cannot reach this case — religion is NOT NULL there — so nothing is being
 * contradicted.) A student recorded as "Other" is a different matter: that is
 * an answer, and it sits neither religion paper.
 */
export function sitsSubject(s: Subject, who: Sitter): boolean {
  return excludedBy(s, who) === null;
}

/**
 * WHICH part of the rule shut this student out, or null if nothing did.
 *
 * sitsSubject is this function with the answer thrown away. Keeping the two
 * together means a screen can say "Bashir Uddin is Hindu, which does not sit
 * Islam & Moral Education" — naming the thing that actually decided it —
 * without a second copy of the rule drifting out of step with the first.
 */
export function excludedBy(
  s: Subject,
  who: Sitter,
): 'class' | 'group' | 'religion' | null {
  if (!(s.classNames ?? []).includes(who.className)) return 'class';

  const groups = s.groupNames ?? [];
  const myGroup = normalGroup(who.groupName);
  if (groups.length > 0 && myGroup !== '' && !groups.includes(myGroup)) return 'group';

  const religions = s.religions ?? [];
  const myReligion = normalReligion(who.religion);
  if (religions.length > 0 && myReligion !== '' && !religions.includes(myReligion)) {
    return 'religion';
  }

  return null;
}

/** The papers one student sits — the list every grade and GPA is built from. */
export const subjectsForStudent = (subjects: Subject[], who: Sitter) =>
  subjects.filter((s) => sitsSubject(s, who));

// ---------------------------------------------------------------------------
// marks
//
// The document id is examId_studentId_subjectId, so saving the same sheet
// twice corrects it rather than adding a second set of marks.

/**
 * The subject, plus whatever was entered for it, as the grading engine wants
 * it. Every screen goes through here, so a subject's components and its
 * combine group reach the tabulation the same way on the sheet, the report
 * card and the student's own page.
 */
export function subjectMarkFor(s: Subject, got?: ResultRow | null): SubjectMark {
  return {
    subjectId: s.subjectId,
    subjectName: s.subjectName,
    fullMarks: s.fullMarks,
    marks: got ? got.marks : null,
    absent: got?.absent ?? false,
    isOptional: s.isOptional,
    components: s.components?.length ? s.components : undefined,
    parts: got?.parts ?? undefined,
    combineGroup: s.combineGroup ?? null,
    groupNames: s.groupNames ?? [],
    religions: s.religions ?? [],
  };
}

export const resultId = (examId: string, studentId: string, subjectId: string) =>
  `${examId}_${studentId}_${subjectId}`;

/**
 * One stored mark. `updatedAt` comes back as a Firestore timestamp, so it is
 * turned into plain milliseconds here rather than in every screen that reads
 * it — and is null for marks saved before the field existed.
 */
function toRow(data: Record<string, unknown>): ResultRow {
  const at = data.updatedAt as { toMillis?: () => number } | null | undefined;
  return {
    ...(data as unknown as ResultRow),
    updatedAt: typeof at?.toMillis === 'function' ? at.toMillis() : null,
  };
}

export async function marksForExam(examId: string, classId?: string): Promise<ResultRow[]> {
  const base = collection(school(), 'results');
  const q = classId
    ? query(base, where('examId', '==', examId), where('classId', '==', classId))
    : query(base, where('examId', '==', examId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => toRow(d.data()));
}

export async function marksForStudent(studentId: string): Promise<ResultRow[]> {
  const snap = await getDocs(query(
    collection(school(), 'results'),
    where('studentId', '==', studentId),
  ));
  return snap.docs.map((d) => toRow(d.data()));
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
        parts: r.parts ?? null,
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
    const subjectMarks: SubjectMark[] = subjectsForStudent(subjects, student)
      .map((s) => subjectMarkFor(s, mine.find((m) => m.subjectId === s.subjectId)));
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

/** One exam a student has sat, with the class they sat it in. */
export type SatExam = { exam: Exam; tabulation: Tabulation; sat: Sitting | null };

/**
 * Everything one student has sat, newest exam first.
 *
 * Each line carries the class and roll THE MARKS were entered under, not the
 * student's class today. A report listing several years cannot have one true
 * class in its heading, and a promoted student's older results were printing
 * under their new one.
 */
export async function resultsForStudent(
  student: StudentDetail,
  exams: Exam[],
  subjects: Subject[],
): Promise<SatExam[]> {
  const marks = await marksForStudent(student.studentId);
  return exams
    .map((exam) => {
      const mine = marks.filter((m) => m.examId === exam.examId);
      if (!mine.length) return null;
      const subjectMarks: SubjectMark[] = subjectsForStudent(subjects, student)
        .map((s) => subjectMarkFor(s, mine.find((m) => m.subjectId === s.subjectId)));
      return { exam, tabulation: tabulate(subjectMarks), sat: satAs(mine) };
    })
    .filter(Boolean) as SatExam[];
}

export async function getExam(examId: string): Promise<Exam | null> {
  const snap = await getDoc(doc(school(), 'exams', examId));
  return snap.exists() ? ({ examId, ...(snap.data() as Omit<Exam, 'examId'>) }) : null;
}

// ---------------------------------------------------------------------------
// the two sheets
//
// Both are views over the same marks: nothing below is stored, so correcting a
// mark corrects the tabulation, the result sheet and the progress report
// together.

/**
 * The total of every subject sat, INCLUDING an optional one that was marked.
 *
 * The optional subject counts towards the total even though it only partly
 * counts towards the GPA — that is how a tabulation sheet has always been
 * read, and a total that silently dropped a subject the student sat would be
 * queried by the first teacher to add up the row by hand.
 *
 * Withheld only while a COMPULSORY mark is missing, which is the same test the
 * GPA uses: see marksTotal().
 */
export function totalMarks(t: Tabulation): number | null {
  return marksTotal(t.subjects).obtained;
}

/**
 * One line per exam: earliest YEAR first, then by exam id.
 *
 * Within a year the school's own order decides (sortOrder on the exam: 1 for
 * the first exam of the year, 2 for the next). Exams carry no date, and the
 * name does not order them — "Annual" sorts before "Half yearly" alphabetically
 * but comes after it in the year. Where the order was never set both are 0 and
 * the fallback is the exam id, which is at least stable; the report only calls
 * the chart "progress" once every exam on it has a real order.
 *
 * The marks total and the percentage are withheld while any compulsory mark is
 * still missing. A part-entered exam shown as a percentage reads as a bad
 * result rather than an unfinished one, and a parent cannot tell the difference.
 */
export type ResultLine = {
  examId: string;
  examName: string;
  examYear: string;
  published: boolean;
  gpa: number | null;
  letter: string;
  incomplete: boolean;
  failed: string[];
  obtained: number | null;
  outOf: number;
  percent: number | null;
  sortOrder: number;
  /** The class and roll THIS exam was sat under, from its own marks. */
  sat: Sitting | null;
};

export function resultLines(results: SatExam[]): ResultLine[] {
  return [...results]
    .sort((a, b) =>
      a.exam.examYear.localeCompare(b.exam.examYear) ||
      (a.exam.sortOrder ?? 0) - (b.exam.sortOrder ?? 0) ||
      a.exam.examId.localeCompare(b.exam.examId))
    .map(({ exam, tabulation, sat }) => {
      const { obtained, outOf } = marksTotal(tabulation.subjects);
      return {
        examId: exam.examId,
        examName: exam.examName,
        examYear: exam.examYear,
        published: exam.published,
        sortOrder: exam.sortOrder ?? 0,
        gpa: tabulation.gpa,
        letter: tabulation.letter,
        incomplete: tabulation.incomplete,
        failed: tabulation.failed,
        obtained,
        outOf,
        percent: obtained === null || outOf === 0
          ? null
          : Math.round((obtained / outOf) * 1000) / 10,
        sat,
      };
    });
}

/**
 * The columns a tabulation sheet has for one class.
 *
 * NOT simply the class's subjects: papers that are graded together are ONE
 * column, out of their combined total, because that is the subject the
 * tabulation grades. Taking the raw subject list instead leaves every
 * combined paper looking for a row the tabulation does not contain — the
 * whole sheet comes out blank, which is exactly what happened to a school
 * whose four subjects were two Bangla papers and two English ones.
 */
export function sheetColumns(subjects: Subject[], className: string): SubjectMark[] {
  return combineUnits(subjectsForClass(subjects, className).map((s) => subjectMarkFor(s, null)));
}

export type SubjectStat = {
  subjectId: string;
  subjectName: string;
  highest: number | null;
  lowest: number | null;
  average: number | null;
  passed: number;
  failed: number;
  absent: number;
};

/** Per-subject statistics for the foot of the tabulation sheet. */
export function subjectStats(
  results: StudentResult[],
  subjects: Pick<Subject, 'subjectId' | 'subjectName'>[],
): SubjectStat[] {
  return subjects.map((subject) => {
    const marks: number[] = [];
    let passed = 0;
    let failed = 0;
    let absent = 0;

    for (const r of results) {
      const s = r.tabulation.subjects.find((x) => x.subjectId === subject.subjectId);
      if (!s) continue;
      if (s.absent) { absent++; failed++; continue; }
      if (s.marks === null) continue;
      marks.push(s.marks);
      if (s.letter === 'F') failed++; else passed++;
    }

    return {
      subjectId: subject.subjectId,
      subjectName: subject.subjectName,
      highest: marks.length ? Math.max(...marks) : null,
      lowest: marks.length ? Math.min(...marks) : null,
      average: marks.length
        ? Math.round((marks.reduce((a, b) => a + b, 0) / marks.length) * 10) / 10
        : null,
      passed,
      failed,
      absent,
    };
  });
}

/** How many of each grade, in scale order — the foot of the result sheet. */
export function gradeDistribution(results: StudentResult[]): { letter: string; count: number }[] {
  const order = ['A+', 'A', 'A-', 'B', 'C', 'D', 'F'];
  const counts = new Map<string, number>();
  for (const r of results) {
    if (r.tabulation.incomplete) continue;
    counts.set(r.tabulation.letter, (counts.get(r.tabulation.letter) ?? 0) + 1);
  }
  return order
    .filter((letter) => counts.has(letter))
    .map((letter) => ({ letter, count: counts.get(letter) ?? 0 }));
}

/**
 * Merit order: best first, then by roll so the order is stable between runs.
 * Students whose marks are not all in have no position and go last — they are
 * not failures, they are simply not finished.
 */
export function meritOrder(results: StudentResult[]): StudentResult[] {
  return [...results].sort((a, b) => {
    if (a.tabulation.incomplete !== b.tabulation.incomplete) {
      return a.tabulation.incomplete ? 1 : -1;
    }
    const diff = (b.tabulation.gpa ?? -1) - (a.tabulation.gpa ?? -1);
    if (diff !== 0) return diff;
    return a.student.rollNo - b.student.rollNo;
  });
}
