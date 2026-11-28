/**
 * One cell of the tabulation sheet, in two tiers.
 *
 * A tabulation cell used to say "68 F", which is true and useless: the sheet
 * showed a passing-looking mark beside a fail and gave no way to see why. The
 * reason is always a PART — 60 in CQ and 8 in MCQ is 68 out of 100 and still
 * F, because the MCQ pass mark is 10 (grading.ts). The marks that explain the
 * letter were entered, stored and then thrown away at the last step.
 *
 * So the cell is split. The upper tier carries the parts, small, in the order
 * the paper is marked in; the lower tier carries the subject total and its
 * letter. One cell, one subject, nothing hidden:
 *
 *        50  22  20          <- the parts, small
 *          92   A+           <- the total and the grade
 *
 * Four things still have to look different from each other, which is the
 * whole difficulty of this cell: a mark, a mark not entered yet, a subject
 * half entered (the two Bangla papers are ONE subject out of 200), and a
 * paper this student does not sit at all. The last is not here — a cell with
 * no subject is a dot, drawn by the sheet.
 *
 * This file has a twin: android/.../data/CellParts.kt.
 */

import type { SubjectGrade, SubjectMark } from './grading';
import { enteredSoFar, partGroups, partLabel } from './grading';

/** A mark as a sheet prints it: 50, not 50.0, and 50.5 kept. */
export const fmtMark = (n: number): string =>
  Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);

export type PartBit = {
  /** The part's own name, without the paper in front of it: "CQ", "MCQ". */
  label: string;
  /** The mark, or an en dash for a part nobody has entered yet. */
  text: string;
  /**
   * Below ITS OWN pass mark — the fact that explains an F with a high total.
   *
   * Set on an entered part even when the subject as a whole has no total yet.
   * The subject is not being judged (it still shows a dash below); this part
   * is finished and it did fail, and a teacher is better off seeing that
   * while the rest of the marks are still coming in than after.
   */
  failed: boolean;
  /**
   * The first part of a paper after the first one, in a subject that is
   * several papers graded as one. The sheet draws a thin gap there, so that
   * four numbers read as 1st Paper and 2nd Paper rather than as one run.
   */
  opensPaper: boolean;
};

export type CellText = {
  /** The upper tier. Empty for a paper that is not marked in parts. */
  parts: PartBit[];
  /** The lower tier's figure: "abs", a total, "(50)" part-way, or a dash. */
  main: string;
  /** The letter, or '' when there is no grade to show yet. */
  letter: string;
  /** True when `main` is a part-way figure rather than a total. */
  provisional: boolean;
};

const NOT_ENTERED = '–';
const NO_TOTAL = '—';

/** The part's name with its paper stripped off: "Bangla 1st Paper MCQ" -> "MCQ". */
export { partLabel };

/**
 * The parts, in the order the paper is marked in.
 *
 * Empty when the paper is not marked in parts (English is one written paper
 * out of 100) and empty for an absent student, who has no parts to show —
 * the cell says "abs" and that is the whole of it.
 *
 * Empty too when NOTHING has been entered for the subject. A tier of dashes
 * says no more than the dash below it does, and a sheet opened halfway
 * through mark entry would otherwise be a field of them — the parts tier is
 * worth its height only once there is a part to put in it.
 */
export function partBits(m: SubjectMark): PartBit[] {
  if (m.absent || !m.components?.length) return [];
  const entered = m.components.some((c) => {
    const v = m.parts?.[c.name];
    return v !== null && v !== undefined && Number.isFinite(v);
  });
  if (!entered) return [];
  const out: PartBit[] = [];
  const failedGroups = new Set(
    partGroups(m).filter((g) => g.mark !== null && g.mark < g.pass).map((g) => g.label),
  );
  let paper: string | null | undefined;
  m.components.forEach((c, i) => {
    const v = m.parts?.[c.name];
    const got = v !== null && v !== undefined && Number.isFinite(v);
    out.push({
      label: partLabel(c.name, c.paper),
      text: got ? fmtMark(v as number) : NOT_ENTERED,
      // Judged on the GROUP, not this component: one paper under its own
      // half of the pass mark has not failed if the pair clears it together.
      failed: got && (failedGroups.has(partLabel(c.name, c.paper))),
      opensPaper: i > 0 && !!c.paper && c.paper !== paper,
    });
    paper = c.paper;
  });
  return out;
}

/**
 * The whole cell.
 *
 * `main` follows the sheet's existing rules exactly, and the parts tier is
 * why one of them can now be dropped: the bracketed "part of this is in"
 * figure is only reached when there are no parts to show instead of it, so
 * the same number is never printed twice in one cell.
 */
export function cellText(cell: SubjectMark & SubjectGrade): CellText {
  const parts = partBits(cell);
  if (cell.absent) return { parts, main: 'abs', letter: '', provisional: false };
  if (cell.total !== null) {
    return { parts, main: fmtMark(cell.total), letter: cell.letter, provisional: false };
  }
  const sofar = parts.length === 0 ? enteredSoFar(cell) : null;
  if (sofar !== null) {
    return { parts, main: `(${fmtMark(sofar)})`, letter: '', provisional: true };
  }
  return { parts, main: NO_TOTAL, letter: '', provisional: false };
}

/**
 * The parts spelled out, for a tooltip — the one place the part names fit.
 *
 * The paper is named only when the subject is more than one paper, because
 * "MCQ" twice over in a Bangla cell says nothing about which paper it is.
 */
export function partsTitle(m: SubjectMark): string {
  const bits = partBits(m);
  if (bits.length === 0) return '';
  const groups = partGroups(m);
  const papers = new Set((m.components ?? []).map((c) => c.paper ?? ''));
  const many = papers.size > 1;
  return (m.components ?? [])
    .map((c, i) => {
      const where = many && c.paper ? `${c.paper} ` : '';
      const out = `${where}${bits[i].label} ${bits[i].text}`;
      // The pass mark named is the one actually applied: for a unit of two
      // papers that is both halves together, not this paper's share.
      const group = groups.find((g) => g.label === bits[i].label);
      return bits[i].failed ? `${out} (below pass ${fmtMark(group?.pass ?? c.pass)})` : out;
    })
    .join(' · ');
}
