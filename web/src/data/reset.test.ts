import { describe, expect, it } from 'vitest';
import {
  ALL_COLLECTIONS, ALWAYS_KEPT, confirms, leftoverList, planFor, stillThere,
} from './reset';

/** The SAME cases exist in android/.../data/ResetTest.kt. */

describe('what a reset clears', () => {
  it('clears everything but who you are and how you get in', () => {
    const p = planFor('all');
    expect(p.keep).toEqual(['integrations', 'members', 'settings']);
    for (const gone of ['students', 'payments', 'classes', 'counters', 'results']) {
      expect(p.clear).toContain(gone);
    }
  });

  it('NEVER clears members, or the school is locked out of its own app', () => {
    for (const mode of ['all', 'records'] as const) {
      expect(planFor(mode).clear).not.toContain('members');
    }
    expect(ALWAYS_KEPT).toContain('members');
  });

  it('keeps the Gemini key, because re-pasting it is a nuisance not a guard', () => {
    expect(planFor('all').clear).not.toContain('integrations');
  });

  it("keeps settings, which holds the name the confirmation is typed against", () => {
    expect(planFor('all').clear).not.toContain('settings');
  });

  it("'records' keeps the school's shape and clears its history", () => {
    const p = planFor('records');
    for (const kept of ['classes', 'subjects', 'feeHeads', 'feeStructure', 'holidays', 'staff']) {
      expect(p.keep).toContain(kept);
    }
    for (const gone of ['students', 'results', 'attendanceMarks', 'payments', 'studentPhotos']) {
      expect(p.clear).toContain(gone);
    }
  });

  it('every collection is accounted for, in one list or the other', () => {
    // The blind spot this guards: a browser cannot ask Firestore what
    // collections exist, so one left out of ALL_COLLECTIONS is simply never
    // cleared and the new school starts with last year's records in it.
    for (const mode of ['all', 'records'] as const) {
      const p = planFor(mode);
      expect([...p.clear, ...p.keep].sort()).toEqual([...ALL_COLLECTIONS].sort());
    }
  });

  it('names the collections the rules know about', () => {
    // If one of these is ever renamed, this fails here rather than silently
    // leaving records behind on the day somebody starts a new school.
    for (const named of [
      'students', 'studentPhotos', 'results', 'exams', 'attendance', 'attendanceMarks',
      'classes', 'subjects', 'holidays', 'feeHeads', 'feeStructure', 'discounts',
      'payments', 'counters', 'expenseHeads', 'expenses', 'staff', 'salaryStructure',
      'salaryPayments', 'documents', 'guardians', 'members', 'settings', 'integrations',
    ]) {
      expect(ALL_COLLECTIONS).toContain(named);
    }
  });
});

describe('the confirmation', () => {
  it('takes only the school\'s own name', () => {
    expect(confirms('Matkhola ML High School', 'Matkhola ML High School')).toBe(true);
    expect(confirms('yes', 'Matkhola ML High School')).toBe(false);
    expect(confirms('', 'Matkhola ML High School')).toBe(false);
    expect(confirms('Matkhola', 'Matkhola ML High School')).toBe(false);
  });

  it('forgives a typing slip, not a doubt', () => {
    expect(confirms('  matkhola ml high school ', 'Matkhola ML High School')).toBe(true);
    expect(confirms('Matkhola  ML   High School', 'Matkhola ML High School')).toBe(true);
  });

  it('cannot be satisfied by typing nothing at a school with no name', () => {
    expect(confirms('', '')).toBe(false);
    expect(confirms('  ', ' ')).toBe(false);
  });
});

describe('what is still there afterwards', () => {
  it('is nothing when the clearing worked', () => {
    expect(stillThere({ students: 0, results: 0 }, ['students', 'results'])).toEqual([]);
  });

  it('names what survived, biggest first', () => {
    // A refused batch — the armed window ran out, the connection dropped —
    // leaves records the new school starts with and nobody is expecting.
    expect(stillThere({ students: 78, results: 36, payments: 0 }, ['students', 'results', 'payments']))
      .toEqual([{ name: 'students', count: 78 }, { name: 'results', count: 36 }]);
  });

  it('ignores a collection that was never going to be cleared', () => {
    expect(stillThere({ members: 1, students: 0 }, ['students'])).toEqual([]);
  });

  it('treats a count it never got as nothing left, not as a failure', () => {
    // A collection the count could not read says nothing either way; the
    // alternative is crying wolf on every reset.
    expect(stillThere({}, ['students'])).toEqual([]);
  });

  it('reads as a sentence', () => {
    expect(leftoverList([{ name: 'students', count: 78 }])).toBe('students (78)');
    expect(leftoverList([
      { name: 'students', count: 78 }, { name: 'results', count: 36 },
    ])).toBe('students (78) and results (36)');
    expect(leftoverList([
      { name: 'students', count: 78 }, { name: 'results', count: 36 }, { name: 'exams', count: 2 },
    ])).toBe('students (78), results (36) and exams (2)');
  });
});
