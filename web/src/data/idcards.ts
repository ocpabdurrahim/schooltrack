/**
 * Laying ID cards out on a sheet.
 *
 * This is here, apart from the page, because getting it wrong is invisible
 * until a school has cut up ninety sheets of card: every back has to land
 * behind its OWN front, and nothing on screen tells you that it did.
 *
 * Web only. The phone shows one student's card at a time and never prints,
 * so there is no Kotlin twin to keep in step.
 */

export const PER_ROW = 3;      // 3 x 54mm + gaps fits A4 portrait at a 12mm margin
export const PER_SHEET = 9;    // 3 x 86mm + gaps fills it down the page

export function chunk<T>(rows: T[], size: number): T[][] {
  if (size < 1) throw new Error('chunk size must be at least 1');
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/**
 * One sheet of fronts, reordered for the backs.
 *
 * A duplex printer flipping on the long edge turns the page over left-to-
 * right, so each ROW must be reversed for a back to meet its front.
 *
 * The padding matters as much as the reversing: a final row of two, mirrored
 * without padding, would slide across and print under the wrong two fronts.
 * `null` is a blank card — a gap on the paper, exactly where the front side
 * has a gap too.
 */
export function mirrored<T>(sheet: T[], perRow = PER_ROW): (T | null)[] {
  const padded: (T | null)[] = [...sheet];
  while (padded.length % perRow !== 0) padded.push(null);
  return chunk(padded, perRow).flatMap((row) => [...row].reverse());
}
