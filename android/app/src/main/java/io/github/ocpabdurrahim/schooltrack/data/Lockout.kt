package io.github.ocpabdurrahim.schooltrack.data

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
 * This file has a twin: web/src/data/lockout.ts.
 */

data class Lockout(val atRisk: Boolean, val admins: Int, val warning: String)

/** Administrators who can actually sign in today. */
fun activeAdmins(members: List<MemberRow>) =
    members.count { it.role == "ADMIN" && it.active }

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
fun lockoutRisk(members: List<MemberRow>): Lockout {
    val admins = activeAdmins(members)
    if (admins >= 2) return Lockout(false, admins, "")

    if (admins == 0) {
        return Lockout(
            true, admins,
            "No active administrator. Nobody can change who signs in, " +
                "including this list. Make somebody an administrator now.",
        )
    }

    return Lockout(
        true, admins,
        "Only one administrator. If that account is lost, locked or " +
            "forgotten, nobody can get into this school and nobody can grant " +
            "access either — the records would need a service-account key to " +
            "reach. Add a second administrator you trust, such as the head " +
            "teacher.",
    )
}
