import { describe, expect, it } from 'vitest';
import type { Component, Parts, SubjectMark } from './grading';
import { combineUnits, tabulate } from './grading';
import {
  EVEN, examSummary, overallPercent, pctText, progressFor, shortPart, signed,
  subjectPercent,
} from './progress';

/** The SAME cases exist in android/.../data/ProgressTest.kt. */

const sub = (
  name: string,
  marks: number | null,
  over: Partial<SubjectMark> = {},
): SubjectMark => ({
  subjectId: name,
  subjectName: name,
  fullMarks: 100,
  marks,
  ...over,
});

/** Three compulsory subjects, as a section has. */
const exam = (bangla: number | null, english: number | null, maths: number | null) =>
  tabulate([sub('BANGLA', bangla), sub('ENGLISH', english), sub('MATHEMATICS', maths)]);

describe('one student across two exams', () => {
  it('puts each subject on one line, with the move between them', () => {
    const got = progressFor(exam(60, 55, 70), exam(72, 51, 70));
    expect(got.subjects.map((s) => [s.subjectName, s.before, s.after, s.change])).toEqual([
      ['BANGLA', 60, 72, 12],
      ['ENGLISH', 55, 51, -4],
      ['MATHEMATICS', 70, 70, 0],
    ]);
  });

  it('carries the grade from each exam, not just the marks', () => {
    const got = progressFor(exam(60, 55, 70), exam(82, 51, 70));
    expect(got.subjects[0].beforeLetter).toBe('A-');
    expect(got.subjects[0].afterLetter).toBe('A+');
  });

  it('puts the subjects in the school’s order, whichever exam they came from', () => {
    const got = progressFor(exam(60, 55, 70), exam(72, 51, 70));
    expect(got.subjects.map((s) => s.subjectName))
      .toEqual(['BANGLA', 'ENGLISH', 'MATHEMATICS']);
  });

  it('totals and the GPA move too', () => {
    const got = progressFor(exam(60, 55, 70), exam(72, 51, 70));
    expect([got.totalBefore, got.totalAfter, got.totalChange]).toEqual([185, 193, 8]);
    expect(got.gpaBefore).toBeCloseTo(3.5, 2);
    expect(got.gpaAfter).toBeCloseTo(3.67, 2);
    expect(got.verdict).toBe('better');
  });

  it('says worse when the GPA fell, and same when it did not move', () => {
    expect(progressFor(exam(80, 80, 80), exam(50, 50, 50)).verdict).toBe('worse');
    expect(progressFor(exam(80, 80, 80), exam(81, 82, 83)).verdict).toBe('same');
  });
});

describe('what it refuses to compare', () => {
  it('REFUSES to call a paper that was not sat a fall of seventy marks', () => {
    // The figure that gets a child shouted at. A subject in one exam and not
    // the other has no difference to report, and says so.
    const before = tabulate([sub('BANGLA', 70), sub('ENGLISH', 60), sub('AGRICULTURE', 70)]);
    const after = tabulate([sub('BANGLA', 72), sub('ENGLISH', 61)]);
    const got = progressFor(before, after);
    const agri = got.subjects.find((s) => s.subjectName === 'AGRICULTURE')!;
    expect(agri.before).toBe(70);
    expect(agri.after).toBeNull();
    expect(agri.change).toBeNull();
  });

  it('leaves that subject out of BOTH totals, so the two are of one thing', () => {
    const before = tabulate([sub('BANGLA', 70), sub('ENGLISH', 60), sub('AGRICULTURE', 70)]);
    const after = tabulate([sub('BANGLA', 72), sub('ENGLISH', 61)]);
    const got = progressFor(before, after);
    expect([got.totalBefore, got.totalAfter, got.totalChange]).toEqual([130, 133, 3]);
  });

  it('shows a subject that is new in the later exam, with nothing before it', () => {
    const got = progressFor(
      tabulate([sub('BANGLA', 70)]),
      tabulate([sub('BANGLA', 72), sub('ICT', 44, { fullMarks: 50 })]),
    );
    const ict = got.subjects.find((s) => s.subjectName === 'ICT')!;
    expect([ict.before, ict.after, ict.change]).toEqual([null, 44, null]);
  });

  it('withholds the GPA move while either exam is unfinished', () => {
    const got = progressFor(exam(60, 55, 70), exam(72, null, 70));
    expect(got.gpaAfter).toBeNull();
    expect(got.gpaChange).toBeNull();
    expect(got.verdict).toBe('unknown');   // not 'same': not in yet is not level
  });

  it('counts an absence as nought, because the child did sit the exam', () => {
    const after = tabulate([
      sub('BANGLA', null, { absent: true }), sub('ENGLISH', 51), sub('MATHEMATICS', 70),
    ]);
    const got = progressFor(exam(60, 55, 70), after);
    expect(got.subjects[0].after).toBe(0);
    expect(got.subjects[0].change).toBe(-60);
    expect(got.subjects[0].afterLetter).toBe('F');
  });

  it('copes with a student who has only one of the two exams at all', () => {
    const only = progressFor(null, exam(72, 51, 70));
    expect(only.subjects).toHaveLength(3);
    expect(only.subjects.every((s) => s.before === null)).toBe(true);
    expect(only.totalBefore).toBeNull();
    expect(only.verdict).toBe('unknown');
    expect(progressFor(null, null).subjects).toEqual([]);
  });
});

describe('the merit position', () => {
  it('turns the sign over: 12th to 7th is five places BETTER', () => {
    const got = progressFor(exam(60, 55, 70), exam(72, 51, 70), { before: 12, after: 7 });
    expect(got.positionChange).toBe(5);
  });

  it('and 7th to 12th is five worse', () => {
    const got = progressFor(exam(60, 55, 70), exam(72, 51, 70), { before: 7, after: 12 });
    expect(got.positionChange).toBe(-5);
  });

  it('says nothing when either exam left them unranked', () => {
    const got = progressFor(exam(60, 55, 70), exam(72, 51, 70), { before: 12, after: null });
    expect(got.positionChange).toBeNull();
    expect(got.positionBefore).toBe(12);
  });
});

describe('signed', () => {
  it('always shows the sign, because the sign is the point', () => {
    expect(signed(12)).toBe('+12');
    expect(signed(-4)).toBe('−4');
    expect(signed(0.33, 2)).toBe('+0.33');
    expect(signed(-0.33, 2)).toBe('−0.33');
  });

  it('writes no sign on nothing at all', () => {
    expect(signed(0)).toBe('0');
    expect(signed(0, 2)).toBe('0.00');
  });

  it('writes a dash where there is no figure', () => {
    expect(signed(null)).toBe('—');
  });
});

describe('a percentage counted from both exams', () => {
  const half = exam(60, 55, 70);   // 185 / 300  = 61.666…%
  const annual = exam(72, 51, 70); // 193 / 300  = 64.333…%

  it('weighs the two exams the way the split says', () => {
    const p = progressFor(half, annual);
    // 61.6667 x .3 + 64.3333 x .7 = 63.5333…
    expect(overallPercent(p, { before: 30, after: 70 })).toBeCloseTo(63.5333, 3);
    expect(overallPercent(p, { before: 70, after: 30 })).toBeCloseTo(62.4667, 3);
    expect(overallPercent(p, EVEN)).toBeCloseTo(63.0, 3);
  });

  it('reads a split by its proportions, not its digits', () => {
    const p = progressFor(half, annual);
    expect(overallPercent(p, { before: 3, after: 7 }))
      .toBeCloseTo(overallPercent(p, { before: 30, after: 70 })!, 9);
  });

  it('gives each subject its own combined percentage', () => {
    const p = progressFor(half, annual);
    const bangla = p.subjects[0];
    // 60% x .3 + 72% x .7 = 68.4
    expect(subjectPercent(bangla, { before: 30, after: 70 })).toBeCloseTo(68.4, 6);
  });

  it('HOLDS THE SPLIT when the papers are out of different totals', () => {
    // Half-yearly out of 50, annual out of 100 -- the case that catches a
    // percentage built by adding raw marks. 30 of 50 is 60%, 72 of 100 is
    // 72%, so a 30/70 split must give 68.4, exactly as it does above.
    const small = tabulate([sub('BANGLA', 30, { fullMarks: 50 })]);
    const big = tabulate([sub('BANGLA', 72)]);
    const p = progressFor(small, big);
    expect(subjectPercent(p.subjects[0], { before: 30, after: 70 })).toBeCloseTo(68.4, 6);
    expect(overallPercent(p, { before: 30, after: 70 })).toBeCloseTo(68.4, 6);
    // Adding the marks would give 102/150 = 68%, which is NOT a 30/70 split.
    expect(overallPercent(p, { before: 30, after: 70 })).not.toBeCloseTo(68.0, 3);
  });

  it('refuses a subject that only one exam marked', () => {
    const p = progressFor(exam(60, 55, null), exam(72, 51, 70));
    const maths = p.subjects.find((s) => s.subjectName === 'MATHEMATICS')!;
    expect(subjectPercent(maths, EVEN)).toBeNull();
  });

  it('counts an absent paper as nought, because the child sat the exam', () => {
    const p = progressFor(exam(60, 55, 70), tabulate([
      sub('BANGLA', null, { absent: true }), sub('ENGLISH', 51), sub('MATHEMATICS', 70),
    ]));
    expect(subjectPercent(p.subjects[0], EVEN)).toBeCloseTo(30, 6);
  });

  it('says nothing at all when the split is empty', () => {
    const p = progressFor(half, annual);
    expect(overallPercent(p, { before: 0, after: 0 })).toBeNull();
  });

  it('prints a dash rather than NaN%', () => {
    expect(pctText(null)).toBe('—');
    expect(pctText(63.5333)).toBe('63.53%');
    expect(pctText(63.5333, 0)).toBe('64%');
  });
});

describe('the component columns, as page 43 prints them', () => {
  const CQ_MCQ: Component[] = [
    { name: 'CQ', max: 70, pass: 23 },
    { name: 'MCQ', max: 30, pass: 10 },
  ];
  const SCIENCE: Component[] = [
    { name: 'CQ', max: 50, pass: 17 },
    { name: 'MCQ', max: 25, pass: 8 },
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

  it('prints only the components the student is actually marked in', () => {
    // Humanities: CQ and MCQ, and NO Practical column at all.
    const e1 = tabulate([parted('BANGLA', CQ_MCQ, { CQ: 45, MCQ: 20 })]);
    const e2 = tabulate([parted('BANGLA', CQ_MCQ, { CQ: 50, MCQ: 22 })]);
    expect(progressFor(e1, e2).partLabels).toEqual(['MCQ', 'CQ']);
  });

  it('adds Practical for a science student, in marksheet order', () => {
    const e1 = tabulate([parted('PHYSICS', SCIENCE, { CQ: 40, MCQ: 20, PRACTICAL: 20 })]);
    const e2 = tabulate([parted('PHYSICS', SCIENCE, { CQ: 42, MCQ: 21, PRACTICAL: 22 })]);
    expect(progressFor(e1, e2).partLabels).toEqual(['MCQ', 'CQ', 'PRACTICAL']);
  });

  it('carries each exam’s component marks onto the row', () => {
    const e1 = tabulate([parted('PHYSICS', SCIENCE, { CQ: 40, MCQ: 20, PRACTICAL: 20 })]);
    const e2 = tabulate([parted('PHYSICS', SCIENCE, { CQ: 42, MCQ: 21, PRACTICAL: 22 })]);
    const row = progressFor(e1, e2).subjects[0];
    expect(row.partsBefore).toEqual({ CQ: 40, MCQ: 20, PRACTICAL: 20 });
    expect(row.partsAfter).toEqual({ CQ: 42, MCQ: 21, PRACTICAL: 22 });
  });

  it('SUMS like parts across papers merged into one graded unit', () => {
    // Bangla 1st + 2nd are one unit out of 200. A column headed MCQ can hold
    // one figure, so the two papers' MCQ marks are added, not listed twice.
    const unit = () => combineUnits([
      parted('B1', CQ_MCQ, { CQ: 45, MCQ: 20 }, { combineGroup: 'BANGLA' }),
      parted('B2', CQ_MCQ, { CQ: 40, MCQ: 18 }, { combineGroup: 'BANGLA' }),
    ]);
    const got = progressFor(tabulate(unit()), tabulate(unit()));
    expect(got.partLabels).toEqual(['MCQ', 'CQ']);
    expect(got.subjects[0].partsBefore).toEqual({ CQ: 85, MCQ: 38 });
  });

  it('shows no parts for an absent paper, rather than a row of noughts', () => {
    const sat = tabulate([parted('PHYSICS', SCIENCE, { CQ: 40, MCQ: 20, PRACTICAL: 20 })]);
    const missed = tabulate([
      parted('PHYSICS', SCIENCE, {}, { absent: true }),
    ]);
    const row = progressFor(sat, missed).subjects[0];
    expect(row.partsBefore).toEqual({ CQ: 40, MCQ: 20, PRACTICAL: 20 });
    expect(row.partsAfter).toEqual({});
  });

  it('leaves out a component with nothing entered in it yet', () => {
    const e1 = tabulate([parted('PHYSICS', SCIENCE, { CQ: 40, MCQ: 20, PRACTICAL: null })]);
    const e2 = tabulate([parted('PHYSICS', SCIENCE, { CQ: 42, MCQ: 21, PRACTICAL: null })]);
    expect(progressFor(e1, e2).partLabels).toEqual(['MCQ', 'CQ']);
  });

  it('shortens the headings the way the sheet prints them', () => {
    expect(shortPart('MCQ')).toBe('MCQ');
    expect(shortPart('CQ')).toBe('CQ');
    expect(shortPart('PRACTICAL')).toBe('Pract');
    expect(shortPart('WRITTEN')).toBe('Writ');
  });
});

describe('each exam’s own bottom line', () => {
  it('reports a pass, with that exam’s own figures', () => {
    const t = tabulate([sub('BANGLA', 80), sub('ENGLISH', 75), sub('MATHEMATICS', 70)]);
    const got = examSummary(t, 225, 3);
    expect([got.total, got.position, got.result]).toEqual([225, 3, 'Passed']);
    expect(got.letter).not.toBe('—');
  });

  it('reports a fail when a compulsory subject was failed', () => {
    const t = tabulate([sub('BANGLA', 20), sub('ENGLISH', 75), sub('MATHEMATICS', 70)]);
    expect(examSummary(t, 165, 9).result).toBe('Failed');
  });

  it('says neither passed nor failed while a mark is missing', () => {
    const t = tabulate([sub('BANGLA', null), sub('ENGLISH', 75), sub('MATHEMATICS', 70)]);
    const got = examSummary(t, null, null);
    expect(got.result).toBe('—');
    expect(got.gpa).toBeNull();
    expect(got.letter).toBe('—');
  });

  it('has nothing to say about an exam the student did not sit', () => {
    const got = examSummary(null, null, null);
    expect([got.total, got.gpa, got.position]).toEqual([null, null, null]);
    expect(got.result).toBe('—');
  });
});
