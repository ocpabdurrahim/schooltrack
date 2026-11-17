import { describe, expect, it } from 'vitest';
import { RELIGIONS, normalReligion, religionOptions } from './religions';

/** The same cases exist in android/.../data/ReligionsTest.kt. */

describe('normalReligion', () => {
  it('keeps the three the school’s own table allows', () => {
    expect(normalReligion('Islam')).toBe('Islam');
    expect(normalReligion('Hindu')).toBe('Hindu');
    expect(normalReligion('Other')).toBe('Other');
    expect(RELIGIONS).toEqual(['Islam', 'Hindu', 'Other']);
  });

  it('reads the spellings an office actually types', () => {
    expect(normalReligion('muslim')).toBe('Islam');
    expect(normalReligion('MUSLIM')).toBe('Islam');
    expect(normalReligion('Islami')).toBe('Islam');
    expect(normalReligion('hinduism')).toBe('Hindu');
    expect(normalReligion('  Hindu  ')).toBe('Hindu');
    expect(normalReligion('Sanatan')).toBe('Hindu');
  });

  it('folds the ones the school has no column for into Other', () => {
    // students_info allows Islam, Hindu or Other and nothing else, so this is
    // the school's own decision, not ours.
    expect(normalReligion('Christian')).toBe('Other');
    expect(normalReligion('Buddhist')).toBe('Other');
  });

  it('treats nothing as nothing — a record that was never filled in', () => {
    expect(normalReligion('')).toBe('');
    expect(normalReligion('   ')).toBe('');
    expect(normalReligion(null)).toBe('');
    expect(normalReligion(undefined)).toBe('');
  });

  it('leaves a word it does not know alone rather than guessing', () => {
    expect(normalReligion('Jain')).toBe('Jain');
  });
});

describe('religionOptions', () => {
  it('offers the three', () => {
    expect(religionOptions('')).toEqual(['Islam', 'Hindu', 'Other']);
    expect(religionOptions('Islam')).toEqual(['Islam', 'Hindu', 'Other']);
  });

  it('keeps whatever is already on the record, so saving cannot wipe it', () => {
    expect(religionOptions('Jain')).toEqual(['Islam', 'Hindu', 'Other', 'Jain']);
  });
});
