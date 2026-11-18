import { describe, expect, it } from 'vitest';
import { shortName, shortNames } from './shortnames';

/**
 * The SAME cases exist in android/.../data/ShortNamesTest.kt, and every name
 * below is one of the 21 subjects this school actually teaches.
 */

describe('shortName', () => {
  it('abbreviates the subjects a school writes a particular way', () => {
    expect(shortName('ISLAM AND MORALITY EDUCATION')).toBe('ISL');
    expect(shortName('HINDU AND MORALITY EDUCATION')).toBe('HIN');
    expect(shortName('HIGHER MATHS')).toBe('H.MATH');
    expect(shortName('ICT')).toBe('ICT');
  });

  it('uses the settled abbreviation of the first word', () => {
    expect(shortName('BANGLA')).toBe('BAN');
    expect(shortName('ENGLISH')).toBe('ENG');
    expect(shortName('MATHEMATICS')).toBe('MATH');
    expect(shortName('PHYSICS')).toBe('PHY');
    expect(shortName('CHEMISTRY')).toBe('CHEM');
    expect(shortName('BIOLOGY')).toBe('BIO');
    expect(shortName('GEOGRAPHY')).toBe('GEO');
    expect(shortName('SCIENCE')).toBe('SCI');
    expect(shortName('ACCOUNTING')).toBe('ACC');
    expect(shortName('AGRICULTURE')).toBe('AGRI');
    expect(shortName('CIVICS AND CITIZENSHIP')).toBe('CIV');
    expect(shortName('HISTORY OF BANGLADESH AND WORLD CIVILIZATION')).toBe('HIST');
  });

  it('takes the initials of the words that carry meaning', () => {
    expect(shortName('BANGLADESH AND GLOBAL STUDIES')).toBe('BGS');   // what the board calls it
    expect(shortName('FINANCE AND BANKING')).toBe('FB');
    expect(shortName('BUSINESS ENTREPRENEURSHIP')).toBe('BE');
  });

  it('keeps the letter that belongs to the abbreviation', () => {
    // BG is not what anybody calls Bangladesh and Global Studies.
    expect(shortName('BANGLADESH AND GLOBAL STUDIES')).toBe('BGS');
    expect(shortName('PHYSICAL EDUCATION')).toBe('PE');
  });

  it('copes with a subject nobody thought of', () => {
    expect(shortName('Pottery')).toBe('POTT');
    expect(shortName('')).toBe('?');
  });
});

describe('shortNames', () => {
  it('leaves a set that is already distinct alone', () => {
    expect(shortNames(['BANGLA', 'ENGLISH', 'PHYSICS']))
      .toEqual(['BAN', 'ENG', 'PHY']);
  });

  it('separates two subjects that would share a heading', () => {
    // Two columns headed the same are worse than two long headings.
    const got = shortNames(['PHYSICS', 'PHYSICAL EDUCATION']);
    expect(got[0]).toBe('PHY');
    expect(got[1]).not.toBe('PHY');
    expect(new Set(got).size).toBe(2);
  });

  it('keeps every heading different however alike the names', () => {
    const got = shortNames(['SCIENCE', 'SCIENCE', 'SCIENCE']);
    expect(new Set(got).size).toBe(3);
  });
});
