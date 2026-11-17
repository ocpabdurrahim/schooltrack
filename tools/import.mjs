#!/usr/bin/env node
/**
 * SchoolTrack — one-way mirror: Oracle CSV exports → Firestore.
 *
 *   node import.mjs                 # dry run: says what it WOULD write
 *   node import.mjs --commit        # actually writes
 *   node import.mjs --only students,classes --commit
 *
 * Direction is Oracle → Firestore and never the reverse (data-model.md §0).
 * While a module belongs to Oracle its collections are read-only in the
 * security rules; this script runs through the Admin SDK, which bypasses
 * rules, so the mirror keeps working while neither app can corrupt data the
 * other owns.
 *
 * Re-running is safe and expected: every document keeps its Oracle id and is
 * written with { merge: true }, so a second run updates rather than
 * duplicates, and fields the app added (a photo, a note) are not wiped.
 *
 * CREDENTIALS, in order of preference:
 *
 *   1. gcloud application-default credentials — nothing is stored in this
 *      project folder at all:
 *          gcloud auth application-default login
 *      This is the better option: there is no key file to leak, and it is
 *      tied to your own Google account rather than a standing credential.
 *
 *   2. tools/serviceAccount.json — Firebase console → Project settings →
 *      Service accounts → Generate new private key. GITIGNORED AND MUST STAY
 *      SO: it bypasses every security rule and this repository is public.
 *
 * Either way the Admin SDK bypasses the rules, which is exactly how the
 * mirror writes collections the rules mark read-only.
 */
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { parse } from 'csv-parse/sync';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The streams this school runs, exactly as web/src/data/groups.ts lists them.
 * Kept here as a plain constant because this script is run with bare node,
 * outside the app's TypeScript build.
 */
const GROUPS = ['Science', 'Humanities', 'Business Studies'];

/**
 * The two religion papers, by Oracle's own subject_code.
 *
 * This one mapping is not in any table over there: enroll_student_subjects
 * names the codes in its WHERE clause --
 *
 *   AND NOT ( s.subject_code = 'ISL' AND v_relig <> 'Islam' )
 *   AND NOT ( s.subject_code = 'HIN' AND v_relig <> 'Hindu' )
 *
 * -- so the rule is copied here rather than derived. Without it every student
 * would be expected to sit BOTH religion papers after a mirror, because
 * subject_group lists both under all three groups.
 */
const RELIGION_PAPERS = { ISL: ['Islam'], HIN: ['Hindu'] };

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, 'data');
const SCHOOL_ID = 'matkhola';

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const ONLY = (() => {
  const i = args.indexOf('--only');
  return i === -1 ? null : new Set(args[i + 1].split(',').map((s) => s.trim()));
})();

// ---------------------------------------------------------------------------
// helpers

const str = (v) => (v === undefined || v === null || v === '' ? null : String(v).trim());
const num = (v) => {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};
const bool = (v, truthy = 'Y') => (str(v) ?? '').toUpperCase() === truthy;

/** Drops nulls so a merge never overwrites a good value with nothing. */
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null));

function read(name) {
  const file = join(DATA, `${name}.csv`);
  if (!existsSync(file)) return null;
  // APEX downloads UTF-8; strip the BOM or the first header becomes "﻿id"
  const text = readFileSync(file, 'utf8').replace(/^﻿/, '');
  return parse(text, { columns: true, skip_empty_lines: true, trim: true });
}

// ---------------------------------------------------------------------------
// what each file becomes.  id() -> document id, doc() -> document body

const MAPPINGS = {
  settings: {
    path: () => ['settings'],
    id: () => 'school',
    doc: (r) =>
      clean({
        instituteName: str(r.instituteName),
        sessionLabel: str(r.sessionLabel),
        address: str(r.address),
        eiin: str(r.eiin),
        headTeacher: str(r.headTeacher),
        weekendDays: (str(r.weekendDays) ?? 'FRI,SAT').split(',').map((d) => d.trim()),
      }),
  },

  classes: {
    path: () => ['classes'],
    id: (r) => str(r.classId),
    doc: (r) =>
      clean({
        className: str(r.className),
        section: str(r.section),
        displayName: str(r.displayName),
        sortOrder: num(r.sortOrder),
        active: true,
      }),
  },

  students: {
    path: () => ['students'],
    id: (r) => str(r.studentId),
    doc: (r) =>
      clean({
        fullName: str(r.fullName),
        rollNo: num(r.rollNo),
        regNo: str(r.regNo),
        classId: str(r.classId),
        className: str(r.className),
        section: str(r.section),
        groupName: str(r.groupName),
        religion: str(r.religion),
        gender: str(r.gender),
        dob: str(r.dob),
        fatherName: str(r.fatherName),
        motherName: str(r.motherName),
        bloodGroup: str(r.bloodGroup),
        mobileNo: str(r.mobileNo),
        status: str(r.status) ?? 'A',
      }),
  },

  staff: {
    path: () => ['staff'],
    id: (r) => str(r.staffId),
    doc: (r) =>
      clean({
        fullName: str(r.fullName),
        designation: str(r.designation),
        mobileNo: str(r.mobileNo),
        staffStatus: str(r.staffStatus) ?? 'ACTIVE',
        appUsername: str(r.appUsername),
        joinDate: str(r.joinDate),
      }),
  },

  subjects: {
    path: () => ['subjects'],
    id: (r) => str(r.subjectId),
    doc: (r) => clean({
      subjectName: str(r.subjectName),
      subjectCode: str(r.subjectCode),
      fullMarks: num(r.fullMarks),
      isOptional: r.isOptional === undefined ? undefined : str(r.isOptional) === 'Y',
      // Bangla first and second paper carry the same tag and are graded as one
      // subject out of 200, the way the board counts them.
      combineGroup: str(r.combineGroup),
      religions: RELIGION_PAPERS[str(r.subjectCode)?.toUpperCase()],
    }),
  },

  /**
   * How each paper is marked — CQ, MCQ, PRACTICAL — with each part's own pass
   * mark. Oracle keeps one ROW per component; a Firestore subject keeps them
   * as one array on the subject itself, so `fold` gathers the rows of a
   * subject into the single document they belong on.
   *
   * Parts are ordered biggest first, which is the order a teacher marks and
   * types them in, and fullMarks is recomputed from them so the two can never
   * drift apart.
   */
  components: {
    path: () => ['subjects'],
    id: (r) => str(r.subjectId),
    fold: (rows) => {
      const components = rows
        .map((r) => ({
          name: str(r.name).toUpperCase(),
          max: num(r.max) ?? 0,
          pass: num(r.pass) ?? 0,
        }))
        .filter((c) => c.name)
        .sort((a, b) => b.max - a.max);
      return {
        components,
        fullMarks: components.reduce((t, c) => t + c.max, 0),
      };
    },
  },

  /**
   * Which streams sit which paper, from Oracle's subject_group — folded onto
   * the subject, like its components.
   *
   * A paper listed under EVERY group is stored with no groups at all. It means
   * the same thing (the whole class sits it) and it keeps meaning it if the
   * school ever adds a fourth stream, which a hard list of three would not.
   */
  subjectgroups: {
    path: () => ['subjects'],
    id: (r) => str(r.subjectId),
    fold: (rows) => {
      const groupNames = [...new Set(rows.map((r) => str(r.groupName)).filter(Boolean))].sort();
      return { groupNames: groupNames.length >= GROUPS.length ? [] : groupNames };
    },
  },

  exams: {
    path: () => ['exams'],
    id: (r) => str(r.examId),
    doc: (r) =>
      clean({
        examName: str(r.examName),
        examYear: num(r.examYear),
        periodLabel: str(r.periodLabel),
      }),
  },

  feeHeads: {
    path: () => ['feeHeads'],
    id: (r) => str(r.feeHeadId),
    doc: (r) =>
      clean({
        headCode: str(r.headCode),
        headName: str(r.headName),
        frequency: str(r.frequency),
        active: bool(r.isActive),
      }),
  },

  feeStructure: {
    path: () => ['feeStructure'],
    // the Oracle unique constraint, carried over as the document id
    id: (r) => `${str(r.feeHeadId)}_${str(r.className)}_${str(r.sessionYear)}`.replace(/\s+/g, '-'),
    doc: (r) =>
      clean({
        feeHeadId: str(r.feeHeadId),
        className: str(r.className),
        sessionYear: str(r.sessionYear),
        amount: num(r.amount),
      }),
  },

  expenseHeads: {
    path: () => ['expenseHeads'],
    id: (r) => str(r.expenseHeadId),
    doc: (r) =>
      clean({
        headCode: str(r.headCode),
        headName: str(r.headName),
        active: bool(r.isActive),
        sortOrder: num(r.sortOrder),
      }),
  },

  holidays: {
    path: () => ['holidays'],
    id: (r) => str(r.date),
    doc: (r) => clean({ date: str(r.date), name: str(r.name), source: 'GAZETTE' }),
  },
};

// Reference data before anything that points at it.
const ORDER = [
  'settings', 'classes', 'students', 'staff', 'subjects', 'components',
  'subjectgroups',
  'exams', 'feeHeads', 'feeStructure', 'expenseHeads', 'holidays',
];

// ---------------------------------------------------------------------------

async function main() {
  const keyFile = join(HERE, 'serviceAccount.json');
  const hasKey = existsSync(keyFile);
  const hasAdc = !!process.env.GOOGLE_APPLICATION_CREDENTIALS ||
                 !!process.env.CLOUDSDK_CONFIG ||
                 existsSync(join(process.env.APPDATA ?? process.env.HOME ?? '',
                                 'gcloud', 'application_default_credentials.json'));

  if (COMMIT && !hasKey && !hasAdc) {
    console.error([
      'No credentials.',
      '',
      '  Either:  gcloud auth application-default login     (nothing stored here)',
      '  Or:      save a service-account key as tools/serviceAccount.json',
    ].join('\n'));
    process.exit(1);
  }

  let db = null;
  if (COMMIT) {
    initializeApp({
      credential: hasKey
        ? cert(JSON.parse(readFileSync(keyFile, 'utf8')))
        : applicationDefault(),
      projectId: 'schooltrack-1941',
    });
    db = getFirestore();
    console.log(
      hasKey
        ? 'Using tools/serviceAccount.json'
        : 'Using gcloud application-default credentials',
    );
  }

  console.log(COMMIT ? 'WRITING to Firestore\n' : 'DRY RUN — nothing will be written\n');

  let grand = 0;
  for (const name of ORDER) {
    if (ONLY && !ONLY.has(name)) continue;

    const rows = read(name);
    if (rows === null) {
      console.log(`${name.padEnd(14)} —  no data/${name}.csv, skipped`);
      continue;
    }

    const map = MAPPINGS[name];
    const docs = [];
    const bad = [];

    if (map.fold) {
      // Several rows make ONE document: the components of a subject.
      const byId = new Map();
      for (const r of rows) {
        const id = map.id(r);
        if (!id) { bad.push(r); continue; }
        byId.set(id, [...(byId.get(id) ?? []), r]);
      }
      for (const [id, group] of byId) docs.push({ id, body: map.fold(group) });
    } else {
      for (const r of rows) {
        const id = map.id(r);
        if (!id) { bad.push(r); continue; }
        docs.push({ id, body: map.doc(r) });
      }
    }

    if (COMMIT) {
      // 500 writes per batch is the Firestore limit; 400 leaves room for the
      // updatedAt sentinel on each document.
      for (let i = 0; i < docs.length; i += 400) {
        const batch = db.batch();
        for (const d of docs.slice(i, i + 400)) {
          const ref = db.collection('schools').doc(SCHOOL_ID)
                        .collection(...map.path()).doc(d.id);
          batch.set(ref, { ...d.body, updatedAt: FieldValue.serverTimestamp(),
                           mirroredFrom: 'ORACLE' }, { merge: true });
        }
        await batch.commit();
      }
    }

    grand += docs.length;
    console.log(
      `${name.padEnd(14)} ${String(docs.length).padStart(5)} document(s)` +
      (bad.length ? `   ${bad.length} skipped (no id)` : ''),
    );
    if (docs.length) {
      console.log(`${' '.repeat(15)}e.g. ${docs[0].id} -> ${JSON.stringify(docs[0].body).slice(0, 110)}…`);
    }
  }

  console.log(`\n${grand} document(s) ${COMMIT ? 'written' : 'would be written'}.`);
  if (!COMMIT) console.log('Re-run with --commit when the sample above looks right.');
}

main().catch((e) => { console.error(e); process.exit(1); });
