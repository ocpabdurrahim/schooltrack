import { describe, expect, it } from 'vitest';
import {
  type Exam,
  type StudentResult,
  type Subject,
  gradeDistribution,
  meritOrder,
  resultLines,
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

describe('resultLines, the results a parent reads', () => {
  const exam = (
    examId: string,
    examName: string,
    examYear: string,
    published = true,
    sortOrder = 0,
  ): Exam => ({
    examId, examName, examYear, published, sortOrder,
    periodLabel: `${examName}-${examYear}`.toUpperCase(),
  });

  const tabulationFor = (marks: Marks, absent: string[] = []) =>
    tabulate(SUBJECTS.map((s) => ({
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      fullMarks: 100,
      marks: marks[s.subjectId as keyof Marks] ?? null,
      absent: absent.includes(s.subjectId),
      isOptional: s.isOptional,
    })));

  it('runs oldest year first, so a report reads forwards', () => {
    const lines = resultLines([
      { exam: exam('final-2026', 'Final', '2026'), tabulation: tabulationFor({ Bangla: 80, English: 80, Maths: 80 }) },
      { exam: exam('half-2025', 'Half yearly', '2025'), tabulation: tabulationFor({ Bangla: 60, English: 60, Maths: 60 }) },
    ]);
    expect(lines.map((l) => l.examYear)).toEqual(['2025', '2026']);
  });

  it("follows the school's order within a year, which the name cannot", () => {
    // "Annual" sorts before "Half yearly" alphabetically but comes after it in
    // the year — the whole reason the order field exists.
    const marks = { Bangla: 70, English: 70, Maths: 70 };
    const lines = resultLines([
      { exam: exam('annual-2026', 'Annual', '2026', true, 2), tabulation: tabulationFor(marks) },
      { exam: exam('half-yearly-2026', 'Half yearly', '2026', true, 1), tabulation: tabulationFor(marks) },
    ]);
    expect(lines.map((l) => l.examName)).toEqual(['Half yearly', 'Annual']);
  });

  it('falls back to the exam id when no order was ever set', () => {
    const marks = { Bangla: 70, English: 70, Maths: 70 };
    const lines = resultLines([
      { exam: exam('half-yearly-2026', 'Half yearly', '2026'), tabulation: tabulationFor(marks) },
      { exam: exam('annual-2026', 'Annual', '2026'), tabulation: tabulationFor(marks) },
    ]);
    expect(lines.map((l) => l.examId)).toEqual(['annual-2026', 'half-yearly-2026']);
    expect(lines.every((l) => l.sortOrder === 0)).toBe(true);
  });

  it('gives the marks out of the full marks of every subject sat', () => {
    const [line] = resultLines([
      { exam: exam('e', 'Exam', '2026'), tabulation: tabulationFor({ Bangla: 80, English: 70, Maths: 60, Agri: 90 }) },
    ]);
    expect(line.obtained).toBe(300);
    expect(line.outOf).toBe(400);       // the optional subject counts here
    expect(line.percent).toBe(75);
    expect(line.letter).not.toBe('-');
  });

  it('withholds the total and the percentage while a mark is missing', () => {
    // Half an exam shown as a percentage reads as a bad result rather than an
    // unfinished one, and a parent cannot tell the difference.
    const [line] = resultLines([
      { exam: exam('e', 'Exam', '2026'), tabulation: tabulationFor({ Bangla: 80, English: 70 }) },
    ]);
    expect(line.incomplete).toBe(true);
    expect(line.obtained).toBeNull();
    expect(line.percent).toBeNull();
    expect(line.gpa).toBeNull();
  });

  it('still reports the marks when one compulsory subject failed the exam', () => {
    const [line] = resultLines([
      {
        exam: exam('e', 'Exam', '2026'),
        tabulation: tabulationFor({ Bangla: 80, English: 20, Maths: 70, Agri: 50 }),
      },
    ]);
    expect(line.letter).toBe('F');
    expect(line.gpa).toBe(0);
    expect(line.failed).toEqual(['English']);
    expect(line.obtained).toBe(220);    // the marks are all in, so they are shown
    expect(line.percent).toBe(55);
  });

  it('still totals the marks when the OPTIONAL one was never sat', () => {
    // This used to withhold the total, on the grounds that a total leaving one
    // subject out would disagree with the result sheet's. The school found what
    // that looked like on paper: "GPA 4.33" printed beside "Total --", which
    // reads as broken arithmetic. A student sits ONE 4th subject, not every
    // optional one their class is offered, so there was never a mark coming.
    //
    // The objection is answered a better way now: the result sheet, the mark
    // sheets and this report all call marksTotal(), so they cannot disagree.
    const [line] = resultLines([
      { exam: exam('e', 'Exam', '2026'), tabulation: tabulationFor({ Bangla: 80, English: 70, Maths: 60 }) },
    ]);
    expect(line.incomplete).toBe(false);
    expect(line.gpa).not.toBeNull();
    expect(line.obtained).toBe(210);    // 80 + 70 + 60, out of the three sat
    expect(line.outOf).toBe(300);       // NOT 400: the unsat 4th subject is not counted
    expect(line.percent).toBe(70);
  });

  it('carries whether the exam is published, which is what a parent may see', () => {
    const lines = resultLines([
      { exam: exam('e', 'Exam', '2026', false), tabulation: tabulationFor({ Bangla: 80, English: 70, Maths: 60 }) },
    ]);
    expect(lines[0].published).toBe(false);
  });

  it('is empty for a student with no results at all', () => {
    expect(resultLines([])).toEqual([]);
  });
});
