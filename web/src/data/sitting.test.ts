import { describe, expect, it } from 'vitest';
import { satAs, sittingName } from './sitting';

/** The SAME cases exist in android/.../data/SittingTest.kt. */

const mark = (classId: string, rollNo: number) => ({ classId, rollNo });

describe('where an exam was sat', () => {
  it('is what the marks say, not where the student is now', () => {
    // The whole point: these marks were entered in Class 9 and the student is
    // in Class 10 now. Nothing here looks at the student.
    expect(satAs([mark('class-9-a', 7), mark('class-9-a', 7)]))
      .toEqual({ classId: 'class-9-a', rollNo: 7, agreed: true });
  });

  it('says nothing when the marks say nothing', () => {
    expect(satAs([])).toBeNull();
    expect(satAs([mark('', 0), mark('  ', 3)])).toBeNull();
  });

  it('ignores a mark stored before the field existed', () => {
    // Missing information, not evidence of a different class.
    const got = satAs([mark('', 0), mark('class-9-a', 7), mark('class-9-a', 7)]);
    expect(got).toEqual({ classId: 'class-9-a', rollNo: 7, agreed: true });
  });

  it('takes the commonest when the marks disagree, and says they disagreed', () => {
    // One mark entered before the class was moved up, two after.
    const got = satAs([mark('class-9-a', 7), mark('class-10-a', 3), mark('class-10-a', 3)]);
    expect(got).toEqual({ classId: 'class-10-a', rollNo: 3, agreed: false });
  });

  it('settles a tie the same way every time', () => {
    const one = satAs([mark('class-9-a', 7), mark('class-10-a', 3)]);
    const other = satAs([mark('class-10-a', 3), mark('class-9-a', 7)]);
    expect(one).toEqual(other);
    expect(one?.agreed).toBe(false);
  });

  it('treats a changed ROLL as a different sitting too', () => {
    // Promotion gives new roll numbers in the same class shape; the roll on
    // the paper is the one the marks were entered against.
    expect(satAs([mark('class-9-a', 7), mark('class-9-a', 7), mark('class-9-a', 41)]))
      .toEqual({ classId: 'class-9-a', rollNo: 7, agreed: false });
  });
});

describe('naming the class it was sat in', () => {
  const classes = [
    { classId: 'class-9-a', displayName: 'Class 9 - A' },
    { classId: 'class-10-a', displayName: 'Class 10 - A' },
  ];

  it('names the class the marks point at', () => {
    expect(sittingName({ classId: 'class-9-a', rollNo: 7, agreed: true }, classes, 'Class 10 - A'))
      .toBe('Class 9 - A');
  });

  it('falls back only when the marks said nothing', () => {
    expect(sittingName(null, classes, 'Class 10 - A')).toBe('Class 10 - A');
  });

  it('names NOTHING rather than the wrong class when the class is gone', () => {
    // Naming a deleted class after the student's current one is the exact
    // mistake this module exists to stop.
    expect(sittingName({ classId: 'class-8-a', rollNo: 2, agreed: true }, classes, 'Class 10 - A'))
      .toBe('');
  });
});
