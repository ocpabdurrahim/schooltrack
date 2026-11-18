/**
 * The columns of a tabulation sheet for a section whose students do not all
 * sit the same subjects.
 *
 * A Science student and a Humanities student in the same Class 9 share four
 * papers and differ on five. One column per subject gives sixteen columns of
 * which each student uses ten, and the rest are dots — a sheet that is mostly
 * holes and too wide for the page.
 *
 * So the columns that differ become SLOTS. Every student has one religion
 * paper, four group papers and at most one 4th subject, so those get a fixed
 * number of columns and each student's own subjects fill them, named in the
 * cell. Ten columns, no holes, and a Science row and a Humanities row can be
 * read side by side.
 *
 * This file has a twin: android/.../data/TabSheet.kt.
 */

import type { SubjectGrade, SubjectMark, Tabulation } from './grading';

/** A graded unit as the tabulation holds it. */
export type Cell = SubjectMark & SubjectGrade;

export type Slotted = {
  /** The subjects everybody in the section sits, in the school's order. */
  common: Cell[];
  /** Whichever religion paper this student sits. Null if none applies. */
  religion: Cell | null;
  /** This student's own group papers, in order. */
  group: Cell[];
  /** The 4th subject, if the student has one. */
  optional: Cell | null;
};

const isReligion = (c: Cell) => (c.religions ?? []).length > 0;
const isGroup = (c: Cell) => !c.isOptional && (c.groupNames ?? []).length > 0;

/** One student's units, sorted into the sheet's slots. */
export function slot(t: Tabulation): Slotted {
  const cells = t.subjects as Cell[];
  return {
    common: cells.filter((c) => !c.isOptional && !isReligion(c) && !isGroup(c)),
    religion: cells.find(isReligion) ?? null,
    group: cells.filter(isGroup),
    optional: cells.find((c) => c.isOptional) ?? null,
  };
}

export type Layout = {
  /** Column headings for the shared subjects, in order. */
  common: { subjectId: string; subjectName: string }[];
  /**
   * One entry per group column, naming every subject that turns up in it on
   * this sheet — Physics for the Science rows, Civics for the Humanities
   * ones. The heading is those names shortened and joined, so the column says
   * what it holds instead of saying "Grp 1".
   */
  groupSlots: string[][];
  /** The religion papers on this sheet, and the 4th subjects. Empty: none. */
  religion: string[];
  optional: string[];
};

/** Adds a name to a slot's list, keeping the order it was first seen in. */
function note(into: string[], name?: string) {
  if (name && !into.includes(name)) into.push(name);
}

/**
 * The sheet's shape, from the students actually on it.
 *
 * Nothing is assumed about how many group papers a stream has: the sheet is
 * as wide as the widest student needs and no wider, so a section that has not
 * been streamed yet simply has no group columns at all.
 */
export function layout(results: Tabulation[]): Layout {
  const common: { subjectId: string; subjectName: string }[] = [];
  const seen = new Set<string>();
  const groupSlots: string[][] = [];
  const religion: string[] = [];
  const optional: string[] = [];

  for (const t of results) {
    const s = slot(t);
    for (const c of s.common) {
      if (seen.has(c.subjectId)) continue;
      seen.add(c.subjectId);
      common.push({ subjectId: c.subjectId, subjectName: c.subjectName });
    }
    s.group.forEach((c, i) => {
      while (groupSlots.length <= i) groupSlots.push([]);
      note(groupSlots[i], c.subjectName);
    });
    note(religion, s.religion?.subjectName);
    note(optional, s.optional?.subjectName);
  }

  return { common, groupSlots, religion, optional };
}
