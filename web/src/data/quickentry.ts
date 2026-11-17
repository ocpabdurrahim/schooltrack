/**
 * Subject-first mark entry: one subject, roll after roll.
 *
 * This is the APEX "Quick Mark Entry" page (SMS app 161019, page 13) as this
 * app does it, and it is the flow the office actually uses — pick the exam,
 * the section and the subject once, then type a roll, the marks, and Enter.
 * Nothing is chosen again until the bundle of scripts runs out.
 *
 * The point of this file is that the roll lookup is INSTANT. The whole
 * section's roster, and whatever is already stored for the chosen subject, is
 * read once and held here; typing a roll then resolves in memory rather than
 * over the network, which is the difference between keying in forty scripts
 * and waiting forty times.
 *
 * This file has a twin: android/.../data/QuickEntry.kt. The same test cases
 * are written against both.
 */

import { type ResultRow, type Subject, subjectMarkFor } from './exams';
import { type Parts, type SubjectGrade, type SubjectMark, gradeForSubject } from './grading';
import { type Typed, blankTyped, numOrNull, partsAndTotal, typedFrom } from './markentry';

/** What the roster needs to know about a student. */
export type RosterStudent = {
  studentId: string;
  rollNo: number;
  fullName: string;
  className: string;
};

/** One student on the loaded roster, with whatever is already stored. */
export type RosterRow = {
  studentId: string;
  rollNo: number;
  fullName: string;
  className: string;
  /** Does this student's class sit the chosen subject? */
  takes: boolean;
  /** What is stored for them, as text, ready for the boxes. */
  typed: Typed;
  /** True once this subject has been entered for this student. */
  stored: boolean;
  /** When it was last saved, epoch ms — null when nothing says. */
  savedAt: number | null;
};

/** Keyed by roll number as text, exactly as it is typed. */
export type Roster = Record<string, RosterRow>;

const anyPart = (parts: Parts | null | undefined): boolean =>
  Object.values(parts ?? {}).some((v) => v !== null && v !== undefined);

/**
 * Has this subject actually been entered for this student?
 *
 * A row can exist and still say nothing — clearing a mark typed by mistake
 * leaves one behind — so the test is whether it carries a mark, a part or an
 * absence. One rule, used both when the roster is read and after a save, so
 * the entered list and the "12 of 78" count can never disagree.
 */
export function hasEntry(row: Pick<ResultRow, 'marks' | 'absent' | 'parts'>): boolean {
  return row.marks !== null || row.absent || anyPart(row.parts);
}

/**
 * The roster for one section and one subject.
 *
 * Every student in the section is included, even one who does not sit the
 * subject: a roll that exists but should not be marked has to be told apart
 * from a roll that was mistyped, and that is only possible if both are here.
 */
export function buildRoster(
  students: RosterStudent[],
  subject: Pick<Subject, 'subjectId' | 'classNames'>,
  marks: ResultRow[],
): Roster {
  const mine = new Map<string, ResultRow>();
  for (const m of marks) {
    if (m.subjectId === subject.subjectId) mine.set(m.studentId, m);
  }

  const out: Roster = {};
  for (const s of students) {
    const got = mine.get(s.studentId);
    out[String(s.rollNo)] = {
      studentId: s.studentId,
      rollNo: s.rollNo,
      fullName: s.fullName,
      className: s.className,
      takes: (subject.classNames ?? []).includes(s.className),
      typed: got ? typedFrom(got.marks, got.parts, got.absent) : blankTyped(),
      stored: !!got && hasEntry(got),
      savedAt: got?.updatedAt ?? null,
    };
  }
  return out;
}

/** What typing a roll turned up. */
export type Lookup =
  | { kind: 'blank' }
  | { kind: 'notFound'; roll: string }
  | { kind: 'notTaken'; row: RosterRow }
  | { kind: 'found'; row: RosterRow };

/**
 * The student behind a typed roll.
 *
 * "007" finds roll 7: the roll is a number, and an operator padding it should
 * not be told the student does not exist.
 */
export function lookupRoll(roster: Roster, roll: string): Lookup {
  const key = roll.trim();
  if (key === '') return { kind: 'blank' };

  const n = Number(key);
  const row = roster[key] ?? (Number.isFinite(n) ? roster[String(n)] : undefined);
  if (!row) return { kind: 'notFound', roll: key };
  if (!row.takes) return { kind: 'notTaken', row };
  return { kind: 'found', row };
}

/**
 * A mark box as the operator is allowed to leave it: digits, and one dot for
 * the half marks some papers carry. Everything else is dropped as it is typed,
 * so a stray letter never reaches the grading engine to be read as a zero.
 */
export function cleanMark(raw: string): string {
  const kept = raw.replace(/[^\d.]/g, '');
  const dot = kept.indexOf('.');
  if (dot === -1) return kept;
  return kept.slice(0, dot + 1) + kept.slice(dot + 1).replace(/\./g, '');
}

/**
 * A box holding something impossible — not a number, negative, or above what
 * that part is out of. This is the condition that refuses to save.
 *
 * A mark BELOW the part's pass mark is not in here: failing is a real result,
 * and flagging it as a typing mistake would teach the operator to ignore the
 * flag that matters.
 */
export function fieldBad(max: number, raw: string): boolean {
  const v = raw.trim();
  if (v === '') return false;
  const n = numOrNull(v);
  return n === null || n < 0 || n > max;
}

/** The boxes this subject is marked in. Empty means one box for the paper. */
export function boxNames(subject: Pick<Subject, 'components'>): string[] {
  return (subject.components ?? []).map((c) => c.name);
}

/**
 * Where Enter goes from here: the next box, or null for "that was the last
 * one, save it". One keystroke per box and the row is away.
 */
export function nextBox(boxes: string[], current: string): string | null {
  const i = boxes.indexOf(current);
  if (i === -1 || i >= boxes.length - 1) return null;
  return boxes[i + 1];
}

/** The subject mark behind one student's boxes — what the grade is read from. */
export function markFor(subject: Subject, typed: Typed): SubjectMark {
  const { parts, marks } = partsAndTotal(subject, typed);
  return {
    ...subjectMarkFor(subject, null),
    marks,
    parts: parts ?? undefined,
    absent: typed.absent,
  };
}

/** One row for the entered-marks list under the boxes. */
export type LogRow = {
  rollNo: number;
  fullName: string;
  parts: Parts;
  total: number | null;
  grade: SubjectGrade;
  absent: boolean;
  savedAt: number | null;
};

/**
 * What has been entered for this subject so far, most recent first.
 *
 * Most recent first is the whole value of it: the operator's last few rows sit
 * at the top, where a mistyped mark is spotted while the script is still in
 * hand. Rows with no time known sink below, ordered by roll.
 */
export function enteredLog(roster: Roster, subject: Subject): LogRow[] {
  return Object.values(roster)
    .filter((r) => r.stored)
    .map((r) => {
      const mark = markFor(subject, r.typed);
      return {
        rollNo: r.rollNo,
        fullName: r.fullName,
        parts: mark.parts ?? {},
        total: mark.marks,
        grade: gradeForSubject(mark),
        absent: r.typed.absent,
        savedAt: r.savedAt,
      };
    })
    .sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0) || a.rollNo - b.rollNo);
}

/** How far through the section this subject is. */
export function progress(roster: Roster): { done: number; takes: number } {
  const rows = Object.values(roster).filter((r) => r.takes);
  return { done: rows.filter((r) => r.stored).length, takes: rows.length };
}

/**
 * The document to write for one student's boxes.
 *
 * Both apps build it here, so a mark keyed on a phone and the same mark keyed
 * in a browser produce the same document — down to the total, which is
 * computed, never typed.
 */
export function resultRowFor(
  examId: string,
  classId: string,
  subject: Subject,
  row: Pick<RosterRow, 'studentId' | 'rollNo'>,
  typed: Typed,
): ResultRow {
  const { parts, marks } = partsAndTotal(subject, typed);
  return {
    examId,
    studentId: row.studentId,
    subjectId: subject.subjectId,
    subjectName: subject.subjectName,
    marks,
    parts,
    absent: typed.absent,
    classId,
    rollNo: row.rollNo,
    fullMarks: subject.fullMarks,
    isOptional: subject.isOptional,
  };
}
