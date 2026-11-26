/**
 * Merit order: who is first, and why.
 *
 * GPA alone cannot order a section. Eighty-three students over seven grades
 * means a dozen share 4.00, and "equal first" twelve times over is not a merit
 * list — a school has to pin a notice on a wall with one name per line and be
 * able to answer a parent who asks why their child is below another.
 *
 * So the order is a CHAIN, and every rung of it is a rule the school already
 * uses:
 *
 *   1. the result must be finished      an incomplete result is not last,
 *                                       it is unranked (see sheetFor)
 *   2. GPA, highest first
 *   3. FEWER SUBJECTS FAILED first      only ever separates failures, since
 *                                       every passing student has failed none
 *   4. total marks, highest first
 *   5. the first paper of the school's order, highest first
 *                                       Bangla 1st Paper here -- see
 *                                       subjectorder.ts, whose first slot it
 *                                       is, matched across its spellings and
 *                                       its board code rather than by name
 *   6. the roll, lowest first
 *
 * Rung 6 ends it: a roll is unique within a section, so no two students can
 * stay level and every position is a single name. That is deliberate. The old
 * rule shared a position between equal GPAs and skipped the next (1, 2, 2, 4),
 * which is correct arithmetic and useless on a noticeboard.
 *
 * Rung 3 is the school's own rule for failures and it comes BEFORE marks on
 * purpose: a student who failed one paper is ahead of one who failed three,
 * whatever the two of them scored in total.
 *
 * This file has a twin: android/.../data/Merit.kt.
 */

/** Everything the order needs, and nothing else — so it can be tested flat. */
export type MeritKey = {
  /** Any compulsory mark still missing. Unranked, not last. */
  incomplete: boolean;
  /** Null only when incomplete, where it is never read. */
  gpa: number | null;
  /** How many compulsory subjects graded F. Zero for everyone who passed. */
  failed: number;
  /** The printed total, or null when the sheet withholds it. */
  total: number | null;
  /** The mark in the first paper of the school's order. Null if not sat. */
  firstPaper: number | null;
  /** The roll as the section numbers it. Unique, so it decides any tie. */
  rollNo: number;
};

/** A missing figure sorts below any real one, never above. */
const num = (n: number | null) => (n === null || !Number.isFinite(n) ? -1 : n);

/**
 * Negative when `a` comes first. The chain, in order.
 *
 * Deliberately total: feed it the same two keys twice and it answers the same
 * way, so a list sorted with it is the same list on the phone, in the browser
 * and on the sheet that was printed last week.
 */
export function compareMerit(a: MeritKey, b: MeritKey): number {
  if (a.incomplete !== b.incomplete) return a.incomplete ? 1 : -1;
  if (num(a.gpa) !== num(b.gpa)) return num(b.gpa) - num(a.gpa);
  if (a.failed !== b.failed) return a.failed - b.failed;
  if (num(a.total) !== num(b.total)) return num(b.total) - num(a.total);
  if (num(a.firstPaper) !== num(b.firstPaper)) {
    return num(b.firstPaper) - num(a.firstPaper);
  }
  return a.rollNo - b.rollNo;
}

/**
 * The position of each key, in the order they were handed in.
 *
 * Null for an incomplete result: a student whose maths mark has not been
 * entered is not last in the school, they are simply not finished, and
 * printing a number against them would be a lie that a correction then
 * silently changes.
 *
 * Two keys that compare equal share a position and the next one skips, which
 * the chain makes unreachable through rung 6 — it is kept because a rule that
 * depends on rolls being unique should say so by handling them not being.
 */
export function meritPositions(keys: readonly MeritKey[]): (number | null)[] {
  const order = keys
    .map((key, index) => ({ key, index }))
    .filter((k) => !k.key.incomplete)
    .sort((x, y) => compareMerit(x.key, y.key));

  const out: (number | null)[] = keys.map(() => null);
  let position = 0;
  order.forEach((k, i) => {
    if (i === 0 || compareMerit(order[i - 1].key, k.key) !== 0) position = i + 1;
    out[k.index] = position;
  });
  return out;
}
