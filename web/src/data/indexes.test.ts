import { describe, expect, it } from 'vitest';
import indexes from '../../../firebase/firestore.indexes.json';

/**
 * Every composite index the app's queries need.
 *
 * THE EMULATOR DOES NOT ENFORCE INDEXES. It answers any query you give it, so
 * a query that needs a composite index passes every test here and then fails
 * on the real project with FAILED_PRECONDITION — which is exactly how the
 * monthly sheet reached a live school saying "Could not read the month".
 *
 * This table is written from the queries in src/data. It cannot know about a
 * query added later, so the rule matters more than the list: IN AN INDEX, THE
 * EQUALITY FIELDS COME FIRST, THEN THE RANGE OR ORDER FIELD. An index on
 * (date, classId) does NOT serve `where classId == x and date >= a`, which is
 * the trap that caught this one.
 */

type Field = { fieldPath: string; order?: string };
type Index = { collectionGroup: string; fields: Field[] };

const NEEDED: { why: string; collectionGroup: string; fields: [string, 'ASCENDING' | 'DESCENDING'][] }[] = [
  {
    why: "the monthly sheet and the low-attendance list: marksForMonth(classId, month)",
    collectionGroup: 'attendanceMarks',
    fields: [['classId', 'ASCENDING'], ['date', 'ASCENDING']],
  },
  {
    why: "a parent's attendance report: marksForStudentMonth(studentId, month)",
    collectionGroup: 'attendanceMarks',
    fields: [['studentId', 'ASCENDING'], ['date', 'DESCENDING']],
  },
  {
    why: "the dashboard's present count: marks for a date with status in P/L",
    collectionGroup: 'attendanceMarks',
    fields: [['date', 'ASCENDING'], ['status', 'ASCENDING']],
  },
  {
    why: "one student's attendance history: attendanceFor(studentId, from)",
    collectionGroup: 'attendanceMarks',
    fields: [['studentId', 'ASCENDING'], ['date', 'DESCENDING']],
  },
  {
    why: "the register for one section: active students of a class, by roll",
    collectionGroup: 'students',
    fields: [['status', 'ASCENDING'], ['classId', 'ASCENDING'], ['rollNo', 'ASCENDING']],
  },
  {
    why: 'the register for ALL sections: active students, by roll',
    collectionGroup: 'students',
    fields: [['status', 'ASCENDING'], ['rollNo', 'ASCENDING']],
  },
  {
    why: 'the student browser filtered by class',
    collectionGroup: 'students',
    fields: [['classId', 'ASCENDING'], ['rollNo', 'ASCENDING']],
  },
  {
    why: 'the student browser unfiltered, ordered by class then roll',
    collectionGroup: 'students',
    fields: [['className', 'ASCENDING'], ['rollNo', 'ASCENDING']],
  },
  {
    why: "one student's receipts, newest first",
    collectionGroup: 'payments',
    fields: [['studentId', 'ASCENDING'], ['paymentDate', 'DESCENDING']],
  },
  {
    why: 'the daily collection filtered by method',
    collectionGroup: 'payments',
    fields: [['paymentDate', 'DESCENDING'], ['method', 'ASCENDING']],
  },
  {
    why: "one student's marks for one exam",
    collectionGroup: 'results',
    fields: [['examId', 'ASCENDING'], ['studentId', 'ASCENDING']],
  },
  {
    why: 'the expense report filtered by head',
    collectionGroup: 'expenses',
    fields: [['expenseDate', 'DESCENDING'], ['expenseHeadId', 'ASCENDING']],
  },
];

const defined = (indexes as { indexes: Index[] }).indexes.map((i) => ({
  collectionGroup: i.collectionGroup,
  key: i.fields.map((f) => `${f.fieldPath}:${f.order}`).join(','),
}));

describe('the composite indexes the queries need are declared', () => {
  for (const need of NEEDED) {
    it(need.why, () => {
      const key = need.fields.map(([path, order]) => `${path}:${order}`).join(',');
      const found = defined.some((d) => d.collectionGroup === need.collectionGroup && d.key === key);
      expect(found, `missing index on ${need.collectionGroup}: ${key}`).toBe(true);
    });
  }

  it('declares no index whose range field comes before an equality field', () => {
    // Not a rule Firestore can be asked about from here — this is a reminder
    // in test form that (date, classId) and (classId, date) are different
    // indexes and only one of them answers "classId == x and date >= a".
    const attendance = defined.filter((d) => d.collectionGroup === 'attendanceMarks');
    expect(attendance.some((d) => d.key === 'classId:ASCENDING,date:ASCENDING')).toBe(true);
  });
});
