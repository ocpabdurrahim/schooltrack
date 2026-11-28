/**
 * One student, two exams, side by side.
 *
 * A result sheet answers "how did the class do". A parent at a desk asks
 * something else: is my child doing better than last time? That is two
 * exams' marks on one line per subject, and the difference spelled out, so
 * nobody has to subtract eleven pairs of numbers in their head and nobody
 * has to be trusted to have done it right.
 *
 * WHAT IT WILL NOT DO is compare two things that are not comparable. A
 * subject sat in one exam and not the other has no difference to report, and
 * says so with a dash rather than counting the missing one as nought — the
 * same rule the rest of the app keeps, and the one that matters most here,
 * because "down 70 marks" against a paper the child never sat is the kind of
 * figure that gets a child shouted at.
 *
 * This file has a twin: android/.../data/Progress.kt.
 */

import type { SubjectGrade, SubjectMark, Tabulation } from './grading';
import { subjectRank } from './subjectorder';

type Cell = SubjectMark & SubjectGrade;

/** One subject's line: what it was, what it is, and the move between them. */
export type SubjectProgress = {
  subjectId: string;
  subjectName: string;
  fullMarks: number;
  /** The earlier exam, then the later one. Null: not sat, or not marked. */
  before: number | null;
  after: number | null;
  beforeLetter: string;
  afterLetter: string;
  /** after − before, and null unless BOTH are real figures. */
  change: number | null;
};

export type Progress = {
  subjects: SubjectProgress[];
  totalBefore: number | null;
  totalAfter: number | null;
  totalChange: number | null;
  gpaBefore: number | null;
  gpaAfter: number | null;
  gpaChange: number | null;
  /** Merit position in each exam, where the sheet gave one. */
  positionBefore: number | null;
  positionAfter: number | null;
  /** Positive means they moved UP the list — 12th to 7th is +5, not −5. */
  positionChange: number | null;
  /**
   * What to say in one word, from the GPA: a figure a parent already knows
   * how to read, and the one the school itself is judged on.
   *
   * 'unknown' while either exam is unfinished. Not 'the same' — a result
   * that is not in yet is not a result that stood still.
   */
  verdict: 'better' | 'worse' | 'same' | 'unknown';
};

/** A figure only counts as a figure when it is one. */
const real = (n: number | null | undefined): n is number =>
  n !== null && n !== undefined && Number.isFinite(n);

const diff = (before: number | null, after: number | null) =>
  (real(before) && real(after) ? after - before : null);

/** The subject's total as the sheet prints it; absent is nought, not blank. */
const markOf = (c: Cell | undefined): number | null => {
  if (!c) return null;
  if (c.absent) return 0;
  return real(c.total) ? c.total : null;
};

const letterOf = (c: Cell | undefined): string => {
  if (!c) return '';
  return c.absent ? 'F' : c.letter;
};

/**
 * The two tabulations as one list of subjects.
 *
 * The union of both, in the school's order, because a student may have
 * changed stream between the exams or sat a 4th subject in only one of them.
 * Matched on subjectId: a renamed subject is still the same subject, and two
 * subjects that happen to share a name are not.
 */
export function progressFor(
  before: Tabulation | null,
  after: Tabulation | null,
  positions: { before?: number | null; after?: number | null } = {},
): Progress {
  const was = new Map((before?.subjects ?? []).map((c) => [c.subjectId, c as Cell]));
  const now = new Map((after?.subjects ?? []).map((c) => [c.subjectId, c as Cell]));

  const ids: string[] = [];
  for (const id of [...was.keys(), ...now.keys()]) if (!ids.includes(id)) ids.push(id);

  const subjects = ids
    .map((id) => {
      const a = was.get(id);
      const b = now.get(id);
      const any = (b ?? a) as Cell;
      const beforeMark = markOf(a);
      const afterMark = markOf(b);
      return {
        subjectId: id,
        subjectName: any.subjectName,
        fullMarks: any.fullMarks,
        before: beforeMark,
        after: afterMark,
        beforeLetter: letterOf(a),
        afterLetter: letterOf(b),
        change: diff(beforeMark, afterMark),
      };
    })
    .sort((x, y) => subjectRank(x) - subjectRank(y) || x.subjectName.localeCompare(y.subjectName));

  // The totals are added up from the subjects BOTH exams have, so the two
  // figures are of the same thing. A subject in only one of them would make
  // one total bigger for a reason that has nothing to do with the child.
  let totalBefore: number | null = null;
  let totalAfter: number | null = null;
  for (const s of subjects) {
    if (!real(s.before) || !real(s.after)) continue;
    totalBefore = (totalBefore ?? 0) + s.before;
    totalAfter = (totalAfter ?? 0) + s.after;
  }

  const gpaBefore = before && !before.incomplete ? before.gpa : null;
  const gpaAfter = after && !after.incomplete ? after.gpa : null;
  const gpaChange = diff(gpaBefore, gpaAfter);

  const positionBefore = real(positions.before) ? positions.before : null;
  const positionAfter = real(positions.after) ? positions.after : null;

  return {
    subjects,
    totalBefore,
    totalAfter,
    totalChange: diff(totalBefore, totalAfter),
    gpaBefore,
    gpaAfter,
    gpaChange,
    positionBefore,
    positionAfter,
    // Up the list is a SMALLER number, so the sign is turned over: a parent
    // reading "+5" should not have to be told it means fifth better.
    positionChange: real(positionBefore) && real(positionAfter)
      ? positionBefore - positionAfter
      : null,
    verdict: gpaChange === null ? 'unknown'
      : gpaChange > 0 ? 'better'
        : gpaChange < 0 ? 'worse' : 'same',
  };
}

/** "+0.33", "−12", "0" — the sign always shown, because that is the point. */
export function signed(n: number | null, places = 0): string {
  if (!real(n)) return '—';
  const fixed = Math.abs(n).toFixed(places);
  if (Number(fixed) === 0) return places ? `0.${'0'.repeat(places)}` : '0';
  return `${n > 0 ? '+' : '−'}${fixed}`;
}
