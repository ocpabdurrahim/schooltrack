import type { Cell } from './xlsx';

/**
 * The blank mark sheet the app hands out, for a class and a subject.
 *
 * THE LAYOUT IS THE READER'S, not a guess at it. Mark entry reads an upload
 * with parseMarkParts(), which looks for the first row carrying a roll
 * heading AND at least one column it wants, then reads those columns BY NAME.
 * Three things follow, and all three are used here:
 *
 *   - A COLUMN IT DOES NOT WANT IS IGNORED, so Name and Group can sit in the
 *     sheet for whoever fills it in and the app never looks at them.
 *   - THE HEADING ROW NEED NOT BE FIRST, so row 1 can say what the sheet is
 *     and what to do with it.
 *   - headingKey() STRIPS ANYTHING IN BRACKETS, so "CQ (70)" still matches
 *     the part called CQ and the teacher can see what it is out of.
 *
 * THE MARK CELLS ARE LEFT EMPTY, never zeroed. A zero is a mark, and a
 * failing one; "nobody has written this yet" and "the child scored nothing"
 * must not arrive at a teacher looking the same. parseMarkParts drops a row
 * that carries a roll and no marks, so an unfilled sheet uploaded by mistake
 * changes precisely nothing.
 *
 * This file has a twin: android/.../data/MarkTemplate.kt.
 */

export type TemplateSubject = {
  subjectName: string;
  fullMarks?: number;
  components?: { name: string; max?: number }[];
};

export type TemplateStudent = {
  rollNo: number;
  fullName?: string;
  groupName?: string;
};

/** The columns the app will actually read, labelled with what each is out of. */
export function markColumns(subject: TemplateSubject): string[] {
  const comps = subject.components ?? [];
  if (comps.length) {
    return comps.map((c) => (c.max ? `${c.name} (${c.max})` : c.name));
  }
  const full = Number(subject.fullMarks) || 100;
  return [`Marks (${full})`];
}

/** The line at the top, which the parser skips and a person reads. */
export function templateNote(subject: TemplateSubject, classLabel: string): string {
  const comps = (subject.components ?? []).map((c) => c.name);
  const which = comps.length ? comps.join(' and ') : 'Marks';
  return `${subject.subjectName} — ${classLabel} — fill in the ${which} column`
    + `${comps.length > 1 ? 's' : ''}. Leave a box empty for a student who did not `
    + `sit it. Write A for absent. Do not change the Roll column.`;
}

/**
 * The whole sheet: a note, a heading row, then one row per student.
 *
 * The students handed in are the ones who SIT this paper — the caller works
 * that out with the app's own rule, so a Science paper does not arrive with
 * the Humanities half of the class on it.
 */
export function templateRows(
  subject: TemplateSubject,
  students: readonly TemplateStudent[],
  classLabel: string,
): Cell[][] {
  const marks = markColumns(subject);
  const comps = subject.components ?? [];
  const full = Number(subject.fullMarks) || 100;

  const headings: Cell[] = ['Roll', 'Name', 'Group', ...marks];
  // A Total for the person filling it in to check against. The app ignores
  // it on a sheet marked in parts and works the total out itself, which is
  // the whole reason a mistyped part gets noticed.
  if (comps.length) headings.push(`Total (${full})`);

  return [
    [templateNote(subject, classLabel)],
    headings,
    ...[...students]
      .sort((a, b) => a.rollNo - b.rollNo)
      .map((s): Cell[] => [
        s.rollNo,
        s.fullName ?? '',
        s.groupName ?? '',
        ...marks.map(() => ''),
        ...(comps.length ? [''] : []),
      ]),
  ];
}

/** "Class 9 - A — MATHEMATICS.xlsx" */
export const templateFileName = (classLabel: string, subjectName: string) =>
  `${classLabel} — ${subjectName}.xlsx`;
