import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { excelDate, gridToText, parseCsv, readSheetFile, readXlsx } from './sheet';
import { parseStudentRows, prepareStudentRows } from './batch';

/**
 * The same cases exist in android/.../data/SheetTest.kt, and both read THE SAME
 * students.xlsx — rebuilt by tools/make-xlsx-fixture.py, which says what is
 * awkward about it on purpose.
 */

const fixture = () => {
  const path = fileURLToPath(new URL('./fixtures/students.xlsx', import.meta.url));
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
};

describe('reading a CSV', () => {
  it('keeps a comma that is inside quotes', () => {
    // The naive split is what makes "Mia, Karim" into two students.
    expect(parseCsv('1,"Mia, Karim",01711')).toEqual([['1', 'Mia, Karim', '01711']]);
  });

  it('reads a doubled quote as one quote, and a newline inside quotes', () => {
    expect(parseCsv('1,"She said ""hi""",2')).toEqual([['1', 'She said "hi"', '2']]);
    expect(parseCsv('1,"two\nlines",3')).toEqual([['1', 'two\nlines', '3']]);
  });

  it('reads tab and semicolon files, which Excel also writes', () => {
    expect(parseCsv('1\tAyesha\tKarim')).toEqual([['1', 'Ayesha', 'Karim']]);
    expect(parseCsv('1;Ayesha;Karim')).toEqual([['1', 'Ayesha', 'Karim']]);
  });

  it('drops the byte-order mark Excel puts at the front', () => {
    expect(parseCsv('﻿Roll,Name')[0][0]).toBe('Roll');
  });

  it('handles CRLF line endings and a ragged last line', () => {
    expect(parseCsv('a,b\r\nc\r\n')).toEqual([['a', 'b'], ['c'], ['']]);
  });
});

describe('a grid as the text the paste box holds', () => {
  it('joins with tabs, which is what a paste out of Excel looks like', () => {
    expect(gridToText([['1', 'Ayesha'], ['2', 'Rakib']])).toBe('1\tAyesha\n2\tRakib');
  });

  it('flattens a tab or newline inside a cell, so one cell stays one cell', () => {
    expect(gridToText([['a\tb', 'c\nd']])).toBe('a b\tc d');
  });

  it('drops the empty cells and rows an export leaves at the edges', () => {
    expect(gridToText([['1', 'Ayesha', '', ''], ['', ''], []])).toBe('1\tAyesha');
  });
});

describe('an Excel date, which is a number with a format on it', () => {
  it('reads the serial the way Excel means it', () => {
    expect(excelDate(38353)).toBe('2005-01-01');
    expect(excelDate(40179)).toBe('2010-01-01');
    expect(excelDate(45000)).toBe('2023-03-15');
  });

  it('refuses the days around Excel\'s imaginary 29 February 1900', () => {
    // Day 60 does not exist. No school date is anywhere near it, so it is
    // left as a number rather than quietly shifted by one.
    expect(excelDate(60)).toBe('');
    expect(excelDate(0)).toBe('');
    expect(excelDate(Number.NaN)).toBe('');
  });
});

describe('reading an .xlsx', () => {
  it('reads the first sheet of the workbook, not the second', async () => {
    const grid = await readXlsx(fixture());
    expect(JSON.stringify(grid)).not.toContain('DO NOT READ');
  });

  it('reads shared strings, inline strings and formula text alike', async () => {
    const grid = await readXlsx(fixture());
    expect(grid[0]).toEqual(['Roll', 'Name', 'Father', 'Mobile', 'DOB']);
    expect(grid[1][1]).toBe('Ayesha Khatun');     // shared
    expect(grid[2][2]).toBe('Jashim Uddin');      // inline
    expect(grid[1][3]).toBe('01711000000');       // a formula's cached text, not a number
  });

  it('turns a formatted date into a date, not into 38353', async () => {
    const grid = await readXlsx(fixture());
    expect(grid[1][4]).toBe('2005-01-01');        // built-in format 14
    expect(grid[2][4]).toBe('2010-01-01');        // a custom dd/mm/yyyy
  });

  it('leaves a plain number alone, however much it looks like a date', async () => {
    const grid = await readXlsx(fixture());
    expect(grid[3][4]).toBe('12345');
  });

  it('keeps a row lined up when a cell is missing', async () => {
    // Row 3 has no B cell: the father's name must stay in column C.
    const grid = await readXlsx(fixture());
    expect(grid[2][1]).toBe('');
    expect(grid[2][2]).toBe('Jashim Uddin');
  });

  it('keeps an empty row in place, so later rows do not move up', async () => {
    const grid = await readXlsx(fixture());
    expect(grid[4]).toEqual([]);                  // sheet row 5 is empty
    expect(grid[5][1]).toBe('Sumi & Co <3');      // and row 6 is still row 6
  });

  it('reads an entry that was stored rather than deflated', async () => {
    // sharedStrings.xml is STORED in the fixture; without it every shared
    // string would come back empty.
    const grid = await readXlsx(fixture());
    expect(grid[1][1]).toBe('Ayesha Khatun');
  });

  it('says plainly what is not a spreadsheet', async () => {
    const notZip = new TextEncoder().encode('Roll,Name\n1,Ayesha').buffer as ArrayBuffer;
    await expect(readXlsx(notZip)).rejects.toThrow(/not even a zip/);
  });
});

describe('choosing a file', () => {
  it('picks the reader by content as well as by name', async () => {
    // A browser hands over whatever name the file has; the content decides.
    const xlsx = new File([fixture()], 'export');
    expect(await readSheetFile(xlsx)).toContain('Roll	Name');
    const csv = new File(['1,Ayesha'], 'list.csv');
    expect(await readSheetFile(csv)).toBe('1	Ayesha');
  });

  it('says what to do about an old .xls', async () => {
    await expect(readSheetFile(new File([fixture()], 'roll.xls')))
      .rejects.toThrow(/old \.xls format/);
  });
});

describe('a spreadsheet becomes the same rows a paste would', () => {
  it('feeds batch.ts, header line and all', async () => {
    const text = gridToText(await readXlsx(fixture()));
    const rows = prepareStudentRows(parseStudentRows(text), []);

    // The heading row is recognised, so the columns are named and not guessed.
    expect(rows.map((r) => r.fullName)).toEqual(['Ayesha Khatun', '', 'Rakib Hasan', 'Sumi & Co <3']);
    expect(rows[0]).toMatchObject({
      rollNo: 1, fatherName: 'Karim Mia', mobileNo: '01711000000', dob: '2005-01-01', problem: '',
    });
    // row 3 of the sheet has no name, and says so rather than being dropped
    expect(rows[1].problem).toContain('No name');
    // the last row has only a name, so it is given the next roll
    expect(rows[3]).toMatchObject({ rollNo: 4, problem: '' });
  });
});
