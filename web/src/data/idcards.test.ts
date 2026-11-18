import { describe, expect, it } from 'vitest';
import { PER_SHEET, chunk, mirrored } from './idcards';

describe('chunk', () => {
  it('fills whole sheets and leaves the remainder in the last one', () => {
    expect(chunk([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
  });

  it('has no sheets at all for no students', () => {
    expect(chunk([], 9)).toEqual([]);
  });

  it('makes one sheet of a section smaller than a sheet', () => {
    expect(chunk([1, 2], PER_SHEET)).toEqual([[1, 2]]);
  });
});

describe('mirrored', () => {
  // The test that matters: print this on the back of [1..9] and every card
  // meets its own front when the page is flipped on the long edge.
  it('reverses each row, not the whole sheet', () => {
    expect(mirrored([1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([3, 2, 1, 6, 5, 4, 9, 8, 7]);
  });

  it('pads a short last row BEFORE reversing, so backs do not slide across', () => {
    // 7 students: the last row is [7, _, _] and must mirror to [_, _, 7].
    // Without the padding it would mirror to [7] and print under card 5.
    expect(mirrored([1, 2, 3, 4, 5, 6, 7]))
      .toEqual([3, 2, 1, 6, 5, 4, null, null, 7]);
  });

  it('pads a row of two the same way', () => {
    expect(mirrored([1, 2])).toEqual([null, 2, 1]);
  });

  it('is its own undo — mirroring twice gives the sheet back', () => {
    const sheet = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    expect(mirrored(mirrored(sheet) as number[])).toEqual(sheet);
  });

  it('leaves an empty sheet empty', () => {
    expect(mirrored([])).toEqual([]);
  });

  it('keeps every student exactly once', () => {
    const sheet = [1, 2, 3, 4, 5, 6, 7];
    const got = mirrored(sheet).filter((x): x is number => x !== null);
    expect(got.slice().sort((a, b) => a - b)).toEqual(sheet);
  });
});
