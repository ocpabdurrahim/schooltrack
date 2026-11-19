/**
 * Security rules tests — SchoolTrack
 *
 * Run against the emulator, never the real project:
 *   firebase emulators:exec --only firestore "npm run test:rules"
 *
 * These prove the four things the whole model rests on
 * (docs/data-model.md §0 and §2):
 *   1. access comes only from members/{email} or guardians/{email}; signing in
 *      successfully grants nothing by itself
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
const office = () => who('office@school.test').firestore();
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
    await member('office@school.test', 'OFFICE');
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

    await setDoc(doc(db, p('integrations', 'gemini')), {
      geminiApiKey: 'test-key-not-a-real-one', geminiModel: 'gemini-x-flash', updatedAt: now,
    });

    await setDoc(doc(db, p('feeHeads', 'TUITION')), {
      headCode: 'TUITION', headName: 'Tuition fee', frequency: 'MONTHLY',
      active: true, sortOrder: 1, updatedAt: now,
    });

    await setDoc(doc(db, p('feeStructure', 'TUITION_Class 6_2026')), {
      feeHeadId: 'TUITION', className: 'Class 6', sessionYear: '2026',
      amount: 300, updatedAt: now,
    });

    await setDoc(doc(db, p('holidays', '2026-12-16')), {
      date: '2026-12-16', name: 'Victory Day', source: 'SCHOOL', updatedAt: now,
    });

    await setDoc(doc(db, p('exams', 'HALF_YEARLY-2026')), {
      examName: 'Half Yearly', examYear: 2026, published: false, updatedAt: now,
    });

    await setDoc(doc(db, p('settings', 'rooms')), {
      rooms: [{ roomId: 'ROOM_101', roomName: 'Room 101', capacity: 30, columns: 2 }],
      updatedAt: now,
    });
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

describe('attendance writes must carry the snapshot (§4)', () => {
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

describe('guardians (§2)', () => {
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

  it("reads their own child's receipt", async () => {
    await assertSucceeds(getDoc(doc(parent(), p('payments', 'RCPT-000001'))));
  });

  // The fees report has to say what is OUTSTANDING, and a balance cannot be
  // worked out without the rate card. A school publishes its fees anyway.
  it('reads the rate card, so the fees report can show a balance', async () => {
    await assertSucceeds(getDoc(doc(parent(), p('feeHeads', 'TUITION'))));
    await assertSucceeds(getDoc(doc(parent(), p('feeStructure', 'TUITION_Class 6_2026'))));
    await assertSucceeds(getDocs(collection(parent(), p('feeHeads'))));
  });

  it('cannot change the rate card', async () => {
    await assertFails(
      setDoc(doc(parent(), p('feeStructure', 'TUITION_Class 6_2026')), {
        feeHeadId: 'TUITION', className: 'Class 6', sessionYear: '2026',
        amount: 1, updatedAt: serverTimestamp(),
      }),
    );
  });

  it('still cannot read the per-student discounts', async () => {
    await assertFails(getDoc(doc(parent(), p('discounts', 'x'))));
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
  // Widening the rate card to guardians must not widen it to teachers: money
  // is not a teacher's business here, and that was true before guardians were.
  it('a TEACHER still cannot read the rate card', async () => {
    await assertFails(getDoc(doc(teacher(), p('feeHeads', 'TUITION'))));
    await assertFails(getDoc(doc(teacher(), p('feeStructure', 'TUITION_Class 6_2026'))));
  });

  it('a TEACHER cannot read payments', async () => {
    await assertFails(getDoc(doc(teacher(), p('payments', 'RCPT-000001'))));
  });

  // The student list offers Paid and Due columns, and they are fetched from
  // /payments. OFFICE may read the rate card but NOT a receipt, so the list
  // must not offer those columns to an OFFICE user: it would only earn a
  // refusal where the rest of the page worked.
  it('an OFFICE user reads the rate card but not a payment', async () => {
    await assertSucceeds(getDoc(doc(office(), p('feeHeads', 'TUITION'))));
    await assertSucceeds(getDoc(doc(office(), p('feeStructure', 'TUITION_Class 6_2026'))));
    await assertFails(getDoc(doc(office(), p('payments', 'RCPT-000001'))));
  });

  // ---- the Gemini key -------------------------------------------------
  //
  // An API key is worth money to whoever holds it, and this one sits in the
  // database because the app has no server to hide it behind. So the rules
  // are the whole of its protection, and these cases are the whole of the
  // proof that it works.

  it('a guardian cannot read the API key', async () => {
    // The reason it is not a document under settings/: parents read settings,
    // and rules are a union, so nothing inside that collection can be hidden
    // from them afterwards.
    await assertFails(getDoc(doc(parent(), p('integrations', 'gemini'))));
    await assertSucceeds(getDoc(doc(parent(), p('settings', 'school'))));
  });

  it('signed out, the API key is unreachable', async () => {
    await assertFails(getDoc(doc(stranger(), p('integrations', 'gemini'))));
  });

  it('a TEACHER reads the API key, because a teacher scans the sheets', async () => {
    await assertSucceeds(getDoc(doc(teacher(), p('integrations', 'gemini'))));
  });

  it('ACCOUNTS and OFFICE cannot read the API key', async () => {
    // Neither of them ever enters a mark, so neither needs it.
    await assertFails(getDoc(doc(accounts(), p('integrations', 'gemini'))));
    await assertFails(getDoc(doc(office(), p('integrations', 'gemini'))));
  });

  it('only an ADMIN may set the API key', async () => {
    // serverTimestamp(), because stamped() wants updatedAt == request.time.
    await assertFails(
      setDoc(doc(teacher(), p('integrations', 'gemini')), {
        geminiApiKey: 'teacher-should-not', updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      setDoc(doc(admin(), p('integrations', 'gemini')), {
        geminiApiKey: 'admin-may', updatedAt: serverTimestamp(),
      }),
    );
  });

  // ---- student photographs -------------------------------------------
  //
  // A photo is a data URL inside a document, so the rules carry a size guard
  // as well as a role check: a document that grew past 1 MiB would refuse to
  // load at all, and the record would be unreachable rather than merely ugly.

  const photo = (bytes: number) =>
    'data:image/jpeg;base64,' + 'A'.repeat(bytes);

  it('the office may set a student photo', async () => {
    await assertSucceeds(
      setDoc(doc(office(), p('studentPhotos', '76')), {
        jpeg: photo(1000), bytes: 750, updatedBy: 'office@school.test', updatedAt: new Date(),
      }),
    );
  });

  it('a TEACHER may read a photo but not change one', async () => {
    await assertSucceeds(getDoc(doc(teacher(), p('studentPhotos', '76'))));
    await assertFails(
      setDoc(doc(teacher(), p('studentPhotos', '76')), {
        jpeg: photo(1000), updatedBy: 'teacher@school.test', updatedAt: new Date(),
      }),
    );
  });

  it("a parent reads their own child's photo and nobody else's", async () => {
    await assertSucceeds(getDoc(doc(parent(), p('studentPhotos', '76'))));
    await assertFails(getDoc(doc(parent(), p('studentPhotos', '77'))));
  });

  it('refuses a photo big enough to threaten the document limit', async () => {
    await assertFails(
      setDoc(doc(admin(), p('studentPhotos', '76')), {
        jpeg: photo(200_001), updatedBy: 'admin@school.test', updatedAt: new Date(),
      }),
    );
  });

  it('refuses something that is not a JPEG data URL', async () => {
    await assertFails(
      setDoc(doc(admin(), p('studentPhotos', '76')), {
        jpeg: 'https://example.test/photo.jpg',
        updatedBy: 'admin@school.test', updatedAt: new Date(),
      }),
    );
  });

  it('lets the office take a photo off again', async () => {
    await assertSucceeds(deleteDoc(doc(office(), p('studentPhotos', '76'))));
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

describe('receipts and counters (§5)', () => {
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

describe('the calendar and exam operations', () => {
  it('a TEACHER reads holidays — the monthly sheet cannot be drawn without them', async () => {
    await assertSucceeds(getDoc(doc(teacher(), p('holidays', '2026-12-16'))));
  });

  it('only ADMIN may add a holiday', async () => {
    await assertFails(
      setDoc(doc(teacher(), p('holidays', '2026-02-21')), {
        date: '2026-02-21', name: 'Language Day', updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      setDoc(doc(admin(), p('holidays', '2026-02-21')), {
        date: '2026-02-21', name: 'Language Day', updatedAt: serverTimestamp(),
      }),
    );
  });

  it('a holiday must be stamped', async () => {
    await assertFails(
      setDoc(doc(admin(), p('holidays', '2026-02-21')), {
        date: '2026-02-21', name: 'Language Day',
      }),
    );
  });

  // The one deletable record in the database. Delete is deliberately outside
  // stamped(), because a delete carries no request.resource to stamp.
  it('ADMIN may delete a holiday, and a TEACHER may not', async () => {
    await assertFails(deleteDoc(doc(teacher(), p('holidays', '2026-12-16'))));
    await assertSucceeds(deleteDoc(doc(admin(), p('holidays', '2026-12-16'))));
  });

  it('only ADMIN may set the routine, which lives on the exam', async () => {
    const routine = [{
      classId: '61', subjectId: 'BANGLA', subjectName: 'Bangla',
      date: '2026-12-01', startTime: '10:00', endTime: '13:00',
    }];
    await assertFails(
      setDoc(doc(teacher(), p('exams', 'HALF_YEARLY-2026')),
        { routine, updatedAt: serverTimestamp() }, { merge: true }),
    );
    await assertSucceeds(
      setDoc(doc(admin(), p('exams', 'HALF_YEARLY-2026')),
        { routine, updatedAt: serverTimestamp() }, { merge: true }),
    );
  });

  it('a TEACHER reads the rooms for the seat plan but cannot change them', async () => {
    await assertSucceeds(getDoc(doc(teacher(), p('settings', 'rooms'))));
    await assertFails(
      setDoc(doc(teacher(), p('settings', 'rooms')),
        { rooms: [], updatedAt: serverTimestamp() }, { merge: true }),
    );
  });
});
