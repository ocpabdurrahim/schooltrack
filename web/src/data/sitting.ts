/**
 * Which class and roll a student sat an exam under.
 *
 * A result row stores classId and rollNo AS ENTERED — that is what makes
 * moving a class up safe, because last year's marks keep pointing at last
 * year's class. The reports did not read them. They printed the student's
 * CURRENT class instead, so an Annual 2026 result sat in Class 9 appeared
 * under "Class 10 - A" the moment the student was promoted: the right marks
 * under the wrong heading, which is worse than no heading at all, because a
 * parent has no way to tell.
 *
 * So the heading comes from the marks themselves. Nothing here reads the
 * student record at all.
 *
 * This file has a twin: android/.../data/Sitting.kt.
 */

/** What a result row carries about where it was entered. */
export type Entered = { classId: string; rollNo: number };

export type Sitting = {
  classId: string;
  rollNo: number;
  /**
   * False when the marks for this exam do not all agree.
   *
   * It happens: a mark entered before the class was moved up and another
   * entered after it carry different classIds for the same exam. The
   * commonest wins, and a caller that cares can say so rather than print one
   * of two answers as though it were the only one.
   */
  agreed: boolean;
};

/**
 * Where these marks were entered, or null if they do not say.
 *
 * Marks with no classId are IGNORED rather than treated as their own answer:
 * a row stored before the field existed is missing information, not evidence
 * of a different class. When none of them say anything the answer is null,
 * and the caller falls back to whatever it knew before.
 */
export function satAs(marks: readonly Entered[]): Sitting | null {
  const said = marks.filter((m) => (m.classId ?? '').trim() !== '');
  if (!said.length) return null;

  const counts = new Map<string, Entered & { n: number }>();
  for (const m of said) {
    const key = `${m.classId}\u0000${m.rollNo}`;
    const seen = counts.get(key);
    if (seen) seen.n += 1;
    else counts.set(key, { classId: m.classId, rollNo: m.rollNo, n: 1 });
  }

  // Commonest first, then by class and roll so that a tie is settled the same
  // way every time rather than by whichever mark happened to be read first.
  const [best] = [...counts.values()].sort(
    (a, b) => b.n - a.n
      || a.classId.localeCompare(b.classId)
      || a.rollNo - b.rollNo,
  );
  return { classId: best.classId, rollNo: best.rollNo, agreed: best.n === said.length };
}

/**
 * The name to print for a sitting, given the classes the school has.
 *
 * Falls back to the name the caller already had — the student's current class
 * — ONLY when the marks said nothing. A class that was named and has since
 * been deleted gives an empty string instead, because naming it after some
 * other class is the exact mistake this file exists to stop.
 */
export function sittingName(
  sat: Sitting | null,
  classes: readonly { classId: string; displayName: string }[],
  fallback: string,
): string {
  if (!sat) return fallback;
  return classes.find((c) => c.classId === sat.classId)?.displayName ?? '';
}
