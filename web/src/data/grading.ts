/**
 * Grades, GPA and the fail rules — the Bangladeshi school scale.
 *
 * This file has a twin: android/.../data/Grading.kt. They must agree exactly,
 * because a student will be shown a GPA by whichever app is to hand, and the
 * same test cases are written against both. Change one, change the other.
 *
 * Nothing here is stored. Grades and GPA are COMPUTED from the marks every
 * time (data-model.md §3) so that correcting a mark corrects everything that
 * follows from it. Only a published exam freezes its tabulation.
 */

export type Grade = { letter: string; point: number };

/** Percentage thresholds, highest first. 33 is the pass mark. */
const SCALE: { from: number; letter: string; point: number }[] = [
  { from: 80, letter: 'A+', point: 5.0 },
  { from: 70, letter: 'A', point: 4.0 },
  { from: 60, letter: 'A-', point: 3.5 },
  { from: 50, letter: 'B', point: 3.0 },
  { from: 40, letter: 'C', point: 2.0 },
  { from: 33, letter: 'D', point: 1.0 },
  { from: 0, letter: 'F', point: 0.0 },
];

export const PASS_MARK_PERCENT = 33;
export const MAX_GPA = 5.0;

/** A subject's grade from its marks. Absent is F, not "no grade". */
export function gradeFor(marks: number | null, fullMarks = 100, absent = false): Grade {
  if (absent) return { letter: 'F', point: 0 };
  if (marks === null || !Number.isFinite(marks)) return { letter: '-', point: 0 };
  const percent = fullMarks > 0 ? (marks / fullMarks) * 100 : 0;
  const band = SCALE.find((s) => percent >= s.from) ?? SCALE[SCALE.length - 1];
  return { letter: band.letter, point: band.point };
}

// ---------------------------------------------------------------------------
// components
//
// A paper is marked in parts — CQ, MCQ, PRACTICAL — and each part carries its
// OWN pass mark, not just a share of the subject's. 60 in CQ and 8 in MCQ is
// 68 out of 100 and still a fail, because the MCQ pass is 10. That rule is the
// whole reason components exist here rather than being added up in the UI and
// forgotten.

export type Component = {
  name: string;   // CQ | MCQ | PRACTICAL | WRITTEN
  max: number;
  pass: number;
};

/** What was entered, keyed by component name. null = not entered yet. */
export type Parts = Record<string, number | null>;

export type SubjectMark = {
  subjectId: string;
  subjectName: string;
  fullMarks: number;
  marks: number | null;      // null = not entered yet
  absent?: boolean;
  isOptional?: boolean;      // the "4th subject"
  components?: Component[];  // how this paper is marked, if in parts
  parts?: Parts;             // what was entered for those components
  combineGroup?: string | null; // papers sharing one group are graded as one
};

/** True once at least one component of this subject has a mark on it. */
function partlyEntered(m: SubjectMark): boolean {
  if (!m.components?.length || !m.parts) return false;
  return m.components.some((c) => m.parts?.[c.name] !== null && m.parts?.[c.name] !== undefined);
}

/**
 * The subject's total.
 *
 * From the parts when the paper is marked in parts, and from `marks` when it
 * is not — which is also what keeps results entered before components existed
 * reading correctly. One part still blank makes the total null: a missing
 * mark is not a zero, so the sheet says "not entered" rather than failing a
 * student whose practical has not been marked yet.
 */
export function subjectTotal(m: SubjectMark): number | null {
  if (!partlyEntered(m)) return m.marks;
  let total = 0;
  for (const c of m.components ?? []) {
    const v = m.parts?.[c.name];
    if (v === null || v === undefined || !Number.isFinite(v)) return null;
    total += v;
  }
  return total;
}

/**
 * What has been entered so far, when the subject is not finished.
 *
 * A subject with a missing part has no total — that is the rule the grading
 * rests on. But "no total" and "nothing entered" are different things, and a
 * sheet that prints the same dash for both tells a teacher who has just keyed
 * in English First Paper that their work went nowhere. English First and
 * Second are ONE subject out of 200: until the second paper is in, the
 * subject has no mark, and this is how the sheet can still show that half of
 * it has arrived.
 *
 * Null when the subject is finished (there is a real total to print) or when
 * nothing has been entered at all.
 */
export function enteredSoFar(m: SubjectMark): number | null {
  if (!m.components?.length || subjectTotal(m) !== null) return null;
  let any = false;
  let total = 0;
  for (const c of m.components) {
    const v = m.parts?.[c.name];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    any = true;
    total += v;
  }
  return any ? total : null;
}

/** The components that fall below their own pass mark, by name. */
export function failedComponents(m: SubjectMark): string[] {
  if (!partlyEntered(m)) return [];
  const out: string[] = [];
  for (const c of m.components ?? []) {
    const v = m.parts?.[c.name];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    if (v < c.pass) out.push(c.name);
  }
  return out;
}

export type SubjectGrade = Grade & { total: number | null; failedParts: string[] };

/**
 * One subject's grade, with the component rule applied.
 *
 * Order matters: absent first, then "nothing entered yet", then the component
 * pass marks, and only then the percentage. A paper that fails a component is
 * F however high the total, which is the rule the APEX tabulation uses and the
 * one a printed marksheet has to agree with.
 */
export function gradeForSubject(m: SubjectMark): SubjectGrade {
  if (m.absent) return { letter: 'F', point: 0, total: null, failedParts: [] };
  const total = subjectTotal(m);
  if (total === null) return { letter: '-', point: 0, total: null, failedParts: [] };
  const failedParts = failedComponents(m);
  if (failedParts.length) return { letter: 'F', point: 0, total, failedParts };
  return { ...gradeFor(total, m.fullMarks), total, failedParts: [] };
}

// ---------------------------------------------------------------------------
// combined papers
//
// Bangla first and second paper are ONE grade out of 200, and so are the two
// English papers. Grading them separately gives a different GPA for the same
// marks — two 3.5s where the school's own sheet shows a single 4.0 — so the
// papers are merged into a unit before anything is graded.

/** "Bengali First Paper" + "Bengali Second Paper" -> "Bengali". */
export function unitName(names: string[], fallback: string): string {
  if (names.length === 0) return fallback;
  let prefix = names[0];
  for (const n of names.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < n.length && prefix[i] === n[i]) i += 1;
    prefix = prefix.slice(0, i);
  }
  const trimmed = prefix.replace(/[^A-Za-z]+$/, '').trim();
  return trimmed.length >= 3 ? trimmed : fallback;
}

/**
 * Papers sharing a combine group become one unit, in the place of the first
 * of them — so Bangla stays where Bangla was on the sheet rather than being
 * pushed to the bottom.
 *
 * Each component keeps its paper's name in front of it ("Bengali First Paper
 * MCQ"), because "MCQ" alone would collide between the two papers and a
 * student told they failed "MCQ" would not know which one.
 */
export function combineUnits(marks: SubjectMark[]): SubjectMark[] {
  const groups = new Map<string, SubjectMark[]>();
  for (const m of marks) {
    const g = (m.combineGroup ?? '').trim();
    if (g === '') continue;
    groups.set(g, [...(groups.get(g) ?? []), m]);
  }

  const done = new Set<string>();
  const out: SubjectMark[] = [];
  for (const m of marks) {
    const g = (m.combineGroup ?? '').trim();
    if (g === '' || (groups.get(g) ?? []).length < 2) {
      out.push(m);
      continue;
    }
    if (done.has(g)) continue;
    done.add(g);
    out.push(mergeUnit(g, groups.get(g) ?? []));
  }
  return out;
}

function mergeUnit(group: string, papers: SubjectMark[]): SubjectMark {
  const components: Component[] = [];
  const parts: Parts = {};
  for (const p of papers) {
    for (const c of p.components ?? []) {
      const key = `${p.subjectName} ${c.name}`;
      components.push({ ...c, name: key });
      parts[key] = p.parts?.[c.name] ?? null;
    }
  }

  const totals = papers.map((p) => subjectTotal(p));
  const marks = totals.some((t) => t === null)
    ? null
    : totals.reduce((a: number, b) => a + (b ?? 0), 0);

  return {
    subjectId: `UNIT_${group}`,
    subjectName: unitName(papers.map((p) => p.subjectName), group),
    fullMarks: papers.reduce((t, p) => t + p.fullMarks, 0),
    marks,
    absent: papers.some((p) => p.absent),
    isOptional: papers.some((p) => p.isOptional),
    combineGroup: group,
    components: components.length ? components : undefined,
    parts: components.length ? parts : undefined,
  };
}

// ---------------------------------------------------------------------------
// the tabulation

export type Tabulation = {
  gpa: number | null;        // null while any compulsory mark is missing
  letter: string;
  failed: string[];          // names of the compulsory subjects failed
  incomplete: boolean;
  subjects: (SubjectMark & SubjectGrade)[];
};

/**
 * One student's result for one exam.
 *
 * Four rules carried over from the APEX tabulation, and each one matters:
 *
 *   1. ONE F IN A COMPULSORY SUBJECT FAILS THE EXAM. The GPA is 0.00 and the
 *      grade F, however good the rest are.
 *   2. THE OPTIONAL (4th) SUBJECT ONLY EVER HELPS. Points above 2.00 are added
 *      to the total, it is never counted in the divisor, and failing it does
 *      not fail the student.
 *   3. A MISSING MARK IS NOT A ZERO. Until every compulsory subject has a mark
 *      the GPA is null and the sheet says so, rather than publishing a GPA
 *      that will change when the last subject is entered.
 *   4. A FAILED COMPONENT FAILS THE SUBJECT, whatever the total comes to.
 */
export function tabulate(marks: SubjectMark[]): Tabulation {
  const units = combineUnits(marks);
  const subjects = units.map((m) => ({ ...m, ...gradeForSubject(m) }));
  const compulsory = subjects.filter((s) => !s.isOptional);
  const optional = subjects.filter((s) => s.isOptional);

  const incomplete = compulsory.some((s) => s.total === null && !s.absent);
  const failed = compulsory.filter((s) => s.letter === 'F').map((s) => s.subjectName);

  if (incomplete) return { gpa: null, letter: '-', failed, incomplete, subjects };
  if (!compulsory.length) return { gpa: null, letter: '-', failed, incomplete: true, subjects };
  if (failed.length) return { gpa: 0, letter: 'F', failed, incomplete: false, subjects };

  const total = compulsory.reduce((t, s) => t + s.point, 0);
  const bonus = optional.reduce((t, s) => t + Math.max(0, s.point - 2), 0);
  const gpa = Math.min(MAX_GPA, (total + bonus) / compulsory.length);
  const rounded = Math.round(gpa * 100) / 100;

  return {
    gpa: rounded,
    letter: letterForGpa(rounded),
    failed: [],
    incomplete: false,
    subjects,
  };
}

/**
 * What a result adds up to, and what it is out of.
 *
 * ONE rule for every sheet, because the alternative was shipped and found: the
 * GPA treats a result as finished once every COMPULSORY subject is marked —
 * a student takes one 4th subject, not every optional one the class offers —
 * while the total demanded all of them and printed a dash. A sheet showed
 * "GPA 4.33" beside "Total —", which reads as a bug in the arithmetic.
 *
 * So the total is withheld on exactly the same test as the GPA, and an
 * optional subject with no mark is left out of BOTH sides: counting its full
 * marks against a student who never sat it would read as a zero.
 */
export function marksTotal(
  subjects: Pick<SubjectMark, 'marks' | 'fullMarks' | 'absent' | 'isOptional'>[],
): { obtained: number | null; outOf: number } {
  const counted = subjects.filter((s) => !s.isOptional || s.marks !== null || s.absent);
  const missing = counted.some((s) => !s.isOptional && s.marks === null && !s.absent);
  return {
    obtained: missing
      ? null
      : counted.reduce((t, s) => t + (s.absent ? 0 : s.marks ?? 0), 0),
    outOf: counted.reduce((t, s) => t + s.fullMarks, 0),
  };
}

/** The overall letter, from the GPA rather than from any one subject. */
export function letterForGpa(gpa: number): string {
  if (gpa >= 5) return 'A+';
  if (gpa >= 4) return 'A';
  if (gpa >= 3.5) return 'A-';
  if (gpa >= 3) return 'B';
  if (gpa >= 2) return 'C';
  if (gpa >= 1) return 'D';
  return 'F';
}

export const gpaText = (gpa: number | null) => (gpa === null ? '—' : gpa.toFixed(2));
