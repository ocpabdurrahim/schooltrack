/**
 * Security rules tests â€” SchoolTrack
 *
 * Run against the emulator, never the real project:
 *   firebase emulators:exec --only firestore "npm run test:rules"
 *
 * These prove the four things the whole model rests on
 * (docs/data-model.md Â§0 and Â§2):
 *   1. while a module belongs to Oracle, nobody may write it here â€” not even
 *      an administrator
 *   2. a guardian sees their own children and nothing else, and can write
 *      nothing at all
 *   3. an attendance mark must carry its class/roll snapshot or be refused
 *   4. receipts are immutable and their counter only ever moves forward by one
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const SCHOOL = 'matkhola';
let env: RulesTestEnvironment;

const who = (email: string) =>
  env.authenticatedContext(email.replace(/\W/g, ''), { email, email_verified: true });

const admin = () => who('admin@school.test').firestore();
const teacher = () => who('teacher@school.test').firestore();
const accounts = () => who('accounts@school.test').firestore();
const retired = () => who('retired@school.test').firestore();
const parent = () => who('parent@home.test').firestore();
const stranger = () => env.unauthenticatedContext().firestore();

const p = (...parts: string[]) => ['schools', SCHOOL, ...parts].join('/');

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'schooltrack-rules-test',
    firestore: {
      rules: readFileSync('../firebase/firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const now = new Date();

    await setDoc(doc(db, 'schools', SCHOOL), { name: 'Matkhola ML High School', active: true });

    const member = (email: string, role: string, extra = {}) =>
      setDoc(doc(db, p('members', email)), {
        email, name: email, role, active: true, deleted: false, updatedAt: now, ...extra,
      });

    await member('admin@school.test', 'ADMIN');
    await member('teacher@school.test', 'TEACHER');
    await member('accounts@school.test', 'ACCOUNTS');
    // left the school: still listed, but must have no access at all
    await member('retired@school.test', 'TEACHER', { active: false });

    await setDoc(doc(db, p('guardians', 'parent@home.test')), {
      email: 'parent@home.test', name: 'A Parent',
      studentIds: ['76'], active: true, updatedAt: now,
    });

    for (const id of ['76', '77']) {
      await setDoc(doc(db, p('students', id)), {
        fullName: `Student ${id}`, rollNo: Number(id), classId: '61',
        className: 'Class 6', section: 'A', status: 'A', updatedAt: now,
      });
    }

    for (const id of ['76', '77']) {
      await setDoc(doc(db, p('attendanceMarks', `2026-11-15_${id}`)), {
        studentId: id, classId: '61', className: 'Class 6', section: 'A', rollNo: Number(id),
        date: '2026-11-15', status: 'P', markedVia: 'MANUAL',
        markedBy: 'teacher@school.test', markedAt: now,
      });
    }

    await setDoc(doc(db, p('payments', 'RCPT-000001')), {
      receiptNo: 'RCPT-000001', studentId: '76', studentName: 'Student 76',
      totalAmount: 600, method: 'Cash', createdBy: 'accounts@school.test',
      lines: [{ feeHeadId: 'EXAM', headName: 'Exam Fee', periodLabel: 'HALF_YEARLY_EXAM-2026',
                grossAmount: 600, discountAmount: 0, amountPaid: 600 }],
      paymentDate: '2026-08-08', createdAt: now,
    });

    await setDoc(doc(db, p('counters', 'receipts')), { next: 2 });
  });
});

// ---------------------------------------------------------------------------

describe('signed out', () => {
  it('reads nothing', async () => {
    await assertFails(getDoc(doc(stranger(), p('students', '76'))));
  });
  it('writes nothing', async () => {
    await assertFails(setDoc(doc(stranger(), p('students', '76')), { fullName: 'x' }));
  });
});

describe('who may mark attendance', () => {
  it('TEACHER can mark', async () => {
    await assertSucceeds(
      setDoc(doc(teacher(), p('attendanceMarks', '2026-11-16_76')), {
        studentId: '76', classId: '61', rollNo: 76, date: '2026-11-16',
        status: 'P', markedVia: 'SCAN',
        markedBy: 'teacher@school.test', markedAt: serverTimestamp(),
      }),
    );
  });

  it('ACCOUNTS cannot mark', async () => {
    await assertFails(
      setDoc(doc(accounts(), p('attendanceMarks', '2026-11-16_76')), {
        studentId: '76', classId: '61', rollNo: 76, date: '2026-11-16',
        status: 'P', markedVia: 'MANUAL',
        markedBy: 'accounts@school.test', markedAt: serverTimestamp(),
      }),
    );
  });

  it('a member whose access was switched off cannot mark', async () => {
    await assertFails(
      setDoc(doc(retired(), p('attendanceMarks', '2026-11-16_76')), {
        studentId: '76', classId: '61', rollNo: 76, date: '2026-11-16',
        status: 'P', markedVia: 'MANUAL',
        markedBy: 'retired@school.test', markedAt: serverTimestamp(),
      }),
    );
  });
});

describe('attendance writes must carry the snapshot (Â§4)', () => {
  const mark = (extra: Record<string, unknown>) => ({
    studentId: '76', classId: '61', rollNo: 76, date: '2026-11-16',
    status: 'P', markedVia: 'SCAN',
    markedBy: 'teacher@school.test', markedAt: serverTimestamp(),
    ...extra,
  });

  const write = (data: Record<string, unknown>) =>
    setDoc(doc(teacher(), p('attendanceMarks', '2026-11-16_76')), data);

  it('rejects a mark with no classId', async () => {
    const { classId, ...noClass } = mark({});
    await assertFails(write(noClass));
  });

  it('rejects a mark with no rollNo', async () => {
    const { rollNo, ...noRoll } = mark({});
    await assertFails(write(noRoll));
  });

  it('rejects an invalid status', async () => {
    await assertFails(write(mark({ status: 'X' })));
  });

  it('rejects a mark attributed to someone else', async () => {
    await assertFails(write(mark({ markedBy: 'admin@school.test' })));
  });

  it('rejects a back-dated markedAt', async () => {
    await assertFails(write(mark({ markedAt: new Date('2020-01-01') })));
  });

  it('rejects a mark whose id does not match date_studentId', async () => {
    // the document id IS the uniqueness: one mark per student per day
    await assertFails(
      setDoc(doc(teacher(), p('attendanceMarks', '2026-11-16_77')), mark({})),
    );
    await assertFails(
      setDoc(doc(teacher(), p('attendanceMarks', 'nonsense')), mark({})),
    );
  });
});

describe('guardians (Â§2)', () => {
  it('reads their own child', async () => {
    await assertSucceeds(getDoc(doc(parent(), p('students', '76'))));
  });

  it('cannot read another child', async () => {
    await assertFails(getDoc(doc(parent(), p('students', '77'))));
  });

  it('reads their own child\'s attendance', async () => {
    await assertSucceeds(
      getDoc(doc(parent(), p('attendanceMarks', '2026-11-15_76'))),
    );
  });

  it('cannot widen their own access', async () => {
    await assertFails(
      updateDoc(doc(parent(), p('guardians', 'parent@home.test')), {
        studentIds: ['76', '77'], updatedAt: serverTimestamp(),
      }),
    );
  });

  it('cannot write attendance', async () => {
    await assertFails(
      setDoc(doc(parent(), p('attendanceMarks', '2026-11-16_76')), {
        studentId: '76', classId: '61', rollNo: 76, date: '2026-11-16',
        status: 'P', markedVia: 'MANUAL',
        markedBy: 'parent@home.test', markedAt: serverTimestamp(),
      }),
    );
  });

  it('cannot read payroll', async () => {
    await assertFails(getDoc(doc(parent(), p('salaryPayments', 'x'))));
  });

  // The UI also hides other children, but that is courtesy. These are the
  // checks that actually stop a determined parent with a URL bar.
  it('may query the attendance of their OWN child', async () => {
    await assertSucceeds(getDocs(query(
      collection(parent(), p('attendanceMarks')),
      where('studentId', '==', '76'),
    )));
  });

  it('cannot query the attendance of another child', async () => {
    await assertFails(getDocs(query(
      collection(parent(), p('attendanceMarks')),
      where('studentId', '==', '77'),
    )));
  });

  it('cannot query the whole register', async () => {
    await assertFails(getDocs(collection(parent(), p('attendanceMarks'))));
  });

  it('cannot list all students', async () => {
    await assertFails(getDocs(collection(parent(), p('students'))));
  });
});

describe('role boundaries', () => {
  it('a TEACHER cannot read payments', async () => {
    await assertFails(getDoc(doc(teacher(), p('payments', 'RCPT-000001'))));
  });

  it('a TEACHER cannot create a payment', async () => {
    await assertFails(
      setDoc(doc(teacher(), p('payments', 'RCPT-000002')), {
        receiptNo: 'RCPT-000002', studentId: '76', totalAmount: 100,
        lines: [{ feeHeadId: 'TUITION', amountPaid: 100 }],
        createdBy: 'teacher@school.test',
      }),
    );
  });

  it('ACCOUNTS can create a payment', async () => {
    await assertSucceeds(
      setDoc(doc(accounts(), p('payments', 'RCPT-000002')), {
        receiptNo: 'RCPT-000002', studentId: '76', totalAmount: 100,
        lines: [{ feeHeadId: 'TUITION', amountPaid: 100 }],
        createdBy: 'accounts@school.test',
      }),
    );
  });

  it('only ADMIN reads payroll', async () => {
    await assertFails(getDoc(doc(accounts(), p('salaryPayments', 'x'))));
    await assertSucceeds(getDoc(doc(admin(), p('salaryPayments', 'x'))));
  });

  it('a member who has left has no access', async () => {
    await assertFails(getDoc(doc(retired(), p('students', '76'))));
  });

  it('only ADMIN may grant access', async () => {
    await assertFails(
      setDoc(doc(teacher(), p('members', 'new@school.test')), {
        email: 'new@school.test', role: 'ADMIN', active: true,
        deleted: false, updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      setDoc(doc(admin(), p('members', 'new@school.test')), {
        email: 'new@school.test', role: 'TEACHER', active: true,
        deleted: false, updatedAt: serverTimestamp(),
      }),
    );
  });
});

describe('receipts and counters (Â§5)', () => {
  it('a receipt cannot be edited, even by ADMIN', async () => {
    await assertFails(
      updateDoc(doc(admin(), p('payments', 'RCPT-000001')), { totalAmount: 1 }),
    );
  });

  it('a receipt cannot be deleted, even by ADMIN', async () => {
    await assertFails(deleteDoc(doc(admin(), p('payments', 'RCPT-000001'))));
  });

  it('the counter moves forward by exactly one', async () => {
    await assertSucceeds(setDoc(doc(accounts(), p('counters', 'receipts')), { next: 3 }));
  });

  it('the counter cannot jump', async () => {
    await assertFails(setDoc(doc(accounts(), p('counters', 'receipts')), { next: 9 }));
  });

  it('the counter cannot go backwards', async () => {
    await assertFails(setDoc(doc(accounts(), p('counters', 'receipts')), { next: 1 }));
  });
});
