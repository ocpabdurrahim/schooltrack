#!/usr/bin/env node
/**
 * Oracle exam marks → SchoolTrack results.
 *
 * The CSV is one row per COMPONENT (a subject's CQ, MCQ, Practical...), which
 * is how Oracle's result_info stores it. SchoolTrack keeps one document per
 * student per SUBJECT, with the components folded into a `parts` map — so the
 * folding is this script's real work.
 *
 *   node tools/import-marks.mjs <csv> --exam half-year-exam-2026
 *   node tools/import-marks.mjs <csv> --exam half-year-exam-2026 --commit
 *
 * Dry run by default: it says exactly what it would write and what it could
 * not match, and writes nothing. Re-running with --commit is safe — the
 * document id is examId_studentId_subjectId, the same id the app itself uses,
 * so a second run corrects rather than duplicates.
 *
 * The SQL that produces the CSV (SQL Workshop → run → Download):
 *
 *   SELECT st.student_id, st.roll_no, st.full_name, sub.subject_code,
 *          sub.subject_name, c.comp_name, c.max_marks, r.marks_obtained,
 *          NVL(r.is_absent,'N') AS is_absent,
 *          CASE WHEN st.optional_subject_id = sub.subject_id THEN 'Y' ELSE 'N' END AS is_optional
 *   FROM   result_info r
 *   JOIN   subject_components c ON c.comp_id = r.comp_id
 *   JOIN   subjects_info sub    ON sub.subject_id = c.subject_id
 *   JOIN   students_info st     ON st.student_id = r.student_id
 *   JOIN   class_info cl        ON cl.class_id = st.class_id
 *   JOIN   exams e              ON e.exam_id = r.exam_id
 *   WHERE  e.exam_name LIKE 'Half%' AND e.exam_year = 2026
 *     AND  cl.class_name = 'Class 9'
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHOOL = 'matkhola';

/**
 * Oracle's subject_code → SchoolTrack's subject id.
 *
 * The two systems were set up separately and do NOT share codes: Oracle calls
 * it BAN1, SchoolTrack calls it BANGLA_1ST_PAPER. Every pair below was checked
 * by comparing both systems' subject lists AND their components — all but ICT
 * matched part for part, and ICT was corrected in SchoolTrack to Oracle's
 * MCQ + PRACTICAL.
 *
 * A code that is not here stops the import rather than being skipped. A marks
 * import that quietly drops a subject is worse than one that refuses to run.
 */
const SUBJECT = {
  BAN1: 'BANGLA_1ST_PAPER',
  BAN2: 'BANGLA_2ND_PAPER',
  BGS: 'BANGLADESH_AND_GLOBAL_STUDIES',
  BIO: 'BIOLOGY',
  CHEM: 'CHEMISTRY',
  ENG1: 'ENGLISH_1ST_PAPER',
  ENG2: 'ENGLISH_2ND_PAPER',
  HMATH: 'HIGHER_MATHS',
  ICT: 'ICT',
  ISL: 'ISLAM_AND_MORALITY_EDUCATION',
  MATH: 'MATHEMATICS',
  PHY: 'PHYSICS',
  GS: 'SCIENCE',
  AGR: 'AGRICULTURE',
  HIN: 'HINDU_AND_MORALITY_EDUCATION',
  CIV: 'CIVICS_AND_CITIZENSHIP',
  GEO: 'GEOGRAPHY',
  HBWC: 'HISTORY',
};

const argv = process.argv.slice(2);
const csvPath = argv.find((a) => !a.startsWith('--'));
const examId = (() => {
  const i = argv.indexOf('--exam');
  return i === -1 || i === argv.length - 1 ? null : argv[i + 1];
})();
const COMMIT = argv.includes('--commit');

if (!csvPath || !examId) {
  console.error('usage: node tools/import-marks.mjs <csv> --exam <examId> [--commit]');
  process.exit(1);
}

const num = (v) => {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : null;
};

async function main() {
  const key = JSON.parse(await readFile(join(HERE, 'serviceAccount.json'), 'utf8'));
  initializeApp({ credential: cert(key) });
  const db = getFirestore();
  const school = db.collection('schools').doc(SCHOOL);

  // ---- what SchoolTrack already knows -------------------------------------
  const [stuSnap, subSnap, examSnap] = await Promise.all([
    school.collection('students').get(),
    school.collection('subjects').get(),
    school.collection('exams').doc(examId).get(),
  ]);
  if (!examSnap.exists) {
    console.error(`No exam "${examId}" in SchoolTrack. Create it first.`);
    process.exit(1);
  }
  const students = new Map(stuSnap.docs.map((d) => [d.id, d.data()]));
  const subjects = new Map(subSnap.docs.map((d) => [d.id, d.data()]));

  // ---- fold the CSV into one row per student per subject ------------------
  const text = await readFile(csvPath, 'utf8');
  const rows = parse(text, { columns: true, skip_empty_lines: true, bom: true });

  const folded = new Map();
  const problems = [];

  for (const r of rows) {
    const code = String(r.SUBJECT_CODE ?? '').trim();
    const subjectId = SUBJECT[code];
    if (!subjectId) {
      problems.push(`unknown Oracle subject code "${code}" — not in the map`);
      continue;
    }
    const studentId = String(r.STUDENT_ID ?? '').trim();
    const k = `${studentId}|${subjectId}`;
    const at = folded.get(k) ?? {
      studentId,
      subjectId,
      rollNo: num(r.ROLL_NO),
      fullName: String(r.FULL_NAME ?? '').trim(),
      parts: {},
      absent: true,          // flipped to false by any component that was sat
      isOptional: false,
      maxes: {},
    };
    const comp = String(r.COMP_NAME ?? '').trim().toUpperCase();
    const absent = String(r.IS_ABSENT ?? 'N').trim().toUpperCase() === 'Y';
    if (!absent) {
      at.absent = false;
      at.parts[comp] = num(r.MARKS_OBTAINED) ?? 0;
    }
    at.maxes[comp] = num(r.MAX_MARKS) ?? 0;
    if (String(r.IS_OPTIONAL ?? 'N').trim().toUpperCase() === 'Y') at.isOptional = true;
    folded.set(k, at);
  }

  // ---- check every one against SchoolTrack before writing anything --------
  const docs = [];
  const unknownStudents = new Set();
  const partMismatch = [];
  const overMax = [];
  let absentCount = 0;

  for (const f of folded.values()) {
    const stu = students.get(f.studentId);
    if (!stu) { unknownStudents.add(`${f.studentId} (${f.fullName}, roll ${f.rollNo})`); continue; }
    const sub = subjects.get(f.subjectId);
    if (!sub) { problems.push(`SchoolTrack has no subject ${f.subjectId}`); continue; }

    const defined = new Set((sub.components ?? []).map((c) => c.name));
    for (const [name, mark] of Object.entries(f.parts)) {
      if (defined.size && !defined.has(name)) {
        partMismatch.push(`${f.subjectId}: Oracle has a "${name}" part, SchoolTrack does not`);
      }
      const max = (sub.components ?? []).find((c) => c.name === name)?.max;
      if (max !== undefined && mark > max) {
        overMax.push(`${f.fullName} ${f.subjectId} ${name}: ${mark} > ${max}`);
      }
    }

    const marks = f.absent
      ? null
      : Object.values(f.parts).reduce((t, v) => t + (v ?? 0), 0);
    if (f.absent) absentCount += 1;

    docs.push({
      id: `${examId}_${f.studentId}_${f.subjectId}`,
      body: {
        examId,
        studentId: f.studentId,
        classId: stu.classId,
        rollNo: stu.rollNo ?? f.rollNo,
        subjectId: f.subjectId,
        subjectName: sub.subjectName ?? f.subjectId,
        fullMarks: sub.fullMarks ?? null,
        // Absent short-circuits the grading engine (F, 0, and not counted as
        // "not entered"), so no mark is invented for it. A 0 would claim the
        // paper was sat and scored nothing.
        marks: f.absent ? null : marks,
        parts: f.absent ? null : f.parts,
        absent: f.absent,
        isOptional: f.isOptional,
      },
    });
  }

  // ---- say what would happen ---------------------------------------------
  const byAbsent = docs.filter((d) => d.body.absent).length;
  console.log(`CSV            ${rows.length} component rows`);
  console.log(`folded into    ${folded.size} student x subject entries`);
  console.log(`to write       ${docs.length} result documents into "${examId}"`);
  console.log(`  of those     ${byAbsent} absent, ${docs.length - byAbsent} with marks`);
  console.log(`students       ${new Set(docs.map((d) => d.body.studentId)).size}`);
  console.log(`subjects       ${new Set(docs.map((d) => d.body.subjectId)).size}`);

  const say = (title, list) => {
    if (!list.length) return;
    console.log(`\n${title} (${list.length}):`);
    for (const x of [...new Set(list)].slice(0, 12)) console.log('  ' + x);
    if (new Set(list).size > 12) console.log('  …');
  };
  say('NOT IN SCHOOLTRACK, skipped', [...unknownStudents]);
  say('PART NAMES THAT DO NOT MATCH', partMismatch);
  say('MARKS ABOVE THE COMPONENT MAXIMUM', overMax);
  say('PROBLEMS', problems);

  if (partMismatch.length || overMax.length || problems.length) {
    console.log('\nFix the above before committing — none of it is safe to guess at.');
    if (COMMIT) process.exit(1);
  }

  if (!COMMIT) {
    console.log('\nDRY RUN — nothing was written. Add --commit to write.');
    process.exit(0);
  }

  let done = 0;
  let batch = db.batch();
  for (const d of docs) {
    batch.set(school.collection('results').doc(d.id),
      { ...d.body, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    done += 1;
    if (done % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  console.log(`\nwrote ${done} result documents.`);
  process.exit(0);
}

main().catch((e) => {
  console.error('import FAILED: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
