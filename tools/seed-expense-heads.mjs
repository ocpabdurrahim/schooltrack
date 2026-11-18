/**
 * Set up the live school's expense heads.
 *
 * The twelve heads are NOT invented here: they are the school's own, read out
 * of sql/66_expense_schema.sql in the APEX project, where the office already
 * agreed to them. Codes, names and order all match, so a voucher written in
 * one system means the same thing in the other.
 *
 * Idempotent: the document id is derived from the head code, exactly as
 * headIdFor() in web/src/data/expenses.ts derives it, so running this twice
 * updates the same twelve rather than making twelve more. It never deletes,
 * and it leaves `active` alone on a head that already exists — switching one
 * off is a decision the office makes in the app, and a re-run must not undo
 * it.
 *
 *   node tools/seed-expense-heads.mjs           # say what it would do
 *   node tools/seed-expense-heads.mjs --write   # do it
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const WRITE = process.argv.includes('--write');
const SCHOOL = 'matkhola';

const HEADS = [
  ['ELECTRICITY', 'Electricity Bill', 10],
  ['WATER', 'Water Bill', 20],
  ['INTERNET', 'Internet & Telephone', 30],
  ['REPAIRS', 'Repairs & Maintenance', 40],
  ['FURNITURE', 'Furniture & Equipment', 50],
  ['STATIONERY', 'Stationery & Office Supplies', 60],
  ['EXAM_MATERIAL', 'Exam Materials & Printing', 70],
  ['CLEANING', 'Cleaning & Sanitation', 80],
  ['SPORTS', 'Sports & Cultural Programme', 90],
  ['TRANSPORT', 'Transport & Fuel', 100],
  ['GUEST', 'Guest Entertainment', 110],
  ['OTHERS', 'Other Expenses', 900],
];

/** The same rule as headIdFor() on the web, so both write the same document. */
const idFor = (code) =>
  code.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const key = JSON.parse(readFileSync(new URL('./serviceAccount.json', import.meta.url)));
initializeApp({ credential: cert(key) });
const db = getFirestore();
const heads = db.collection(`schools/${SCHOOL}/expenseHeads`);

const existing = new Map((await heads.get()).docs.map((d) => [d.id, d.data()]));
console.log(`live now: ${existing.size} head(s)`);

let added = 0;
let updated = 0;
const batch = db.batch();

for (const [headCode, headName, sortOrder] of HEADS) {
  const id = idFor(headCode);
  const was = existing.get(id);
  const row = {
    headCode,
    headName,
    sortOrder,
    // only set on a new head: an office that retired one must stay retired
    ...(was ? {} : { active: true }),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (!was) {
    added += 1;
    console.log(`  + ${id.padEnd(14)} ${headName}`);
  } else if (was.headName !== headName || was.sortOrder !== sortOrder) {
    updated += 1;
    console.log(`  ~ ${id.padEnd(14)} ${was.headName} -> ${headName}`);
  } else {
    console.log(`  = ${id.padEnd(14)} ${headName}`);
  }
  if (WRITE) batch.set(heads.doc(id), row, { merge: true });
}

const leftAlone = [...existing.keys()].filter((id) => !HEADS.some(([c]) => idFor(c) === id));
if (leftAlone.length) {
  console.log(`\nleft alone (not in this list, never deleted): ${leftAlone.join(', ')}`);
}

if (WRITE) {
  await batch.commit();
  console.log(`\nwritten: ${added} added, ${updated} updated.`);
} else {
  console.log(`\nDRY RUN — nothing written. ${added} would be added, ${updated} updated.`);
  console.log('Run again with --write to do it.');
}
