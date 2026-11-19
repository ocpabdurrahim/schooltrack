/**
 * What a reset clears and what it keeps.
 *
 * Kept apart from the script that does the deleting, and with no Firebase in
 * it, so the one decision that matters — which collections survive — can be
 * read in one screen and tested without a database.
 *
 * TWO RULES SHAPE THIS LIST.
 *
 * The first is that you must still be able to get in afterwards. `members`
 * holds the only grant of access there is: signing in gives nothing by itself
 * (see firebase/firestore.rules §2), so a reset that cleared it would lock the
 * school out of its own app with no way back except a service account.
 *
 * The second is that anything NOT named here is CLEARED. A collection added
 * next year and forgotten about should fail by being wiped on a wipe, not by
 * quietly surviving one — a "clean" database with last year's records still in
 * a corner is worse than no reset at all. The script prints every collection
 * it found, under the heading it has put it, before touching anything.
 */

/**
 * Kept by every mode: who the school is, who may get in, and the keys.
 *
 * `integrations` is the Gemini API key. It belongs to the school, it costs
 * money, and re-pasting it is a nuisance rather than a safeguard.
 */
export const ALWAYS_KEPT = ['members', 'settings', 'integrations'];

/**
 * Also kept by `--records`: the school's shape rather than its history.
 *
 * This is the "it is July and last year is over" reset. The classes, the
 * subjects, what things cost and who teaches stay; the children, their marks,
 * their attendance and their money go.
 *
 * `staff` and `salaryStructure` travel together on purpose. A pay scale
 * without the person it belongs to is a row nobody can read.
 */
export const SETUP = [
  'classes',
  'subjects',
  'feeHeads',
  'feeStructure',
  'expenseHeads',
  'holidays',
  'staff',
  'salaryStructure',
];

export const MODES = ['all', 'records'];

/**
 * Which of the collections that actually exist get cleared, and which stay.
 *
 * Takes the collection names FOUND IN THE DATABASE rather than a list written
 * here, so a collection this file has never heard of still shows up in the
 * plan instead of being skipped in silence.
 */
export function planFor(found, mode) {
  if (!MODES.includes(mode)) throw new Error(`unknown mode: ${mode}`);
  const kept = mode === 'records' ? [...ALWAYS_KEPT, ...SETUP] : ALWAYS_KEPT;
  const names = [...found].sort();
  return {
    mode,
    clear: names.filter((n) => !kept.includes(n)),
    keep: names.filter((n) => kept.includes(n)),
    /** Named here but not in the database: nothing to do, and worth saying. */
    missing: kept.filter((n) => !names.includes(n)).sort(),
  };
}

/**
 * The confirmation. The school's own name, typed, exactly.
 *
 * Not "yes" and not "y": the point is to be a sentence you cannot produce by
 * leaning on the keyboard, and one that names WHICH school is about to be
 * emptied. Case and surrounding space are forgiven because they are typing
 * slips, not doubts about intent.
 */
export function confirms(typed, schoolName) {
  if (typeof typed !== 'string' || typeof schoolName !== 'string') return false;
  const tidy = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  return tidy(schoolName) !== '' && tidy(typed) === tidy(schoolName);
}

/**
 * How the command line was meant.
 *
 * Deleting is never the default. With no flags this is a dry run, because the
 * first thing anybody does with an unfamiliar script is run it to see what it
 * says, and that must not be the thing that empties the school.
 */
export function readArgs(argv) {
  const args = argv.slice(2);
  const unknown = args.filter(
    (a) => !['--wipe', '--records', '--restore', '--help', '-h'].includes(a)
      && !a.startsWith('--restore='),
  );
  const restore = args.find((a) => a === '--restore' || a.startsWith('--restore='));
  return {
    wipe: args.includes('--wipe'),
    mode: args.includes('--records') ? 'records' : 'all',
    restore: restore ? (restore.split('=')[1] ?? '') : null,
    help: args.includes('--help') || args.includes('-h'),
    unknown,
  };
}
