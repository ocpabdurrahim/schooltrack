import { describe, expect, it } from 'vitest';
import type { Component } from './grading';
import {
  type Chosen,
  type ScanRead,
  type Student,
  checkScan,
  classNumber,
  headerFindings,
  matchComponent,
  sameSubject,
} from './scanmarks';

/**
 * The SAME cases exist in android/.../data/ScanMarksTest.kt.
 *
 * The sheet below is the real one: the photographed Half Yearly History form
 * for class Ten, read row by row, including roll 23 where the teacher wrote
 * over both the CQ and the total and the two no longer agree.
 */

const CQ_MCQ: Component[] = [
  { name: 'CQ', max: 70, pass: 23 },
  { name: 'MCQ', max: 30, pass: 10 },
];
const WITH_PRAC: Component[] = [
  { name: 'CQ', max: 50, pass: 17 },
  { name: 'MCQ', max: 25, pass: 8 },
  { name: 'PRACTICAL', max: 25, pass: 8 },
];

const history: Chosen = {
  sectionName: 'Class 10 - A',
  className: 'Class 10',
  subjectName: 'HISTORY OF BANGLADESH AND WORLD CIVILIZATION',
  examName: 'HALF YEARLY EXAM 2026',
  fullMarks: 100,
  components: CQ_MCQ,
};

const header = {
  exam: 'Half Yearly', year: '2026', className: 'Ten', subject: 'History',
};

/** Roll, CQ, MCQ, the total as written. Prac is blank on every row. */
const SHEET: [number, number, number, number][] = [
  [3, 51, 18, 69],
  [4, 56, 18, 74],
  [5, 40, 15, 55],
  [12, 34, 12, 46],
  [13, 34, 15, 49],
  [14, 32, 15, 47],
  [18, 46, 14, 60],
  [23, 28, 15, 53],   // written over on the paper: 28 + 15 is 43, not 53
  [27, 28, 10, 38],
  [30, 27, 13, 40],
  [35, 23, 12, 35],
  [36, 23, 9, 32],
  [37, 27, 12, 39],
  [42, 26, 11, 37],
  [43, 20, 13, 33],
  [47, 13, 12, 25],
  [54, 23, 11, 34],
  [57, 25, 6, 31],
  [59, 2, 11, 13],
  [61, 2, 11, 13],
  [65, 42, 15, 57],
];

const read = (over: Partial<ScanRead> = {}): ScanRead => ({
  header,
  rows: SHEET.map(([roll, cq, mcq, total]) => ({
    roll,
    values: { CQ: cq, MCQ: mcq, Prac: null, Total: total },
  })),
  ...over,
});

/** Rolls 1 to 99, so every roll on the sheet is a real student. */
const CLASS: Student[] = Array.from({ length: 99 }, (_, i) => ({
  studentId: `s${i + 1}`, rollNo: i + 1, fullName: `Student ${i + 1}`,
}));

const row = (c: ReturnType<typeof checkScan>, roll: number) =>
  c.rows.find((r) => r.rollNo === roll)!;

describe('matchComponent', () => {
  it('matches a column to the part it abbreviates', () => {
    expect(matchComponent('Prac', WITH_PRAC)?.name).toBe('PRACTICAL');
    expect(matchComponent('CQ', CQ_MCQ)?.name).toBe('CQ');
    expect(matchComponent('mcq', CQ_MCQ)?.name).toBe('MCQ');
  });

  it('never mistakes CQ for MCQ', () => {
    // Neither is a prefix of the other, which is what keeps them apart.
    expect(matchComponent('CQ', [{ name: 'MCQ', max: 30, pass: 10 }])).toBeNull();
    expect(matchComponent('MCQ', [{ name: 'CQ', max: 70, pass: 23 }])).toBeNull();
  });

  it('is not a part at all for the total column', () => {
    expect(matchComponent('Total', CQ_MCQ)).toBeNull();
  });

  it('gives null for a part this subject has not got', () => {
    expect(matchComponent('Prac', CQ_MCQ)).toBeNull();
  });
});

describe('classNumber', () => {
  it('reads the class a teacher writes', () => {
    expect(classNumber('Ten')).toBe(10);
    expect(classNumber('ten')).toBe(10);
    expect(classNumber('Class 10 - A')).toBe(10);
    expect(classNumber('10')).toBe(10);
    expect(classNumber('Nine')).toBe(9);
  });

  it('gives null for something it cannot place', () => {
    expect(classNumber('')).toBeNull();
    expect(classNumber('Dakhil')).toBeNull();
  });
});

describe('sameSubject', () => {
  it('knows the short name a teacher writes is the long one on file', () => {
    expect(sameSubject('History', 'HISTORY OF BANGLADESH AND WORLD CIVILIZATION')).toBe(true);
    expect(sameSubject('Agriculture', 'AGRICULTURE')).toBe(true);
    expect(sameSubject('ICT', 'ICT')).toBe(true);
  });

  it('tells two different subjects apart', () => {
    expect(sameSubject('History', 'GEOGRAPHY')).toBe(false);
    expect(sameSubject('Physics', 'CHEMISTRY')).toBe(false);
  });
});

describe('headerFindings', () => {
  it('STOPS a sheet whose class is not the section chosen', () => {
    // The whole reason this exists: a Class 10 sheet applied to Class 9 would
    // match on every roll and hand 21 children someone else's marks.
    const f = headerFindings(header, { ...history, sectionName: 'Class 9 - A', className: 'Class 9' });
    expect(f.some((x) => x.level === 'STOP')).toBe(true);
    expect(f.find((x) => x.level === 'STOP')!.message).toContain('wrong children');
  });

  it('is happy when the sheet and the section agree', () => {
    expect(headerFindings(header, history).filter((f) => f.level !== 'OK')).toHaveLength(0);
  });

  it('STOPS a sheet headed with another subject', () => {
    const f = headerFindings({ ...header, subject: 'Geography' }, history);
    expect(f.some((x) => x.level === 'STOP')).toBe(true);
  });

  it('only warns when the class could not be read', () => {
    const f = headerFindings({ ...header, className: '' }, history);
    expect(f.every((x) => x.level !== 'STOP')).toBe(true);
    expect(f.some((x) => x.level === 'WARN')).toBe(true);
  });

  it('only warns about the exam, which is struck out by hand', () => {
    const f = headerFindings({ ...header, exam: 'Annual' }, history);
    expect(f.every((x) => x.level !== 'STOP')).toBe(true);
    expect(f.some((x) => x.message.includes('misread'))).toBe(true);
  });
});

describe('checkScan on the real History sheet', () => {
  const checked = checkScan(read(), CLASS, history);

  it('fills every row but the one that does not add up', () => {
    expect(checked.rows).toHaveLength(21);
    expect(checked.filled).toBe(20);
    expect(checked.held).toBe(1);
  });

  it('holds roll 23 back and says why', () => {
    const r = row(checked, 23);
    expect(r.problem).toContain('come to 43');
    expect(r.problem).toContain('53');
    expect(checked.entries.s23).toBeUndefined();
  });

  it('puts the parts in the boxes, and no total', () => {
    const r = row(checked, 3);
    expect(r.parts).toEqual({ CQ: '51', MCQ: '18' });
    expect(r.computed).toBe(69);
    expect(r.written).toBe(69);
    expect(checked.entries.s3).toEqual({ marks: '', parts: { CQ: '51', MCQ: '18' }, absent: false });
  });

  it('says nothing about the empty Prac column, because History has no Prac', () => {
    expect(row(checked, 3).problem).toBe('');
    expect(row(checked, 3).note).toBe('');
  });

  it('skips the empty rows entirely rather than entering zeros', () => {
    // 99 printed rolls, 21 written on.
    expect(checked.rows.every((r) => r.computed !== null || r.problem !== '')).toBe(true);
    expect(Object.keys(checked.entries)).toHaveLength(20);
    expect(checked.entries.s1).toBeUndefined();
  });

  it('reads the rows back in roll order whatever order they came in', () => {
    const shuffled = { ...read(), rows: [...read().rows].reverse() };
    const got = checkScan(shuffled, CLASS, history);
    expect(got.rows.map((r) => r.rollNo)).toEqual(SHEET.map(([roll]) => roll));
  });

  it('names the student against each row, so the paper can be checked by eye', () => {
    expect(row(checked, 65).studentName).toBe('Student 65');
  });
});

describe('checkScan: rows that must not be trusted', () => {
  const one = (values: Record<string, number | null>, roll: number | null = 7, c = history) =>
    checkScan({ header, rows: [{ roll, values }] }, CLASS, c).rows[0];

  it('holds a roll this section has not got', () => {
    const r = one({ CQ: 50, MCQ: 20, Total: 70 }, 400);
    expect(r.problem).toContain('not in this section');
  });

  it('holds a row whose roll could not be read', () => {
    const r = one({ CQ: 50, MCQ: 20, Total: 70 }, null);
    expect(r.problem).toContain('No roll number');
  });

  it('holds a part written over its own maximum', () => {
    const r = one({ CQ: 80, MCQ: 20, Total: 100 });
    expect(r.problem).toContain('over the 70');
  });

  it('holds a part the subject does not have', () => {
    // A Prac mark against History: the sheet and the subject disagree, and
    // dropping it quietly would store a total that is missing a part.
    const r = one({ CQ: 40, MCQ: 15, Prac: 20, Total: 75 });
    expect(r.problem).toContain('no "Prac"');
  });

  it('holds a total that cannot be split into parts', () => {
    const r = one({ Total: 55 });
    expect(r.problem).toContain('cannot be split');
  });

  it('holds the same roll written twice', () => {
    const twice = checkScan({
      header,
      rows: [
        { roll: 9, values: { CQ: 40, MCQ: 15, Total: 55 } },
        { roll: 9, values: { CQ: 41, MCQ: 15, Total: 56 } },
      ],
    }, CLASS, history);
    expect(twice.rows[1].problem).toContain('twice');
    expect(twice.filled).toBe(1);
  });

  it('fills nothing at all when the header STOPS the sheet', () => {
    const wrong = checkScan(read(), CLASS, { ...history, className: 'Class 9', sectionName: 'Class 9 - A' });
    expect(wrong.filled).toBe(0);
    expect(Object.keys(wrong.entries)).toHaveLength(0);
    // The rows are still shown: the person needs to see what was on the paper.
    expect(wrong.rows).toHaveLength(21);
  });
});

describe('checkScan: subjects marked other ways', () => {
  it('takes the total as the mark when the paper has no parts', () => {
    const whole: Chosen = { ...history, subjectName: 'GEOGRAPHY', components: [] };
    const r = checkScan({
      header: { ...header, subject: 'Geography' },
      rows: [{ roll: 7, values: { CQ: null, MCQ: null, Total: 64 } }],
    }, CLASS, whole);
    expect(r.rows[0].marks).toBe('64');
    expect(r.rows[0].parts).toEqual({});
    expect(r.entries.s7).toEqual({ marks: '64', parts: {}, absent: false });
  });

  it('refuses a whole-paper mark over the full marks', () => {
    const whole: Chosen = { ...history, subjectName: 'GEOGRAPHY', components: [], fullMarks: 100 };
    const r = checkScan({
      header: { ...header, subject: 'Geography' },
      rows: [{ roll: 7, values: { Total: 140 } }],
    }, CLASS, whole);
    expect(r.rows[0].problem).toContain('more than the 100');
  });

  it('takes a lone total as the one part when the paper has only one', () => {
    const written: Chosen = {
      ...history,
      subjectName: 'ENGLISH 1ST PAPER',
      components: [{ name: 'WRITTEN', max: 100, pass: 33 }],
    };
    const r = checkScan({
      header: { ...header, subject: 'English 1st Paper' },
      rows: [{ roll: 7, values: { Total: 72 } }],
    }, CLASS, written);
    expect(r.rows[0].parts).toEqual({ WRITTEN: '72' });
    expect(r.rows[0].note).toContain('only that one part');
    expect(r.filled).toBe(1);
  });

  it('checks all three parts of a practical subject against the total', () => {
    const agri: Chosen = { ...history, subjectName: 'AGRICULTURE', components: WITH_PRAC };
    const ok = checkScan({
      header: { ...header, subject: 'Agriculture' },
      rows: [{ roll: 47, values: { CQ: 15, MCQ: 10, Prac: 25, Total: 50 } }],
    }, CLASS, agri);
    expect(ok.rows[0].problem).toBe('');
    expect(ok.rows[0].parts).toEqual({ CQ: '15', MCQ: '10', PRACTICAL: '25' });

    const bad = checkScan({
      header: { ...header, subject: 'Agriculture' },
      rows: [{ roll: 56, values: { CQ: 8, MCQ: 11, Prac: 25, Total: 49 } }],
    }, CLASS, agri);
    expect(bad.rows[0].problem).toContain('come to 44');
  });

  it('notes a part left blank rather than calling it zero', () => {
    const agri: Chosen = { ...history, subjectName: 'AGRICULTURE', components: WITH_PRAC };
    const r = checkScan({
      header: { ...header, subject: 'Agriculture' },
      rows: [{ roll: 7, values: { CQ: 15, MCQ: 10, Prac: null, Total: 25 } }],
    }, CLASS, agri);
    expect(r.rows[0].problem).toBe('');
    expect(r.rows[0].note).toContain('PRACTICAL');
    expect(r.rows[0].parts.PRACTICAL).toBeUndefined();
    expect(r.filled).toBe(1);
  });

  it('notes a row with parts but no total written', () => {
    const r = checkScan({
      header, rows: [{ roll: 7, values: { CQ: 40, MCQ: 15, Total: null } }],
    }, CLASS, history);
    expect(r.rows[0].problem).toBe('');
    expect(r.rows[0].note).toContain('nothing to check');
    expect(r.filled).toBe(1);
  });
});
