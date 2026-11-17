/**
 * What a teacher types, turned into the numbers that get stored.
 *
 * This file has a twin: android/.../data/MarkEntryData.kt. Both mark entry
 * screens on both apps go through it, so a mark typed on a phone and the same
 * mark typed in a browser are stored identically — including the total, which
 * is never typed and never trusted from the caller.
 */

import type { Subject } from './exams';
import { type Parts, subjectTotal } from './grading';

/** One student's boxes for one subject, exactly as they are on screen. */
export type Typed = {
  marks: string;                      // the single box, when the paper is one mark
  parts: Record<string, string>;      // a box per component, when it is marked in parts
  absent: boolean;
};

export const blankTyped = (): Typed => ({ marks: '', parts: {}, absent: false });

/**
 * A typed box as a number, or null for "not entered".
 *
 * Blank is null rather than 0 — the whole grading engine rests on that
 * difference — and so is anything that is not a number, because a box holding
 * "ab" must not quietly become a mark.
 */
export function numOrNull(raw: string): number | null {
  const v = raw.trim();
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * The parts and the subject total behind one student's boxes.
 *
 * The total comes from subjectTotal(), the same function the marksheet and the
 * report card use, so the number written to the database can never disagree
 * with the grade printed from it. A paper marked as one mark has no parts at
 * all — null, not an empty map, so nothing is stored that says nothing.
 */
export function partsAndTotal(
  subject: Pick<Subject, 'subjectId' | 'subjectName' | 'fullMarks' | 'components'>,
  typed: Typed,
): { parts: Parts | null; marks: number | null } {
  if (!subject.components?.length) return { parts: null, marks: numOrNull(typed.marks) };

  const parts: Parts = {};
  for (const c of subject.components) parts[c.name] = numOrNull(typed.parts[c.name] ?? '');

  return {
    parts,
    marks: subjectTotal({
      subjectId: subject.subjectId,
      subjectName: subject.subjectName,
      fullMarks: subject.fullMarks,
      marks: null,
      components: subject.components,
      parts,
    }),
  };
}

/** Parts as they come back from the database, as text for the boxes. */
export function typedFrom(
  marks: number | null | undefined,
  parts: Parts | null | undefined,
  absent: boolean,
): Typed {
  return {
    marks: marks === null || marks === undefined ? '' : String(marks),
    parts: Object.fromEntries(
      Object.entries(parts ?? {}).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)]),
    ),
    absent,
  };
}

/** A part typed above its own maximum — the one mistake worth refusing to save. */
export function overMax(
  subject: Pick<Subject, 'fullMarks' | 'components'>,
  typed: Typed,
): boolean {
  if (subject.components?.length) {
    return subject.components.some((c) => (numOrNull(typed.parts[c.name] ?? '') ?? 0) > c.max);
  }
  return (numOrNull(typed.marks) ?? 0) > subject.fullMarks;
}
