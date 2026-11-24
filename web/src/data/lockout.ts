/**
 * Can this school still be got into tomorrow?
 *
 * Access comes only from members/{email}, and only an ADMIN may write that
 * collection. So a school with ONE active administrator is one lost password,
 * one closed Google account or one person leaving away from nobody being able
 * to get in — and nobody being able to let anybody in either. The records are
 * still there; they are simply unreachable without a service-account key, by
 * hand, from a computer with the file on it.
 *
 * That is not a hypothetical. The live school ran this way for a fortnight:
 * one member, no guardians.
 *
 * This file has a twin: android/.../data/Lockout.kt.
 */

export type Who = { role: string; active?: boolean };

/** Administrators who can actually sign in today. */
export const activeAdmins = (members: readonly Who[]) =>
  members.filter((m) => m.role === 'ADMIN' && m.active !== false).length;

export type Lockout = { atRisk: boolean; admins: number; warning: string };

/**
 * The warning to show, if any.
 *
 * Only ever about ADMINS: a school with ten teachers and one administrator is
 * exactly as stuck, because a teacher cannot grant access.
 *
 * Deliberately not an error and not a blocker. A school that has just been
 * set up has one administrator for a few minutes, and shouting at somebody
 * mid-setup teaches them to ignore the thing that matters.
 */
export function lockoutRisk(members: readonly Who[]): Lockout {
  const admins = activeAdmins(members);
  if (admins >= 2) return { atRisk: false, admins, warning: '' };

  if (admins === 0) {
    return {
      atRisk: true,
      admins,
      warning: 'No active administrator. Nobody can change who signs in, '
        + 'including this list. Make somebody an administrator now.',
    };
  }

  return {
    atRisk: true,
    admins,
    warning: 'Only one administrator. If that account is lost, locked or '
      + 'forgotten, nobody can get into this school and nobody can grant '
      + 'access either — the records would need a service-account key to '
      + 'reach. Add a second administrator you trust, such as the head '
      + 'teacher.',
  };
}
