#!/usr/bin/env node
/**
 * SchoolTrack — first run.
 *
 *   node bootstrap.mjs --admin you@example.com                 # dry run
 *   node bootstrap.mjs --admin you@example.com --commit
 *   node bootstrap.mjs --admin you@example.com --name "Matkhola ML High School" --commit
 *
 * A brand-new Firebase project is empty, and the security rules are built so
 * that access comes only from a members/{email} document — which only an
 * administrator may write. That is a deliberate deadlock: nobody can grant
 * themselves access through the app. This script breaks it exactly once,
 * through the Admin SDK, which bypasses rules.
 *
 * It writes three things:
 *
 *   schools/{school}                 the school document (name, timezone)
 *   schools/{school}/settings/school the name and session the app shows
 *   schools/{school}/members/{email} the first ADMIN
 *
 * It does NOT create the Firebase Auth account or set a password. The person
 * signs up themselves in the app, with their own password, and confirms their
 * email address; this script only grants access to that address. If the
 * account already exists but the address was never confirmed, --verify marks
 * it confirmed, because the rules require a verified address and there is no
 * other way to repair that from outside the console.
 *
 * Credentials: gcloud application-default login, or tools/serviceAccount.json
 * (gitignored — this repository is public).
 */
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = 'schooltrack-1941';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const COMMIT = args.includes('--commit');
const VERIFY = args.includes('--verify');
const SCHOOL_ID = flag('school', 'matkhola');
const ADMIN = (flag('admin') ?? '').trim().toLowerCase();
const NAME = flag('name', 'My School');

if (!ADMIN || !ADMIN.includes('@')) {
  console.error('Give the first administrator: --admin you@example.com');
  process.exit(1);
}

const keyFile = join(HERE, 'serviceAccount.json');
const hasKey = existsSync(keyFile);

initializeApp({
  credential: hasKey ? cert(JSON.parse(readFileSync(keyFile, 'utf8'))) : applicationDefault(),
  projectId: PROJECT_ID,
});

const db = getFirestore();
const auth = getAuth();
const school = db.collection('schools').doc(SCHOOL_ID);

const plan = [
  [`schools/${SCHOOL_ID}`, { name: NAME, timezone: 'Asia/Dhaka' }],
  [`schools/${SCHOOL_ID}/settings/school`, {
    instituteName: NAME,
    weekendDays: ['FRI', 'SAT'],
  }],
  [`schools/${SCHOOL_ID}/members/${ADMIN}`, {
    email: ADMIN, name: ADMIN.split('@')[0], role: 'ADMIN', active: true, deleted: false,
  }],
];

console.log(COMMIT ? `WRITING to ${PROJECT_ID}\n` : 'DRY RUN — nothing will be written\n');
for (const [path, body] of plan) {
  console.log(path.padEnd(46), JSON.stringify(body));
}

// Does the account exist yet, and is its address confirmed?
let user = null;
try {
  user = await auth.getUserByEmail(ADMIN);
} catch {
  user = null;
}

console.log('');
if (!user) {
  console.log(`No Firebase account for ${ADMIN} yet.`);
  console.log('Create it yourself in the app ("Create an account" on the sign-in page),');
  console.log('confirm the email, then sign in. This script can run before or after that.');
} else if (!user.emailVerified) {
  console.log(`Account exists but the address is NOT confirmed.`);
  console.log(VERIFY
    ? '--verify given: it will be marked confirmed.'
    : 'The rules require a confirmed address. Use the link in the confirmation email,'
      + '\nor re-run with --verify to mark it confirmed here.');
} else {
  console.log(`Account exists and the address is confirmed.`);
}

if (!COMMIT) {
  console.log('\nRe-run with --commit when the plan above looks right.');
  process.exit(0);
}

const batch = db.batch();
batch.set(school, { ...plan[0][1], updatedAt: FieldValue.serverTimestamp() }, { merge: true });
batch.set(school.collection('settings').doc('school'),
  { ...plan[1][1], updatedAt: FieldValue.serverTimestamp() }, { merge: true });
batch.set(school.collection('members').doc(ADMIN),
  { ...plan[2][1], updatedAt: FieldValue.serverTimestamp() }, { merge: true });
await batch.commit();

if (user && !user.emailVerified && VERIFY) {
  await auth.updateUser(user.uid, { emailVerified: true });
  console.log('Marked the address confirmed.');
}

console.log('\nDone. Sign in to the app as', ADMIN);
console.log('Then: Setup → check the name, Classes → add a section, Students → add a student.');
