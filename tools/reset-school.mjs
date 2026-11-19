/**
 * Empty the school and start again.
 *
 *   node reset-school.mjs                     what WOULD go. Deletes nothing.
 *   node reset-school.mjs --wipe              empties the school, after a backup
 *   node reset-school.mjs --wipe --records    keeps classes, subjects, fees, staff
 *   node reset-school.mjs --restore=data/backup-....json    puts it all back
 *
 * WHY THIS IS A SCRIPT AND NOT A BUTTON IN THE APP.
 *
 * The security rules refuse deletes almost everywhere, and not by oversight:
 * every `allow write: ... && stamped()` turns one away because a delete
 * carries no request.resource, and `payments` says outright
 *
 *     allow update, delete: if false;
 *     // A receipt is never edited or deleted. Money that was taken wrongly
 *     // is corrected with another document, the way the paper ledger does it.
 *
 * An in-app reset would mean opening delete on every collection for ever, so
 * that an append-only ledger stopped being append-only, in exchange for an
 * operation a school performs about once. This runs with the service account
 * instead, which bypasses the rules by design, from one computer, by hand.
 * Nothing on a phone or in a browser can reach it.
 *
 * EVERY RUN BACKS UP FIRST. A reset without an undo is one slip away from 78
 * children's records being gone, so the backup is not a flag: the wipe does
 * not start until the file is written and read back.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createInterface } from 'node:readline/promises';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { stdin, stdout } from 'node:process';
import { planFor, confirms, readArgs } from './reset-plan.mjs';
import { toJson, fromJson } from './reset-values.mjs';

const SCHOOL = 'matkhola';
/** Firestore takes 500 writes to a batch; a little under keeps room to spare. */
const PER_BATCH = 450;

const args = readArgs(process.argv);

if (args.help) {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0]);
  process.exit(0);
}
if (args.unknown.length) {
  console.error(`Not a flag this script knows: ${args.unknown.join(' ')}`);
  console.error('Try --wipe, --records, --restore=<file>, or nothing at all for a dry run.');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// which database

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
let projectId;
if (emulator) {
  projectId = process.env.GCLOUD_PROJECT || 'schooltrack-1941';
  initializeApp({ projectId });
} else {
  const key = JSON.parse(readFileSync(new URL('./serviceAccount.json', import.meta.url), 'utf8'));
  projectId = key.project_id;
  initializeApp({ credential: cert(key) });
}
const db = getFirestore();
const school = db.doc(`schools/${SCHOOL}`);

// Said loudly and said first. The one truly unrecoverable mistake here is
// running this against the live project while believing it is the emulator.
const where = emulator ? `EMULATOR at ${emulator}` : 'THE LIVE DATABASE';
console.log('');
console.log(`  project   ${projectId}`);
console.log(`  school    schools/${SCHOOL}`);
console.log(`  target    ${where}`);
console.log('');

// ---------------------------------------------------------------------------
// restore

if (args.restore !== null) {
  if (!args.restore) {
    console.error('Which file? --restore=tools/data/backup-....json');
    process.exit(2);
  }
  await restore(args.restore);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// the plan

const collections = await school.listCollections();
const counts = new Map();
for (const c of collections) counts.set(c.id, (await c.count().get()).data().count);

const plan = planFor([...counts.keys()], args.mode);
const schoolDoc = await school.get();
// settings/school.instituteName is where the school's name actually lives
// (web/src/data/admin.ts). The document on the school itself carries only a
// short label, so it is the fallback and not the first choice.
const schoolName =
  (await school.collection('settings').doc('school').get()).data()?.instituteName
  || schoolDoc.data()?.name
  || SCHOOL;

const wide = Math.max(...[...counts.keys()].map((n) => n.length), 10);
const line = (name, verb) => `  ${verb}  ${name.padEnd(wide)}  ${String(counts.get(name)).padStart(6)}`;

console.log(args.mode === 'records'
  ? '  Clearing the records, keeping the school\'s shape:'
  : '  Clearing everything the school holds:');
console.log('');
for (const name of plan.clear) console.log(line(name, 'CLEAR'));
console.log('');
console.log('  Kept:');
for (const name of plan.keep) console.log(line(name, ' keep'));
if (plan.missing.length) console.log(`\n  (not in this school at all: ${plan.missing.join(', ')})`);

const going = plan.clear.reduce((n, name) => n + counts.get(name), 0);
console.log('');
console.log(`  ${going} document(s) would be deleted.`);
if (plan.clear.includes('counters')) {
  console.log('  Student, staff and receipt numbering starts again at 1.');
}

if (!args.wipe) {
  console.log('');
  console.log('  Nothing was deleted. Add --wipe to do it for real.');
  process.exit(0);
}
if (going === 0) {
  console.log('\n  There is nothing to delete.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// the backup, before anything is touched

mkdirSync(new URL('./data/', import.meta.url), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupPath = new URL(`./data/backup-${SCHOOL}-${stamp}.json`, import.meta.url);

console.log('');
process.stdout.write('  Backing up… ');
const backup = { school: SCHOOL, projectId, takenAt: new Date().toISOString(), collections: {} };
// EVERY collection, not only the ones going. A backup that restores a school
// to a state it was never in is not a backup.
for (const c of collections) {
  const snap = await c.get();
  // toJson, not the raw data: JSON has no timestamp, and a restore that puts
  // a map where every record keeps its "last changed" is a backup that looks
  // like it worked. See reset-values.mjs.
  backup.collections[c.id] = snap.docs.map((d) => ({ id: d.id, data: toJson(d.data(), `${c.id}/${d.id}`) }));
}
backup.schoolDoc = schoolDoc.exists ? toJson(schoolDoc.data(), 'schoolDoc') : null;
writeFileSync(backupPath, JSON.stringify(backup, null, 2));

// Read back before deleting. A file that did not write is the one thing that
// would turn a mistake into a loss, and it costs nothing to check.
const readBack = JSON.parse(readFileSync(backupPath, 'utf8'));
const saved = Object.values(readBack.collections).reduce((n, rows) => n + rows.length, 0);
const total = [...counts.values()].reduce((a, b) => a + b, 0);
if (saved !== total) {
  console.error(`\n  The backup holds ${saved} of ${total} documents. Nothing was deleted.`);
  process.exit(1);
}
console.log(`${saved} document(s) → ${backupPath.pathname.split('/').pop()}`
  + ` (${(statSync(backupPath).size / 1024).toFixed(0)} KB)`);

// ---------------------------------------------------------------------------
// the confirmation

console.log('');
console.log(`  This cannot be undone except from that file.`);
if (!emulator) console.log('  THIS IS THE LIVE SCHOOL.');
console.log('');

const rl = createInterface({ input: stdin, output: stdout });
const typed = await rl.question(`  Type the school's name to go ahead  (${schoolName})\n  > `);
rl.close();

if (!confirms(typed, schoolName)) {
  console.log('\n  That is not the name. Nothing was deleted.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// the deleting

console.log('');
let done = 0;
for (const name of plan.clear) {
  const col = school.collection(name);
  let gone = 0;
  for (;;) {
    const snap = await col.limit(PER_BATCH).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    gone += snap.size;
  }
  done += gone;
  console.log(`  cleared  ${name.padEnd(wide)}  ${String(gone).padStart(6)}`);
}

// Said after the fact, from the database and not from arithmetic.
const left = [];
for (const name of plan.clear) {
  const n = (await school.collection(name).count().get()).data().count;
  if (n > 0) left.push(`${name} (${n})`);
}

console.log('');
console.log(`  ${done} document(s) deleted.`);
if (left.length) {
  console.log(`  STILL THERE: ${left.join(', ')} — run it again.`);
  process.exit(1);
}
console.log(`  Backup: ${backupPath.pathname.split('/').pop()}`);
console.log(`  Put it back with:  node reset-school.mjs --restore=data/backup-${SCHOOL}-${stamp}.json`);
console.log('');

// ---------------------------------------------------------------------------

/**
 * Put a backup back.
 *
 * Writes what the file holds over whatever is there now, and does NOT delete
 * anything first: restoring onto a school that has been used since should add
 * the old records back, not take the new ones away. A document the file knows
 * about wins, because that is the one the person asked for.
 */
async function restore(path) {
  const file = new URL(path.replace(/^tools[/\\]/, './'), import.meta.url);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  if (data.school !== SCHOOL) {
    console.error(`  That backup is for schools/${data.school}, not schools/${SCHOOL}.`);
    process.exit(1);
  }
  console.log(`  Backup taken ${data.takenAt} from ${data.projectId}.`);
  if (data.projectId !== projectId) {
    console.log(`  NOTE: it came from a different project (${data.projectId}).`);
  }

  let put = 0;
  for (const [name, rows] of Object.entries(data.collections)) {
    for (let i = 0; i < rows.length; i += PER_BATCH) {
      const batch = db.batch();
      for (const row of rows.slice(i, i + PER_BATCH)) {
        batch.set(school.collection(name).doc(row.id), fromJson(row.data));
      }
      await batch.commit();
    }
    if (rows.length) console.log(`  restored  ${name.padEnd(20)}  ${String(rows.length).padStart(6)}`);
    put += rows.length;
  }
  if (data.schoolDoc) await school.set(fromJson(data.schoolDoc), { merge: true });
  console.log(`\n  ${put} document(s) restored.\n`);
}
