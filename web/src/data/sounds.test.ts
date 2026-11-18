import { describe, expect, it } from 'vitest';
import { ERROR_BUZZ, SUCCESS_CHIME, envelope, totalMs } from './sounds';

describe('the two gate sounds', () => {
  it('are both two notes, so neither can be mistaken for a single blip', () => {
    expect(SUCCESS_CHIME).toHaveLength(2);
    expect(ERROR_BUZZ).toHaveLength(2);
  });

  it('rises for a good scan and falls for a bad one', () => {
    expect(SUCCESS_CHIME[1].freq).toBeGreaterThan(SUCCESS_CHIME[0].freq);
    expect(ERROR_BUZZ[1].freq).toBeLessThan(ERROR_BUZZ[0].freq);
  });

  // The whole point: told apart in one hearing, by someone not listening.
  it('keeps the error well below the bell', () => {
    const lowestBell = Math.min(...SUCCESS_CHIME.map((n) => n.freq));
    const highestBuzz = Math.max(...ERROR_BUZZ.map((n) => n.freq));
    expect(lowestBell / highestBuzz).toBeGreaterThan(4);
  });

  it('keeps the bell short and lets the error ring longer', () => {
    expect(totalMs(SUCCESS_CHIME)).toBeLessThan(300);
    expect(totalMs(ERROR_BUZZ)).toBeGreaterThan(totalMs(SUCCESS_CHIME));
  });

  // A gate takes a child every second or so. A sound that outlasts the next
  // scan would still be playing when the next one is due.
  it('is over before the next child can be scanned', () => {
    expect(totalMs(SUCCESS_CHIME)).toBeLessThan(1000);
    expect(totalMs(ERROR_BUZZ)).toBeLessThan(1000);
  });

  it('never asks for a gain that would clip', () => {
    for (const n of [...SUCCESS_CHIME, ...ERROR_BUZZ]) {
      expect(n.gain).toBeGreaterThan(0);
      expect(n.gain).toBeLessThanOrEqual(0.5);
    }
  });
});

describe('totalMs', () => {
  it('measures to the end of the last note, not the sum of them', () => {
    // overlapping notes: 0..100 and 85..255
    expect(totalMs(SUCCESS_CHIME)).toBe(255);
  });

  it('is nothing for no notes', () => {
    expect(totalMs([])).toBe(0);
  });
});

describe('envelope', () => {
  it('is silent before the note and after it', () => {
    expect(envelope(-1, 100)).toBe(0);
    expect(envelope(101, 100)).toBe(0);
  });

  it('starts from silence rather than clicking in', () => {
    expect(envelope(0, 100)).toBe(0);
  });

  it('reaches full loudness quickly, then fades', () => {
    const peak = envelope(6, 100);
    expect(peak).toBeGreaterThan(0.7);
    expect(envelope(50, 100)).toBeLessThan(peak);
    expect(envelope(99, 100)).toBeLessThan(envelope(50, 100));
  });

  it('never goes above one, whatever the length', () => {
    for (const ms of [10, 100, 260]) {
      for (let t = 0; t <= ms; t += ms / 20) {
        expect(envelope(t, ms)).toBeLessThanOrEqual(1);
      }
    }
  });
});
