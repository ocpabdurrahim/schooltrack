import { describe, expect, it } from 'vitest';
import {
  PRIVILEGES,
  TUITION_HEAD,
  explainPrivilege,
  netRate,
  normalPrivilege,
  privilegeOptions,
  tuitionWaiverPercent,
  waiverOn,
} from './privileges';

/** The same cases exist in android/.../data/PrivilegesTest.kt. */

describe('normalPrivilege', () => {
  it('keeps the four the office named', () => {
    expect(PRIVILEGES).toEqual(['Regular', 'Scholarship', 'Donor family', 'Half fee']);
    for (const p of PRIVILEGES) expect(normalPrivilege(p)).toBe(p);
  });

  it('reads a blank as Regular, because every older record has one', () => {
    expect(normalPrivilege('')).toBe('Regular');
    expect(normalPrivilege('   ')).toBe('Regular');
    expect(normalPrivilege(null)).toBe('Regular');
    expect(normalPrivilege(undefined)).toBe('Regular');
  });

  it('reads the spellings an office actually types', () => {
    expect(normalPrivilege('HALF')).toBe('Half fee');
    expect(normalPrivilege('half-fee')).toBe('Half fee');
    expect(normalPrivilege('50%')).toBe('Half fee');
    expect(normalPrivilege('donor')).toBe('Donor family');
    expect(normalPrivilege('Donor Family')).toBe('Donor family');
    expect(normalPrivilege('free')).toBe('Donor family');
    expect(normalPrivilege('  scholarship ')).toBe('Scholarship');
    expect(normalPrivilege('stipend')).toBe('Scholarship');
    expect(normalPrivilege('none')).toBe('Regular');
  });

  it('leaves a word it does not know alone', () => {
    expect(normalPrivilege('Orphan fund')).toBe('Orphan fund');
  });
});

describe('privilegeOptions', () => {
  it('offers the four', () => {
    expect(privilegeOptions('Regular')).toEqual(PRIVILEGES);
    expect(privilegeOptions('')).toEqual(PRIVILEGES);
  });

  it('keeps an arrangement the picker has no room for, so saving cannot wipe it', () => {
    expect(privilegeOptions('Orphan fund')).toEqual([...PRIVILEGES, 'Orphan fund']);
  });
});

describe('what each arrangement waives', () => {
  it('charges a regular student the card rate', () => {
    expect(tuitionWaiverPercent('Regular')).toBe(0);
    expect(waiverOn(TUITION_HEAD, 200, 'Regular')).toBe(0);
    expect(netRate(TUITION_HEAD, 200, 'Regular')).toBe(200);
  });

  it('charges a scholarship and a donor family no tuition at all', () => {
    for (const p of ['Scholarship', 'Donor family']) {
      expect(tuitionWaiverPercent(p)).toBe(100);
      expect(waiverOn(TUITION_HEAD, 200, p)).toBe(200);
      expect(netRate(TUITION_HEAD, 200, p)).toBe(0);
    }
  });

  it('halves tuition for a half-fee student', () => {
    expect(tuitionWaiverPercent('Half fee')).toBe(50);
    expect(waiverOn(TUITION_HEAD, 200, 'Half fee')).toBe(100);
    expect(netRate(TUITION_HEAD, 200, 'Half fee')).toBe(100);
  });

  it('gives the odd taka to the waiver, never to the bill', () => {
    // 175 halves to 87.5. The family pays 87 and the school waives 88.
    expect(waiverOn(TUITION_HEAD, 175, 'Half fee')).toBe(88);
    expect(netRate(TUITION_HEAD, 175, 'Half fee')).toBe(87);
  });

  it('waives NOTHING on any head but tuition', () => {
    for (const head of ['SESSION', 'EXAM', 'ADMISSION', 'REGISTRATION', 'LABFEE', 'FINE']) {
      expect(waiverOn(head, 500, 'Donor family')).toBe(0);
      expect(waiverOn(head, 500, 'Half fee')).toBe(0);
      expect(netRate(head, 500, 'Scholarship')).toBe(500);
    }
  });

  it('waives nothing it cannot make sense of, rather than guessing', () => {
    expect(waiverOn(TUITION_HEAD, 200, 'Orphan fund')).toBe(0);
    expect(waiverOn(TUITION_HEAD, null, 'Donor family')).toBe(0);
    expect(waiverOn(TUITION_HEAD, 0, 'Donor family')).toBe(0);
    expect(waiverOn(TUITION_HEAD, -50, 'Half fee')).toBe(0);
    expect(netRate(TUITION_HEAD, null, 'Regular')).toBe(0);
  });

  it('explains itself in words the collector can read off the screen', () => {
    expect(explainPrivilege('Half fee')).toBe('50% off tuition');
    expect(explainPrivilege('Donor family')).toBe('no tuition fee');
    expect(explainPrivilege('Scholarship')).toBe('no tuition fee');
    expect(explainPrivilege('')).toContain('full rate');
  });
});
