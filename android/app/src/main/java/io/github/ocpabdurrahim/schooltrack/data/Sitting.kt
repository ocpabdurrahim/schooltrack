package io.github.ocpabdurrahim.schooltrack.data

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
 * This file has a twin: web/src/data/sitting.ts.
 */

/** What a result row carries about where it was entered. */
interface Entered {
    val classId: String
    val rollNo: Long
}

data class Sitting(
    val classId: String,
    val rollNo: Long,
    /**
     * False when the marks for this exam do not all agree.
     *
     * It happens: a mark entered before the class was moved up and another
     * entered after it carry different classIds for the same exam. The
     * commonest wins, and a caller that cares can say so rather than print one
     * of two answers as though it were the only one.
     */
    val agreed: Boolean,
)

/**
 * Where these marks were entered, or null if they do not say.
 *
 * Marks with no classId are IGNORED rather than treated as their own answer:
 * a row stored before the field existed is missing information, not evidence
 * of a different class. When none of them say anything the answer is null,
 * and the caller falls back to whatever it knew before.
 */
fun satAs(marks: List<Entered>): Sitting? {
    val said = marks.filter { it.classId.isNotBlank() }
    if (said.isEmpty()) return null

    val counts = LinkedHashMap<Pair<String, Long>, Int>()
    for (m in said) {
        val key = m.classId to m.rollNo
        counts[key] = (counts[key] ?: 0) + 1
    }

    // Commonest first, then by class and roll so that a tie is settled the
    // same way every time rather than by whichever mark happened to be read
    // first.
    val best = counts.entries.sortedWith(
        compareByDescending<Map.Entry<Pair<String, Long>, Int>> { it.value }
            .thenBy { it.key.first }
            .thenBy { it.key.second },
    ).first()

    return Sitting(best.key.first, best.key.second, best.value == said.size)
}

/**
 * The name to print for a sitting, given the classes the school has.
 *
 * Falls back to the name the caller already had — the student's current class
 * — ONLY when the marks said nothing. A class that was named and has since
 * been deleted gives an empty string instead, because naming it after some
 * other class is the exact mistake this file exists to stop.
 */
fun sittingName(
    sat: Sitting?,
    classes: List<ClassRow>,
    fallback: String,
): String {
    if (sat == null) return fallback
    return classes.firstOrNull { it.classId == sat.classId }?.displayName ?: ""
}
