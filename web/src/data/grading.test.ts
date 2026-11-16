import { describe, expect, it } from 'vitest';
import { type SubjectMark, gradeFor, tabulate } from './grading';

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
