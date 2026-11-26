import { describe, expect, it } from 'vitest';
import type { Component, Parts, SubjectMark } from './grading';
import { combineUnits, gradeForSubject } from './grading';
import { cellText, fmtMark, partBits, partLabel, partsTitle } from './cellparts';

/** The SAME cases exist in android/.../data/CellPartsTest.kt. */

const CQ_MCQ: Component[] = [
  { name: 'CQ', max: 70, pass: 23 },
  { name: 'MCQ', max: 30, pass: 10 },
];

const SCIENCE: Component[] = [
  { name: 'CQ', max: 50, pass: 17 },
  { name: 'MCQ', max: 25, pass: 8 },
  { name: 'PRACTICAL', max: 25, pass: 8 },
];

const parted = (
  name: string,
  components: Component[],
  parts: Parts,
  extra: Partial<SubjectMark> = {},
): SubjectMark => ({
  subjectId: name,
  subjectName: name,
  fullMarks: components.reduce((t, c) => t + c.max, 0),
  marks: null,
  components,
  parts,
  ...extra,
});

/** A cell as the tabulation holds it: the mark with its grade worked out. */
const cell = (m: SubjectMark) => ({ ...m, ...gradeForSubject(m) });

describe('the two tiers of a tabulation cell', () => {
  it('puts the parts above and the total with its letter below', () => {
    const got = cellText(cell(parted('Physics', SCIENCE, { CQ: 40, MCQ: 22, PRACTICAL: 20 })));
    expect(got.parts.map((p) => p.text)).toEqual(['40', '22', '20']);
    expect(got.main).toBe('82');
    expect(got.letter).toBe('A+');
  });

  it('keeps the parts in the order the paper is marked in, not sorted', () => {
    const got = partBits(parted('Physics', SCIENCE, { PRACTICAL: 20, MCQ: 22, CQ: 40 }));
    expect(got.map((p) => p.label)).toEqual(['CQ', 'MCQ', 'PRACTICAL']);
  });

  it('IS THE WHOLE POINT: 68 and still F, with the failing part marked', () => {
    // The mark that explains the letter. 60 + 8 = 68, and the MCQ pass is 10.
    const got = cellText(cell(parted('Maths', CQ_MCQ, { CQ: 60, MCQ: 8 })));
    expect(got.main).toBe('68');
    expect(got.letter).toBe('F');
    expect(got.parts.map((p) => p.failed)).toEqual([false, true]);
  });

  it('marks a part below its pass even while the subject has no total', () => {
    // The subject is not being judged — main is still a dash. This part is
    // finished and it did fail, and that is worth seeing now, not in a week.
    const got = cellText(cell(parted('Maths', CQ_MCQ, { CQ: null, MCQ: 4 })));
    expect(got.main).toBe('—');
    expect(got.letter).toBe('');
    expect(got.parts.map((p) => p.text)).toEqual(['–', '4']);
    expect(got.parts[1].failed).toBe(true);
  });

  it('shows which part is missing instead of a bracketed sum', () => {
    // The parts tier says CQ 55 is in and the MCQ is not, so the lower tier
    // has no reason to print "(55)" as well. One number, one place.
    const got = cellText(cell(parted('Geography', CQ_MCQ, { CQ: 55, MCQ: null })));
    expect(got.parts.map((p) => p.text)).toEqual(['55', '–']);
    expect(got.main).toBe('—');
    expect(got.provisional).toBe(false);
  });

  it('leaves the upper tier empty for a paper not marked in parts', () => {
    const eng: SubjectMark = {
      subjectId: 'E1', subjectName: 'English First Paper', fullMarks: 100, marks: 71,
    };
    const got = cellText(cell(eng));
    expect(got.parts).toEqual([]);
    expect(got.main).toBe('71');
    expect(got.letter).toBe('A');
  });

  it('still reads a result entered before components existed', () => {
    const old: SubjectMark = {
      subjectId: 'M', subjectName: 'Maths', fullMarks: 100, marks: 68, components: CQ_MCQ,
    };
    const got = cellText(cell(old));
    expect(got.main).toBe('68');
    expect(got.letter).toBe('A-');
    // Nothing was entered part by part, so there is nothing to show above —
    // a tier of dashes over a perfectly good 68 would be a lie about it.
    expect(got.parts).toEqual([]);
  });

  it('says abs and nothing else for an absent student', () => {
    const got = cellText(cell(parted('Maths', CQ_MCQ, { CQ: 60, MCQ: 20 }, { absent: true })));
    expect(got.main).toBe('abs');
    expect(got.letter).toBe('');
    expect(got.parts).toEqual([]);
  });

  it('stays quiet in a cell where nothing has been entered at all', () => {
    // The 4th subject of a student who has not taken one, and every cell on a
    // sheet opened halfway through mark entry. A dash below is the whole of
    // what there is to say; a tier of dashes above it says it twice.
    const empty = parted('Higher Maths', CQ_MCQ, {});
    const got = cellText({ ...empty, ...gradeForSubject(empty) });
    expect(got.parts).toEqual([]);
    expect(got.main).toBe('—');
  });

  it('keeps a half mark and prints a whole one whole', () => {
    expect(fmtMark(50)).toBe('50');
    expect(fmtMark(50.5)).toBe('50.5');
    const got = cellText(cell(parted('Maths', CQ_MCQ, { CQ: 60.5, MCQ: 20 })));
    expect(got.parts[0].text).toBe('60.5');
    expect(got.main).toBe('80.5');
  });
});

describe('a subject that is two papers graded as one', () => {
  const ban1 = parted('Bangla 1st Paper', CQ_MCQ, { CQ: 50, MCQ: 22 }, { combineGroup: 'BAN' });
  const ban2 = parted('Bangla 2nd Paper', CQ_MCQ, { CQ: 48, MCQ: 20 }, { combineGroup: 'BAN' });
  const [unit] = combineUnits([ban1, ban2]);

  it('shows all four parts, in paper order', () => {
    const got = cellText(cell(unit));
    expect(got.parts.map((p) => p.text)).toEqual(['50', '22', '48', '20']);
    expect(got.main).toBe('140');
  });

  it('labels them bare, without the paper in front', () => {
    expect(partBits(unit).map((p) => p.label)).toEqual(['CQ', 'MCQ', 'CQ', 'MCQ']);
    expect(partLabel('Bangla 1st Paper MCQ', 'Bangla 1st Paper')).toBe('MCQ');
    expect(partLabel('MCQ', undefined)).toBe('MCQ');
  });

  it('says where the second paper starts, so four numbers do not read as one run', () => {
    expect(partBits(unit).map((p) => p.opensPaper)).toEqual([false, false, true, false]);
  });

  it('names the paper in the tooltip, because MCQ twice over says nothing', () => {
    const title = partsTitle(unit);
    expect(title).toContain('Bangla 1st Paper CQ 50');
    expect(title).toContain('Bangla 2nd Paper MCQ 20');
  });

  it('leaves the paper out of the tooltip when there is only one', () => {
    expect(partsTitle(parted('Maths', CQ_MCQ, { CQ: 60, MCQ: 20 })))
      .toBe('CQ 60 · MCQ 20');
  });

  it('says in the tooltip what a failing part fell below', () => {
    expect(partsTitle(parted('Maths', CQ_MCQ, { CQ: 60, MCQ: 8 })))
      .toBe('CQ 60 · MCQ 8 (below pass 10)');
  });
});
