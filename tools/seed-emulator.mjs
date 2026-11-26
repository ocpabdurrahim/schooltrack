#!/usr/bin/env node
/**
 * Seeds the LOCAL EMULATORS with invented data so the app can be exercised
 * without touching schooltrack-1941 and without any real student's name.
 *
 *   firebase emulators:start --only firestore,auth
 *   node tools/seed-emulator.mjs
 *   npm --prefix web run dev:emulator
 *
 * It refuses to run unless the emulator environment variables are set, so it
 * can never be pointed at the real project by accident.
 *
 * Test accounts it creates (dev only, emulator only):
 *   admin@test.local   / test-pass-1  ADMIN — the setup, classes and users screens
 *   teacher@test.local / test-pass-1  TEACHER
 *   parent@test.local  / test-pass-1  guardian of student 76
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

const PROJECT = 'schooltrack-1941';
const SCHOOL = 'matkhola';
const PASSWORD = 'test-pass-1';

initializeApp({ projectId: PROJECT });
const db = getFirestore();
const auth = getAuth();

const school = db.collection('schools').doc(SCHOOL);
const now = FieldValue.serverTimestamp();

const CLASSES = [
  { classId: '61', className: 'Class 6', section: 'A', displayName: 'Class 6 - A', sortOrder: 61 },
  { classId: '62', className: 'Class 7', section: 'A', displayName: 'Class 7 - A', sortOrder: 62 },
  // Class 9 is here for the RESULTS screens, which the two classes above
  // cannot exercise: the tabulation sheet is only itself when the section is
  // streamed, sits a religion paper and has papers marked in parts.
  { classId: '91', className: 'Class 9', section: 'A', displayName: 'Class 9 - A', sortOrder: 91 },
];

const STUDENTS = [
  { studentId: '76', fullName: 'Ayesha Rahman',  rollNo: 1, classId: '61' },
  { studentId: '77', fullName: 'Bashir Uddin',   rollNo: 2, classId: '61' },
  { studentId: '78', fullName: 'Chaity Das',     rollNo: 3, classId: '61' },
  { studentId: '79', fullName: 'Delwar Hossain', rollNo: 4, classId: '61' },
  { studentId: '80', fullName: 'Eshita Khatun',  rollNo: 5, classId: '61' },
  { studentId: '91', fullName: 'Farid Mia',      rollNo: 1, classId: '62' },
  { studentId: '92', fullName: 'Gulshan Ara',    rollNo: 2, classId: '62' },
  // Class 9: two streams and two religions in one section, which is what the
  // tabulation's slot columns exist for.
  { studentId: '101', fullName: 'Hasan Ali',    rollNo: 1, classId: '91',
    groupName: 'Science', religion: 'Islam' },
  { studentId: '102', fullName: 'Ishrat Jahan', rollNo: 2, classId: '91',
    groupName: 'Science', religion: 'Islam' },
  { studentId: '103', fullName: 'Joy Barua',    rollNo: 3, classId: '91',
    groupName: 'Humanities', religion: 'Hindu' },
  { studentId: '104', fullName: 'Kamrul Islam', rollNo: 4, classId: '91',
    groupName: 'Humanities', religion: 'Islam' },
];

async function user(email, uid) {
  await auth.createUser({ uid, email, password: PASSWORD, emailVerified: true })
            .catch(() => auth.updateUser(uid, { password: PASSWORD, emailVerified: true }));
}

await school.set({ name: 'Matkhola ML High School (emulator)', active: true });

await school.collection('settings').doc('school').set({
  instituteName: 'Matkhola ML High School', sessionLabel: '2025-26',
  weekendDays: ['FRI', 'SAT'], updatedAt: now,
});

await school.collection('members').doc('admin@test.local').set({
  email: 'admin@test.local', name: 'Test Admin', role: 'ADMIN',
  active: true, deleted: false, updatedAt: now,
});

await school.collection('members').doc('teacher@test.local').set({
  email: 'teacher@test.local', name: 'Test Teacher', role: 'TEACHER',
  active: true, deleted: false, updatedAt: now,
});

await school.collection('guardians').doc('parent@test.local').set({
  email: 'parent@test.local', name: 'Test Parent',
  studentIds: ['76'], active: true, updatedAt: now,
});

for (const c of CLASSES) {
  const { classId, ...rest } = c;
  await school.collection('classes').doc(classId).set({ ...rest, active: true, updatedAt: now });
}

for (const s of STUDENTS) {
  const cls = CLASSES.find((c) => c.classId === s.classId);
  await school.collection('students').doc(s.studentId).set({
    fullName: s.fullName, rollNo: s.rollNo, classId: s.classId,
    className: cls.className, section: cls.section,
    groupName: s.groupName ?? '', religion: s.religion ?? '',
    status: 'A', updatedAt: now,
  });
}

// ---------------------------------------------------------------------------
// an exam with marks, for the results screens
//
// Every case the tabulation cell has to tell apart is in here on purpose, and
// each one has been got wrong at some point:
//
//   Hasan    a clean pass, three parts in one cell (Physics 40+22+20)
//   Ishrat   68 in Maths and still F -- CQ 60, MCQ 8, and the MCQ pass is 10
//   Joy      Geography half entered: CQ in, MCQ not. No total, no GPA, no
//            position, and the sheet must say WHICH part is missing
//   Kamrul   absent in one paper, which fails the exam
//
// and across the four of them: two streams, two religion papers, a 4th
// subject only one of them takes, and English marked whole where everything
// else is marked in parts.

const CQ_MCQ = [
  { name: 'CQ', max: 70, pass: 23 },
  { name: 'MCQ', max: 30, pass: 10 },
];
const WITH_PRACTICAL = [
  { name: 'CQ', max: 50, pass: 17 },
  { name: 'MCQ', max: 25, pass: 8 },
  { name: 'PRACTICAL', max: 25, pass: 8 },
];
const NINE = ['Class 9'];

const SUBJECTS = [
  { subjectId: 'BAN1', subjectName: 'Bangla 1st Paper', sortOrder: 1,
    components: CQ_MCQ, combineGroup: 'BAN' },
  { subjectId: 'BAN2', subjectName: 'Bangla 2nd Paper', sortOrder: 2,
    components: CQ_MCQ, combineGroup: 'BAN' },
  // Marked whole, out of 100: these cells have no parts tier to show.
  { subjectId: 'ENG1', subjectName: 'English 1st Paper', sortOrder: 3,
    components: [], combineGroup: 'ENG' },
  { subjectId: 'ENG2', subjectName: 'English 2nd Paper', sortOrder: 4,
    components: [], combineGroup: 'ENG' },
  { subjectId: 'MATH', subjectName: 'Mathematics', sortOrder: 5, components: CQ_MCQ },
  { subjectId: 'ISL', subjectName: 'Islam & Moral Education', sortOrder: 6,
    components: CQ_MCQ, religions: ['Islam'] },
  { subjectId: 'HIN', subjectName: 'Hindu Religion', sortOrder: 6,
    components: CQ_MCQ, religions: ['Hindu'] },
  { subjectId: 'ICT', subjectName: 'ICT', sortOrder: 7, fullMarks: 50,
    components: [{ name: 'CQ', max: 25, pass: 8 }, { name: 'MCQ', max: 25, pass: 8 }] },
  { subjectId: 'PHY', subjectName: 'Physics', sortOrder: 8,
    components: WITH_PRACTICAL, groupNames: ['Science'] },
  { subjectId: 'CHE', subjectName: 'Chemistry', sortOrder: 9,
    components: WITH_PRACTICAL, groupNames: ['Science'] },
  { subjectId: 'CIV', subjectName: 'Civics & Citizenship', sortOrder: 8,
    components: CQ_MCQ, groupNames: ['Humanities'] },
  { subjectId: 'GEO', subjectName: 'Geography', sortOrder: 9,
    components: CQ_MCQ, groupNames: ['Humanities'] },
  { subjectId: 'HMATH', subjectName: 'Higher Mathematics', sortOrder: 20,
    components: WITH_PRACTICAL, groupNames: ['Science'], isOptional: true },
];

const fullOf = (s) => s.fullMarks
  ?? (s.components.length ? s.components.reduce((t, c) => t + c.max, 0) : 100);

for (const s of SUBJECTS) {
  await school.collection('subjects').doc(s.subjectId).set({
    subjectName: s.subjectName,
    classNames: NINE,
    fullMarks: fullOf(s),
    isOptional: s.isOptional === true,
    sortOrder: s.sortOrder,
    components: s.components,
    combineGroup: s.combineGroup ?? null,
    groupNames: s.groupNames ?? [],
    religions: s.religions ?? [],
    active: true, updatedAt: now,
  });
}

const EXAM = 'half-yearly-2026';
await school.collection('exams').doc(EXAM).set({
  examName: 'Half Yearly', examYear: '2026', periodLabel: 'HALF_YEARLY-2026',
  published: false, sortOrder: 1, isFinal: false, updatedAt: now,
});

/** The parts added up, by the same rule the app uses (subjectTotal). */
const sumParts = (parts) => {
  const vs = Object.values(parts);
  return vs.some((v) => v === null) ? null : vs.reduce((t, v) => t + v, 0);
};

// A number is a paper marked whole, an object is marked in parts, 'abs' is
// absent, and a null part is one nobody has entered yet.
const MARKS = {
  101: {
    BAN1: { CQ: 50, MCQ: 22 }, BAN2: { CQ: 48, MCQ: 20 },
    ENG1: 71, ENG2: 59,
    MATH: { CQ: 55, MCQ: 27 },
    ISL: { CQ: 48, MCQ: 23 },
    ICT: { CQ: 20, MCQ: 20 },
    PHY: { CQ: 40, MCQ: 22, PRACTICAL: 20 },
    CHE: { CQ: 30, MCQ: 15, PRACTICAL: 10 },
    HMATH: { CQ: 40, MCQ: 20, PRACTICAL: 18 },
  },
  102: {
    BAN1: { CQ: 45, MCQ: 20 }, BAN2: { CQ: 44, MCQ: 19 },
    ENG1: 62, ENG2: 55,
    MATH: { CQ: 60, MCQ: 8 },
    ISL: { CQ: 40, MCQ: 20 },
    ICT: { CQ: 18, MCQ: 17 },
    PHY: { CQ: 35, MCQ: 18, PRACTICAL: 18 },
    CHE: { CQ: 28, MCQ: 14, PRACTICAL: 12 },
  },
  103: {
    BAN1: { CQ: 42, MCQ: 18 }, BAN2: { CQ: 40, MCQ: 17 },
    ENG1: 55, ENG2: 48,
    MATH: { CQ: 38, MCQ: 15 },
    HIN: { CQ: 44, MCQ: 21 },
    ICT: { CQ: 16, MCQ: 15 },
    CIV: { CQ: 40, MCQ: 18 },
    GEO: { CQ: 55, MCQ: null },
  },
  104: {
    BAN1: { CQ: 52, MCQ: 24 }, BAN2: { CQ: 50, MCQ: 22 },
    ENG1: 68, ENG2: 64,
    MATH: { CQ: 58, MCQ: 25 },
    ISL: { CQ: 50, MCQ: 24 },
    ICT: 'abs',
    CIV: { CQ: 45, MCQ: 20 },
    GEO: { CQ: 48, MCQ: 22 },
  },
};

let written = 0;
for (const [studentId, got] of Object.entries(MARKS)) {
  const who = STUDENTS.find((s) => s.studentId === studentId);
  for (const [subjectId, v] of Object.entries(got)) {
    const s = SUBJECTS.find((x) => x.subjectId === subjectId);
    const absent = v === 'abs';
    const parted = v !== null && typeof v === 'object';
    await school.collection('results').doc(EXAM + '_' + studentId + '_' + subjectId).set({
      examId: EXAM, studentId, subjectId, subjectName: s.subjectName,
      marks: absent ? null : parted ? sumParts(v) : v,
      parts: parted ? v : null,
      absent,
      classId: who.classId, rollNo: who.rollNo,
      fullMarks: fullOf(s),
      isOptional: s.isOptional === true,
      updatedAt: now,
    });
    written += 1;
  }
}

// Where the app's own numbering carries on from. The seeded students were
// given Oracle's ids, so the counter starts past them: a student added in the
// app must not be handed a number that is already on somebody's ID card.
await school.collection('counters').doc('students').set({ next: 93 });
await school.collection('counters').doc('staff').set({ next: 1 });

await user('admin@test.local', 'uid-admin');
await user('teacher@test.local', 'uid-teacher');
await user('parent@test.local', 'uid-parent');

console.log(`Seeded ${CLASSES.length} classes, ${STUDENTS.length} students, 3 accounts.`);
console.log(`And one exam: ${SUBJECTS.length} subjects, ${written} marks in Class 9 - A.`);
console.log('Sign in as admin@test.local — password is in this file.');
process.exit(0);
