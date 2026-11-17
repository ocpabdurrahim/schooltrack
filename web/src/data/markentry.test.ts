import { describe, expect, it } from 'vitest';
import type { Subject } from './exams';
import { blankTyped, numOrNull, overMax, partsAndTotal, typedFrom } from './markentry';

/**
 * The SAME cases exist in android/.../data/MarkEntryDataTest.kt. A mark typed
 * on a phone and the same mark typed in a browser must be stored identically.
 */

const whole: Subject = {
  subjectId: 'ENG1', subjectName: 'English First Paper', classNames: ['Class 9'],
  fullMarks: 100, isOptional: false, sortOrder: 1,
};

const parted: Subject = {
  ...whole,
  subjectId: 'MATH',
  subjectName: 'Mathematics',
  fullMarks: 100,
  components: [{ name: 'CQ', max: 70, pass: 23 }, { name: 'MCQ', max: 30, pass: 10 }],
};

describe('numOrNull', () => {
  it('reads a number, however it was typed', () => {
    expect(numOrNull('12')).toBe(12);
    expect(numOrNull('  12  ')).toBe(12);
    expect(numOrNull('12.5')).toBe(12.5);
    expect(numOrNull('0')).toBe(0);
  });

  it('is null for a box that holds nothing, and for one that holds nonsense', () => {
    expect(numOrNull('')).toBeNull();
    expect(numOrNull('   ')).toBeNull();
    expect(numOrNull('ab')).toBeNull();
    // a zero is a real mark and must never be read as "not entered"
    expect(numOrNull('0')).not.toBeNull();
  });
});

describe('partsAndTotal', () => {
  it('stores no parts at all for a paper marked as one mark', () => {
    expect(partsAndTotal(whole, { ...blankTyped(), marks: '71' }))
      .toEqual({ parts: null, marks: 71 });
  });

  it('adds the parts up', () => {
    const got = partsAndTotal(parted, { ...blankTyped(), parts: { CQ: '55', MCQ: '22' } });
    expect(got).toEqual({ parts: { CQ: 55, MCQ: 22 }, marks: 77 });
  });

  it('keeps the total null while a part is blank', () => {
    const got = partsAndTotal(parted, { ...blankTyped(), parts: { CQ: '55', MCQ: '' } });
    expect(got).toEqual({ parts: { CQ: 55, MCQ: null }, marks: null });
  });

  it('ignores a box the subject has no component for', () => {
    const got = partsAndTotal(parted, {
      ...blankTyped(), parts: { CQ: '55', MCQ: '22', PRACTICAL: '20' },
    });
    expect(got.parts).toEqual({ CQ: 55, MCQ: 22 });
    expect(got.marks).toBe(77);
  });

  it('counts a zero as a mark, not as a blank', () => {
    const got = partsAndTotal(parted, { ...blankTyped(), parts: { CQ: '40', MCQ: '0' } });
    expect(got.marks).toBe(40);
  });
});

describe('typedFrom', () => {
  it('puts the stored numbers back in the boxes', () => {
    expect(typedFrom(77, { CQ: 55, MCQ: 22 }, false))
      .toEqual({ marks: '77', parts: { CQ: '55', MCQ: '22' }, absent: false });
  });

  it('leaves a box empty where nothing was stored', () => {
    expect(typedFrom(null, { CQ: 55, MCQ: null }, true))
      .toEqual({ marks: '', parts: { CQ: '55', MCQ: '' }, absent: true });
    expect(typedFrom(undefined, null, false)).toEqual({ marks: '', parts: {}, absent: false });
  });
});

describe('overMax', () => {
  it('catches a part typed above what that part is out of', () => {
    expect(overMax(parted, { ...blankTyped(), parts: { CQ: '55', MCQ: '31' } })).toBe(true);
    expect(overMax(parted, { ...blankTyped(), parts: { CQ: '70', MCQ: '30' } })).toBe(false);
  });

  it('catches a whole paper typed above its full marks', () => {
    expect(overMax(whole, { ...blankTyped(), marks: '101' })).toBe(true);
    expect(overMax(whole, { ...blankTyped(), marks: '100' })).toBe(false);
  });
});
