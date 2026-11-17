#!/usr/bin/env node
/**
 * SchoolTrack — file the CSVs downloaded from APEX into tools/data/.
 *
 *   node collect-exports.mjs                  # look in your Downloads folder
 *   node collect-exports.mjs "C:\\some\\folder"
 *   node collect-exports.mjs --move           # move rather than copy
 *
 * APEX names every download the same thing, so twelve exports arrive as
 * SQL_Commands.csv, SQL_Commands (1).csv, SQL_Commands (2).csv… Renaming
 * them by hand is the step where the wrong query ends up in the wrong file
 * and the mirror writes a student's name into a fee head.
 *
 * Nothing here guesses: each export has a header row that no other export
 * has, so this reads the first line and files the CSV by what it IS. A file
 * it cannot recognise is listed and left alone.
 *
 * Only CSVs touched in the last few days are considered, so an old download
 * cannot creep back in; pass --all to consider every CSV in the folder.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, 'data');

/**
 * What each export must have in its header, as the queries in
 * export-reference.sql name the columns. Only the distinctive ones are
 * listed — enough to tell every export apart from every other.
 */
const SHAPES = {
  settings: ['instituteName', 'sessionLabel'],
  classes: ['classId', 'className', 'displayName'],
  students: ['studentId', 'fullName', 'rollNo', 'classId'],
  staff: ['staffId', 'designation'],
  subjects: ['subjectId', 'subjectName', 'fullMarks'],
  components: ['subjectId', 'name', 'max', 'pass'],
  subjectgroups: ['subjectId', 'groupName'],
  exams: ['examId', 'examName', 'examYear'],
  feeHeads: ['feeHeadId', 'headCode', 'frequency'],
  feeStructure: ['feeHeadId', 'className', 'amount'],
  expenseHeads: ['expenseHeadId', 'headCode'],
  holidays: ['date', 'name'],
};

const args = process.argv.slice(2);
const move = args.includes('--move');
const all = args.includes('--all');
const from = args.find((a) => !a.startsWith('--')) ?? join(homedir(), 'Downloads');

if (!existsSync(from)) {
  console.error(`No such folder: ${from}`);
  process.exit(1);
}
mkdirSync(DATA, { recursive: true });

/** The header row, split on commas that are not inside quotes. */
function headerOf(file) {
  const first = readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)[0] ?? '';
  return first
    .match(/("([^"]|"")*"|[^,]*)(,|$)/g)
    ?.map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim())
    .filter((c, i, a) => !(c === '' && i === a.length - 1)) ?? [];
}

const RECENT = Date.now() - 1000 * 60 * 60 * 24 * 7;
const csvs = readdirSync(from)
  .filter((f) => f.toLowerCase().endsWith('.csv'))
  .map((f) => join(from, f))
  .filter((f) => all || statSync(f).mtimeMs >= RECENT)
  .sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);   // oldest first: a later download wins

if (csvs.length === 0) {
  console.log(`No CSV files in ${from}${all ? '' : ' from the last week (pass --all to widen)'}.`);
  process.exit(0);
}

console.log(`Looking in ${from}\n`);
const placed = new Map();
const unknown = [];

for (const file of csvs) {
  const header = headerOf(file);
  const name = Object.entries(SHAPES).find(([, need]) => need.every((h) => header.includes(h)))?.[0];
  if (!name) { unknown.push({ file, header }); continue; }

  const target = join(DATA, `${name}.csv`);
  if (move) renameSync(file, target); else copyFileSync(file, target);
  const rows = readFileSync(target, 'utf8').trim().split(/\r?\n/).length - 1;
  placed.set(name, { from: file, rows });
}

for (const [name, { from: f, rows }] of placed) {
  console.log(`${name.padEnd(14)} <- ${f.split(/[\\/]/).pop().padEnd(28)} ${rows} row(s)`);
}

const missing = Object.keys(SHAPES).filter((n) => !placed.has(n));
if (missing.length) console.log(`\nStill to export: ${missing.join(', ')}`);

if (unknown.length) {
  console.log('\nNot recognised, left where they were:');
  for (const u of unknown) {
    console.log(`  ${u.file.split(/[\\/]/).pop()} — header: ${u.header.slice(0, 6).join(', ')}`);
  }
}

console.log(`\nNext: node import.mjs            (a dry run — writes nothing)`);
console.log(`Then: node import.mjs --commit   (when the dry run reads right)`);
