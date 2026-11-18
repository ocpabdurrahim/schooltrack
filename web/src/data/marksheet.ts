/**
 * One student's mark sheet, in the two shapes a school hands out.
 *
 * BRIEF is what goes home: one line per graded subject, its total and its
 * grade. DETAILED is what the office and the teacher argue over: the same
 * subjects, but with every part shown — CQ, MCQ, Practical — because that is
 * where a disputed mark actually lives, and because a part below its own pass
 * mark fails the subject however high the total.
 *
 * Both come from the same lines, so the brief sheet can never say something
 * the detailed one contradicts. The grades come from gradeForSubject(), the
 * same call the tabulation makes, so a mark sheet can never disagree with the
 * result sheet it was printed beside.
 *
 * Papers graded together are ONE line with both papers inside it: Bangla
 * first and second are a single subject out of 200, so one grade, two sets of
 * parts.
 *
 * This file has a twin: android/.../data/MarkSheet.kt.
 */

import {
  type ResultRow,
  type Sitter,
  type Subject,
  subjectMarkFor,
  subjectsForStudent,
} from './exams';
import {
  type SubjectMark,
  combineUnits,
  enteredSoFar,
  gradeForSubject,
  marksTotal,
} from './grading';

/** One paper, with what was entered for each of its parts. */
export type PaperLine = {
  subjectId: string;
  subjectName: string;
  /** By component name — CQ, MCQ, PRACTICAL, WRITTEN. Null: not entered. */
  parts: Record<string, number | null>;
  /** This paper's own total, out of its own full marks. */
  marks: number | null;
  fullMarks: number;
  absent: boolean;
};

/** One graded subject: a single paper, or several graded as one. */
export type UnitLine = {
  unitId: string;
  unitName: string;
  /** One for an ordinary subject, two for Bangla or English. */
  papers: PaperLine[];
  /** The subject total. Null while any part of it is missing. */
  marks: number | null;
  /** What has been entered while the total is still null. */
  soFar: number | null;
  fullMarks: number;
  point: number;
  letter: string;
  /** Parts below their own pass mark — the reason an F can look like a pass. */
  failedParts: string[];
  isOptional: boolean;
  absent: boolean;
};

/** The part columns a detailed sheet needs, in the order a teacher reads them. */
const ORDER = ['CQ', 'MCQ', 'PRACTICAL', 'WRITTEN'];

/**
 * The columns this sheet actually needs.
 *
 * Taken from the papers in front of us rather than fixed: a school that marks
 * everything as one whole paper gets no part columns at all, and one that
 * invents a fourth part gets a column for it without anybody editing this.
 */
export function partColumns(lines: UnitLine[]): string[] {
  // A column appears because a paper HAS that part, not because somebody has
  // got round to marking it: a blank Practical column is information.
  const seen = new Set<string>();
  for (const u of lines) {
    for (const p of u.papers) for (const name of Object.keys(p.parts)) seen.add(name);
  }
  const known = ORDER.filter((n) => seen.has(n));
  const rest = [...seen].filter((n) => !ORDER.includes(n)).sort();
  return [...known, ...rest];
}

/** The papers behind one graded unit. */
function papersOf(unit: SubjectMark, all: { subject: Subject; mark: SubjectMark }[]) {
  const own = all.filter((p) => p.mark.subjectId === unit.subjectId);
  if (own.length) return own;
  return all.filter((p) =>
    (p.mark.combineGroup ?? '') !== '' && p.mark.combineGroup === unit.combineGroup);
}

/**
 * One student's sheet: every subject they sit, in the school's own order.
 *
 * A subject with no mark is still a line. Leaving it out would print a sheet
 * that looks finished and is not, which is the one thing a mark sheet must
 * never do.
 */
export function markSheet(
  subjects: Subject[],
  who: Sitter,
  marks: ResultRow[],
): UnitLine[] {
  const mine = subjectsForStudent(subjects, who);
  const all = mine.map((subject) => ({
    subject,
    mark: subjectMarkFor(subject, marks.find((m) => m.subjectId === subject.subjectId)),
  }));

  return combineUnits(all.map((p) => p.mark)).map((unit) => {
    const grade = gradeForSubject(unit);
    return {
      unitId: unit.subjectId,
      unitName: unit.subjectName,
      papers: papersOf(unit, all).map(({ mark }) => ({
        subjectId: mark.subjectId,
        subjectName: mark.subjectName,
        parts: Object.fromEntries(
          (mark.components ?? []).map((c) => [c.name, mark.parts?.[c.name] ?? null]),
        ),
        marks: mark.marks,
        fullMarks: mark.fullMarks,
        absent: mark.absent ?? false,
      })),
      marks: grade.total,
      soFar: grade.total === null ? enteredSoFar(unit) : null,
      fullMarks: unit.fullMarks,
      point: grade.point,
      letter: grade.letter,
      failedParts: grade.failedParts,
      isOptional: unit.isOptional ?? false,
      absent: unit.absent ?? false,
    };
  });
}

/**
 * What the foot of the sheet adds up — the marks, not the GPA.
 *
 * The same marksTotal() the result sheet and the progress report use, so the
 * three can never disagree about what a student scored.
 */
export const sheetTotal = (lines: UnitLine[]) => marksTotal(lines);
