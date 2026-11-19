import { describe, expect, it } from 'vitest';
import {
  SHEET_LONG_EDGE,
  fitSheet,
  sheetMegabytes,
  sheetSizeLabel,
} from './sheetphoto';

/** The SAME cases exist in android/.../data/SheetPhotoTest.kt. */

describe('fitSheet', () => {
  it('caps the long edge, whichever edge that is', () => {
    expect(fitSheet(4000, 3000)).toEqual({ width: SHEET_LONG_EDGE, height: 1650 });
    expect(fitSheet(3000, 4000)).toEqual({ width: 1650, height: SHEET_LONG_EDGE });
  });

  it('never scales a small photograph UP', () => {
    // Enlarging invents detail that is not there and gives the reader more
    // pixels to be confident about.
    expect(fitSheet(1200, 900)).toEqual({ width: 1200, height: 900 });
  });

  it('leaves a photograph already at the cap alone', () => {
    expect(fitSheet(SHEET_LONG_EDGE, 1400)).toEqual({ width: SHEET_LONG_EDGE, height: 1400 });
  });

  it('keeps the shape of the page, so a form is not squashed', () => {
    const { width: w, height: h } = fitSheet(4080, 3060);
    expect(w / h).toBeCloseTo(4080 / 3060, 2);
  });

  it('never returns a zero edge, which would be an unreadable picture', () => {
    expect(fitSheet(10_000, 3)).toEqual({ width: SHEET_LONG_EDGE, height: 1 });
  });

  it('copes with an empty picture rather than dividing by zero', () => {
    expect(fitSheet(0, 0)).toEqual({ width: 0, height: 0 });
  });
});

describe('how big it is on the wire', () => {
  it('reads megabytes off the base64, three bytes in every four characters', () => {
    expect(sheetMegabytes('A'.repeat(4_000_000))).toBeCloseTo(3, 5);
    expect(sheetMegabytes('')).toBe(0);
  });

  it('labels it the way it is shown beside the photograph', () => {
    expect(sheetSizeLabel('A'.repeat(1_866_666))).toBe('1.4 MB');
  });

  it('a sheet at the cap is a real upload, not a rounding error', () => {
    // The point of showing it: on a weak line this is the slow part, and it
    // is worth a teacher seeing the number before spending two minutes on it.
    expect(sheetMegabytes('A'.repeat(2_000_000))).toBeGreaterThan(1);
  });
});
