import { describe, expect, it } from 'vitest';
import type { ResultRow, Subject } from './exams';
import { markSheet, partColumns, sheetTotal } from './marksheet';

/**
 * The SAME cases exist in android/.../data/MarkSheetTest.kt.
 *
 * Built from the school's own setup: Bangla first and second paper marked in
 * CQ 70 + MCQ 30 and graded together out of 200, English the same way as one
 * written paper each, and a science subject with a practical.
 */

const subject = (over: Partial<Subject> & { subjectId: string }): Subject => ({
  subjectName: over.subjectId,
  classNames: ['Class 9'],
  fullMarks: 100,
  isOptional: false,
  sortOrder: 1,
  ...over,
});

const CQ_MCQ = [{ name: 'CQ', max: 70, pass: 23 }, { name: 'MCQ', max: 30, pass: 10 }];
const WRITTEN = [{ name: 'WRITTEN', max: 100, pass: 0 }];
const WITH_PRACTICAL = [
  { name: 'CQ', max: 50, pass: 17 },
  { name: 'MCQ', max: 25, pass: 8 },
  { name: 'PRACTICAL', max: 25, pass: 8 },
];

const ban1 = subject({
  subjectId: 'BAN1', subjectName: 'BANGLA 1ST PAPER', combineGroup: 'BAN', components: CQ_MCQ,
});
const ban2 = subject({
  subjectId: 'BAN2', subjectName: 'BANGLA 2ND PAPER', combineGroup: 'BAN', components: CQ_MCQ,
  sortOrder: 2,
});
const eng1 = subject({
  subjectId: 'ENG1', subjectName: 'ENGLISH 1ST PAPER', combineGroup: 'ENG', components: WRITTEN,
  sortOrder: 3,
});
const eng2 = subject({
  subjectId: 'ENG2', subjectName: 'ENGLISH 2ND PAPER', combineGroup: 'ENG', components: WRITTEN,
  sortOrder: 4,
});
const physics = subject({
  subjectId: 'PHY', subjectName: 'Physics', components: WITH_PRACTICAL, sortOrder: 5,
});
const all = [ban1, ban2, eng1, eng2, physics];
const who = { className: 'Class 9' };

const mark = (subjectId: string, parts: Record<string, number | null>): ResultRow => {
  const values = Object.values(parts);
  const total = values.some((v) => v === null) ? null : values.reduce((a, b) => a! + b!, 0);
  return {
    examId: 'ex1', studentId: 's1', subjectId, subjectName: subjectId,
    marks: total, parts, absent: false,
    classId: 'C9A', rollNo: 1, fullMarks: 100, isOptional: false,
  };
};

describe('markSheet', () => {
  it('is one line per graded subject, with the papers inside it', () => {
    const lines = markSheet(all, who, []);
    expect(lines.map((l) => l.unitName)).toEqual(['BANGLA', 'ENGLISH', 'Physics']);
    expect(lines[0].papers.map((p) => p.subjectName))
      .toEqual(['BANGLA 1ST PAPER', 'BANGLA 2ND PAPER']);
    expect(lines[2].papers).toHaveLength(1);
  });

  it('keeps every part where it was marked', () => {
    const lines = markSheet(all, who, [
      mark('BAN1', { CQ: 55, MCQ: 22 }),
      mark('BAN2', { CQ: 50, MCQ: 25 }),
    ]);
    expect(lines[0].papers[0].parts).toEqual({ CQ: 55, MCQ: 22 });
    expect(lines[0].papers[0].marks).toBe(77);
    expect(lines[0].papers[1].marks).toBe(75);
    expect(lines[0].marks).toBe(152);          // the pair, out of 200
    expect(lines[0].fullMarks).toBe(200);
    expect(lines[0].letter).toBe('A');
  });

  it('shows what is in while the other paper is not', () => {
    const lines = markSheet(all, who, [mark('ENG1', { WRITTEN: 60 })]);
    const english = lines.find((l) => l.unitName === 'ENGLISH')!;
    expect(english.marks).toBeNull();          // one paper is not a subject
    expect(english.soFar).toBe(60);            // but 60 of it has arrived
    expect(english.letter).toBe('-');
  });

  it('fails a subject on a part below its own pass mark, and says which', () => {
    const lines = markSheet(all, who, [mark('PHY', { CQ: 40, MCQ: 20, PRACTICAL: 5 })]);
    const phy = lines.find((l) => l.unitName === 'Physics')!;
    expect(phy.marks).toBe(65);                // 65 out of 100 …
    expect(phy.letter).toBe('F');              // … and still an F
    expect(phy.failedParts).toEqual(['PRACTICAL']);
  });

  it('still lists a subject nobody has marked', () => {
    // A sheet that quietly drops the unmarked subject looks finished.
    expect(markSheet(all, who, []).map((l) => l.letter)).toEqual(['-', '-', '-']);
  });
});

describe('partColumns', () => {
  it('is only the parts these papers actually have, in reading order', () => {
    expect(partColumns(markSheet(all, who, []))).toEqual(['CQ', 'MCQ', 'PRACTICAL', 'WRITTEN']);
    expect(partColumns(markSheet([eng1, eng2], who, []))).toEqual(['WRITTEN']);
  });

  it('is empty for a school that marks every paper as one mark', () => {
    const plain = subject({ subjectId: 'REL', subjectName: 'Religion' });
    expect(partColumns(markSheet([plain], who, []))).toEqual([]);
  });
});

describe('sheetTotal', () => {
  it('adds the subjects up once every one of them is in', () => {
    const lines = markSheet([ban1, ban2], who, [
      mark('BAN1', { CQ: 55, MCQ: 22 }),
      mark('BAN2', { CQ: 50, MCQ: 25 }),
    ]);
    expect(sheetTotal(lines)).toEqual({ obtained: 152, outOf: 200 });
  });

  it('withholds the total while a mark is missing — a part total is a lie', () => {
    const lines = markSheet(all, who, [mark('BAN1', { CQ: 55, MCQ: 22 })]);
    expect(sheetTotal(lines).obtained).toBeNull();
    expect(sheetTotal(lines).outOf).toBe(500);
  });
});
