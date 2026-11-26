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
 * THE SAME SHEET CARRIES THE MARKS ALREADY ENTERED, when it is asked to
 * (`withMarks`). That is not a second format: it is this one with the boxes
 * filled in, so it reads back through the same parser and a teacher can
 * correct a mark in Excel and upload the file to change it. An empty box
 * still means not entered and still changes nothing on the way back, which
 * is what makes a correction safe — you alter the one box you meant to.
 *
 * This file has a twin: android/.../data/MarkTemplate.kt.
 */

export type TemplateSubject = {
  subjectName: string;
  fullMarks?: number;
  components?: { name: string; max?: number }[];
};

/**
 * What has been entered for one student in one subject.
 *
 * Deliberately not a SubjectMark: a sheet needs the parts as they were typed
 * and the total as the app worked it out, and nothing else about grading.
 */
export type EnteredMark = {
  /** By component name, as the subject names them. Absent or null: empty. */
  parts?: Record<string, number | null | undefined>;
  /** The subject's total, for the Total column — or the only column, on a
   *  paper marked out of one number. Null while a part is missing. */
  total?: number | null;
  absent?: boolean;
};

export type TemplateStudent = {
  rollNo: number;
  fullName?: string;
  groupName?: string;
  /** Read only when the sheet is asked for `withMarks`. */
  entered?: EnteredMark;
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
export function templateNote(
  subject: TemplateSubject,
  classLabel: string,
  withMarks = false,
): string {
  const comps = (subject.components ?? []).map((c) => c.name);
  const which = comps.length ? comps.join(' and ') : 'Marks';
  if (withMarks) {
    // It must say that uploading it back CHANGES things, because it is the
    // one sheet somebody might open expecting a read-only report.
    return `${subject.subjectName} — ${classLabel} — the marks entered so far. `
      + `Correct a box and upload this file to change that mark. An empty box `
      + `is a mark not yet entered and uploading it changes nothing; A is `
      + `absent. Do not change the Roll column.`;
  }
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
  withMarks = false,
): Cell[][] {
  const marks = markColumns(subject);
  const comps = subject.components ?? [];
  const full = Number(subject.fullMarks) || 100;

  const headings: Cell[] = ['Roll', 'Name', 'Group', ...marks];
  // A Total for the person filling it in to check against. The app ignores
  // it on a sheet marked in parts and works the total out itself, which is
  // the whole reason a mistyped part gets noticed.
  if (comps.length) headings.push(`Total (${full})`);

  /** A mark as a sheet carries it: a number, or nothing at all. */
  const box = (n: number | null | undefined): Cell =>
    (n === null || n === undefined || !Number.isFinite(n) ? '' : n);

  const cellsFor = (s: TemplateStudent): Cell[] => {
    const got = withMarks ? s.entered : undefined;
    if (!got) return [...marks.map((): Cell => ''), ...(comps.length ? [''] : [])];

    // Absent is one A, in the first column the parser reads. It sets the
    // whole row absent on the way back, and an A in every column would say
    // the same thing four times to somebody reading the sheet.
    if (got.absent) {
      return [
        ...marks.map((_, i): Cell => (i === 0 ? 'A' : '')),
        ...(comps.length ? [''] : []),
      ];
    }

    const cells: Cell[] = comps.length
      ? comps.map((c) => box(got.parts?.[c.name]))
      : [box(got.total)];
    if (comps.length) cells.push(box(got.total));
    return cells;
  };

  return [
    [templateNote(subject, classLabel, withMarks)],
    headings,
    ...[...students]
      .sort((a, b) => a.rollNo - b.rollNo)
      .map((s): Cell[] => [
        s.rollNo,
        s.fullName ?? '',
        s.groupName ?? '',
        ...cellsFor(s),
      ]),
  ];
}

/**
 * "Class 9 - A — MATHEMATICS.xlsx", or "… — marks entered.xlsx".
 *
 * The two must not share a name. A blank form and a filled one look alike in
 * a downloads folder, and handing a teacher the wrong one wastes an evening.
 */
export const templateFileName = (
  classLabel: string,
  subjectName: string,
  withMarks = false,
) => `${classLabel} — ${subjectName}${withMarks ? ' — marks entered' : ''}.xlsx`;
