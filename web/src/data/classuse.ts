/**
 * Whether a class or section may be removed, and what is in the way.
 *
 * REMOVING IS FOR MISTAKES. A section typed twice, a "Class 8 - A" that was
 * meant to be "Class 8 - B", a trial section nobody ever used. A class that
 * has taught anybody is not a mistake, and taking it out would leave its
 * students pointing at a class that is not there, its marks unattributable
 * and its register unreadable — which is exactly the state this app was in
 * tonight, with six attendance marks against a student who no longer
 * existed.
 *
 * So a class that is in use cannot be removed at all. It is RETIRED instead
 * ("In use" off), which every listing already filters while every old record
 * keeps working. The two are not alternatives offered for taste: retiring is
 * what a real class gets at the end of its life, and removing is for
 * something that should never have existed.
 *
 * This file has a twin: android/.../data/ClassUse.kt.
 */

/** What still points at a class, by its id. */
export type ClassUse = {
  /** Every student on that classId, INCLUDING those who have left. */
  students: number;
  results: number;
  /** Attendance marks. */
  attendance: number;
  /** Entries in any exam routine. */
  routine: number;
};

export type Removal =
  | { ok: true; warning: string }
  | { ok: false; reason: string; retire: boolean };

const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * May this class be removed?
 *
 * `lastOfItsName` is true when no other section carries the same class name.
 * Subjects list the class NAMES they are taught in, and fee rates are set per
 * class name, so removing the last section of "Class 8" leaves both naming a
 * class that has no sections. That is untidy rather than broken — the names
 * are still true the moment another section is added — so it warns instead of
 * refusing.
 */
export function canRemoveClass(use: ClassUse, lastOfItsName: boolean): Removal {
  const blocking: string[] = [];
  if (use.students > 0) blocking.push(count(use.students, 'student', 'students'));
  if (use.results > 0) blocking.push(count(use.results, 'result', 'results'));
  if (use.attendance > 0) blocking.push(count(use.attendance, 'attendance mark', 'attendance marks'));
  if (use.routine > 0) blocking.push(count(use.routine, 'exam routine entry', 'exam routine entries'));

  if (blocking.length) {
    return {
      ok: false,
      retire: true,
      reason: `This section still has ${sentence(blocking)}. Removing it would leave `
        + 'them pointing at a section that is not there. Turn "In use" off instead: '
        + 'it disappears from every list, and the records it holds keep working.',
    };
  }

  return {
    ok: true,
    warning: lastOfItsName
      ? 'This is the only section of its class. The subjects taught in it, and any '
        + 'fee rates set for it, name the class rather than the section, so they will '
        + 'be left naming a class with no sections until another one is added.'
      : '',
  };
}

/** "a, b and c" — because "3 students, 2 results" reads like a table, not a sentence. */
function sentence(parts: string[]): string {
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Nothing points at it: the shape of an unused class, for callers to build on. */
export const UNUSED: ClassUse = { students: 0, results: 0, attendance: 0, routine: 0 };
