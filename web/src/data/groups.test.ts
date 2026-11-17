import { describe, expect, it } from 'vitest';
import { GROUPS, groupOptions, normalGroup } from './groups';

/** The same cases exist in android/.../data/GroupsTest.kt. */

describe('normalGroup', () => {
  it('keeps the three proper names as they are', () => {
    expect(normalGroup('Science')).toBe('Science');
    expect(normalGroup('Humanities')).toBe('Humanities');
    expect(normalGroup('Business Studies')).toBe('Business Studies');
  });

  it('reads the spellings an office actually types', () => {
    expect(normalGroup('science')).toBe('Science');
    expect(normalGroup('SCI')).toBe('Science');
    expect(normalGroup('Science Group')).toBe('Science');
    expect(normalGroup('arts')).toBe('Humanities');
    expect(normalGroup('HUM')).toBe('Humanities');
    expect(normalGroup('commerce')).toBe('Business Studies');
    expect(normalGroup('Business')).toBe('Business Studies');
    expect(normalGroup('business studies')).toBe('Business Studies');
    expect(normalGroup('  Business  Studies  ')).toBe('Business Studies');
  });

  it('treats nothing as nothing — classes 6 to 8 have no group', () => {
    expect(normalGroup('')).toBe('');
    expect(normalGroup('   ')).toBe('');
    expect(normalGroup(null)).toBe('');
    expect(normalGroup(undefined)).toBe('');
  });

  it('leaves a name it does not know alone rather than guessing', () => {
    expect(normalGroup('Vocational')).toBe('Vocational');
    expect(normalGroup('  General ')).toBe('General');
  });
});

describe('groupOptions', () => {
  it('offers the three groups and nothing else on a blank record', () => {
    expect(groupOptions('')).toEqual(GROUPS);
    expect(groupOptions(null)).toEqual(GROUPS);
  });

  it('does not repeat a group the record already has', () => {
    expect(groupOptions('Humanities')).toEqual(GROUPS);
    // and the same when it was written some other way
    expect(groupOptions('commerce')).toEqual(GROUPS);
  });

  it('keeps an unknown group on the end so saving cannot wipe it', () => {
    expect(groupOptions('Vocational')).toEqual([...GROUPS, 'Vocational']);
  });
});
