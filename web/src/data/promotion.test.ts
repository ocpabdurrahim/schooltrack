import { describe, expect, it } from 'vitest';
import {
  type Candidate,
  classNumberOf,
  meritOrder,
  nextClassAbove,
  promotionPlan,
  standing,
} from './promotion';

/** The SAME cases exist in android/.../data/PromotionTest.kt. */

const who = (
  rollNo: number, gpa: number | null, total: number | null, extra: Partial<Candidate> = {},
): Candidate => ({
  studentId: `s${rollNo}`,
  fullName: `Student ${rollNo}`,
  rollNo,
  gpa,
  total,
  failed: [],
  incomplete: false,
  ...extra,
});

describe('how a result stands', () => {
  it('tells a missing mark apart from a failed subject', () => {
    // On a sheet both look like a blank, and they could not be less alike:
    // one is work the school has not done, the other a result for the child.
    expect(standing(who(1, null, null, { incomplete: true }))).toBe('INCOMPLETE');
    expect(standing(who(2, 0, 300, { failed: ['MATHS'] }))).toBe('FAILED');
    expect(standing(who(3, 4.5, 700))).toBe('PASSED');
  });

  it('counts a null GPA as incomplete even when nothing says so', () => {
    expect(standing(who(1, null, 400))).toBe('INCOMPLETE');
  });
});

describe('the merit list', () => {
  it('puts the best GPA first', () => {
    const got = meritOrder([who(1, 3.5, 600), who(2, 5, 800), who(3, 4.2, 700)]);
    expect(got.map((c) => c.rollNo)).toEqual([2, 3, 1]);
  });

  it('breaks a tie on GPA with the total marks', () => {
    const got = meritOrder([who(1, 5, 780), who(2, 5, 810)]);
    expect(got.map((c) => c.rollNo)).toEqual([2, 1]);
  });

  it('breaks a dead tie on the roll number, so the list cannot shuffle', () => {
    // Without this the same two children swap places every time the screen is
    // built, and the roll numbers on offer change between looking and pressing.
    const a = meritOrder([who(7, 5, 800), who(3, 5, 800)]);
    const b = meritOrder([who(3, 5, 800), who(7, 5, 800)]);
    expect(a.map((c) => c.rollNo)).toEqual([3, 7]);
    expect(b.map((c) => c.rollNo)).toEqual([3, 7]);
  });

  it('sorts failures below everyone who passed, however high the total', () => {
    const got = meritOrder([
      who(1, 0, 900, { failed: ['MATHS'] }),
      who(2, 2.5, 400),
    ]);
    expect(got.map((c) => c.rollNo)).toEqual([2, 1]);
  });

  it('sorts an unfinished result below a failure', () => {
    const got = meritOrder([
      who(1, null, null, { incomplete: true }),
      who(2, 0, 300, { failed: ['MATHS'] }),
    ]);
    expect(got.map((c) => c.rollNo)).toEqual([2, 1]);
  });

  it('does not disturb the list it was given', () => {
    const given = [who(1, 3, 500), who(2, 5, 800)];
    meritOrder(given);
    expect(given.map((c) => c.rollNo)).toEqual([1, 2]);
  });
});

describe('moving a class up', () => {
  const three = [who(5, 4.0, 700), who(2, 5.0, 820), who(9, 3.2, 560)];

  it('hands out roll numbers in merit order, starting at one', () => {
    const plan = promotionPlan({
      fromClassId: 'class-9-a', toClassId: 'class-10-a', candidates: three,
    });
    expect(plan.problem).toBe('');
    expect(plan.moves.map((m) => [m.fromRoll, m.toRoll])).toEqual([[2, 1], [5, 2], [9, 3]]);
    expect(plan.moves.every((m) => m.toClassId === 'class-10-a')).toBe(true);
  });

  it('keeps a failed student where they are, with the roll they have', () => {
    const plan = promotionPlan({
      fromClassId: 'class-9-a',
      toClassId: 'class-10-a',
      candidates: [who(1, 5, 800), who(2, 0, 300, { failed: ['MATHS'] })],
    });
    const stayed = plan.moves.find((m) => m.fromRoll === 2);
    expect(stayed?.what).toBe('STAYS');
    expect(stayed?.toClassId).toBe('class-9-a');
    expect(stayed?.toRoll).toBeNull();
    expect(plan.warnings.join(' ')).toMatch(/staying down/i);
  });

  it('takes a failed student up when they have been ticked', () => {
    const plan = promotionPlan({
      fromClassId: 'class-9-a',
      toClassId: 'class-10-a',
      candidates: [who(1, 5, 800), who(2, 0, 300, { failed: ['MATHS'] })],
      takeAnyway: ['s2'],
    });
    expect(plan.moves.map((m) => m.what)).toEqual(['UP', 'UP']);
    // and goes to the bottom of the merit list, not the middle of it
    expect(plan.moves.map((m) => [m.fromRoll, m.toRoll])).toEqual([[1, 1], [2, 2]]);
    expect(plan.warnings.join(' ')).toMatch(/without a passing result/i);
  });

  it('does not number the students who stay, so the numbers run 1, 2, 3', () => {
    const plan = promotionPlan({
      fromClassId: 'class-9-a',
      toClassId: 'class-10-a',
      candidates: [
        who(1, 5, 800),
        who(2, 0, 300, { failed: ['MATHS'] }),
        who(3, 4, 700),
      ],
    });
    expect(plan.moves.filter((m) => m.what === 'UP').map((m) => m.toRoll)).toEqual([1, 2]);
  });

  it('archives a class with nothing above it, and gives no new roll', () => {
    // Class Ten: its Test is the last exam the school sets.
    const plan = promotionPlan({
      fromClassId: 'class-10-a', toClassId: null, candidates: three,
    });
    expect(plan.moves.every((m) => m.what === 'ARCHIVED')).toBe(true);
    expect(plan.moves.every((m) => m.toRoll === null)).toBe(true);
    expect(plan.moves.every((m) => m.toClassId === null)).toBe(true);
  });

  it('still holds a failure back rather than archiving them', () => {
    const plan = promotionPlan({
      fromClassId: 'class-10-a',
      toClassId: null,
      candidates: [who(1, 5, 800), who(2, 0, 300, { failed: ['MATHS'] })],
    });
    expect(plan.moves.map((m) => m.what)).toEqual(['ARCHIVED', 'STAYS']);
  });

  it('refuses to promote into a class that already has students', () => {
    // Their roll numbers would collide with the ones being handed out.
    const plan = promotionPlan({
      fromClassId: 'class-9-a',
      toClassId: 'class-10-a',
      candidates: three,
      alreadyThere: [{ rollNo: 1, fullName: 'Someone' }],
    });
    expect(plan.moves).toHaveLength(0);
    expect(plan.problem).toMatch(/already has 1 student/i);
  });

  it('says so plainly when there is nobody to move', () => {
    expect(promotionPlan({ fromClassId: 'c', toClassId: 'd', candidates: [] }).problem)
      .toMatch(/no students/i);
    expect(promotionPlan({ fromClassId: '', toClassId: 'd', candidates: three }).problem)
      .toMatch(/no class/i);
  });
});

describe('which class is above', () => {
  const classes = [
    { classId: 'c9a', className: 'Class 9', section: 'A' },
    { classId: 'c10a', className: 'Class 10', section: 'A' },
    { classId: 'c10b', className: 'Class 10', section: 'B' },
    { classId: 'c6a', className: 'Class 6', section: 'A' },
  ];

  it('reads the number out of the name, in digits or in words', () => {
    expect(classNumberOf('Class 9')).toBe(9);
    expect(classNumberOf('Ten')).toBe(10);
    expect(classNumberOf('class six')).toBe(6);
    expect(classNumberOf('Nursery')).toBeNull();
  });

  it('goes up one, keeping the section', () => {
    expect(nextClassAbove(classes[0], classes)?.classId).toBe('c10a');
  });

  it('has nowhere to go above the top class', () => {
    expect(nextClassAbove(classes[1], classes)).toBeNull();
  });

  it('does not use the order the classes happen to be stored in', () => {
    // "Class 10" sorts before "Class 6" as text, which is why the number is
    // read rather than the position.
    expect(nextClassAbove(classes[3], classes)).toBeNull();  // no Class 7 here
  });
});
