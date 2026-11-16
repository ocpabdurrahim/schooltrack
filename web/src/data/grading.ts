/**
 * Grades, GPA and the fail rules — the Bangladeshi school scale.
 *
 * This file has a twin: android/.../data/Grading.kt. They must agree exactly,
 * because a student will be shown a GPA by whichever app is to hand, and the
 * same test cases are written against both. Change one, change the other.
 *
 * Nothing here is stored. Grades and GPA are COMPUTED from the marks every
 * time (data-model.md §3) so that correcting a mark corrects everything that
 * follows from it. Only a published exam freezes its tabulation.
 */

export type Grade = { letter: string; point: number };

/** Percentage thresholds, highest first. 33 is the pass mark. */
const SCALE: { from: number; letter: string; point: number }[] = [
  { from: 80, letter: 'A+', point: 5.0 },
  { from: 70, letter: 'A', point: 4.0 },
  { from: 60, letter: 'A-', point: 3.5 },
  { from: 50, letter: 'B', point: 3.0 },
  { from: 40, letter: 'C', point: 2.0 },
  { from: 33, letter: 'D', point: 1.0 },
  { from: 0, letter: 'F', point: 0.0 },
];

export const PASS_MARK_PERCENT = 33;
export const MAX_GPA = 5.0;

/** A subject's grade from its marks. Absent is F, not "no grade". */
export function gradeFor(marks: number | null, fullMarks = 100, absent = false): Grade {
  if (absent) return { letter: 'F', point: 0 };
  if (marks === null || !Number.isFinite(marks)) return { letter: '-', point: 0 };
  const percent = fullMarks > 0 ? (marks / fullMarks) * 100 : 0;
  const band = SCALE.find((s) => percent >= s.from) ?? SCALE[SCALE.length - 1];
  return { letter: band.letter, point: band.point };
}

export type SubjectMark = {
  subjectId: string;
  subjectName: string;
  fullMarks: number;
  marks: number | null;      // null = not entered yet
  absent?: boolean;
  isOptional?: boolean;      // the "4th subject"
};

export type Tabulation = {
  gpa: number | null;        // null while any compulsory mark is missing
  letter: string;
  failed: string[];          // names of the compulsory subjects failed
  incomplete: boolean;
  subjects: (SubjectMark & Grade)[];
};

/**
 * One student's result for one exam.
 *
 * Three rules carried over from the APEX tabulation, and each one matters:
 *
 *   1. ONE F IN A COMPULSORY SUBJECT FAILS THE EXAM. The GPA is 0.00 and the
 *      grade F, however good the rest are.
 *   2. THE OPTIONAL (4th) SUBJECT ONLY EVER HELPS. Points above 2.00 are added
 *      to the total, it is never counted in the divisor, and failing it does
 *      not fail the student.
 *   3. A MISSING MARK IS NOT A ZERO. Until every compulsory subject has a mark
 *      the GPA is null and the sheet says so, rather than publishing a GPA
 *      that will change when the last subject is entered.
 */
export function tabulate(marks: SubjectMark[]): Tabulation {
  const subjects = marks.map((m) => ({ ...m, ...gradeFor(m.marks, m.fullMarks, m.absent) }));
  const compulsory = subjects.filter((s) => !s.isOptional);
  const optional = subjects.filter((s) => s.isOptional);

  const incomplete = compulsory.some((s) => s.marks === null && !s.absent);
  const failed = compulsory.filter((s) => s.letter === 'F').map((s) => s.subjectName);

  if (incomplete) return { gpa: null, letter: '-', failed, incomplete, subjects };
  if (!compulsory.length) return { gpa: null, letter: '-', failed, incomplete: true, subjects };
  if (failed.length) return { gpa: 0, letter: 'F', failed, incomplete: false, subjects };

  const total = compulsory.reduce((t, s) => t + s.point, 0);
  const bonus = optional.reduce((t, s) => t + Math.max(0, s.point - 2), 0);
  const gpa = Math.min(MAX_GPA, (total + bonus) / compulsory.length);
  const rounded = Math.round(gpa * 100) / 100;

  return {
    gpa: rounded,
    letter: letterForGpa(rounded),
    failed: [],
    incomplete: false,
    subjects,
  };
}

/** The overall letter, from the GPA rather than from any one subject. */
export function letterForGpa(gpa: number): string {
  if (gpa >= 5) return 'A+';
  if (gpa >= 4) return 'A';
  if (gpa >= 3.5) return 'A-';
  if (gpa >= 3) return 'B';
  if (gpa >= 2) return 'C';
  if (gpa >= 1) return 'D';
  return 'F';
}

export const gpaText = (gpa: number | null) => (gpa === null ? '—' : gpa.toFixed(2));
