#!/usr/bin/env node
/**
 * Puts a backup file back into Firestore.
 *
 * SEPARATE FROM THE BACKUP ON PURPOSE. The script that runs every night must
 * not be able to write to the school. This one can, so it is the one with all
 * the locks on it.
 *
 * By default it restores into the LOCAL EMULATOR, which is where a restore
 * should always be tried first: it proves the file is good without touching
 * anything real.
 *
 *   node tools/restore-firestore.mjs <file>                     -> emulator
 *   node tools/restore-firestore.mjs <file> --target live --i-mean-it
 *
 * Restoring to live needs BOTH flags and still asks for a typed confirmation.
 * It writes documents back at the paths they came from, overwriting what is
 * there now. It does NOT delete anything the backup does not contain — a
 * restore that also emptied collections would turn one bad afternoon into a
 * total loss.
 */
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cert, initializeApp } from 'firebase-admin/app';
import {
  DocumentReference, GeoPoint, Timestamp, getFirestore,
} from 'firebase-admin/firestore';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith('--'));
const target = (() => {
  const i = argv.indexOf('--target');
  return i === -1 || i === argv.length - 1 ? 'emulator' : argv[i + 1];
})();
const meantIt = argv.includes('--i-mean-it');

if (!file) {
  console.error('usage: node tools/restore-firestore.mjs <backup.ndjson> [--target live --i-mean-it]');
  process.exit(1);
}
if (target !== 'emulator' && target !== 'live') {
  console.error('--target must be "emulator" or "live"');
  process.exit(1);
}

function dec(v, db) {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map((x) => dec(x, db));
  if (typeof v === 'object') {
    switch (v.__t) {
      case 'ts': return new Timestamp(v.s, v.n);
      case 'geo': return new GeoPoint(v.lat, v.lng);
      case 'ref': return db.doc(v.p);
      case 'b64': return Buffer.from(v.d, 'base64');
      case 'num': return Number(v.v);
      default: {
        const out = {};
        for (const [k, val] of Object.entries(v)) out[k] = dec(val, db);
        return out;
      }
    }
  }
  return v;
}

async function main() {
  const text = await readFile(file, 'utf8');
  const rows = text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  if (!rows.length) {
    console.error('That file holds no documents.');
    process.exit(1);
  }

  if (target === 'emulator') {
    process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
    initializeApp({ projectId: 'schooltrack-1941' });
    console.log('restoring into the EMULATOR at ' + process.env.FIRESTORE_EMULATOR_HOST);
  } else {
    if (!meantIt) {
      console.error('Restoring to LIVE also needs --i-mean-it.');
      process.exit(1);
    }
    delete process.env.FIRESTORE_EMULATOR_HOST;
    const key = JSON.parse(await readFile(join(HERE, 'serviceAccount.json'), 'utf8'));
    initializeApp({ credential: cert(key) });

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log('');
    console.log('This will overwrite ' + rows.length + ' documents in the LIVE school,');
    console.log('project ' + key.project_id + ', with the contents of');
    console.log('  ' + file);
    console.log('');
    const said = await rl.question('Type the word RESTORE to go ahead: ');
    rl.close();
    if (said.trim() !== 'RESTORE') {
      console.log('Nothing was written.');
      process.exit(1);
    }
  }

  const db = getFirestore();
  let done = 0;
  let batch = db.batch();
  let inBatch = 0;

  for (const row of rows) {
    batch.set(db.doc(row.path), dec(row.data, db));
    inBatch += 1;
    done += 1;
    if (inBatch === 400) {
      await batch.commit();
      batch = db.batch();
      inBatch = 0;
      process.stdout.write('\r  ' + done + ' / ' + rows.length);
    }
  }
  if (inBatch) await batch.commit();

  console.log('\rrestored ' + done + ' documents' + ' '.repeat(20));
  process.exit(0);
}

main().catch((e) => {
  console.error('restore FAILED: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
