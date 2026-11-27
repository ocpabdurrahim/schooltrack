import { describe, expect, it } from 'vitest';
import type { Subject } from './exams';
import { subjectMarkFor } from './exams';
import { tabulate } from './grading';
import { layout, slot, streamOf } from './tabsheet';

/**
 * The SAME cases exist in android/.../data/TabSheetTest.kt, and the subjects
 * below are this school's Class 9: four everybody sits, two religion papers,
 * four group papers per stream and one 4th subject per stream.
 */

const subject = (over: Partial<Subject> & { subjectId: string }): Subject => ({
  subjectName: over.subjectId,
  classNames: ['Class 9'],
  fullMarks: 100,
  isOptional: false,
  sortOrder: 1,
  ...over,
});

const ALL = [
  subject({ subjectId: 'BANGLA', sortOrder: 1 }),
  subject({ subjectId: 'ENGLISH', sortOrder: 2 }),
  subject({ subjectId: 'MATHEMATICS', sortOrder: 3 }),
  subject({ subjectId: 'ICT', sortOrder: 4 }),
  subject({ subjectId: 'ISLAM', religions: ['Islam'], sortOrder: 5 }),
  subject({ subjectId: 'HINDU', religions: ['Hindu'], sortOrder: 6 }),
  subject({ subjectId: 'PHYSICS', groupNames: ['Science'], sortOrder: 7 }),
  subject({ subjectId: 'CHEMISTRY', groupNames: ['Science'], sortOrder: 8 }),
  subject({ subjectId: 'BIOLOGY', groupNames: ['Science'], sortOrder: 9 }),
  subject({ subjectId: 'BGS', groupNames: ['Science'], sortOrder: 10 }),
  subject({ subjectId: 'HISTORY', groupNames: ['Humanities'], sortOrder: 11 }),
  subject({ subjectId: 'GEOGRAPHY', groupNames: ['Humanities'], sortOrder: 12 }),
  subject({ subjectId: 'HIGHER_MATHS', groupNames: ['Science'], isOptional: true, sortOrder: 13 }),
  subject({ subjectId: 'AGRICULTURE', groupNames: ['Humanities'], isOptional: true, sortOrder: 14 }),
];

/**
 * A student with NO stream recorded, who is therefore excluded by nothing
 * and sits every group paper in the school — the real rule from exams.ts,
 * not an invention of this test. One of these is what widened the live
 * school's Annual Exam sheet from four group columns to eleven.
 */
const unstreamedTabulation = (religion: string) => tabulate(
  ALL.filter((s) => !(s.religions ?? []).length || (s.religions ?? []).includes(religion))
    .map((s) => subjectMarkFor(s, {
      examId: 'e', studentId: 'u', subjectId: s.subjectId, subjectName: s.subjectName,
      marks: 70, absent: false, classId: 'c', rollNo: 9, fullMarks: 100, isOptional: s.isOptional,
    })),
);

/** One student's tabulation: the subjects their stream and religion sit. */
const tabulationFor = (group: string, religion: string) => tabulate(
  ALL.filter((s) =>
    (!(s.groupNames ?? []).length || (s.groupNames ?? []).includes(group))
    && (!(s.religions ?? []).length || (s.religions ?? []).includes(religion)))
    .map((s) => subjectMarkFor(s, {
      examId: 'e', studentId: 's', subjectId: s.subjectId, subjectName: s.subjectName,
      marks: 70, absent: false, classId: 'c', rollNo: 1, fullMarks: 100, isOptional: s.isOptional,
    })),
);

describe('slot', () => {
  it('sorts a Science student’s units into the sheet’s slots', () => {
    const s = slot(tabulationFor('Science', 'Islam'));
    expect(s.common.map((c) => c.subjectId))
      .toEqual(['BANGLA', 'ENGLISH', 'MATHEMATICS', 'ICT']);
    expect(s.religion?.subjectId).toBe('ISLAM');
    expect(s.group.map((c) => c.subjectId))
      .toEqual(['PHYSICS', 'CHEMISTRY', 'BIOLOGY', 'BGS']);
    expect(s.optional?.subjectId).toBe('HIGHER_MATHS');
  });

  it('puts a Humanities student’s own subjects in the same slots', () => {
    const s = slot(tabulationFor('Humanities', 'Hindu'));
    expect(s.common.map((c) => c.subjectId))
      .toEqual(['BANGLA', 'ENGLISH', 'MATHEMATICS', 'ICT']);
    expect(s.religion?.subjectId).toBe('HINDU');
    expect(s.group.map((c) => c.subjectId)).toEqual(['HISTORY', 'GEOGRAPHY']);
    expect(s.optional?.subjectId).toBe('AGRICULTURE');
  });

  it('counts the 4th subject as the 4th subject, not as a group paper', () => {
    // Higher Maths is a Science paper AND optional. It belongs in one slot.
    const s = slot(tabulationFor('Science', 'Islam'));
    expect(s.group.map((c) => c.subjectId)).not.toContain('HIGHER_MATHS');
  });

  it('leaves the slots empty for a class that is not streamed', () => {
    const plain = tabulate([subject({ subjectId: 'BANGLA' })]
      .map((s) => subjectMarkFor(s, null)));
    const s = slot(plain);
    expect(s.group).toEqual([]);
    expect(s.religion).toBeNull();
    expect(s.optional).toBeNull();
  });
});

describe('layout', () => {
  it('is as wide as the widest student needs, and no wider', () => {
    const got = layout([tabulationFor('Science', 'Islam'), tabulationFor('Humanities', 'Hindu')]);
    expect(got.common.map((c) => c.subjectId))
      .toEqual(['BANGLA', 'ENGLISH', 'MATHEMATICS', 'ICT']);
    expect(got.groupSlots).toHaveLength(4);   // Science needs four; Humanities uses two
  });

  it('tells each slot which subjects it holds, so the heading can say so', () => {
    // This is where the column heading PHY/HIST comes from.
    const got = layout([tabulationFor('Science', 'Islam'), tabulationFor('Humanities', 'Hindu')]);
    expect(got.groupSlots).toEqual([
      ['PHYSICS', 'HISTORY'],
      ['CHEMISTRY', 'GEOGRAPHY'],
      ['BIOLOGY'],
      ['BGS'],
    ]);
    expect(got.religion).toEqual(['ISLAM', 'HINDU']);
    expect(got.optional).toEqual(['HIGHER_MATHS', 'AGRICULTURE']);
  });

  it('puts the religion column after Mathematics and before ICT', () => {
    // Religion is the sixth subject of the school's order, not a column for
    // the end of the sheet: the common columns are split around it.
    const got = layout([tabulationFor('Science', 'Islam'), tabulationFor('Humanities', 'Hindu')]);
    expect(got.religionAt).toBe(3);
    expect(got.common.slice(0, got.religionAt).map((c) => c.subjectId))
      .toEqual(['BANGLA', 'ENGLISH', 'MATHEMATICS']);
    expect(got.common.slice(got.religionAt).map((c) => c.subjectId)).toEqual(['ICT']);
  });

  it('puts the religion column after common subjects it does not know', () => {
    // An invented paper has no place in the order, so it keeps the place the
    // school gave it — before the religion column rather than swallowing it.
    const odd = tabulate([
      subjectMarkFor(subject({ subjectId: 'MORAL_SCIENCE' }), null),
      subjectMarkFor(subject({ subjectId: 'ISLAM', religions: ['Islam'], sortOrder: 2 }), null),
    ]);
    const got = layout([odd]);
    expect(got.religion).toEqual(['ISLAM']);
    expect(got.religionAt).toBe(0);
  });

  it('names a subject once however many students sit it', () => {
    const got = layout([tabulationFor('Science', 'Islam'), tabulationFor('Science', 'Islam')]);
    expect(got.groupSlots[0]).toEqual(['PHYSICS']);
    expect(got.religion).toEqual(['ISLAM']);
  });

  it('gives a section of one stream exactly that stream’s width', () => {
    expect(layout([tabulationFor('Humanities', 'Islam')]).groupSlots)
      .toEqual([['HISTORY'], ['GEOGRAPHY']]);
  });

  it('has no group or religion columns when nothing is streamed', () => {
    const plain = tabulate([
      subjectMarkFor(subject({ subjectId: 'BANGLA' }), null),
      subjectMarkFor(subject({ subjectId: 'ENGLISH', sortOrder: 2 }), null),
    ]);
    const got = layout([plain]);
    expect(got.common).toHaveLength(2);
    expect(got.groupSlots).toEqual([]);
    expect(got.religion).toEqual([]);
    expect(got.optional).toEqual([]);
  });
});

describe('a student with no stream recorded', () => {
  const science = tabulationFor('Science', 'Islam');
  const humanities = tabulationFor('Humanities', 'Hindu');
  const nobody = unstreamedTabulation('Islam');

  it('does NOT widen the sheet to every group paper in the school', () => {
    // The live sheet went to eleven group columns because one student of
    // eighty-three had no group: seven of them held a subject already paired
    // into one of the four real columns, and the sheet ran off the page.
    expect(layout([science, humanities]).groupSlots).toHaveLength(4);
    expect(layout([science, humanities, nobody]).groupSlots).toHaveLength(4);
  });

  it('does not put their papers into the headings either', () => {
    const withThem = layout([science, humanities, nobody]);
    const without = layout([science, humanities]);
    expect(withThem.groupSlots).toEqual(without.groupSlots);
  });

  it('still shows the group columns when NOBODY has a stream', () => {
    // A class that has not been streamed sits its group papers all the same,
    // and they still need somewhere to appear.
    expect(layout([nobody]).groupSlots.length).toBeGreaterThan(0);
  });

  it('leaves the common, religion and 4th subject columns to everyone', () => {
    const got = layout([science, humanities, nobody]);
    expect(got.common.map((c) => c.subjectId))
      .toEqual(['BANGLA', 'ENGLISH', 'MATHEMATICS', 'ICT']);
    expect(got.religion).toEqual(['ISLAM', 'HINDU']);
  });
});

describe('streamOf', () => {
  it('reads a stream off the papers a student sits', () => {
    expect(streamOf(slot(tabulationFor('Science', 'Islam')).group)).toBe('Science');
    expect(streamOf(slot(tabulationFor('Humanities', 'Hindu')).group)).toBe('Humanities');
  });

  it('says none when the papers agree on none', () => {
    expect(streamOf(slot(unstreamedTabulation('Islam')).group)).toBeNull();
  });

  it('says none for a student with no group papers at all', () => {
    expect(streamOf([])).toBeNull();
  });
});
