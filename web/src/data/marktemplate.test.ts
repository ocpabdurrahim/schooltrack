import { describe, expect, it } from 'vitest';
import { markColumns, templateFileName, templateNote, templateRows } from './marktemplate';
import { xlsxOf } from './xlsx';
import { readSheetGrid } from './sheet';
import { parseMarkParts } from './batch';

/** The SAME cases exist in android/.../data/MarkTemplateTest.kt. */

const PARTS = {
  subjectName: 'MATHEMATICS',
  fullMarks: 100,
  components: [{ name: 'CQ', max: 70 }, { name: 'MCQ', max: 30 }],
};
const WHOLE = { subjectName: 'GEOGRAPHY', fullMarks: 100 };
const ROLL = [
  { rollNo: 2, fullName: 'Bashir Uddin', groupName: 'Science' },
  { rollNo: 1, fullName: 'Ayesha Rahman', groupName: 'Science' },
];

describe('the columns a blank sheet carries', () => {
  it('names one per part, with what it is out of', () => {
    expect(markColumns(PARTS)).toEqual(['CQ (70)', 'MCQ (30)']);
  });

  it('falls back to one Marks column for a paper with no parts', () => {
    expect(markColumns(WHOLE)).toEqual(['Marks (100)']);
  });

  it('leaves out the brackets when a part has no maximum', () => {
    expect(markColumns({ subjectName: 'X', components: [{ name: 'CQ' }] })).toEqual(['CQ']);
  });
});

describe('the sheet itself', () => {
  it('is a note, a heading row, then the students by roll', () => {
    const rows = templateRows(PARTS, ROLL, 'Class 9 - A');
    expect(rows[0][0]).toContain('MATHEMATICS');
    expect(rows[1]).toEqual(['Roll', 'Name', 'Group', 'CQ (70)', 'MCQ (30)', 'Total (100)']);
    expect(rows[2][0]).toBe(1);                 // sorted, whatever order they came in
    expect(rows[3][0]).toBe(2);
    expect(rows).toHaveLength(4);
  });

  it('leaves every mark cell EMPTY, never zero', () => {
    // A zero is a mark, and a failing one. "Nobody has written this yet" and
    // "the child scored nothing" must not look the same on a teacher's desk.
    const rows = templateRows(PARTS, ROLL, 'Class 9 - A');
    expect(rows[2].slice(3)).toEqual(['', '', '']);
  });

  it('gives a whole-paper sheet no Total column, because there is nothing to add up', () => {
    const rows = templateRows(WHOLE, ROLL, 'Class 9 - A');
    expect(rows[1]).toEqual(['Roll', 'Name', 'Group', 'Marks (100)']);
  });

  it('tells the person which columns are theirs', () => {
    expect(templateNote(PARTS, 'Class 9 - A')).toContain('fill in the CQ and MCQ columns');
    expect(templateNote(WHOLE, 'Class 9 - A')).toContain('fill in the Marks column');
    expect(templateNote(PARTS, 'Class 9 - A')).toContain('A for absent');
  });

  it('names the file after the class and the subject', () => {
    expect(templateFileName('Class 9 - A', 'MATHEMATICS'))
      .toBe('Class 9 - A — MATHEMATICS.xlsx');
  });
});

// ---------------------------------------------------------------------------
// the round trip: what this writes, the upload reads

describe('a sheet written here and read back by the upload', () => {
  const asFile = (rows: Parameters<typeof xlsxOf>[0], name = 'x.xlsx') =>
    new File([new Uint8Array(xlsxOf(rows)) as BlobPart], name);

  it('is found, with exactly the columns the subject wants', async () => {
    const grid = await readSheetGrid(asFile(templateRows(PARTS, ROLL, 'Class 9 - A')));
    const sheet = parseMarkParts(grid, ['CQ', 'MCQ']);
    expect(sheet.problem).toBe('');
    expect(Object.keys(sheet.columns).sort()).toEqual(['CQ', 'MCQ']);
  });

  it('changes NOTHING while it is still blank', async () => {
    // The sheet is handed out empty; uploading it unfilled must be a no-op.
    const grid = await readSheetGrid(asFile(templateRows(PARTS, ROLL, 'Class 9 - A')));
    expect(parseMarkParts(grid, ['CQ', 'MCQ']).rows).toEqual([]);
  });

  it('reads the marks back once they are typed in', async () => {
    const rows = templateRows(PARTS, ROLL, 'Class 9 - A');
    rows[2][3] = 51; rows[2][4] = 18;          // roll 1
    rows[3][3] = 'A';                          // roll 2 was absent

    const grid = await readSheetGrid(asFile(rows));
    const sheet = parseMarkParts(grid, ['CQ', 'MCQ']);
    expect(sheet.rows).toHaveLength(2);
    expect(sheet.rows[0].rollNo).toBe(1);
    expect(sheet.rows[0].parts).toEqual({ CQ: 51, MCQ: 18 });
    expect(sheet.rows[1].absent).toBe(true);
  });

  it('reads a whole-paper sheet through whichever word it used', async () => {
    const rows = templateRows(WHOLE, ROLL, 'Class 9 - A');
    rows[2][3] = 64;
    const grid = await readSheetGrid(asFile(rows));
    const sheet = parseMarkParts(grid, ['Marks', 'Mark', 'Total', 'Obtained', 'Score']);
    expect(sheet.rows[0].parts.Marks).toBe(64);
  });
});
