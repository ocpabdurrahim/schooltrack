import { describe, expect, it } from 'vitest';
import {
  type Component,
  type Parts,
  type SubjectMark,
  combineUnits,
  gradeFor,
  gradeForSubject,
  subjectTotal,
  tabulate,
  unitName,
  enteredSoFar,} from './grading';

/**
 * The SAME cases exist in android/app/src/test/.../GradingTest.kt. If a case
 * is added here, add it there: the two apps must never show a student two
 * different GPAs.
 */

const sub = (name: string, marks: number | null, extra: Partial<SubjectMark> = {}): SubjectMark => ({
  subjectId: name, subjectName: name, fullMarks: 100, marks, ...extra,
});

describe('gradeFor', () => {
  it('maps the bands', () => {
    expect(gradeFor(80)).toEqual({ letter: 'A+', point: 5 });
    expect(gradeFor(79)).toEqual({ letter: 'A', point: 4 });
    expect(gradeFor(70)).toEqual({ letter: 'A', point: 4 });
    expect(gradeFor(69)).toEqual({ letter: 'A-', point: 3.5 });
    expect(gradeFor(50)).toEqual({ letter: 'B', point: 3 });
    expect(gradeFor(40)).toEqual({ letter: 'C', point: 2 });
    expect(gradeFor(33)).toEqual({ letter: 'D', point: 1 });
    expect(gradeFor(32)).toEqual({ letter: 'F', point: 0 });
    expect(gradeFor(0)).toEqual({ letter: 'F', point: 0 });
  });

  it('grades on the percentage, not the raw mark', () => {
    // a 50-mark paper: 20 is 40% = C, not F
    expect(gradeFor(20, 50)).toEqual({ letter: 'C', point: 2 });
    expect(gradeFor(17, 50)).toEqual({ letter: 'D', point: 1 });   // 34%
    expect(gradeFor(16, 50)).toEqual({ letter: 'F', point: 0 });   // 32%, just under the pass mark
  });

  it('counts absent as F, and a missing mark as no grade', () => {
    expect(gradeFor(90, 100, true)).toEqual({ letter: 'F', point: 0 });
    expect(gradeFor(null)).toEqual({ letter: '-', point: 0 });
  });
});

describe('tabulate', () => {
  it('averages the points', () => {
    const t = tabulate([sub('Bangla', 85), sub('English', 75), sub('Maths', 65)]);
    expect(t.gpa).toBe(4.17);          // (5 + 4 + 3.5) / 3
    expect(t.letter).toBe('A');
    expect(t.incomplete).toBe(false);
  });

  it('fails the whole exam on one F, whatever the rest are', () => {
    const t = tabulate([sub('Bangla', 95), sub('English', 92), sub('Maths', 20)]);
    expect(t.gpa).toBe(0);
    expect(t.letter).toBe('F');
    expect(t.failed).toEqual(['Maths']);
  });

  it('counts an absence as a fail', () => {
    const t = tabulate([sub('Bangla', 95), sub('Maths', null, { absent: true })]);
    expect(t.letter).toBe('F');
    expect(t.failed).toEqual(['Maths']);
  });

  it('adds only the points above 2 from the optional subject', () => {
    const base = [sub('Bangla', 75), sub('English', 75), sub('Maths', 75)];   // 4.00
    const withOptional = tabulate([...base, sub('Agriculture', 85, { isOptional: true })]);
    // (4+4+4 + (5-2)) / 3 = 5.00, and the optional is NOT in the divisor
    expect(withOptional.gpa).toBe(5);
    expect(withOptional.letter).toBe('A+');
  });

  it('gives no bonus for an optional subject at or below 2 points', () => {
    const base = [sub('Bangla', 75), sub('English', 75), sub('Maths', 75)];
    const t = tabulate([...base, sub('Agriculture', 45, { isOptional: true })]);
    expect(t.gpa).toBe(4);
  });

  it('does not fail a student for failing the optional subject', () => {
    const t = tabulate([
      sub('Bangla', 75), sub('English', 75), sub('Maths', 75),
      sub('Agriculture', 10, { isOptional: true }),
    ]);
    expect(t.gpa).toBe(4);
    expect(t.letter).toBe('A');
    expect(t.failed).toEqual([]);
  });

  it('never exceeds 5.00', () => {
    const t = tabulate([
      sub('Bangla', 100), sub('English', 100), sub('Maths', 100),
      sub('Agriculture', 100, { isOptional: true }),
    ]);
    expect(t.gpa).toBe(5);
  });

  it('reports incomplete rather than guessing a GPA', () => {
    const t = tabulate([sub('Bangla', 75), sub('English', null), sub('Maths', 75)]);
    expect(t.gpa).toBeNull();
    expect(t.incomplete).toBe(true);
    expect(t.letter).toBe('-');
  });

  it('is incomplete when there are no compulsory subjects at all', () => {
    const t = tabulate([sub('Agriculture', 80, { isOptional: true })]);
    expect(t.gpa).toBeNull();
    expect(t.incomplete).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// components

const MCQ30_CQ70: Component[] = [
  { name: 'MCQ', max: 30, pass: 10 },
  { name: 'CQ', max: 70, pass: 23 },
];

const SCIENCE: Component[] = [
  { name: 'MCQ', max: 25, pass: 8 },
  { name: 'CQ', max: 50, pass: 17 },
  { name: 'PRACTICAL', max: 25, pass: 8 },
];

const parted = (
  name: string,
  components: Component[],
  parts: Parts,
  extra: Partial<SubjectMark> = {},
): SubjectMark => ({
  subjectId: name,
  subjectName: name,
  fullMarks: components.reduce((t, c) => t + c.max, 0),
  marks: null,
  components,
  parts,
  ...extra,
});

describe('a paper marked in parts', () => {
  it('adds the parts up and grades the total', () => {
    const g = gradeForSubject(parted('Maths', MCQ30_CQ70, { MCQ: 22, CQ: 55 }));
    expect(g.total).toBe(77);
    expect(g).toMatchObject({ letter: 'A', point: 4, failedParts: [] });
  });

  it('FAILS the subject when one part is below its own pass mark', () => {
    // 68 out of 100 is a C by percentage, but the MCQ pass is 10.
    const g = gradeForSubject(parted('Maths', MCQ30_CQ70, { MCQ: 8, CQ: 60 }));
    expect(g.total).toBe(68);
    expect(g).toMatchObject({ letter: 'F', point: 0, failedParts: ['MCQ'] });
  });

  it('names every part that failed, not just the first', () => {
    const g = gradeForSubject(parted('Physics', SCIENCE, { MCQ: 5, CQ: 40, PRACTICAL: 3 }));
    expect(g.failedParts).toEqual(['MCQ', 'PRACTICAL']);
    expect(g.letter).toBe('F');
  });

  it('grades a practical subject on all three parts', () => {
    const g = gradeForSubject(parted('Physics', SCIENCE, { MCQ: 20, CQ: 40, PRACTICAL: 20 }));
    expect(g.total).toBe(80);
    expect(g).toMatchObject({ letter: 'A+', point: 5 });
  });

  it('treats one blank part as not entered, NOT as a zero', () => {
    // The practical has not been marked yet. Scoring it 0 would fail a child
    // who has not sat it.
    const g = gradeForSubject(parted('Physics', SCIENCE, { MCQ: 20, CQ: 40, PRACTICAL: null }));
    expect(g.total).toBeNull();
    expect(g).toMatchObject({ letter: '-', point: 0, failedParts: [] });
  });

  it('still reads a result entered before components existed', () => {
    // Components are defined on the subject, but this row has only a total.
    const g = gradeForSubject({
      subjectId: 'Maths', subjectName: 'Maths', fullMarks: 100,
      marks: 68, components: MCQ30_CQ70,
    });
    expect(g.total).toBe(68);
    expect(g).toMatchObject({ letter: 'A-', point: 3.5, failedParts: [] });
  });

  it('is F when absent, whatever is in the parts', () => {
    const g = gradeForSubject(parted('Maths', MCQ30_CQ70, { MCQ: 30, CQ: 70 }, { absent: true }));
    expect(g).toMatchObject({ letter: 'F', point: 0 });
  });
});

describe('papers graded as one unit', () => {
  const ban1 = parted('Bengali First Paper', MCQ30_CQ70, { MCQ: 25, CQ: 45 },
    { combineGroup: 'BAN' });
  const ban2 = parted('Bengali Second Paper', MCQ30_CQ70, { MCQ: 24, CQ: 56 },
    { combineGroup: 'BAN' });

  it('merges the two papers into one subject out of 200', () => {
    const [unit] = combineUnits([ban1, ban2]);
    expect(unit.subjectName).toBe('Bengali');
    expect(unit.fullMarks).toBe(200);
    expect(subjectTotal(unit)).toBe(150);
    expect(gradeForSubject(unit)).toMatchObject({ letter: 'A', point: 4 });
  });

  it('keeps the unit where the first paper was, not at the end', () => {
    const maths = parted('Maths', MCQ30_CQ70, { MCQ: 20, CQ: 50 });
    const names = combineUnits([ban1, maths, ban2]).map((u) => u.subjectName);
    expect(names).toEqual(['Bengali', 'Maths']);
  });

  it('keeps each paper name on its components so a failure can be told apart', () => {
    const low = parted('Bengali Second Paper', MCQ30_CQ70, { MCQ: 4, CQ: 56 },
      { combineGroup: 'BAN' });
    const [unit] = combineUnits([ban1, low]);
    expect(gradeForSubject(unit).failedParts).toEqual(['Bengali Second Paper MCQ']);
  });

  it('counts the unit once in the GPA, not twice', () => {
    // Four papers, three units: Bengali, English, Maths.
    const eng1 = sub('English First Paper', 70, { combineGroup: 'ENG' });
    const eng2 = sub('English Second Paper', 80, { combineGroup: 'ENG' });
    const maths = sub('Maths', 90);
    const t = tabulate([eng1, eng2, maths]);
    expect(t.subjects.map((s) => s.subjectName)).toEqual(['English', 'Maths']);
    // English 150/200 = 75% = 4.0, Maths 90 = 5.0 -> 4.5
    expect(t.gpa).toBe(4.5);
  });

  it('leaves a lone paper alone when its partner is not in the list', () => {
    const only = sub('Bengali First Paper', 70, { combineGroup: 'BAN' });
    expect(combineUnits([only]).map((u) => u.subjectName)).toEqual(['Bengali First Paper']);
  });

  it('is incomplete while either paper is unmarked', () => {
    const blank = sub('English Second Paper', null, { combineGroup: 'ENG' });
    const eng1 = sub('English First Paper', 70, { combineGroup: 'ENG' });
    expect(tabulate([eng1, blank]).incomplete).toBe(true);
  });
});

describe('unitName', () => {
  it('takes the common beginning of the paper names', () => {
    expect(unitName(['Bengali First Paper', 'Bengali Second Paper'], 'BAN')).toBe('Bengali');
    expect(unitName(['English 1st Paper', 'English 2nd Paper'], 'ENG')).toBe('English');
  });

  it('falls back to the group when the names share nothing', () => {
    expect(unitName(['Bangla', 'Sahitya'], 'BAN')).toBe('BAN');
    expect(unitName([], 'ENG')).toBe('ENG');
  });
});

// ---------------------------------------------------------------------------
// half a subject
//
// From a real morning at the school: English First Paper was keyed in for a
// whole section and the sheet showed a dash, exactly as it did before anyone
// had typed anything. English First and Second are ONE subject out of 200, so
// there genuinely was no mark yet — but the teacher had no way to tell that
// from their work having been thrown away.

describe('enteredSoFar', () => {
  const english: SubjectMark = {
    subjectId: 'UNIT_ENG',
    subjectName: 'ENGLISH',
    fullMarks: 200,
    marks: null,
    combineGroup: 'ENG',
    components: [
      { name: 'ENGLISH 1ST PAPER WRITTEN', max: 100, pass: 0 },
      { name: 'ENGLISH 2ND PAPER WRITTEN', max: 100, pass: 0 },
    ],
  };

  it('adds up the papers that ARE in, while the subject has no total', () => {
    const half = { ...english, parts: { 'ENGLISH 1ST PAPER WRITTEN': 50,
                                        'ENGLISH 2ND PAPER WRITTEN': null } };
    expect(subjectTotal(half)).toBeNull();     // the subject still has no mark
    expect(enteredSoFar(half)).toBe(50);       // but half of it has arrived
  });

  it('is null when the subject is finished — there is a real total to print', () => {
    const whole = { ...english, parts: { 'ENGLISH 1ST PAPER WRITTEN': 50,
                                         'ENGLISH 2ND PAPER WRITTEN': 60 } };
    expect(subjectTotal(whole)).toBe(110);
    expect(enteredSoFar(whole)).toBeNull();
  });

  it('is null when nothing has been entered at all', () => {
    expect(enteredSoFar({ ...english, parts: { 'ENGLISH 1ST PAPER WRITTEN': null,
                                               'ENGLISH 2ND PAPER WRITTEN': null } }))
      .toBeNull();
    expect(enteredSoFar({ ...english, parts: {} })).toBeNull();
  });

  it('says nothing about a paper marked as one mark', () => {
    expect(enteredSoFar({
      subjectId: 'REL', subjectName: 'Religion', fullMarks: 100, marks: null,
    })).toBeNull();
  });
});
