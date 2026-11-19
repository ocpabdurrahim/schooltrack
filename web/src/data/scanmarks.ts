/**
 * Reading a photographed mark sheet, and deciding how much of it to believe.
 *
 * A subject teacher fills a paper form — Roll, CQ, MCQ, Prac, Total, three
 * blocks of rolls to a page — signs it and hands it in. This file turns what a
 * reader made of that photograph into the same boxes the mark entry grid has
 * always had, and refuses the rest.
 *
 * NOTHING HERE WRITES. The screen shows what was read, the problems are named
 * beside the rows they belong to, a person corrects them, and the marks are
 * saved by the same saveResults() the typed grid uses. A scan with its own
 * write path would be a second set of rules to get wrong.
 *
 * Three ideas carry the weight:
 *
 *   THE TOTAL IS A CHECKSUM, never a mark. The app computes a subject total
 *   from its parts and always has. The number the teacher wrote in the Total
 *   column is therefore free evidence: when CQ + MCQ does not come to it, one
 *   of the three was misread and the row is held back rather than guessed at.
 *
 *   THE HEADER IS EVIDENCE TOO. A sheet headed "Ten" applied to Class 9 would
 *   hand twenty-one children someone else's marks, and every roll would match,
 *   so nothing downstream would notice. The class and the subject written on
 *   the paper are compared with the ones chosen in the app, and a disagreement
 *   stops the whole sheet.
 *
 *   A BLANK BOX IS NOT A ZERO. Most of a sheet is empty — those students were
 *   absent, or their scripts are in another pile. An empty row is skipped
 *   entirely. It must never arrive as a zero, which is a mark, and a failing
 *   one.
 *
 * This file has a twin: android/.../data/ScanMarks.kt.
 */

import type { Component } from './grading';
import type { Typed } from './markentry';
import { UNRANKED, subjectRank } from './subjectorder';

// ---------------------------------------------------------------------------
// what a reader hands back

/** The header of the sheet, as read. Any field may be blank: it was a photo. */
export type ScanHeader = {
  exam: string;
  year: string;
  className: string;
  subject: string;
};

/** One row of the sheet: a roll, and whatever was written across from it. */
export type ScanRow = {
  roll: number | null;
  /** Keyed by the column heading as printed — CQ, MCQ, Prac, Total. */
  values: Record<string, number | null>;
};

export type ScanRead = { header: ScanHeader; rows: ScanRow[] };

/** The column every form carries, which is checked and then thrown away. */
export const TOTAL_COLUMN = 'TOTAL';

// ---------------------------------------------------------------------------
// matching what is printed to what the app holds

/** Letters and digits only, upper case: "Prac." and "prac" are one column. */
export const normalColumn = (raw: string) =>
  raw.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');

/**
 * The component a printed column means.
 *
 * Prefix matching in both directions, because a column heading is abbreviated
 * to fit the paper while the component is not: the form says "Prac" and the
 * subject says "PRACTICAL". It is not fuzzy beyond that — "CQ" will never
 * match "MCQ", since neither is a prefix of the other.
 */
export function matchComponent(column: string, components: Component[]): Component | null {
  const c = normalColumn(column);
  if (c === '' || c === TOTAL_COLUMN) return null;
  const exact = components.find((x) => normalColumn(x.name) === c);
  if (exact) return exact;
  return components.find((x) => {
    const n = normalColumn(x.name);
    return n.startsWith(c) || c.startsWith(n);
  }) ?? null;
}

const WORDS: Record<string, number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6,
  SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10, ELEVEN: 11, TWELVE: 12,
};

/**
 * The class a written name means, or null.
 *
 * A teacher writes "Ten" where the app says "Class 10 - A", so digits alone
 * would find nothing and a letter comparison would find nothing either. The
 * section letter is deliberately ignored: no teacher writes it, and a sheet
 * for the wrong SECTION of the right class is caught by the roll numbers.
 */
export function classNumber(raw: string): number | null {
  const digits = raw.match(/\d+/);
  if (digits) return Number(digits[0]);
  const word = raw.trim().toUpperCase().replace(/[^A-Z]+/g, '');
  return WORDS[word] ?? null;
}

/**
 * Whether a written subject name is the chosen subject.
 *
 * The order rule already knows that "History" and "HISTORY OF BANGLADESH AND
 * WORLD CIVILIZATION" are one paper, so it does this job for free and stays
 * the only place that knowledge lives. Papers it does not know fall back to a
 * prefix comparison.
 */
export function sameSubject(written: string, chosen: string): boolean {
  const a = normalColumn(written);
  const b = normalColumn(chosen);
  if (a === '' || b === '') return false;
  if (a === b || a.startsWith(b) || b.startsWith(a)) return true;
  const ra = subjectRank({ subjectId: written, subjectName: written });
  const rb = subjectRank({ subjectId: chosen, subjectName: chosen });
  return ra !== UNRANKED && ra === rb;
}

// ---------------------------------------------------------------------------
// the verdict

export type Level = 'OK' | 'WARN' | 'STOP';

/** Something found about the sheet as a whole. STOP means nothing is filled. */
export type Finding = { level: Level; message: string };

export type ScannedRow = {
  /**
   * Where this came from in what was read, so a correction made on screen
   * goes back to the right line. Matching on the roll instead would not do:
   * the rows that most need correcting are the ones whose roll was misread.
   */
  index: number;
  rollNo: number | null;
  studentId: string | null;
  studentName: string;
  /** What goes in the boxes, by component name. Empty string: not entered. */
  parts: Record<string, string>;
  /** The whole-paper mark, for a subject marked without parts. */
  marks: string;
  /** The total the teacher wrote. Checked, then thrown away. */
  written: number | null;
  /** The total the app makes of the parts, which is what will be stored. */
  computed: number | null;
  /** Not empty: this row is held back and nothing is filled from it. */
  problem: string;
  /** Not empty: it will be filled, but it is worth a look. */
  note: string;
};

export type ScanCheck = {
  /** Keyed by studentId, shaped like the grid the mark screen already holds. */
  entries: Record<string, Typed>;
  /** Every row that had anything written on it, in roll order. */
  rows: ScannedRow[];
  /** What was found about the sheet itself: the header, mostly. */
  findings: Finding[];
  /** Rows that will fill a box. */
  filled: number;
  /** Rows held back for a person to settle. */
  held: number;
};

export type Student = { studentId: string; rollNo: number; fullName: string };

export type Chosen = {
  /** The section as the app names it, e.g. "Class 10 - A". */
  sectionName: string;
  className: string;
  subjectName: string;
  examName: string;
  fullMarks: number;
  components: Component[];
};

/** The sheet's header against what was picked in the app. */
export function headerFindings(header: ScanHeader, chosen: Chosen): Finding[] {
  const out: Finding[] = [];

  const onPaper = classNumber(header.className);
  const picked = classNumber(chosen.className);
  if (header.className.trim() === '') {
    out.push({ level: 'WARN', message: 'No class name could be read off the sheet.' });
  } else if (onPaper === null || picked === null) {
    out.push({
      level: 'WARN',
      message: `The sheet says "${header.className.trim()}" and you chose `
        + `${chosen.sectionName}. Check they are the same class.`,
    });
  } else if (onPaper !== picked) {
    // The dangerous one. Class 9 and Class 10 both have a roll 3, so every
    // roll on a Class 10 sheet matches in Class 9 and nothing further down
    // would notice.
    out.push({
      level: 'STOP',
      message: `This sheet is for class ${onPaper}, but you chose ${chosen.sectionName}. `
        + 'Every roll number would still match, so the marks would go to the wrong '
        + 'children. Pick the right section, or use the right sheet.',
    });
  }

  if (header.subject.trim() === '') {
    out.push({ level: 'WARN', message: 'No subject could be read off the sheet.' });
  } else if (!sameSubject(header.subject, chosen.subjectName)) {
    out.push({
      level: 'STOP',
      message: `This sheet is headed "${header.subject.trim()}", but you chose `
        + `${chosen.subjectName}.`,
    });
  }

  // The exam is chosen on the paper by striking out three of four words, which
  // is the one field a reader should not be trusted on. It is reported, never
  // enforced.
  if (header.exam.trim() !== '' && !looksLikeExam(header.exam, chosen.examName)) {
    out.push({
      level: 'WARN',
      message: `The sheet reads "${header.exam.trim()}" where you chose ${chosen.examName}. `
        + 'The exam is struck out by hand on the form, so this is often misread — '
        + 'check it yourself before saving.',
    });
  }

  return out;
}

/** Loose on purpose: see the note in headerFindings. */
export function looksLikeExam(written: string, chosen: string): boolean {
  const a = normalColumn(written);
  const b = normalColumn(chosen);
  if (a === '' || b === '') return false;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  // "HALFYEARLY" inside "HALFYEARLYEXAM2026", either way round.
  return a.includes(b) || b.includes(a);
}

// ---------------------------------------------------------------------------

const asText = (n: number | null) => (n === null ? '' : String(n));

/**
 * The whole sheet, checked.
 *
 * Rows arrive in whatever order the reader found them and leave in roll order,
 * because that is the order of the paper and the order a person checking the
 * two side by side will want.
 */
export function checkScan(read: ScanRead, students: Student[], chosen: Chosen): ScanCheck {
  const findings = headerFindings(read.header, chosen);
  const stopped = findings.some((f) => f.level === 'STOP');

  const byRoll = new Map<number, Student>();
  for (const s of students) if (!byRoll.has(s.rollNo)) byRoll.set(s.rollNo, s);

  const seen = new Set<number>();
  const rows: ScannedRow[] = [];

  read.rows.forEach((raw, index) => {
    const row = checkRow(raw, index, byRoll, chosen);
    if (row === null) return;               // nothing was written on this line
    if (row.rollNo !== null) {
      if (seen.has(row.rollNo) && row.problem === '') {
        row.problem = `Roll ${row.rollNo} appears twice on what was scanned.`;
      }
      seen.add(row.rollNo);
    }
    rows.push(row);
  });

  rows.sort((a, b) => (a.rollNo ?? Number.MAX_SAFE_INTEGER) - (b.rollNo ?? Number.MAX_SAFE_INTEGER));

  const entries: Record<string, Typed> = {};
  if (!stopped) {
    for (const r of rows) {
      if (r.problem !== '' || r.studentId === null) continue;
      entries[r.studentId] = { marks: r.marks, parts: { ...r.parts }, absent: false };
    }
  }

  return {
    entries,
    rows,
    findings,
    filled: Object.keys(entries).length,
    held: rows.filter((r) => r.problem !== '').length,
  };
}

/** One line. Null when the line held nothing at all. */
function checkRow(
  raw: ScanRow,
  index: number,
  byRoll: Map<number, Student>,
  chosen: Chosen,
): ScannedRow | null {
  const values = raw.values ?? {};

  // The total is pulled out first: it is a column on the paper but never a
  // mark, and leaving it among the others would have it matched to a part.
  let written: number | null = null;
  const columns: [string, number | null][] = [];
  for (const [name, v] of Object.entries(values)) {
    if (normalColumn(name) === TOTAL_COLUMN) written = v;
    else columns.push([name, v]);
  }

  const anyValue = written !== null || columns.some(([, v]) => v !== null);
  if (!anyValue && raw.roll === null) return null;
  if (!anyValue) return null;               // a printed roll with an empty line

  const student = raw.roll === null ? undefined : byRoll.get(raw.roll);
  const row: ScannedRow = {
    index,
    rollNo: raw.roll,
    studentId: student?.studentId ?? null,
    studentName: student?.fullName ?? '',
    parts: {},
    marks: '',
    written,
    computed: null,
    problem: '',
    note: '',
  };

  if (raw.roll === null) {
    row.problem = 'No roll number could be read for this row.';
  } else if (!student) {
    row.problem = `Roll ${raw.roll} is not in this section.`;
  }

  const comps = chosen.components;

  if (comps.length === 0) {
    // A paper marked whole. The Total column IS the mark; there is nothing to
    // check it against, which is exactly why the form has part columns.
    const loose = columns.find(([, v]) => v !== null);
    const mark = written ?? loose?.[1] ?? null;
    row.marks = asText(mark);
    row.computed = mark;
    if (mark !== null && mark > chosen.fullMarks) {
      row.problem = row.problem
        || `${mark} is more than the ${chosen.fullMarks} this paper is out of.`;
    }
    if (written === null && loose) {
      row.note = 'Read from a part column: this paper is marked as one mark, with no parts.';
    }
    return row;
  }

  // Parts. A column the subject has no component for is a problem, not a
  // thing to ignore: a Prac written against History means the sheet and the
  // subject disagree, and the teacher should be told rather than have it
  // quietly dropped.
  let sum = 0;
  let got = 0;
  for (const [name, v] of columns) {
    if (v === null) continue;
    const comp = matchComponent(name, comps);
    if (!comp) {
      row.problem = row.problem
        || `${chosen.subjectName} has no "${name}" — it is marked ${compList(comps)}.`;
      continue;
    }
    if (v > comp.max) {
      row.problem = row.problem || `${comp.name} ${v} is over the ${comp.max} it is out of.`;
      continue;
    }
    if (v < 0) {
      row.problem = row.problem || `${comp.name} cannot be ${v}.`;
      continue;
    }
    row.parts[comp.name] = String(v);
    sum += v;
    got += 1;
  }

  row.computed = got === 0 ? null : sum;

  if (got === 0) {
    if (written !== null && comps.length === 1) {
      // One part and a total: they are the same number by definition, so a
      // teacher who filled only the Total has still said everything.
      row.parts[comps[0].name] = String(written);
      row.computed = written;
      row.note = `Taken as ${comps[0].name}: this paper has only that one part.`;
      if (written > comps[0].max) {
        row.problem = `${comps[0].name} ${written} is over the ${comps[0].max} it is out of.`;
      }
    } else if (written !== null) {
      row.problem = row.problem
        || `Only a total was written. ${chosen.subjectName} is marked `
        + `${compList(comps)}, and a total cannot be split back into those.`;
    }
    return row;
  }

  // The checksum.
  if (written === null) {
    row.note = row.note || 'No total was written, so there is nothing to check the parts against.';
  } else if (written !== sum) {
    row.problem = row.problem
      || `The parts come to ${sum}, but the total written is ${written}. `
      + 'One of the three was misread, or the addition on the paper is wrong.';
  }

  if (got < comps.length && row.problem === '') {
    const missing = comps.filter((c) => row.parts[c.name] === undefined).map((c) => c.name);
    row.note = row.note
      || `Nothing written for ${missing.join(' or ')}; left empty, not zero.`;
  }

  return row;
}

const compList = (comps: Component[]) =>
  comps.map((c) => `${c.name} out of ${c.max}`).join(' + ');
