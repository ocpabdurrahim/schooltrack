import { describe, expect, it } from 'vitest';
import {
  type ResultRow,
  type Subject,
  sheetFor,
  sitsSubject,
  subjectsForStudent,
} from './exams';
import type { StudentDetail } from './people';

/**
 * The SAME cases exist in android/.../data/SubjectsTest.kt.
 *
 * Classes 9 and 10 stream into groups and the groups sit different papers.
 * Getting this wrong does not look like a bug: it looks like every Humanities
 * student having an unfinished result, for ever, because Physics has no mark.
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
const all = [bangla, physics, history];

describe('sitsSubject', () => {
  it('gives a paper with no group named to the whole class', () => {
    expect(sitsSubject(bangla, 'Class 9', 'Science')).toBe(true);
    expect(sitsSubject(bangla, 'Class 9', 'Humanities')).toBe(true);
    expect(sitsSubject(bangla, 'Class 9', '')).toBe(true);
  });

  it('gives a group paper only to that group', () => {
    expect(sitsSubject(physics, 'Class 9', 'Science')).toBe(true);
    expect(sitsSubject(physics, 'Class 9', 'Humanities')).toBe(false);
    expect(sitsSubject(history, 'Class 9', 'Humanities')).toBe(true);
    expect(sitsSubject(history, 'Class 9', 'Science')).toBe(false);
  });

  it('understands the group however the office wrote it', () => {
    expect(sitsSubject(physics, 'Class 9', 'sci')).toBe(true);
    expect(sitsSubject(history, 'Class 9', 'ARTS')).toBe(true);
  });

  it('gives every paper to a student with no group recorded', () => {
    // Deliberate: see the note on sitsSubject. A short GPA nobody can see is
    // worse than a result that openly says it is not finished.
    expect(sitsSubject(physics, 'Class 9', null)).toBe(true);
    expect(sitsSubject(history, 'Class 9', undefined)).toBe(true);
  });

  it('never gives a paper the class does not sit', () => {
    expect(sitsSubject(physics, 'Class 7', 'Science')).toBe(false);
    expect(sitsSubject(bangla, 'Class 7', '')).toBe(false);
  });
});

describe('subjectsForStudent', () => {
  it('is the class list filtered to the student’s own group', () => {
    expect(subjectsForStudent(all, 'Class 9', 'Science').map((s) => s.subjectId))
      .toEqual(['BAN1', 'PHY']);
    expect(subjectsForStudent(all, 'Class 9', 'Business Studies').map((s) => s.subjectId))
      .toEqual(['BAN1']);
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
  const hum = student({ studentId: 's1', fullName: 'Hasina', rollNo: 1, groupName: 'Humanities' });
  const sci = student({ studentId: 's2', fullName: 'Shakil', rollNo: 2, groupName: 'Science' });

  it('finishes a student whose own papers are all marked', () => {
    const rows = sheetFor([hum], all, [mark('s1', 'BAN1', 70), mark('s1', 'HIST', 80)], 'ex1');
    expect(rows[0].tabulation.incomplete).toBe(false);
    expect(rows[0].tabulation.gpa).toBe(4.5);          // A 4.0 and A+ 5.0
    expect(rows[0].tabulation.subjects.map((s) => s.subjectId)).toEqual(['BAN1', 'HIST']);
  });

  it('does not hold a result open for a paper the student never sat', () => {
    // Physics has no mark for Hasina and never will: she is Humanities.
    const rows = sheetFor([hum], all, [mark('s1', 'BAN1', 70), mark('s1', 'HIST', 80)], 'ex1');
    expect(rows[0].tabulation.subjects.some((s) => s.subjectId === 'PHY')).toBe(false);
  });

  it('still holds it open for a paper the student DOES sit', () => {
    const rows = sheetFor([sci], all, [mark('s2', 'BAN1', 70)], 'ex1');
    expect(rows[0].tabulation.incomplete).toBe(true);
    expect(rows[0].tabulation.gpa).toBeNull();
  });

  it('ranks the two groups against each other on their own papers', () => {
    const rows = sheetFor(
      [hum, sci],
      all,
      [
        mark('s1', 'BAN1', 70), mark('s1', 'HIST', 80),
        mark('s2', 'BAN1', 90), mark('s2', 'PHY', 90),
      ],
      'ex1',
    );
    expect(rows.find((r) => r.student.studentId === 's2')?.position).toBe(1);
    expect(rows.find((r) => r.student.studentId === 's1')?.position).toBe(2);
  });
});
