import { describe, expect, it } from 'vitest';
import {
  type ResultRow,
  type Subject,
  excludedBy,
  sheetColumns,
  sheetFor,
  sitsSubject,
  subjectStats,
  subjectsForStudent,
} from './exams';
import type { StudentDetail } from './people';

/**
 * The SAME cases exist in android/.../data/SubjectsTest.kt.
 *
 * Classes 9 and 10 stream into groups and the groups sit different papers, and
 * the two religion papers go to the students of that religion. Getting either
 * wrong does not look like a bug: it looks like a whole set of students having
 * an unfinished result, for ever, because a paper they never sat has no mark.
 */

const subject = (over: Partial<Subject> & { subjectId: string }): Subject => ({
  subjectName: over.subjectId,
  classNames: ['Class 9'],
  fullMarks: 100,
  isOptional: false,
  sortOrder: 1,
  ...over,
});

const bangla = subject({ subjectId: 'BAN1', subjectName: 'Bengali First Paper' });
const physics = subject({
  subjectId: 'PHY', subjectName: 'Physics', groupNames: ['Science'], sortOrder: 2,
});
const history = subject({
  subjectId: 'HIST', subjectName: 'History', groupNames: ['Humanities'], sortOrder: 3,
});
const islam = subject({
  subjectId: 'ISL', subjectName: 'Islam & Moral Education', religions: ['Islam'], sortOrder: 4,
});
const hindu = subject({
  subjectId: 'HIN', subjectName: 'Hindu Religion', religions: ['Hindu'], sortOrder: 5,
});
const all = [bangla, physics, history, islam, hindu];

describe('sitsSubject', () => {
  it('gives a paper that names neither to the whole class', () => {
    expect(sitsSubject(bangla, { className: 'Class 9', groupName: 'Science' })).toBe(true);
    expect(sitsSubject(bangla, { className: 'Class 9', religion: 'Hindu' })).toBe(true);
    expect(sitsSubject(bangla, { className: 'Class 9' })).toBe(true);
  });

  it('gives a group paper only to that group', () => {
    expect(sitsSubject(physics, { className: 'Class 9', groupName: 'Science' })).toBe(true);
    expect(sitsSubject(physics, { className: 'Class 9', groupName: 'Humanities' })).toBe(false);
    expect(sitsSubject(history, { className: 'Class 9', groupName: 'Humanities' })).toBe(true);
    expect(sitsSubject(history, { className: 'Class 9', groupName: 'Science' })).toBe(false);
  });

  it('gives a religion paper only to that religion', () => {
    expect(sitsSubject(islam, { className: 'Class 9', religion: 'Islam' })).toBe(true);
    expect(sitsSubject(islam, { className: 'Class 9', religion: 'Hindu' })).toBe(false);
    expect(sitsSubject(hindu, { className: 'Class 9', religion: 'Hindu' })).toBe(true);
    expect(sitsSubject(hindu, { className: 'Class 9', religion: 'Islam' })).toBe(false);
  });

  it('gives NEITHER religion paper to a student recorded as Other', () => {
    // "Other" is an answer, not a blank — the same as Oracle, where a student
    // whose religion is neither Islam nor Hindu is enrolled in neither paper.
    expect(sitsSubject(islam, { className: 'Class 9', religion: 'Other' })).toBe(false);
    expect(sitsSubject(hindu, { className: 'Class 9', religion: 'Other' })).toBe(false);
    expect(sitsSubject(bangla, { className: 'Class 9', religion: 'Other' })).toBe(true);
  });

  it('applies the group and the religion together', () => {
    const sciMuslim = { className: 'Class 9', groupName: 'Science', religion: 'Islam' };
    expect(sitsSubject(physics, sciMuslim)).toBe(true);
    expect(sitsSubject(islam, sciMuslim)).toBe(true);
    expect(sitsSubject(history, sciMuslim)).toBe(false);
    expect(sitsSubject(hindu, sciMuslim)).toBe(false);
  });

  it('understands both however the office wrote them', () => {
    expect(sitsSubject(physics, { className: 'Class 9', groupName: 'sci' })).toBe(true);
    expect(sitsSubject(history, { className: 'Class 9', groupName: 'ARTS' })).toBe(true);
    expect(sitsSubject(islam, { className: 'Class 9', religion: 'muslim' })).toBe(true);
    expect(sitsSubject(hindu, { className: 'Class 9', religion: 'Hinduism' })).toBe(true);
  });

  it('gives every paper to a student with nothing recorded', () => {
    // Deliberate: see the note on sitsSubject. A short GPA nobody can see is
    // worse than a result that openly says it is not finished.
    expect(sitsSubject(physics, { className: 'Class 9' })).toBe(true);
    expect(sitsSubject(islam, { className: 'Class 9' })).toBe(true);
    expect(sitsSubject(hindu, { className: 'Class 9', religion: null })).toBe(true);
  });

  it('never gives a paper the class does not sit', () => {
    expect(sitsSubject(physics, { className: 'Class 7', groupName: 'Science' })).toBe(false);
    expect(sitsSubject(bangla, { className: 'Class 7' })).toBe(false);
  });
});

describe('excludedBy', () => {
  it('names the part of the rule that actually decided it', () => {
    const humHindu = { className: 'Class 9', groupName: 'Humanities', religion: 'Hindu' };
    expect(excludedBy(physics, humHindu)).toBe('group');
    expect(excludedBy(islam, humHindu)).toBe('religion');
    expect(excludedBy(bangla, humHindu)).toBeNull();
    expect(excludedBy(history, { ...humHindu, className: 'Class 7' })).toBe('class');
  });

  it('is the one answer sitsSubject is built on', () => {
    const who = { className: 'Class 9', groupName: 'Science', religion: 'Other' };
    for (const s of all) expect(sitsSubject(s, who)).toBe(excludedBy(s, who) === null);
  });
});

describe('subjectsForStudent', () => {
  it('is the class list narrowed to this student’s own papers', () => {
    expect(subjectsForStudent(all, {
      className: 'Class 9', groupName: 'Science', religion: 'Islam',
    }).map((s) => s.subjectId)).toEqual(['BAN1', 'PHY', 'ISL']);

    expect(subjectsForStudent(all, {
      className: 'Class 9', groupName: 'Humanities', religion: 'Hindu',
    }).map((s) => s.subjectId)).toEqual(['BAN1', 'HIST', 'HIN']);

    expect(subjectsForStudent(all, {
      className: 'Class 9', groupName: 'Business Studies', religion: 'Other',
    }).map((s) => s.subjectId)).toEqual(['BAN1']);
  });
});

// ---------------------------------------------------------------------------
// what it is all for

const student = (over: Partial<StudentDetail> & { studentId: string }): StudentDetail => ({
  fullName: over.studentId,
  rollNo: 1,
  classId: 'C9A',
  className: 'Class 9',
  section: 'A',
  status: 'A',
  ...over,
});

const mark = (studentId: string, subjectId: string, marks: number): ResultRow => ({
  examId: 'ex1',
  studentId,
  subjectId,
  subjectName: subjectId,
  marks,
  absent: false,
  classId: 'C9A',
  rollNo: 1,
  fullMarks: 100,
  isOptional: false,
});

describe('the result sheet', () => {
  const hum = student({
    studentId: 's1', fullName: 'Hasina', rollNo: 1,
    groupName: 'Humanities', religion: 'Islam',
  });
  const sci = student({
    studentId: 's2', fullName: 'Shakil', rollNo: 2,
    groupName: 'Science', religion: 'Hindu',
  });

  it('finishes a student whose own papers are all marked', () => {
    const rows = sheetFor(
      [hum], all,
      [mark('s1', 'BAN1', 70), mark('s1', 'HIST', 80), mark('s1', 'ISL', 75)],
      'ex1',
    );
    expect(rows[0].tabulation.incomplete).toBe(false);
    expect(rows[0].tabulation.subjects.map((s) => s.subjectId))
      .toEqual(['BAN1', 'HIST', 'ISL']);
  });

  it('does not hold a result open for a paper the student never sat', () => {
    // Physics is a Science paper and Hindu Religion is not Hasina's: neither
    // mark is ever coming, and neither should hold her result open.
    const rows = sheetFor(
      [hum], all,
      [mark('s1', 'BAN1', 70), mark('s1', 'HIST', 80), mark('s1', 'ISL', 75)],
      'ex1',
    );
    const ids = rows[0].tabulation.subjects.map((s) => s.subjectId);
    expect(ids).not.toContain('PHY');
    expect(ids).not.toContain('HIN');
  });

  it('still holds it open for a paper the student DOES sit', () => {
    const rows = sheetFor([sci], all, [mark('s2', 'BAN1', 70)], 'ex1');
    expect(rows[0].tabulation.incomplete).toBe(true);
    expect(rows[0].tabulation.gpa).toBeNull();
  });

  it('ranks students on their own papers, whatever they sat', () => {
    const rows = sheetFor(
      [hum, sci],
      all,
      [
        mark('s1', 'BAN1', 70), mark('s1', 'HIST', 80), mark('s1', 'ISL', 75),
        mark('s2', 'BAN1', 90), mark('s2', 'PHY', 90), mark('s2', 'HIN', 90),
      ],
      'ex1',
    );
    expect(rows.find((r) => r.student.studentId === 's2')?.position).toBe(1);
    expect(rows.find((r) => r.student.studentId === 's1')?.position).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// the columns of the sheet itself
//
// A real school's whole subject list was two Bangla papers and two English
// ones, every one of them graded in a pair. The sheet took its columns from
// the subject list and its values from the tabulation, which holds the merged
// units — so nothing ever matched and the entire sheet came out blank with the
// marks sitting safely in the database.

describe('sheetColumns', () => {
  const ban1 = subject({
    subjectId: 'BANGLA_1ST_PAPER', subjectName: 'BANGLA 1ST PAPER', combineGroup: 'BAN',
  });
  const ban2 = subject({
    subjectId: 'BANGLA_2ND_PAPER', subjectName: 'BANGLA 2ND PAPER', combineGroup: 'BAN',
    sortOrder: 2,
  });
  const eng1 = subject({
    subjectId: 'ENGLISH_1ST_PAPER', subjectName: 'ENGLISH 1ST PAPER', combineGroup: 'ENG',
    sortOrder: 3,
  });
  const eng2 = subject({
    subjectId: 'ENGLISH_2ND_PAPER', subjectName: 'ENGLISH 2ND PAPER', combineGroup: 'ENG',
    sortOrder: 4,
  });
  const theirs = [ban1, ban2, eng1, eng2];
  const pupil = student({ studentId: 's9', fullName: 'Nusrat', rollNo: 1 });

  it('is one column per graded unit, not one per paper', () => {
    const cols = sheetColumns(theirs, 'Class 9');
    expect(cols.map((c) => c.subjectId)).toEqual(['UNIT_BAN', 'UNIT_ENG']);
    expect(cols.map((c) => c.subjectName)).toEqual(['BANGLA', 'ENGLISH']);
    expect(cols.map((c) => c.fullMarks)).toEqual([200, 200]);
  });

  it('matches what the tabulation holds, so the marks appear', () => {
    const rows = sheetFor(
      [pupil], theirs,
      [mark('s9', 'BANGLA_1ST_PAPER', 50), mark('s9', 'BANGLA_2ND_PAPER', 50)],
      'ex1',
    );
    const cols = sheetColumns(theirs, 'Class 9');
    const bangla = rows[0].tabulation.subjects.find((x) => x.subjectId === cols[0].subjectId);
    expect(bangla).toBeDefined();
    expect(bangla?.marks).toBe(100);          // the pair, out of 200
  });

  it('leaves a paper that stands alone as its own column', () => {
    const maths = subject({ subjectId: 'MATH', subjectName: 'Mathematics', sortOrder: 5 });
    expect(sheetColumns([...theirs, maths], 'Class 9').map((c) => c.subjectId))
      .toEqual(['UNIT_BAN', 'UNIT_ENG', 'MATH']);
  });

  it('counts the per-subject statistics against those same columns', () => {
    const rows = sheetFor(
      [pupil], theirs,
      [mark('s9', 'BANGLA_1ST_PAPER', 50), mark('s9', 'BANGLA_2ND_PAPER', 50)],
      'ex1',
    );
    const stats = subjectStats(rows, sheetColumns(theirs, 'Class 9'));
    expect(stats[0].subjectName).toBe('BANGLA');
    expect(stats[0].highest).toBe(100);
  });
});
