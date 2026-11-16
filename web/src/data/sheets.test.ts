import { describe, expect, it } from 'vitest';
import {
  type StudentResult,
  type Subject,
  gradeDistribution,
  meritOrder,
  subjectStats,
  totalMarks,
} from './exams';
import { type SubjectMark, tabulate } from './grading';
import type { StudentDetail } from './people';

/**
 * The same cases exist in android/.../SheetsTest.kt.
 *
 * Three compulsory subjects and one optional, as a real section has: with
 * only two compulsory the optional bonus is divided by two and swamps
 * everything, which is how the first draft of this test fooled itself.
 */

const subject = (id: string, optional = false): Subject => ({
  subjectId: id, subjectName: id, classNames: ['Class 6'],
  fullMarks: 100, isOptional: optional, sortOrder: 0,
});

const SUBJECTS = [subject('Bangla'), subject('English'), subject('Maths'), subject('Agri', true)];

type Marks = Partial<Record<'Bangla' | 'English' | 'Maths' | 'Agri', number>>;

const student = (id: string, roll: number): StudentDetail => ({
  studentId: id, fullName: `Student ${id}`, rollNo: roll,
  classId: '61', className: 'Class 6', section: 'A', status: 'A',
});

const result = (id: string, roll: number, marks: Marks, absent: string[] = []): StudentResult => {
  const subjectMarks: SubjectMark[] = SUBJECTS.map((s) => ({
    subjectId: s.subjectId,
    subjectName: s.subjectName,
    fullMarks: 100,
    marks: marks[s.subjectId as keyof Marks] ?? null,
    absent: absent.includes(s.subjectId),
    isOptional: s.isOptional,
  }));
  return { student: student(id, roll), tabulation: tabulate(subjectMarks), position: null };
};

describe('totalMarks', () => {
  it('adds every subject sat, including the optional one', () => {
    const r = result('1', 1, { Bangla: 80, English: 70, Maths: 60, Agri: 50 });
    expect(totalMarks(r.tabulation)).toBe(260);
  });

  it('counts an absence as nothing, not as a missing mark', () => {
    const r = result('1', 1, { Bangla: 80, Maths: 60, Agri: 50 }, ['English']);
    expect(totalMarks(r.tabulation)).toBe(190);
  });

  it('refuses a part-total while a mark is missing', () => {
    const r = result('1', 1, { Bangla: 80, Agri: 60 });
    expect(totalMarks(r.tabulation)).toBeNull();
  });
});

describe('subjectStats', () => {
  const rows = [
    result('1', 1, { Bangla: 80, English: 70, Maths: 65, Agri: 60 }),
    result('2', 2, { Bangla: 40, English: 30, Maths: 45, Agri: 50 }),
    result('3', 3, { Bangla: 60, Maths: 55, Agri: 55 }, ['English']),
  ];
  const stats = subjectStats(rows, SUBJECTS);

  it('reports highest, lowest and average over the marks actually entered', () => {
    const bangla = stats.find((s) => s.subjectId === 'Bangla')!;
    expect(bangla.highest).toBe(80);
    expect(bangla.lowest).toBe(40);
    expect(bangla.average).toBe(60);
    expect(bangla.passed).toBe(3);
    expect(bangla.failed).toBe(0);
  });

  it('counts an absence as failed and leaves it out of the average', () => {
    const english = stats.find((s) => s.subjectId === 'English')!;
    expect(english.absent).toBe(1);
    expect(english.failed).toBe(2);       // one absent, one scored 30
    expect(english.passed).toBe(1);
    expect(english.average).toBe(50);     // (70 + 30) / 2, the absence excluded
  });
});

describe('gradeDistribution', () => {
  it('counts grades in scale order and leaves out the unfinished', () => {
    const rows = [
      result('1', 1, { Bangla: 85, English: 85, Maths: 85, Agri: 85 }),   // 5.00 A+
      result('2', 2, { Bangla: 75, English: 75, Maths: 75, Agri: 40 }),   // 4.00 A
      result('3', 3, { Bangla: 72, English: 78, Maths: 70, Agri: 30 }),   // 4.00 A
      result('4', 4, { Bangla: 20, English: 80, Maths: 80, Agri: 80 }),   // 0.00 F
      result('5', 5, { Bangla: 60, Maths: 60, Agri: 60 }),                // incomplete
    ];
    expect(gradeDistribution(rows)).toEqual([
      { letter: 'A+', count: 1 },
      { letter: 'A', count: 2 },
      { letter: 'F', count: 1 },
    ]);
  });
});

describe('meritOrder', () => {
  it('puts the best first and breaks ties by roll', () => {
    const rows = [
      result('3', 3, { Bangla: 75, English: 75, Maths: 75, Agri: 40 }),   // 4.00
      result('1', 1, { Bangla: 85, English: 85, Maths: 85, Agri: 85 }),   // 5.00
      result('2', 2, { Bangla: 75, English: 75, Maths: 75, Agri: 40 }),   // 4.00, lower roll
    ];
    expect(meritOrder(rows).map((r) => r.student.rollNo)).toEqual([1, 2, 3]);
  });

  it('puts the unfinished last, below even a fail', () => {
    const rows = [
      result('1', 1, { Bangla: 60, Maths: 60, Agri: 60 }),                // incomplete
      result('2', 2, { Bangla: 10, English: 10, Maths: 10, Agri: 10 }),   // failed
    ];
    expect(meritOrder(rows).map((r) => r.student.rollNo)).toEqual([2, 1]);
  });
});
