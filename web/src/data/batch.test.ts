import { describe, expect, it } from 'vitest';
import {
  applyMarkPaste, normalDate, parseMarkPaste, parseStudentRows, prepareStudentRows,
} from './batch';

/** The same cases exist in android/.../data/BatchTest.kt. */

describe('reading a pasted list of students', () => {
  it('reads a tab-separated paste out of a spreadsheet', () => {
    const rows = parseStudentRows('1\tAyesha Khatun\tKarim Mia\tFatema\t01711000000');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      rollNo: 1,
      fullName: 'Ayesha Khatun',
      fatherName: 'Karim Mia',
      motherName: 'Fatema',
      mobileNo: '01711000000',
      problem: '',
    });
  });

  it('reads a comma-separated list typed by hand', () => {
    const rows = parseStudentRows('3, Rakib Hasan, Jashim Uddin');
    expect(rows[0]).toMatchObject({ rollNo: 3, fullName: 'Rakib Hasan', fatherName: 'Jashim Uddin' });
  });

  it('reads a bare column of names, with no rolls at all', () => {
    const rows = parseStudentRows('Ayesha Khatun\nRakib Hasan\n');
    expect(rows.map((r) => r.fullName)).toEqual(['Ayesha Khatun', 'Rakib Hasan']);
    expect(rows.every((r) => r.rollNo === null && r.problem === '')).toBe(true);
  });

  it('reads "12 Ayesha Begum" as a roll and a two-word name, not three columns', () => {
    // A single space is not evidence of a column break. The name keeps its
    // spaces; only a leading number is taken off the front.
    const rows = parseStudentRows('12 Ayesha Begum');
    expect(rows[0]).toMatchObject({ rollNo: 12, fullName: 'Ayesha Begum', problem: '' });
  });

  it('takes the column order from a header line when there is one', () => {
    const rows = parseStudentRows('Name,Father,Mobile,Roll\nAyesha,Karim,01711,7');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      fullName: 'Ayesha', fatherName: 'Karim', mobileNo: '01711', rollNo: 7, problem: '',
    });
  });

  it('does not mistake a line of data for a header line', () => {
    const rows = parseStudentRows('1,Ayesha\n2,Rakib');
    expect(rows.map((r) => r.fullName)).toEqual(['Ayesha', 'Rakib']);
  });

  it('decides roll-first or name-first from the first line, not line by line', () => {
    // A list that does not lead with a number is read as having no rolls in it,
    // so the second column is the father's name and not a roll.
    const names = parseStudentRows('Ayesha,Karim\nRakib,Jashim');
    expect(names.map((r) => r.fullName)).toEqual(['Ayesha', 'Rakib']);
    expect(names.map((r) => r.fatherName)).toEqual(['Karim', 'Jashim']);
    expect(names.every((r) => r.rollNo === null && r.problem === '')).toBe(true);
    const rolls = parseStudentRows('1,Ayesha\n2,Rakib');
    expect(rolls.map((r) => r.rollNo)).toEqual([1, 2]);
  });

  it('stops a row whose roll is not a number, and says what to do about it', () => {
    const rows = parseStudentRows('Roll,Name\nAyesha,Karim');
    expect(rows[0].problem).toContain('not a roll number');
    expect(rows[0].problem).toContain('header line');
  });

  it('stops a row with no name', () => {
    expect(parseStudentRows('5,,Karim')[0].problem).toBe('No name on this line.');
  });

  it('keeps the line number so a problem can be pointed at', () => {
    const rows = parseStudentRows('1,Ayesha\n\n\n2,\n3,Rakib');
    expect(rows.map((r) => r.line)).toEqual([1, 4, 5]);
    expect(rows[1].problem).not.toBe('');
  });

  it('reads a date day-first and stores it the way the app does', () => {
    const rows = parseStudentRows('Roll,Name,DOB\n1,Ayesha,05/03/2012');
    expect(rows[0].dob).toBe('2012-03-05');
  });

  it('leaves out a date it cannot read rather than guessing one', () => {
    const rows = parseStudentRows('Roll,Name,DOB\n1,Ayesha,March 2012');
    expect(rows[0].dob).toBe('');
    expect(rows[0].note).toContain('could not be read');
    expect(rows[0].problem).toBe('');   // the student is still worth saving
  });

  it('reads male and female however they are written', () => {
    const rows = parseStudentRows('Roll,Name,Sex\n1,Ayesha,female\n2,Rakib,M\n3,Sumi,other');
    expect(rows.map((r) => r.gender)).toEqual(['F', 'M', '']);
    expect(rows[2].note).toContain('not male or female');
  });

  it('says so when a paste has more columns than it can place', () => {
    const rows = parseStudentRows('1\tAyesha\tKarim\tFatema\t01711\t2012-03-05\tB+\tScience');
    expect(rows[0].note).toContain('only the first 6 columns');
    expect(rows[0].problem).toBe('');
  });

  it('places every column a header names, however many', () => {
    const rows = parseStudentRows(
      'Roll,Name,Blood,Group,Reg no\n1,Ayesha,B+,Science,2026-1234',
    );
    expect(rows[0]).toMatchObject({
      bloodGroup: 'B+', groupName: 'Science', regNo: '2026-1234', note: '',
    });
  });

  it('ignores a column it has no home for, instead of giving up on the header', () => {
    // The school's own APEX export, header and all. Class, Section, Religion
    // and StudentId have nowhere to go in this app; everything else must still
    // land in the right place.
    const rows = parseStudentRows(
      'Roll,Name,Gender,Reg,Group,Class,Section,Religion,Status,StudentId\n'
      + '1,Samia Putul,Female,123456,Science,Class 9,A,Islam,A,1',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      rollNo: 1,
      fullName: 'Samia Putul',
      fatherName: '',
      gender: 'F',
      regNo: '123456',
      groupName: 'Science',
      problem: '',
      note: '',
    });
  });

  it('still refuses a line with a roll number in it as a header', () => {
    // Two of these cells ARE column names, so the bare 1 is the only thing
    // keeping the line out of the header. Without that guard the real first
    // student would be swallowed and every name below would shift a column.
    const rows = parseStudentRows('1,Name,Group\n2,Ayesha,Science');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ rollNo: 1, fullName: 'Name', fatherName: 'Group' });
    expect(rows[1]).toMatchObject({ rollNo: 2, fullName: 'Ayesha', fatherName: 'Science' });
  });

  it('writes the group the way the picker spells it', () => {
    const rows = parseStudentRows(
      'Roll,Name,Group\n1,Ayesha,commerce\n2,Bashir,SCI\n3,Chaity,Vocational',
    );
    expect(rows.map((r) => r.groupName))
      .toEqual(['Business Studies', 'Science', 'Vocational']);
  });

  it('ignores blank lines and trailing whitespace', () => {
    expect(parseStudentRows('\n\n  \n')).toEqual([]);
    expect(parseStudentRows('  1 , Ayesha  ')[0]).toMatchObject({ rollNo: 1, fullName: 'Ayesha' });
  });
});

describe('settling the rolls against the section', () => {
  const rows = (text: string) => parseStudentRows(text);

  it('gives a roll to every row that has none, continuing past the highest in use', () => {
    const out = prepareStudentRows(rows('Ayesha\nRakib'), [1, 2, 7]);
    expect(out.map((r) => r.rollNo)).toEqual([8, 9]);
    expect(out[0].note).toContain('given automatically');
  });

  it('starts at 1 in an empty section', () => {
    expect(prepareStudentRows(rows('Ayesha\nRakib'), []).map((r) => r.rollNo)).toEqual([1, 2]);
  });

  it('leaves a gap alone — a gap is usually a student who left', () => {
    const out = prepareStudentRows(rows('Ayesha'), [1, 2, 4]);
    expect(out[0].rollNo).toBe(5);
  });

  it('stops the second row when a roll is typed twice in one list', () => {
    const out = prepareStudentRows(rows('5,Ayesha\n5,Rakib'), []);
    expect(out[0].problem).toBe('');
    expect(out[1].problem).toContain('more than one line');
  });

  it('only flags a roll an existing student has: that student may have left', () => {
    const out = prepareStudentRows(rows('5,Ayesha'), [5]);
    expect(out[0].problem).toBe('');
    expect(out[0].note).toContain('already used');
  });

  it('does not hand out a roll that the same paste has claimed', () => {
    const out = prepareStudentRows(rows('Roll,Name\n9,Ayesha\n,Rakib'), [1]);
    expect(out.map((r) => r.rollNo)).toEqual([9, 10]);
  });

  it('leaves a row that cannot be saved without a roll number', () => {
    const out = prepareStudentRows(rows('5,'), []);
    expect(out[0].problem).not.toBe('');
  });
});

describe('a date on its own', () => {
  it('reads what a school writes', () => {
    expect(normalDate('2012-3-5')).toBe('2012-03-05');
    expect(normalDate('5-3-2012')).toBe('2012-03-05');
    expect(normalDate('5.3.2012')).toBe('2012-03-05');
    expect(normalDate('')).toBe('');
    expect(normalDate('5/13/2012')).toBe('');   // no month 13, and not read as May
    expect(normalDate('05/03/12')).toBe('');    // a two-digit year is a guess
  });
});

describe('reading a pasted tally of marks', () => {
  const section = [
    { studentId: '76', rollNo: 1 },
    { studentId: '77', rollNo: 2 },
    { studentId: '78', rollNo: 3 },
  ];

  it('reads a roll and a mark on each line', () => {
    const paste = parseMarkPaste('1 78\n2=65\n3,90');
    expect(paste.kind).toBe('ROLLS');
    const fill = applyMarkPaste(paste, section, 100);
    expect(fill.filled).toBe(3);
    expect(fill.entries['76'].marks).toBe('78');
    expect(fill.entries['78'].marks).toBe('90');
    expect(fill.problem).toBe('');
  });

  it('reads the roll, the name and the mark when three columns were copied', () => {
    const fill = applyMarkPaste(parseMarkPaste('1\tAyesha Khatun\t78'), section, 100);
    expect(fill.entries['76']).toEqual({ marks: '78', absent: false });
  });

  it('marks a child absent however the tally says so', () => {
    const fill = applyMarkPaste(parseMarkPaste('1 A\n2 absent\n3 abs'), section, 100);
    expect(Object.values(fill.entries).every((e) => e.absent && e.marks === '')).toBe(true);
  });

  it('clears a mark where the tally has a dash', () => {
    const fill = applyMarkPaste(parseMarkPaste('1 -'), section, 100);
    expect(fill.entries['76']).toEqual({ marks: '', absent: false });
  });

  it('fills a bare column of marks in roll order', () => {
    const paste = parseMarkPaste('78\n65\n90');
    expect(paste.kind).toBe('MARKS_ONLY');
    const fill = applyMarkPaste(paste, section, 100);
    expect(fill.entries['76'].marks).toBe('78');
    expect(fill.entries['77'].marks).toBe('65');
    expect(fill.entries['78'].marks).toBe('90');
  });

  it('REFUSES a bare column that does not match the section exactly', () => {
    // One line short and every mark below it belongs to the wrong child. This
    // is the whole reason the bare column is treated differently.
    const fill = applyMarkPaste(parseMarkPaste('78\n65'), section, 100);
    expect(fill.filled).toBe(0);
    expect(fill.entries).toEqual({});
    expect(fill.problem).toContain('2 marks for 3 students');
  });

  it('refuses a bare column with a bad line in it rather than shifting the rest', () => {
    const fill = applyMarkPaste(parseMarkPaste('78\nninety\n90'), section, 100);
    expect(fill.filled).toBe(0);
    expect(fill.problem).toContain('moves every mark under it');
  });

  it('names a roll this section does not have, and fills the rest', () => {
    const fill = applyMarkPaste(parseMarkPaste('1 78\n9 65'), section, 100);
    expect(fill.filled).toBe(1);
    expect(fill.unknownRolls).toEqual([9]);
  });

  it('names a mark over the subject full marks, and still fills it in for correction', () => {
    const fill = applyMarkPaste(parseMarkPaste('1 178'), section, 100);
    expect(fill.overRolls).toEqual([1]);
    expect(fill.entries['76'].marks).toBe('178');
  });

  it('skips the heading line a spreadsheet brings with it', () => {
    const paste = parseMarkPaste('Roll\tName\tMarks\n1\tAyesha\t78\n2\tRakib\tA');
    expect(paste.rows).toHaveLength(2);
    expect(paste.rows.every((r) => r.problem === '')).toBe(true);
    expect(paste.rows[0].line).toBe(2);   // still pointing at the right line
    const fill = applyMarkPaste(paste, section, 100);
    expect(fill.entries['76'].marks).toBe('78');
    expect(fill.entries['77'].absent).toBe(true);
  });

  it('does not mistake a single line for a heading', () => {
    expect(parseMarkPaste('Marks').rows[0].problem).toContain('not a mark');
  });

  it('flags a line with no roll when the other lines have one', () => {
    const paste = parseMarkPaste('1 78\n65');
    expect(paste.kind).toBe('ROLLS');
    expect(paste.rows[1].problem).toContain('No roll number');
  });

  it('flags what is not a mark at all', () => {
    expect(parseMarkPaste('1 ninety').rows[0].problem).toContain('not a mark');
    expect(parseMarkPaste('Ayesha 78').rows[0].problem).toContain('does not start with a roll');
  });

  it('says so when the box is empty, or holds nothing this section can use', () => {
    expect(applyMarkPaste(parseMarkPaste(''), section, 100).problem).toContain('nothing in the box');
    expect(applyMarkPaste(parseMarkPaste('9 70'), section, 100).problem).toContain('None of those rolls');
  });

  it('reads a decimal mark', () => {
    const fill = applyMarkPaste(parseMarkPaste('1 77.5'), section, 100);
    expect(fill.entries['76'].marks).toBe('77.5');
  });
});
