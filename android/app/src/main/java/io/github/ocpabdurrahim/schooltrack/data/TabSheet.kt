package io.github.ocpabdurrahim.schooltrack.data

/**
 * The columns of a tabulation sheet for a section whose students do not all
 * sit the same subjects.
 *
 * A Science student and a Humanities student in the same Class 9 share four
 * papers and differ on five. One column per subject gives sixteen columns of
 * which each student uses ten, and the rest are dots — a sheet that is mostly
 * holes and too wide for the page.
 *
 * So the columns that differ become SLOTS. Every student has one religion
 * paper, four group papers and at most one 4th subject, so those get a fixed
 * number of columns and each student's own subjects fill them, named in the
 * cell.
 *
 * The twin of web/src/data/tabsheet.ts.
 */

data class Slotted(
    /** The subjects everybody in the section sits, in the school's order. */
    val common: List<GradedSubject>,
    /** Whichever religion paper this student sits. Null if none applies. */
    val religion: GradedSubject?,
    /** This student's own group papers, in order. */
    val group: List<GradedSubject>,
    /** The 4th subject, if the student has one. */
    val optional: GradedSubject?,
)

private fun isReligion(g: GradedSubject) = g.mark.religions.isNotEmpty()
private fun isGroup(g: GradedSubject) = !g.mark.isOptional && g.mark.groupNames.isNotEmpty()

/** One student's units, sorted into the sheet's slots. */
fun slot(t: Tabulation) = Slotted(
    common = t.subjects.filter { !it.mark.isOptional && !isReligion(it) && !isGroup(it) },
    religion = t.subjects.firstOrNull(::isReligion),
    group = t.subjects.filter(::isGroup),
    optional = t.subjects.firstOrNull { it.mark.isOptional },
)

data class Layout(
    /** Column headings for the shared subjects, in order. */
    val common: List<Pair<String, String>>,   // subjectId to subjectName
    /** How many group columns the widest student in this section needs. */
    val groupSlots: Int,
    val religion: Boolean,
    val optional: Boolean,
)

/**
 * The sheet's shape, from the students actually on it.
 *
 * Nothing is assumed about how many group papers a stream has: the sheet is
 * as wide as the widest student needs and no wider, so a section that has not
 * been streamed yet simply has no group columns at all.
 */
fun layout(results: List<Tabulation>): Layout {
    val common = mutableListOf<Pair<String, String>>()
    val seen = mutableSetOf<String>()
    var groupSlots = 0
    var religion = false
    var optional = false

    for (t in results) {
        val s = slot(t)
        for (c in s.common) {
            if (seen.add(c.mark.subjectId)) common.add(c.mark.subjectId to c.mark.subjectName)
        }
        groupSlots = maxOf(groupSlots, s.group.size)
        religion = religion || s.religion != null
        optional = optional || s.optional != null
    }

    return Layout(common, groupSlots, religion, optional)
}
