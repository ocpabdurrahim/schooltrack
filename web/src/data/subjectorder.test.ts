import { describe, expect, it } from 'vitest';
import { UNRANKED, normaliseKey, sortSubjects, subjectRank } from './subjectorder';

/**
 * The SAME cases exist in android/.../data/SubjectOrderTest.kt.
 *
 * The fixture below is the live school's twenty-one subjects, with the names,
 * ids and codes they are actually stored under, in the jumbled order their
 * stored sortOrder gave them. If this file passes, the order on screen is the
 * order that was asked for.
 */

type Row = { subjectId: string; subjectName: string; subjectCode?: string | null; sortOrder: number };

const s = (
  subjectId: string,
  subjectName: string,
  subjectCode: string | null,
  sortOrder: number,
): Row => ({ subjectId, subjectName, subjectCode, sortOrder });

/** As stored: six subjects share sortOrder 0, which is how Civics came third. */
const LIVE: Row[] = [
  s('BANGLA_1ST_PAPER', 'BANGLA 1ST PAPER', '101', 0),
  s('BANGLA_2ND_PAPER', 'BANGLA 2ND PAPER', '102', 0),
  s('CIVICS_AND_CITIZENSHIP', 'CIVICS AND CITIZENSHIP', '140', 0),
  s('ENGLISH_1ST_PAPER', 'ENGLISH 1ST PAPER', null, 0),
  s('ICT', 'ICT', '154', 0),
  s('MATHEMATICS', 'MATHEMATICS', null, 0),
  s('ENGLISH_2ND_PAPER', 'ENGLISH 2ND PAPER', '108', 1),
  s('HINDU_AND_MORALITY_EDUCATION', 'HINDU AND MORALITY EDUCATION', null, 2),
  s('ISLAM_AND_MORALITY_EDUCATION', 'ISLAM AND MORALITY EDUCATION', '111', 2),
  s('BANGLADESH_AND_GLOBAL_STUDIES', 'BANGLADESH AND GLOBAL STUDIES', '150', 3),
  s('SCIENCE', 'SCIENCE', '127', 3),
  s('CHEMISTRY', 'CHEMISTRY', '137', 4),
  s('PHYSICS', 'PHYSICS', '136', 4),
  s('BIOLOGY', 'BIOLOGY', '138', 5),
  s('HISTORY', 'HISTORY OF BANGLADESH AND WORLD CIVILIZATION', '153', 5),
  s('GEOGRAPHY', 'GEOGRAPHY', '110', 6),
  s('ACCOUNTING', 'ACCOUNTING', '146', 7),
  s('FINANCE_AND_BANKING', 'FINANCE AND BANKING', '152', 7),
  s('BUSINESS_ENTREPRENEURSHIP', 'BUSINESS ENTREPRENEURSHIP', '143', 8),
  s('HIGHER_MATHS', 'HIGHER MATHS', '126', 8),
  s('AGRICULTURE', 'AGRICULTURE', '134', 9),
];

const ids = (rows: Row[]) => sortSubjects(rows).map((r) => r.subjectId);

describe('normaliseKey', () => {
  it('reads an id and a name as the same key', () => {
    expect(normaliseKey('BANGLA_1ST_PAPER')).toBe('BANGLA 1ST PAPER');
    expect(normaliseKey('  Bangla  1st   Paper ')).toBe('BANGLA 1ST PAPER');
    expect(normaliseKey('Islam & Morality Education')).toBe('ISLAM MORALITY EDUCATION');
  });
});

describe('subjectRank', () => {
  it('places a paper by its name', () => {
    expect(subjectRank({ subjectId: 'X', subjectName: 'Physics' }))
      .toBeLessThan(subjectRank({ subjectId: 'Y', subjectName: 'Chemistry' }));
  });

  it('places a paper by its id when the name has been edited', () => {
    const renamed = { subjectId: 'GEOGRAPHY', subjectName: 'Geo (new syllabus)' };
    expect(subjectRank(renamed)).toBe(subjectRank({ subjectId: 'G', subjectName: 'GEOGRAPHY' }));
  });

  it('places a paper by its code when neither name nor id is recognised', () => {
    const odd = { subjectId: 'PAPER_7', subjectName: 'Paper 7', subjectCode: '136' };
    expect(subjectRank(odd)).toBe(subjectRank({ subjectId: 'P', subjectName: 'Physics' }));
  });

  it('accepts the spellings the same paper is written in', () => {
    const physics = subjectRank({ subjectId: 'P', subjectName: 'Physics' });
    expect(subjectRank({ subjectId: 'H', subjectName: 'History' })).toBeGreaterThan(physics);
    expect(subjectRank({
      subjectId: 'H', subjectName: 'History of Bangladesh and World Civilization',
    })).toBe(subjectRank({ subjectId: 'H2', subjectName: 'History' }));
    expect(subjectRank({ subjectId: 'B', subjectName: 'Bengali First Paper' }))
      .toBe(subjectRank({ subjectId: 'B2', subjectName: 'BANGLA 1ST PAPER' }));
  });

  it('leaves a subject it has never heard of unranked', () => {
    expect(subjectRank({ subjectId: 'MUSIC', subjectName: 'Music' })).toBe(UNRANKED);
  });

  it('keeps the papers of one slot together and apart from the next', () => {
    // A slot's own papers share its thousand: this is what lines the group
    // columns of a tabulation sheet up across streams.
    const slotOf = (name: string) =>
      Math.floor(subjectRank({ subjectId: name, subjectName: name }) / 1000);
    expect(slotOf('Physics')).toBe(slotOf('History'));
    expect(slotOf('Physics')).toBe(slotOf('Accounting'));
    expect(slotOf('Chemistry')).toBe(slotOf('Geography'));
    expect(slotOf('Chemistry')).toBe(slotOf('Finance and Banking'));
    expect(slotOf('Biology')).toBe(slotOf('Civics and Citizenship'));
    expect(slotOf('Biology')).toBe(slotOf('Business Entrepreneurship'));
    expect(slotOf('Physics')).not.toBe(slotOf('Chemistry'));
  });
});

describe('sortSubjects', () => {
  it('puts the live school in the order asked for', () => {
    expect(ids(LIVE)).toEqual([
      'BANGLA_1ST_PAPER',
      'BANGLA_2ND_PAPER',
      'ENGLISH_1ST_PAPER',
      'ENGLISH_2ND_PAPER',
      'MATHEMATICS',
      'ISLAM_AND_MORALITY_EDUCATION',
      'HINDU_AND_MORALITY_EDUCATION',
      'ICT',
      'SCIENCE',
      'BANGLADESH_AND_GLOBAL_STUDIES',
      'PHYSICS',
      'HISTORY',
      'ACCOUNTING',
      'CHEMISTRY',
      'GEOGRAPHY',
      'FINANCE_AND_BANKING',
      'BIOLOGY',
      'CIVICS_AND_CITIZENSHIP',
      'BUSINESS_ENTREPRENEURSHIP',
      'HIGHER_MATHS',
      'AGRICULTURE',
    ]);
  });

  it('ignores the stored sortOrder entirely for a subject it knows', () => {
    // The whole point: the live data said Civics came third and Chemistry
    // before Physics. Reversing every stored value changes nothing.
    const upended = LIVE.map((r) => ({ ...r, sortOrder: 100 - r.sortOrder }));
    expect(ids(upended)).toEqual(ids(LIVE));
  });

  it('is unchanged by the order it is handed', () => {
    const reversed = [...LIVE].reverse();
    expect(ids(reversed)).toEqual(ids(LIVE));
  });

  it('does not lose or duplicate a subject', () => {
    expect(ids(LIVE)).toHaveLength(LIVE.length);
    expect(new Set(ids(LIVE)).size).toBe(LIVE.length);
  });

  it('leaves the list it was given alone', () => {
    const before = LIVE.map((r) => r.subjectId);
    sortSubjects(LIVE);
    expect(LIVE.map((r) => r.subjectId)).toEqual(before);
  });

  it('sorts an unknown subject last, by its stored order', () => {
    const extra: Row[] = [
      ...LIVE,
      s('MUSIC', 'Music', null, 5),
      s('HOME_SCIENCE', 'Home Science', null, 2),
    ];
    const out = ids(extra);
    expect(out.slice(-2)).toEqual(['HOME_SCIENCE', 'MUSIC']);
    expect(out.indexOf('AGRICULTURE')).toBe(out.length - 3);
  });

  it('separates two papers of one slot by their stored order', () => {
    // Both are the religion slot's, both unnamed in the other's keys: the
    // school's own sortOrder decides, not chance.
    const two: Row[] = [
      s('RELIGION_B', 'Religion', null, 9),
      s('RELIGION_A', 'Religion', null, 1),
    ];
    expect(ids(two)).toEqual(['RELIGION_A', 'RELIGION_B']);
  });

  it('works on a class that sits only some of the papers', () => {
    // Class 6: no group papers at all, so the order is just the common ones.
    const junior = LIVE.filter((r) => ['BANGLA_1ST_PAPER', 'ICT', 'SCIENCE',
      'ISLAM_AND_MORALITY_EDUCATION', 'MATHEMATICS'].includes(r.subjectId));
    expect(ids(junior)).toEqual([
      'BANGLA_1ST_PAPER',
      'MATHEMATICS',
      'ISLAM_AND_MORALITY_EDUCATION',
      'ICT',
      'SCIENCE',
    ]);
  });

  it('gives a Science and a Humanities student matching slots', () => {
    // What the tabulation sheet's group columns depend on: the nth group
    // paper of one stream is the nth of the other.
    const group = (keep: string[]) => ids(LIVE.filter((r) => keep.includes(r.subjectId)));
    const science = group(['BANGLADESH_AND_GLOBAL_STUDIES', 'PHYSICS', 'CHEMISTRY', 'BIOLOGY']);
    const humanities = group(['SCIENCE', 'HISTORY', 'GEOGRAPHY', 'CIVICS_AND_CITIZENSHIP']);
    const business = group(['SCIENCE', 'ACCOUNTING', 'FINANCE_AND_BANKING',
      'BUSINESS_ENTREPRENEURSHIP']);
    expect(science).toEqual(['BANGLADESH_AND_GLOBAL_STUDIES', 'PHYSICS', 'CHEMISTRY', 'BIOLOGY']);
    expect(humanities).toEqual(['SCIENCE', 'HISTORY', 'GEOGRAPHY', 'CIVICS_AND_CITIZENSHIP']);
    expect(business).toEqual(['SCIENCE', 'ACCOUNTING', 'FINANCE_AND_BANKING',
      'BUSINESS_ENTREPRENEURSHIP']);
  });
});
