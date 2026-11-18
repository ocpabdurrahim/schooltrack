import { describe, expect, it } from 'vitest';
import {
  PHOTO_BOX,
  PHOTO_MAX_BYTES,
  dataUrlBytes,
  fitWithin,
  photoTooBig,
} from './photos';

describe('fitWithin', () => {
  it('shrinks a big portrait photo to the height of the box', () => {
    // 3000 x 4000 is what a phone camera gives: 4:3 upright.
    expect(fitWithin(3000, 4000)).toEqual({ width: 450, height: 600 });
  });

  it('shrinks a big landscape photo to the width of the box', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 480, height: 360 });
  });

  it('keeps a square square', () => {
    expect(fitWithin(2000, 2000)).toEqual({ width: 480, height: 480 });
  });

  // A 200px passport scan blown up to 480 prints soft, and the softness is
  // the first thing anyone notices on a laminated card.
  it('never enlarges a photo that is already smaller than the box', () => {
    expect(fitWithin(200, 250)).toEqual({ width: 200, height: 250 });
  });

  it('fits a photo that is exactly the box without touching it', () => {
    expect(fitWithin(PHOTO_BOX.width, PHOTO_BOX.height)).toEqual(PHOTO_BOX);
  });

  it('rounds to whole pixels', () => {
    const got = fitWithin(1001, 1333);
    expect(Number.isInteger(got.width)).toBe(true);
    expect(Number.isInteger(got.height)).toBe(true);
  });

  it('never returns a zero side for a very long thin image', () => {
    expect(fitWithin(5000, 3).height).toBeGreaterThanOrEqual(1);
  });

  it('gives nothing back for a broken image', () => {
    expect(fitWithin(0, 100)).toEqual({ width: 0, height: 0 });
    expect(fitWithin(Number.NaN, 100)).toEqual({ width: 0, height: 0 });
  });
});

describe('dataUrlBytes', () => {
  const url = (body: string) => `data:image/jpeg;base64,${body}`;

  it('reads three bytes out of every four characters', () => {
    expect(dataUrlBytes(url('AAAA'))).toBe(3);
    expect(dataUrlBytes(url('AAAAAAAA'))).toBe(6);
  });

  it('allows for padding', () => {
    expect(dataUrlBytes(url('AAA='))).toBe(2);
    expect(dataUrlBytes(url('AA=='))).toBe(1);
  });

  it('is zero for something that is not a data URL', () => {
    expect(dataUrlBytes('')).toBe(0);
    expect(dataUrlBytes('https://example.test/photo.jpg')).toBe(0);
  });
});

describe('photoTooBig', () => {
  const ofBytes = (n: number) =>
    `data:image/jpeg;base64,${'A'.repeat(Math.ceil((n * 4) / 3))}`;

  it('passes a photo inside the cap', () => {
    expect(photoTooBig(ofBytes(PHOTO_MAX_BYTES - 1000))).toBe(false);
  });

  it('refuses one over it', () => {
    expect(photoTooBig(ofBytes(PHOTO_MAX_BYTES + 1000))).toBe(true);
  });

  // The cap exists to keep the document under Firestore's 1 MiB limit with
  // room for the rest of the record. If anyone raises it, this fails first.
  it('leaves the document well clear of the 1 MiB limit', () => {
    expect(PHOTO_MAX_BYTES * (4 / 3)).toBeLessThan(1024 * 1024 * 0.25);
  });
});
