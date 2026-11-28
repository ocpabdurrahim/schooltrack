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
import { partLabel } from './cellparts';
import { subjectRank } from './subjectorder';

type Cell = SubjectMark & SubjectGrade;

/** One subject's line: what it was, what it is, and the move between them. */
export type SubjectProgress = {
  subjectId: string;
  subjectName: string;
  fullMarks: number;
  /**
   * What each exam marked this subject OUT OF, kept apart because they can
   * differ: a half-yearly paper out of 50 and an annual out of 100 is
   * ordinary, and a percentage worked out against the wrong denominator is
   * worse than no percentage at all. Null when that exam did not sit it.
   */
  fullBefore: number | null;
  fullAfter: number | null;
  /** The earlier exam, then the later one. Null: not sat, or not marked. */
  before: number | null;
  after: number | null;
  beforeLetter: string;
  afterLetter: string;
  /** after − before, and null unless BOTH are real figures. */
  change: number | null;
  /**
   * The component marks of each exam, added up per label — MCQ, CQ,
   * PRACTICAL, WRITTEN. Papers merged into one graded unit (Bangla 1st and
   * 2nd) have their like parts SUMMED, so a combined Bangla out of 200 shows
   * one MCQ figure rather than two, which is what a column headed MCQ can
   * honestly hold. A label the subject is not marked in is simply absent.
   */
  partsBefore: PartMarks;
  partsAfter: PartMarks;
};

/** Component marks keyed by label, already summed across merged papers. */
export type PartMarks = Record<string, number>;

export type Progress = {
  subjects: SubjectProgress[];
  totalBefore: number | null;
  totalAfter: number | null;
  totalChange: number | null;
  /**
   * What those totals were out of, one per exam. Added up over the SAME
   * subjects the totals are, so a percentage made from them compares like
   * with like.
   */
  fullBefore: number | null;
  fullAfter: number | null;
  /**
   * Which component columns this student's sheet needs, in the order a
   * marksheet prints them. Only the ones they ACTUALLY have marks in: a
   * humanities student gets MCQ and CQ, a science student also Practical,
   * and printing all four always would leave empty columns and push the
   * table past the page for no gain.
   */
  partLabels: string[];
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
 * The order a marksheet prints the parts in. Anything the school invents
 * later still appears — after these, alphabetically — rather than vanishing
 * because this list had not heard of it.
 */
const PART_ORDER = ['MCQ', 'CQ', 'PRACTICAL', 'WRITTEN'];

const partRank = (label: string): number => {
  const i = PART_ORDER.indexOf(label);
  return i === -1 ? PART_ORDER.length : i;
};

/**
 * One exam's component marks for one subject, added up per label.
 *
 * An absent student has no parts to show: the row says so with its grade,
 * and a line of noughts across the components would be a different claim —
 * that they sat it and scored nothing in each.
 */
function partsByLabel(c: Cell | undefined): PartMarks {
  const out: PartMarks = {};
  if (!c || c.absent || !c.components?.length) return out;
  for (const comp of c.components) {
    const v = c.parts?.[comp.name];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    const label = partLabel(comp.name, comp.paper).toUpperCase();
    out[label] = (out[label] ?? 0) + v;
  }
  return out;
}

/** "Pract", "Writ" — the headings p43 prints, short enough for a column. */
export function shortPart(label: string): string {
  if (label === 'PRACTICAL') return 'Pract';
  if (label === 'WRITTEN') return 'Writ';
  if (label === 'MCQ' || label === 'CQ') return label;
  return label.charAt(0) + label.slice(1).toLowerCase();
}

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
        fullBefore: a ? a.fullMarks : null,
        fullAfter: b ? b.fullMarks : null,
        before: beforeMark,
        after: afterMark,
        beforeLetter: letterOf(a),
        afterLetter: letterOf(b),
        change: diff(beforeMark, afterMark),
        partsBefore: partsByLabel(a),
        partsAfter: partsByLabel(b),
      };
    })
    .sort((x, y) => subjectRank(x) - subjectRank(y) || x.subjectName.localeCompare(y.subjectName));

  // The totals are added up from the subjects BOTH exams have, so the two
  // figures are of the same thing. A subject in only one of them would make
  // one total bigger for a reason that has nothing to do with the child.
  let totalBefore: number | null = null;
  let totalAfter: number | null = null;
  let fullBefore: number | null = null;
  let fullAfter: number | null = null;
  for (const s of subjects) {
    if (!real(s.before) || !real(s.after)) continue;
    totalBefore = (totalBefore ?? 0) + s.before;
    totalAfter = (totalAfter ?? 0) + s.after;
    fullBefore = (fullBefore ?? 0) + (s.fullBefore ?? 0);
    fullAfter = (fullAfter ?? 0) + (s.fullAfter ?? 0);
  }

  const seen = new Set<string>();
  for (const sp of subjects) {
    for (const k of Object.keys(sp.partsBefore)) seen.add(k);
    for (const k of Object.keys(sp.partsAfter)) seen.add(k);
  }
  const partLabels = [...seen].sort(
    (x, y) => partRank(x) - partRank(y) || x.localeCompare(y),
  );

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
    fullBefore,
    fullAfter,
    partLabels,
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

/**
 * How much of the combined figure each exam carries.
 *
 * Shares, not necessarily percentages: {before: 30, after: 70} and
 * {before: 3, after: 7} mean the same thing, because they are divided by
 * their own sum before use. A school that counts the half-yearly for 30 and
 * the annual for 70 writes it the way it says it out loud.
 */
export type Weights = { before: number; after: number };

/** Both exams counting the same — the obvious starting point. */
export const EVEN: Weights = { before: 50, after: 50 };

/**
 * The two shares as fractions of one, or null when there is nothing to
 * divide by. Negatives are floored at nought rather than allowed to pull a
 * percentage below zero or above a hundred.
 */
function share(w: Weights): { b: number; a: number } | null {
  const b = Math.max(0, real(w.before) ? w.before : 0);
  const a = Math.max(0, real(w.after) ? w.after : 0);
  const sum = b + a;
  return sum > 0 ? { b: b / sum, a: a / sum } : null;
}

/** Marks as a percentage of what they were out of. */
export function percentOf(mark: number | null, full: number | null): number | null {
  if (!real(mark) || !real(full) || full <= 0) return null;
  return (mark / full) * 100;
}

/**
 * One subject's mark across both exams, weighted.
 *
 * Each exam is turned into a percentage FIRST and the two percentages are
 * then weighed, rather than adding the raw marks: that is the only way the
 * split means what it says when the papers are out of different totals. A
 * 30/70 split on a 50-mark paper and a 100-mark one is still 30/70 here,
 * where adding the marks would quietly make it 18/82.
 *
 * Null unless BOTH exams marked it — the rule the whole file keeps. A
 * percentage that silently counts an unsat paper as nought is the figure
 * that gets a child shouted at.
 */
export function subjectPercent(s: SubjectProgress, w: Weights): number | null {
  const sh = share(w);
  if (!sh) return null;
  const b = percentOf(s.before, s.fullBefore);
  const a = percentOf(s.after, s.fullAfter);
  if (b === null || a === null) return null;
  return b * sh.b + a * sh.a;
}

/**
 * The whole report's combined percentage.
 *
 * Worked from the TOTALS, not by averaging the subject percentages, so a
 * subject out of 50 does not weigh as heavily as one out of 100. Same
 * subjects, same rule, same answer a teacher would get on paper.
 */
export function overallPercent(p: Progress, w: Weights): number | null {
  const sh = share(w);
  if (!sh) return null;
  const b = percentOf(p.totalBefore, p.fullBefore);
  const a = percentOf(p.totalAfter, p.fullAfter);
  if (b === null || a === null) return null;
  return b * sh.b + a * sh.a;
}

/** "73.25%", or a dash when there is no honest figure to print. */
export function pctText(n: number | null, places = 2): string {
  return real(n) ? `${n.toFixed(places)}%` : '—';
}

/**
 * One exam's own bottom line, for the summary table under the subjects.
 *
 * Every figure comes straight from that exam's result, never recomputed
 * here, so the progress report can never contradict the result sheet the
 * same exam already printed. That is p43's rule and it is worth keeping.
 */
export type ExamSummary = {
  total: number | null;
  gpa: number | null;
  letter: string;
  position: number | null;
  /** 'Passed' | 'Failed' | '—' while the marks are not all in. */
  result: string;
};

export function examSummary(
  t: Tabulation | null,
  total: number | null,
  position: number | null,
): ExamSummary {
  if (!t) return { total: null, gpa: null, letter: '—', position: null, result: '—' };
  return {
    total: real(total) ? total : null,
    gpa: t.incomplete ? null : t.gpa,
    letter: t.incomplete ? '—' : t.letter,
    position,
    // An unfinished exam has not been passed OR failed yet, and saying
    // either would be a claim about a mark nobody has entered.
    result: t.incomplete ? '—' : t.failed.length ? 'Failed' : 'Passed',
  };
}
