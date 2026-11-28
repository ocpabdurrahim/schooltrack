#!/usr/bin/env node
/**
 * Backs up every document in Firestore to a file on this machine.
 *
 * WHY THIS EXISTS. Firestore's own scheduled export needs the Blaze plan and a
 * billing account. This school is on the free plan, which means that without
 * this script there is NO copy of the records anywhere: one wrong bulk
 * operation, one mistaken Reset School, and the attendance, marks, receipts
 * and salaries of the year are gone for good.
 *
 * IT ONLY READS. Nothing here writes to Firestore. Restoring is a separate
 * script, on purpose, so that the thing you run every day cannot overwrite the
 * school by accident.
 *
 * WHERE IT WRITES. Outside the repository by default, because this repo is
 * PUBLIC and the backup is nothing but real students' names, their parents'
 * mobile numbers and what they paid. `.gitignore` already covers the obvious
 * shapes, but the only safe answer is for the file never to be inside the
 * working tree at all.
 *
 *   node tools/backup-firestore.mjs
 *   node tools/backup-firestore.mjs --out "E:\\SchoolTrack backups" --keep 60
 *
 * It needs tools/serviceAccount.json (gitignored), the same admin key the
 * diagnostics use.
 */
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cert, initializeApp } from 'firebase-admin/app';
import {
  DocumentReference, GeoPoint, Timestamp, getFirestore,
} from 'firebase-admin/firestore';

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- arguments
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i === -1 || i === argv.length - 1 ? fallback : argv[i + 1];
};

/** Default: a sibling of the project folder, never inside it. */
const OUT = resolve(arg('out', join(HERE, '..', '..', 'SchoolTrack-backups')));
const KEEP = Number(arg('keep', '30'));

// The repo is public. A backup that lands inside the working tree is one
// `git add -A` away from publishing the whole school.
if (resolve(OUT).startsWith(resolve(join(HERE, '..')) + sep)) {
  console.error('Refusing to write backups inside the repository: ' + OUT);
  process.exit(1);
}

// ---------------------------------------------------------------- encoding
/**
 * Firestore values that JSON cannot carry on its own.
 *
 * A timestamp written back as a string is not a timestamp, and every date
 * comparison in the app would quietly start failing. Each special type is
 * tagged so the restore can put it back exactly as it was.
 */
function enc(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Timestamp) return { __t: 'ts', s: v.seconds, n: v.nanoseconds };
  if (v instanceof GeoPoint) return { __t: 'geo', lat: v.latitude, lng: v.longitude };
  if (v instanceof DocumentReference) return { __t: 'ref', p: v.path };
  if (Buffer.isBuffer(v)) return { __t: 'b64', d: v.toString('base64') };
  if (Array.isArray(v)) return v.map(enc);
  if (typeof v === 'number' && !Number.isFinite(v)) return { __t: 'num', v: String(v) };
  if (typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = enc(val);
    return out;
  }
  return v;
}

// ---------------------------------------------------------------- the walk
async function main() {
  const keyPath = join(HERE, 'serviceAccount.json');
  let key;
  try {
    key = JSON.parse(await readFile(keyPath, 'utf8'));
  } catch {
    console.error('Cannot read ' + keyPath + ' — the admin key is missing.');
    process.exit(1);
  }

  initializeApp({ credential: cert(key) });
  const db = getFirestore();

  await mkdir(OUT, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = join(OUT, `schooltrack-${stamp}.ndjson`);
  const out = createWriteStream(file, { encoding: 'utf8' });
  const write = (o) => new Promise((ok, bad) => out.write(JSON.stringify(o) + '\n', (e) => (e ? bad(e) : ok())));

  const counts = {};
  let docs = 0;

  async function walk(col) {
    const snap = await col.get();
    const seen = new Set();

    for (const doc of snap.docs) {
      seen.add(doc.id);
      await write({ path: doc.ref.path, data: enc(doc.data()) });
      docs += 1;
      counts[col.path.replace(/\/[^/]+\//g, '/*/')] =
        (counts[col.path.replace(/\/[^/]+\//g, '/*/')] ?? 0) + 1;
      for (const sub of await doc.ref.listCollections()) await walk(sub);
    }

    // A document can be missing and still have subcollections under it — a
    // "phantom parent". Those children are real data and must come too.
    for (const ref of await col.listDocuments()) {
      if (seen.has(ref.id)) continue;
      for (const sub of await ref.listCollections()) await walk(sub);
    }
  }

  const started = Date.now();
  for (const col of await db.listCollections()) await walk(col);

  await new Promise((ok) => out.end(ok));
  const { size } = await stat(file);

  console.log('backed up ' + docs + ' documents to');
  console.log('  ' + file);
  console.log('  ' + (size / 1024).toFixed(1) + ' KB in ' + ((Date.now() - started) / 1000).toFixed(1) + 's');
  console.log('');
  for (const [k, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log('  ' + String(n).padStart(6) + '  ' + k);
  }

  // Keep the last N, delete the rest. A folder that grows for ever is a folder
  // somebody eventually deletes in one go.
  const olds = (await readdir(OUT))
    .filter((f) => f.startsWith('schooltrack-') && f.endsWith('.ndjson'))
    .sort()
    .reverse()
    .slice(KEEP);
  for (const f of olds) await unlink(join(OUT, f));
  if (olds.length) console.log('\nremoved ' + olds.length + ' backup(s) older than the last ' + KEEP);

  if (docs === 0) {
    console.error('\nNOTHING WAS BACKED UP. That is not a success — check the key and the project.');
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('backup FAILED: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
