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
  // Class 9: the streams and religions of one real section, which is what the
  // tabulation's slot columns exist for. A long name among them on purpose --
  // the Name column is what pushes a printed sheet off the edge of the page.
  { studentId: '101', fullName: 'Hasan Ali',    rollNo: 1, classId: '91',
    groupName: 'Science', religion: 'Islam' },
  { studentId: '102', fullName: 'Ishrat Jahan', rollNo: 2, classId: '91',
    groupName: 'Science', religion: 'Islam' },
  { studentId: '103', fullName: 'Joy Barua',    rollNo: 3, classId: '91',
    groupName: 'Humanities', religion: 'Hindu' },
  { studentId: '104', fullName: 'Mohammad Kamrul Islam Chowdhury', rollNo: 4,
    classId: '91', groupName: 'Humanities', religion: 'Islam' },
  // Four more, built to land on each rung of the merit chain in turn.
  { studentId: '105', fullName: 'Nadia Akter',     rollNo: 5, classId: '91',
    groupName: 'Science', religion: 'Islam' },
  { studentId: '106', fullName: 'Omar Faruk',      rollNo: 6, classId: '91',
    groupName: 'Science', religion: 'Islam' },
  { studentId: '107', fullName: 'Parvin Sultana',  rollNo: 7, classId: '91',
    groupName: 'Science', religion: 'Islam' },
  { studentId: '108', fullName: 'Rakib Hasan',     rollNo: 8, classId: '91',
    groupName: 'Humanities', religion: 'Islam' },
  // One student with NO group, as the live school has: excluded by nothing,
  // so they count as sitting every group paper there is. The sheet must not
  // let them set its width -- see tabsheet.ts.
  { studentId: '109', fullName: 'Shahin Alam',     rollNo: 9, classId: '91',
    groupName: '', religion: 'Islam' },
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
const WRITTEN = [{ name: 'WRITTEN', max: 100, pass: 0 }];
const NINE = ['Class 9'];

// The real school's Class 9, paper for paper, because the SHAPE of the sheet
// is what has to be got right: four papers everybody sits, one religion slot,
// four group slots (the widest stream needs four) and one 4th subject. Ten
// subject columns, seventeen in all, which is what a landscape page has to
// hold without cropping one off the right edge.
const SUBJECTS = [
  { subjectId: 'BAN1', subjectName: 'BANGLA 1ST PAPER', sortOrder: 1,
    components: CQ_MCQ, combineGroup: 'BAN' },
  { subjectId: 'BAN2', subjectName: 'BANGLA 2ND PAPER', sortOrder: 2,
    components: CQ_MCQ, combineGroup: 'BAN' },
  { subjectId: 'ENG1', subjectName: 'ENGLISH 1ST PAPER', sortOrder: 3,
    components: WRITTEN, combineGroup: 'ENG' },
  { subjectId: 'ENG2', subjectName: 'ENGLISH 2ND PAPER', sortOrder: 4,
    components: WRITTEN, combineGroup: 'ENG' },
  { subjectId: 'MATH', subjectName: 'MATHEMATICS', sortOrder: 5, components: CQ_MCQ },
  { subjectId: 'ISL', subjectName: 'ISLAM AND MORALITY EDUCATION', sortOrder: 6,
    components: CQ_MCQ, religions: ['Islam'] },
  { subjectId: 'HIN', subjectName: 'HINDU AND MORALITY EDUCATION', sortOrder: 6,
    components: CQ_MCQ, religions: ['Hindu'] },
  { subjectId: 'ICT', subjectName: 'ICT', sortOrder: 7, fullMarks: 50,
    components: [{ name: 'CQ', max: 25, pass: 8 }, { name: 'MCQ', max: 25, pass: 8 }],
    combineGroup: 'ICT' },

  // Science
  { subjectId: 'BGS', subjectName: 'BANGLADESH AND GLOBAL STUDIES', sortOrder: 8,
    components: CQ_MCQ, groupNames: ['Science'] },
  { subjectId: 'PHY', subjectName: 'PHYSICS', sortOrder: 9,
    components: WITH_PRACTICAL, groupNames: ['Science'] },
  { subjectId: 'CHE', subjectName: 'CHEMISTRY', sortOrder: 10,
    components: WITH_PRACTICAL, groupNames: ['Science'] },
  { subjectId: 'BIO', subjectName: 'BIOLOGY', sortOrder: 11,
    components: WITH_PRACTICAL, groupNames: ['Science'] },

  // Humanities and Business Studies
  { subjectId: 'SCI', subjectName: 'SCIENCE', sortOrder: 8,
    components: CQ_MCQ, groupNames: ['Humanities', 'Business Studies'] },
  { subjectId: 'CIV', subjectName: 'CIVICS AND CITIZENSHIP', sortOrder: 9,
    components: CQ_MCQ, groupNames: ['Humanities'] },
  { subjectId: 'HIST', subjectName: 'HISTORY OF BANGLADESH AND WORLD CIVILIZATION',
    sortOrder: 10, components: CQ_MCQ, groupNames: ['Humanities'] },
  { subjectId: 'GEO', subjectName: 'GEOGRAPHY', sortOrder: 11,
    components: CQ_MCQ, groupNames: ['Humanities'] },
  { subjectId: 'ACC', subjectName: 'ACCOUNTING', sortOrder: 9,
    components: CQ_MCQ, groupNames: ['Business Studies'] },
  { subjectId: 'FIN', subjectName: 'FINANCE AND BANKING', sortOrder: 10,
    components: CQ_MCQ, groupNames: ['Business Studies'] },
  { subjectId: 'BUS', subjectName: 'BUSINESS ENTREPRENEURSHIP', sortOrder: 11,
    components: CQ_MCQ, groupNames: ['Business Studies'] },

  // the 4th subjects
  { subjectId: 'HMATH', subjectName: 'HIGHER MATHS', sortOrder: 20,
    components: WITH_PRACTICAL, groupNames: ['Science'], isOptional: true },
  { subjectId: 'AGRI', subjectName: 'AGRICULTURE', sortOrder: 20,
    components: WITH_PRACTICAL, groupNames: ['Humanities', 'Business Studies'],
    isOptional: true },
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
    ENG1: { WRITTEN: 71 }, ENG2: { WRITTEN: 59 },
    MATH: { CQ: 55, MCQ: 27 },
    ISL: { CQ: 48, MCQ: 23 },
    ICT: { CQ: 20, MCQ: 20 },
    BGS: { CQ: 44, MCQ: 22 },
    PHY: { CQ: 40, MCQ: 22, PRACTICAL: 20 },
    CHE: { CQ: 30, MCQ: 15, PRACTICAL: 10 },
    BIO: { CQ: 38, MCQ: 20, PRACTICAL: 14 },
    HMATH: { CQ: 40, MCQ: 20, PRACTICAL: 18 },
  },
  102: {
    BAN1: { CQ: 45, MCQ: 20 }, BAN2: { CQ: 44, MCQ: 19 },
    ENG1: { WRITTEN: 62 },   // 2nd paper not marked yet, as in the live school
    MATH: { CQ: 60, MCQ: 8 },
    ISL: { CQ: 40, MCQ: 20 },
    ICT: { CQ: 18, MCQ: 17 },
    BGS: { CQ: 38, MCQ: 19 },
    PHY: { CQ: 35, MCQ: 18, PRACTICAL: 18 },
    CHE: { CQ: 28, MCQ: 14, PRACTICAL: 12 },
    BIO: { CQ: 30, MCQ: 16, PRACTICAL: 15 },
  },
  103: {
    BAN1: { CQ: 42, MCQ: 18 }, BAN2: { CQ: 40, MCQ: 17 },
    ENG1: { WRITTEN: 55 },
    MATH: { CQ: 38, MCQ: 15 },
    HIN: { CQ: 44, MCQ: 21 },
    ICT: { CQ: 16, MCQ: 15 },
    SCI: { CQ: 41, MCQ: 19 },
    CIV: { CQ: 40, MCQ: 18 },
    HIST: { CQ: 37, MCQ: 16 },
    GEO: { CQ: 55, MCQ: null },
  },
  104: {
    BAN1: { CQ: 52, MCQ: 24 }, BAN2: { CQ: 50, MCQ: 22 },
    ENG1: { WRITTEN: 68 },
    MATH: { CQ: 58, MCQ: 25 },
    ISL: { CQ: 50, MCQ: 24 },
    ICT: 'abs',
    SCI: { CQ: 46, MCQ: 21 },
    CIV: { CQ: 45, MCQ: 20 },
    HIST: { CQ: 43, MCQ: 19 },
    GEO: { CQ: 48, MCQ: 22 },
    AGRI: { CQ: 36, MCQ: 18, PRACTICAL: 16 },
  },
};

// --- the merit chain, one rung at a time -----------------------------------
//
// 105, 106 and 107 sit the same papers and differ in one place each, so the
// list they come out in is the rule itself and nothing else:
//
//   107  3.72, total 703          ahead on TOTAL MARKS
//   106  3.72, total 696, Ban 72  level on total, ahead on BANGLA 1ST PAPER
//   105  3.72, total 696, Ban 68  level to the last rung, behind on the roll
//
// and 108 against 102, who are both failures:
//
//   102  one subject failed,  total 651   AHEAD, on fewer failures
//   108  two subjects failed, total 709   behind, 58 marks and all
//
// which is the school's rule and the one worth having a test and a sheet for.

const NADIA = {
  BAN1: { CQ: 48, MCQ: 20 }, BAN2: { CQ: 50, MCQ: 22 },   // 68 + 72 = 140
  ENG1: { WRITTEN: 60 },
  MATH: { CQ: 50, MCQ: 22 },
  ISL: { CQ: 45, MCQ: 20 },
  ICT: { CQ: 18, MCQ: 17 },
  BGS: { CQ: 42, MCQ: 20 },
  PHY: { CQ: 35, MCQ: 18, PRACTICAL: 18 },
  CHE: { CQ: 33, MCQ: 17, PRACTICAL: 16 },
  BIO: { CQ: 32, MCQ: 17, PRACTICAL: 16 },
};

MARKS[105] = NADIA;
// The same 140 in Bangla, the other way round: same GPA, same total, and
// ahead of Nadia on the first paper alone.
MARKS[106] = { ...NADIA, BAN1: { CQ: 50, MCQ: 22 }, BAN2: { CQ: 48, MCQ: 20 } };
// Seven more marks in Maths, which is the same grade and so the same GPA.
MARKS[107] = { ...NADIA, MATH: { CQ: 55, MCQ: 24 } };
// The better exam of the two failures, and second of them all the same.
MARKS[108] = {
  BAN1: { CQ: 50, MCQ: 22 }, BAN2: { CQ: 50, MCQ: 22 },
  ENG1: { WRITTEN: 70 }, ENG2: { WRITTEN: 70 },
  MATH: { CQ: 60, MCQ: 8 },     // 68, and F: the MCQ pass is 10
  ISL: { CQ: 50, MCQ: 24 },
  ICT: { CQ: 20, MCQ: 6 },      // 26, and F: the MCQ pass is 8
  SCI: { CQ: 45, MCQ: 20 },
  CIV: { CQ: 44, MCQ: 20 },
  HIST: { CQ: 42, MCQ: 19 },
  GEO: { CQ: 46, MCQ: 21 },
};

// --- enough students to fill more than one printed page -------------------
//
// A tabulation of eight students fits a page and so can never show what goes
// wrong on the second one. The live section has eighty-three. These forty
// are invented, marked by a formula, and exist so that the PRINTED sheet can
// be looked at over a page break -- which is where a two-tier row can be
// torn in half, and where a heading row that does not repeat leaves the
// second page a field of unlabelled numbers.
const FILLER_NAMES = [
  'Abdul Karim', 'Bilkis Begum', 'Chandan Roy', 'Dalia Parvin', 'Emdad Hossain',
  'Farzana Yasmin', 'Golam Mostafa', 'Habiba Khatun', 'Imran Sheikh', 'Jesmin Ara',
];

for (let i = 0; i < 40; i += 1) {
  const roll = 10 + i;
  const id = String(200 + i);
  const science = i % 2 === 0;
  STUDENTS.push({
    studentId: id,
    fullName: `${FILLER_NAMES[i % FILLER_NAMES.length]} ${Math.floor(i / 10) + 1}`,
    rollNo: roll,
    classId: '91',
    groupName: science ? 'Science' : 'Humanities',
    religion: i % 7 === 0 ? 'Hindu' : 'Islam',
  });

  // Spread the marks about so the sheet is not forty identical rows.
  const n = (lo, hi) => lo + ((i * 7) % (hi - lo + 1));
  const cqMcq = { CQ: n(30, 60), MCQ: n(12, 28) };
  const prac = { CQ: n(22, 45), MCQ: n(9, 23), PRACTICAL: n(10, 24) };
  const common = {
    BAN1: cqMcq, BAN2: { CQ: n(28, 58), MCQ: n(11, 27) },
    ENG1: { WRITTEN: n(35, 85) },
    MATH: cqMcq,
    ICT: { CQ: n(10, 24), MCQ: n(9, 23) },
  };
  const religion = i % 7 === 0 ? { HIN: cqMcq } : { ISL: cqMcq };
  const stream = science
    ? { BGS: cqMcq, PHY: prac, CHE: prac, BIO: prac }
    : { SCI: cqMcq, CIV: cqMcq, HIST: cqMcq, GEO: cqMcq };
  MARKS[id] = { ...common, ...religion, ...stream };

  const cls = CLASSES.find((c) => c.classId === '91');
  await school.collection('students').doc(id).set({
    fullName: STUDENTS[STUDENTS.length - 1].fullName,
    rollNo: roll, classId: '91',
    className: cls.className, section: cls.section,
    groupName: STUDENTS[STUDENTS.length - 1].groupName,
    religion: STUDENTS[STUDENTS.length - 1].religion,
    status: 'A', updatedAt: now,
  });
}

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
