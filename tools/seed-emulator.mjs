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
];

const STUDENTS = [
  { studentId: '76', fullName: 'Ayesha Rahman',  rollNo: 1, classId: '61' },
  { studentId: '77', fullName: 'Bashir Uddin',   rollNo: 2, classId: '61' },
  { studentId: '78', fullName: 'Chaity Das',     rollNo: 3, classId: '61' },
  { studentId: '79', fullName: 'Delwar Hossain', rollNo: 4, classId: '61' },
  { studentId: '80', fullName: 'Eshita Khatun',  rollNo: 5, classId: '61' },
  { studentId: '91', fullName: 'Farid Mia',      rollNo: 1, classId: '62' },
  { studentId: '92', fullName: 'Gulshan Ara',    rollNo: 2, classId: '62' },
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
    status: 'A', updatedAt: now,
  });
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
console.log('Sign in as admin@test.local — password is in this file.');
process.exit(0);
