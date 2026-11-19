package io.github.ocpabdurrahim.schooltrack.data

/**
 * Whether a class or section may be removed, and what is in the way.
 *
 * REMOVING IS FOR MISTAKES. A section typed twice, a "Class 8 - A" that was
 * meant to be "Class 8 - B", a trial section nobody ever used. A class that
 * has taught anybody is not a mistake, and taking it out would leave its
 * students pointing at a class that is not there, its marks unattributable
 * and its register unreadable.
 *
 * So a class that is in use cannot be removed at all. It is RETIRED instead
 * ("In use" off), which every listing already filters while every old record
 * keeps working. The two are not alternatives offered for taste: retiring is
 * what a real class gets at the end of its life, and removing is for
 * something that should never have existed.
 *
 * This file has a twin: web/src/data/classuse.ts.
 */

/** What still points at a class, by its id. */
data class ClassUse(
    /** Every student on that classId, INCLUDING those who have left. */
    val students: Int = 0,
    val results: Int = 0,
    /** Attendance marks. */
    val attendance: Int = 0,
    /** Entries in any exam routine. */
    val routine: Int = 0,
)

sealed interface Removal {
    data class Allowed(val warning: String) : Removal
    data class Refused(val reason: String, val retire: Boolean) : Removal
}

private fun count(n: Int, one: String, many: String) = "$n ${if (n == 1) one else many}"

/** "a, b and c" — because "3 students, 2 results" reads like a table, not a sentence. */
private fun sentence(parts: List<String>): String =
    if (parts.size == 1) parts[0]
    else parts.dropLast(1).joinToString(", ") + " and " + parts.last()

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
fun canRemoveClass(use: ClassUse, lastOfItsName: Boolean): Removal {
    val blocking = buildList {
        if (use.students > 0) add(count(use.students, "student", "students"))
        if (use.results > 0) add(count(use.results, "result", "results"))
        if (use.attendance > 0) add(count(use.attendance, "attendance mark", "attendance marks"))
        if (use.routine > 0) add(count(use.routine, "exam routine entry", "exam routine entries"))
    }

    if (blocking.isNotEmpty()) {
        return Removal.Refused(
            "This section still has ${sentence(blocking)}. Removing it would leave " +
                "them pointing at a section that is not there. Turn \"In use\" off instead: " +
                "it disappears from every list, and the records it holds keep working.",
            retire = true,
        )
    }

    return Removal.Allowed(
        if (lastOfItsName) {
            "This is the only section of its class. The subjects taught in it, and any " +
                "fee rates set for it, name the class rather than the section, so they will " +
                "be left naming a class with no sections until another one is added."
        } else {
            ""
        },
    )
}
