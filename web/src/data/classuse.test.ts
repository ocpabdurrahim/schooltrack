import { describe, expect, it } from 'vitest';
import { UNUSED, canRemoveClass } from './classuse';

/** The SAME cases exist in android/.../data/ClassUseTest.kt. */

const use = (over: Partial<typeof UNUSED> = {}) => ({ ...UNUSED, ...over });

describe('removing a class or section', () => {
  it('lets an unused one go', () => {
    const got = canRemoveClass(use(), false);
    expect(got.ok).toBe(true);
  });

  it('REFUSES one that still has students, and says to retire it instead', () => {
    // The fault this guards: a student pointing at a section that is not
    // there, which is unreadable everywhere and fixable nowhere.
    const got = canRemoveClass(use({ students: 78 }), false);
    expect(got.ok).toBe(false);
    if (got.ok) return;
    expect(got.reason).toContain('78 students');
    expect(got.reason).toContain('In use');
    expect(got.retire).toBe(true);
  });

  it('counts a student who has LEFT as still in the way', () => {
    // Their record still carries the classId, and their results still have to
    // be readable years later.
    expect(canRemoveClass(use({ students: 1 }), false).ok).toBe(false);
  });

  it('refuses for marks and attendance even with nobody on the roll', () => {
    // The promoted-class case: the students have moved on, the marks they sat
    // under this section have not.
    expect(canRemoveClass(use({ results: 36 }), false).ok).toBe(false);
    expect(canRemoveClass(use({ attendance: 159 }), false).ok).toBe(false);
  });

  it('refuses for an exam routine entry, which is cheap to redo and easy to miss', () => {
    expect(canRemoveClass(use({ routine: 1 }), false).ok).toBe(false);
  });

  it('names everything in the way, as a sentence', () => {
    const got = canRemoveClass(use({ students: 3, results: 2, attendance: 1 }), false);
    if (got.ok) throw new Error('should have refused');
    expect(got.reason).toContain('3 students, 2 results and 1 attendance mark');
  });

  it('uses the singular where it should', () => {
    const got = canRemoveClass(use({ students: 1 }), false);
    if (got.ok) throw new Error('should have refused');
    expect(got.reason).toContain('1 student.');
  });

  it('WARNS, not refuses, when it is the last section of its class', () => {
    // Subjects and fee rates name the class, not the section.
    const got = canRemoveClass(use(), true);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.warning).toContain('only section of its class');
  });

  it('says nothing extra when another section of the class remains', () => {
    const got = canRemoveClass(use(), false);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.warning).toBe('');
  });
});
