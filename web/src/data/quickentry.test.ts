import { describe, expect, it } from 'vitest';
import type { ResultRow, Subject } from './exams';
import { blankTyped } from './markentry';
import {
  type Roster,
  boxNames,
  buildRoster,
  cleanMark,
  enteredLog,
  fieldBad,
  lookupRoll,
  nextBox,
  progress,
  resultRowFor,
} from './quickentry';

/**
 * The SAME cases exist in android/.../data/QuickEntryTest.kt. Subject-first
 * entry is the flow the office uses all day; it has to behave identically on
 * the phone and in the browser.
 */

const maths: Subject = {
  subjectId: 'MATH',
  subjectName: 'Mathematics',
  classNames: ['Class 9'],
  fullMarks: 100,
  isOptional: false,
  sortOrder: 1,
  components: [{ name: 'CQ', max: 70, pass: 23 }, { name: 'MCQ', max: 30, pass: 10 }],
};

const religion: Subject = {
  ...maths,
  subjectId: 'REL',
  subjectName: 'Religion',
  components: undefined,
};

const physics: Subject = {
  ...maths,
  subjectId: 'PHY',
  subjectName: 'Physics',
  groupNames: ['Science'],
};

const roster = [
  { studentId: 's1', rollNo: 1, fullName: 'Abida Sultana', className: 'Class 9', groupName: 'Science', religion: 'Islam' },
  { studentId: 's2', rollNo: 2, fullName: 'Bashir Ahmed', className: 'Class 9', groupName: 'Humanities', religion: 'Hindu' },
  { studentId: 's3', rollNo: 7, fullName: 'Chandni Roy', className: 'Class 10', groupName: 'Science', religion: 'Islam' },
];

const stored = (over: Partial<ResultRow>): ResultRow => ({
  examId: 'half-yearly-exam-2026',
  studentId: 's1',
  subjectId: 'MATH',
  subjectName: 'Mathematics',
  marks: 77,
  parts: { CQ: 55, MCQ: 22 },
  absent: false,
  classId: 'C9A',
  rollNo: 1,
  fullMarks: 100,
  isOptional: false,
  ...over,
});

describe('buildRoster', () => {
  it('keys the roster by roll, as the roll is typed', () => {
    const r = buildRoster(roster, maths, []);
    expect(Object.keys(r).sort()).toEqual(['1', '2', '7']);
    expect(r['2'].fullName).toBe('Bashir Ahmed');
  });

  it('marks the student whose class does not sit this subject', () => {
    const r = buildRoster(roster, maths, []);
    expect(r['1'].takes).toBe(true);
    expect(r['7'].takes).toBe(false);   // Class 10, and Maths is set up for Class 9
  });

  it('marks the student whose GROUP does not sit this subject', () => {
    const r = buildRoster(roster, physics, []);
    expect(r['1'].takes).toBe(true);    // Science
    expect(r['2'].takes).toBe(false);   // Humanities, and Physics is a Science paper
  });

  it('marks the student whose RELIGION does not sit this subject', () => {
    const r = buildRoster(roster, { ...maths, religions: ['Islam'] }, []);
    expect(r['1'].takes).toBe(true);    // Islam
    expect(r['2'].takes).toBe(false);   // Hindu, and this is the Islam paper
  });

  it('fills the boxes from what is already stored', () => {
    const r = buildRoster(roster, maths, [stored({})]);
    expect(r['1'].typed.parts).toEqual({ CQ: '55', MCQ: '22' });
    expect(r['1'].stored).toBe(true);
    expect(r['2'].typed).toEqual(blankTyped());
    expect(r['2'].stored).toBe(false);
  });

  it('ignores marks belonging to another subject', () => {
    const r = buildRoster(roster, maths, [stored({ subjectId: 'ENG1', marks: 40 })]);
    expect(r['1'].stored).toBe(false);
    expect(r['1'].typed).toEqual(blankTyped());
  });

  it('counts an absent student as entered, and an empty row as not', () => {
    const absent = buildRoster(roster, maths, [
      stored({ marks: null, parts: null, absent: true }),
    ]);
    expect(absent['1'].stored).toBe(true);
    expect(absent['1'].typed.absent).toBe(true);

    const nothing = buildRoster(roster, maths, [
      stored({ marks: null, parts: { CQ: null, MCQ: null } }),
    ]);
    expect(nothing['1'].stored).toBe(false);
  });

  it('keeps the save time for the entered list', () => {
    const r = buildRoster(roster, maths, [stored({ updatedAt: 1_700_000_000_000 })]);
    expect(r['1'].savedAt).toBe(1_700_000_000_000);
    expect(r['2'].savedAt).toBeNull();
  });
});

describe('lookupRoll', () => {
  const r = buildRoster(roster, maths, []);

  it('says nothing at all for an empty box', () => {
    expect(lookupRoll(r, '').kind).toBe('blank');
    expect(lookupRoll(r, '   ').kind).toBe('blank');
  });

  it('finds the student', () => {
    const got = lookupRoll(r, '2');
    expect(got.kind).toBe('found');
    if (got.kind === 'found') expect(got.row.fullName).toBe('Bashir Ahmed');
  });

  it('finds a roll typed with padding', () => {
    const got = lookupRoll(r, '007');
    expect(got.kind).toBe('notTaken');          // roll 7 exists, but sits Class 10
    if (got.kind === 'notTaken') expect(got.row.rollNo).toBe(7);
  });

  it('tells a mistyped roll apart from one that does not sit the subject', () => {
    expect(lookupRoll(r, '99').kind).toBe('notFound');
    expect(lookupRoll(r, '7').kind).toBe('notTaken');
  });

  it('is not fooled by a box holding letters', () => {
    expect(lookupRoll(r, 'ab').kind).toBe('notFound');
  });
});

describe('cleanMark', () => {
  it('keeps digits only', () => {
    expect(cleanMark('55')).toBe('55');
    expect(cleanMark('5a5')).toBe('55');
    expect(cleanMark('-12')).toBe('12');
  });

  it('allows one dot, for the papers marked in halves', () => {
    expect(cleanMark('12.5')).toBe('12.5');
    expect(cleanMark('12.5.7')).toBe('12.57');
  });
});

describe('fieldBad', () => {
  it('is quiet about an empty box', () => {
    expect(fieldBad(70, '')).toBe(false);
    expect(fieldBad(70, '   ')).toBe(false);
  });

  it('catches a mark above what the part is out of', () => {
    expect(fieldBad(70, '71')).toBe(true);
    expect(fieldBad(70, '70')).toBe(false);
  });

  it('catches nonsense and negatives', () => {
    expect(fieldBad(70, 'ab')).toBe(true);
    expect(fieldBad(70, '-5')).toBe(true);
  });

  it('does NOT flag a failing mark — failing is a real result', () => {
    expect(fieldBad(30, '8')).toBe(false);     // MCQ pass is 10; 8 is a fail, not a typo
  });
});

describe('boxNames and nextBox', () => {
  it('lists the parts the paper is marked in', () => {
    expect(boxNames(maths)).toEqual(['CQ', 'MCQ']);
    expect(boxNames(religion)).toEqual([]);
  });

  it('walks the parts and then says to save', () => {
    expect(nextBox(['CQ', 'MCQ'], 'CQ')).toBe('MCQ');
    expect(nextBox(['CQ', 'MCQ'], 'MCQ')).toBeNull();
    expect(nextBox([], '')).toBeNull();
  });
});

describe('enteredLog', () => {
  const r: Roster = buildRoster(roster, maths, [
    stored({ updatedAt: 1_000 }),
    stored({ studentId: 's2', rollNo: 2, parts: { CQ: 60, MCQ: 8 }, marks: 68, updatedAt: 2_000 }),
  ]);

  it('lists only what has been entered', () => {
    expect(enteredLog(r, maths).map((x) => x.rollNo)).toEqual([2, 1]);
  });

  it('puts the row just keyed in at the top', () => {
    expect(enteredLog(r, maths)[0].rollNo).toBe(2);
  });

  it('applies the component pass mark, not just the total', () => {
    const [first, second] = enteredLog(r, maths);
    expect(first.total).toBe(68);
    expect(first.grade.letter).toBe('F');            // 68/100, but MCQ 8 is below 10
    expect(first.grade.failedParts).toEqual(['MCQ']);
    expect(second.total).toBe(77);
    expect(second.grade.letter).toBe('A');
  });

  it('falls back to roll order where no time is known', () => {
    const noTimes = buildRoster(roster, maths, [
      stored({ studentId: 's2', rollNo: 2 }),
      stored({}),
    ]);
    expect(enteredLog(noTimes, maths).map((x) => x.rollNo)).toEqual([1, 2]);
  });
});

describe('progress', () => {
  it('counts only the students who sit the subject', () => {
    const r = buildRoster(roster, maths, [stored({})]);
    expect(progress(r)).toEqual({ done: 1, takes: 2 });   // roll 7 is Class 10
  });
});

describe('resultRowFor', () => {
  it('works the total out from the parts rather than trusting one', () => {
    const row = resultRowFor('ex1', 'C9A', maths, { studentId: 's1', rollNo: 1 }, {
      ...blankTyped(), parts: { CQ: '55', MCQ: '22' },
    });
    expect(row.marks).toBe(77);
    expect(row.parts).toEqual({ CQ: 55, MCQ: 22 });
    expect(row.subjectName).toBe('Mathematics');
    expect(row.fullMarks).toBe(100);
  });

  it('stores no parts for a paper marked as one mark', () => {
    const row = resultRowFor('ex1', 'C9A', religion, { studentId: 's1', rollNo: 1 }, {
      ...blankTyped(), marks: '71',
    });
    expect(row.parts).toBeNull();
    expect(row.marks).toBe(71);
  });

  it('keeps an absent student with no marks at all', () => {
    const row = resultRowFor('ex1', 'C9A', maths, { studentId: 's1', rollNo: 1 }, {
      ...blankTyped(), absent: true,
    });
    expect(row.absent).toBe(true);
    expect(row.marks).toBeNull();
  });
});
