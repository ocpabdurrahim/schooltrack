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

describe('the same sheet, carrying the marks already entered', () => {
  const entered = [
    {
      rollNo: 1,
      fullName: 'Ayesha Rahman',
      entered: { parts: { CQ: 51, MCQ: 18 }, total: 69 },
    },
    {
      rollNo: 2,
      fullName: 'Bashir Uddin',
      entered: { absent: true },
    },
    {
      // Half entered: the MCQ has not been marked yet, so there is no total.
      rollNo: 3,
      fullName: 'Chaity Das',
      entered: { parts: { CQ: 44, MCQ: null }, total: null },
    },
    // Roll 4 has nothing at all against them.
    { rollNo: 4, fullName: 'Delwar Hossain' },
  ];

  it('puts each part in its own column, and the total in the Total column', () => {
    const rows = templateRows(PARTS, entered, 'Class 9 - A', true);
    expect(rows[2]).toEqual([1, 'Ayesha Rahman', '', 51, 18, 69]);
  });

  it('LEAVES A PART NOT ENTERED EMPTY, never zero', () => {
    // A zero is a mark, and a failing one. The total is withheld too, the
    // same way every other sheet withholds it.
    const rows = templateRows(PARTS, entered, 'Class 9 - A', true);
    expect(rows[4]).toEqual([3, 'Chaity Das', '', 44, '', '']);
  });

  it('writes one A for an absence, in the first column the parser reads', () => {
    const rows = templateRows(PARTS, entered, 'Class 9 - A', true);
    expect(rows[3]).toEqual([2, 'Bashir Uddin', '', 'A', '', '']);
  });

  it('leaves a student with nothing entered completely empty', () => {
    const rows = templateRows(PARTS, entered, 'Class 9 - A', true);
    expect(rows[5]).toEqual([4, 'Delwar Hossain', '', '', '', '']);
  });

  it('puts the mark in the one column of a paper marked out of one number', () => {
    const rows = templateRows(WHOLE, [{ rollNo: 1, entered: { total: 71 } }], 'Class 9 - A', true);
    expect(rows[2]).toEqual([1, '', '', 71]);
  });

  it('IGNORES the marks when a blank form was asked for', () => {
    // A blank form must be blank however much the caller knows.
    const rows = templateRows(PARTS, entered, 'Class 9 - A');
    expect(rows[2]).toEqual([1, 'Ayesha Rahman', '', '', '', '']);
  });

  it('says what it is, and that uploading it back changes marks', () => {
    const note = templateNote(PARTS, 'Class 9 - A', true);
    expect(note).toContain('the marks entered so far');
    expect(note).toContain('upload this file to change');
    // The warning that matters: an empty box is not a zero on the way back.
    expect(note).toContain('changes nothing');
  });

  it('is named so it cannot be confused with the blank form', () => {
    expect(templateFileName('Class 9 - A', 'MATHEMATICS'))
      .toBe('Class 9 - A — MATHEMATICS.xlsx');
    expect(templateFileName('Class 9 - A', 'MATHEMATICS', true))
      .toBe('Class 9 - A — MATHEMATICS — marks entered.xlsx');
  });

  it('READS BACK AS THE SAME MARKS — the whole point of it', async () => {
    // Downloaded, not touched, uploaded again: every mark must come back
    // exactly as it went out, or correcting one box in Excel would quietly
    // change others.
    const file = new File(
      [new Uint8Array(xlsxOf(templateRows(PARTS, entered, 'Class 9 - A', true))) as BlobPart],
      'marks.xlsx',
    );
    const sheet = parseMarkParts(await readSheetGrid(file), ['CQ', 'MCQ']);
    expect(sheet.problem).toBe('');
    expect(sheet.rows.map((r) => ({ roll: r.rollNo, parts: r.parts, absent: r.absent })))
      .toEqual([
        { roll: 1, parts: { CQ: 51, MCQ: 18 }, absent: false },
        { roll: 2, parts: {}, absent: true },
        { roll: 3, parts: { CQ: 44 }, absent: false },
        // Roll 4 carried nothing, so it is not a row at all — uploading the
        // sheet leaves that student exactly as they were.
      ]);
  });

  it('comes back unchanged after a correction, and only there', async () => {
    const rows = templateRows(PARTS, entered, 'Class 9 - A', true);
    rows[2][4] = 21;                       // roll 1's MCQ corrected, 18 -> 21
    const file = new File(
      [new Uint8Array(xlsxOf(rows)) as BlobPart], 'marks.xlsx',
    );
    const sheet = parseMarkParts(await readSheetGrid(file), ['CQ', 'MCQ']);
    expect(sheet.rows[0]).toMatchObject({ rollNo: 1, parts: { CQ: 51, MCQ: 21 } });
    expect(sheet.rows[2]).toMatchObject({ rollNo: 3, parts: { CQ: 44 } });
  });
});
