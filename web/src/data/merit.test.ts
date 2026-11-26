import { describe, expect, it } from 'vitest';
import type { MeritKey } from './merit';
import { compareMerit, meritPositions } from './merit';

/** The SAME cases exist in android/.../data/MeritTest.kt. */

const key = (over: Partial<MeritKey> = {}): MeritKey => ({
  incomplete: false,
  gpa: 4,
  failed: 0,
  total: 800,
  firstPaper: 70,
  rollNo: 1,
  ...over,
});

/** The rolls, best first. */
const order = (keys: MeritKey[]) =>
  [...keys].sort(compareMerit).map((k) => k.rollNo);

describe('the merit chain', () => {
  it('puts the higher GPA first', () => {
    expect(order([
      key({ rollNo: 1, gpa: 3.5 }),
      key({ rollNo: 2, gpa: 4.5 }),
      key({ rollNo: 3, gpa: 4 }),
    ])).toEqual([2, 3, 1]);
  });

  it('breaks an equal GPA on total marks', () => {
    expect(order([
      key({ rollNo: 1, gpa: 4, total: 780 }),
      key({ rollNo: 2, gpa: 4, total: 812 }),
    ])).toEqual([2, 1]);
  });

  it('breaks an equal total on the first paper of the order', () => {
    // Bangla 1st Paper, for this school.
    expect(order([
      key({ rollNo: 1, gpa: 4, total: 800, firstPaper: 66 }),
      key({ rollNo: 2, gpa: 4, total: 800, firstPaper: 71 }),
    ])).toEqual([2, 1]);
  });

  it('breaks everything else on the roll, lowest first', () => {
    expect(order([
      key({ rollNo: 9 }), key({ rollNo: 2 }), key({ rollNo: 5 }),
    ])).toEqual([2, 5, 9]);
  });

  it('IS THE SCHOOL RULE: fewer subjects failed ranks higher', () => {
    // Even though roll 2 scored 90 marks more over the exam. A student who
    // failed one paper is ahead of one who failed three.
    expect(order([
      key({ rollNo: 1, gpa: 0, failed: 1, total: 510 }),
      key({ rollNo: 2, gpa: 0, failed: 3, total: 600 }),
    ])).toEqual([1, 2]);
  });

  it('still orders two equal failures by marks, then the first paper', () => {
    expect(order([
      key({ rollNo: 1, gpa: 0, failed: 2, total: 480, firstPaper: 50 }),
      key({ rollNo: 2, gpa: 0, failed: 2, total: 520, firstPaper: 40 }),
      key({ rollNo: 3, gpa: 0, failed: 2, total: 480, firstPaper: 61 }),
    ])).toEqual([2, 3, 1]);
  });

  it('puts every passing student above every failure', () => {
    // A pass is a GPA above zero, so rung 2 settles it before failures are
    // counted at all — the thinnest pass beats the best fail.
    expect(order([
      key({ rollNo: 1, gpa: 0, failed: 1, total: 700 }),
      key({ rollNo: 2, gpa: 1, failed: 0, total: 400 }),
    ])).toEqual([2, 1]);
  });

  it('sorts a withheld figure below a real one, never above', () => {
    expect(order([
      key({ rollNo: 1, gpa: 4, total: null }),
      key({ rollNo: 2, gpa: 4, total: 1 }),
    ])).toEqual([2, 1]);
  });

  it('leaves the unfinished at the end whatever they scored', () => {
    expect(order([
      key({ rollNo: 1, incomplete: true, gpa: null }),
      key({ rollNo: 2, gpa: 0, failed: 5, total: 100 }),
    ])).toEqual([2, 1]);
  });

  it('answers the same way whichever side the pair is handed in', () => {
    const a = key({ rollNo: 4, gpa: 4, total: 800 });
    const b = key({ rollNo: 7, gpa: 4, total: 800 });
    expect(Math.sign(compareMerit(a, b))).toBe(-Math.sign(compareMerit(b, a)));
  });
});

describe('the positions on the list', () => {
  it('numbers them 1, 2, 3 with no two sharing — the roll always decides', () => {
    const keys = [
      key({ rollNo: 1, gpa: 4, total: 800 }),
      key({ rollNo: 2, gpa: 4, total: 800 }),
      key({ rollNo: 3, gpa: 5, total: 900 }),
    ];
    // Roll 3 is first on GPA; rolls 1 and 2 are level to the last rung.
    expect(meritPositions(keys)).toEqual([2, 3, 1]);
  });

  it('gives an incomplete result no position at all', () => {
    const keys = [
      key({ rollNo: 1, gpa: 4 }),
      key({ rollNo: 2, incomplete: true, gpa: null }),
      key({ rollNo: 3, gpa: 5 }),
    ];
    expect(meritPositions(keys)).toEqual([2, null, 1]);
  });

  it('keeps the answers in the order the students were handed in', () => {
    const keys = [
      key({ rollNo: 9, gpa: 2 }),
      key({ rollNo: 4, gpa: 5 }),
      key({ rollNo: 7, gpa: 3 }),
    ];
    expect(meritPositions(keys)).toEqual([3, 1, 2]);
  });

  it('shares a position and skips the next, if ever two could be level', () => {
    // Unreachable through the roll, and kept so that a rule which depends on
    // rolls being unique says what it does when they are not.
    const twin = key({ rollNo: 5, gpa: 4 });
    expect(meritPositions([twin, { ...twin }, key({ rollNo: 6, gpa: 3 })]))
      .toEqual([1, 1, 3]);
  });

  it('ranks nobody in an empty section without falling over', () => {
    expect(meritPositions([])).toEqual([]);
  });
});
