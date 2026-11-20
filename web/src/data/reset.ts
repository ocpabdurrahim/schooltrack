/**
 * Emptying the school from inside the app, to start a new one.
 *
 * There is a script for this too (tools/reset-school.mjs), and it stays: it
 * runs with the service account, from one computer, and can reach collections
 * the rules will never open. This is the same operation for somebody who does
 * not have a terminal.
 *
 * TWO THINGS MAKE IT DIFFERENT FROM THE SCRIPT, and both are in the rules.
 *
 * The first is that deleting is otherwise impossible here. Every
 * `allow write: ... && stamped()` refuses a delete, because a delete carries
 * no request.resource to stamp, and payments says outright that a receipt is
 * never deleted. A button that empties the school needs those opened.
 *
 * The second is how far they are opened: NOT permanently. An ADMIN arms the
 * reset, which writes settings/reset, and the rules allow deletes only while
 * that document says armed and is less than fifteen minutes old. Outside that
 * window the database is exactly as locked as it was before this feature
 * existed — a stray session, a bug in some future screen, or a stolen token
 * cannot delete a receipt, because arming is itself a deliberate write that
 * leaves a record.
 *
 * THE LIST BELOW IS WRITTEN OUT BY HAND, and that is the one thing to
 * remember when adding a collection. A browser cannot ask Firestore what
 * collections exist — listCollections() is the Admin SDK only — so a
 * collection that is not named here is simply not cleared, and the school
 * would start again with last year's records still in it. The script has no
 * such blind spot: it clears whatever it finds. Add new collections to both.
 *
 * This file has a twin: android/.../data/Reset.kt.
 */

/**
 * Every collection this app stores under a school.
 *
 * Kept in one place so the reset, and anybody auditing it, can see the whole
 * database at once.
 */
export const ALL_COLLECTIONS = [
  'attendance',
  'attendanceMarks',
  'classes',
  'counters',
  'discounts',
  'documents',
  'exams',
  'expenseHeads',
  'expenses',
  'feeHeads',
  'feeStructure',
  'guardians',
  'holidays',
  'integrations',
  'members',
  'payments',
  'results',
  'salaryPayments',
  'salaryStructure',
  'settings',
  'staff',
  'studentPhotos',
  'students',
  'subjects',
] as const;

/**
 * Kept by every mode: who the school is, who may get in, and the keys.
 *
 * `members` holds the only grant of access there is — signing in gives
 * nothing by itself — so a reset that cleared it would lock the school out of
 * its own app with no way back except a service account. `settings` carries
 * the school's name, which the confirmation is typed against, and the armed
 * flag this very reset runs on. `integrations` is the Gemini key: it belongs
 * to the school, it costs money, and re-pasting it is a nuisance rather than
 * a safeguard.
 */
export const ALWAYS_KEPT = ['members', 'settings', 'integrations'];

/**
 * Also kept by 'records': the school's shape rather than its history.
 *
 * The "it is July and last year is over" reset. The classes, the subjects,
 * what things cost and who teaches stay; the children, their marks, their
 * attendance and their money go.
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

export type ResetMode = 'all' | 'records';

export type Plan = { mode: ResetMode; clear: string[]; keep: string[] };

/** Which collections a mode clears, and which it leaves alone. */
export function planFor(mode: ResetMode): Plan {
  const kept = mode === 'records' ? [...ALWAYS_KEPT, ...SETUP] : ALWAYS_KEPT;
  const names = [...ALL_COLLECTIONS].sort();
  return {
    mode,
    clear: names.filter((n) => !kept.includes(n)),
    keep: names.filter((n) => kept.includes(n)),
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
export function confirms(typed: string, schoolName: string): boolean {
  const tidy = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  return tidy(schoolName) !== '' && tidy(typed) === tidy(schoolName);
}

/** How long the rules let deletes through once a reset is armed. */
export const ARMED_FOR_MINUTES = 15;
