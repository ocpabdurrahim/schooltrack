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
    /**
     * One entry per group column, naming every subject that turns up in it on
     * this sheet — Physics for the Science rows, Civics for the Humanities
     * ones. The heading is those names shortened and joined, so the column
     * says what it holds instead of saying "Grp 1".
     */
    val groupSlots: List<List<String>>,
    /** The religion papers on this sheet, and the 4th subjects. Empty: none. */
    val religion: List<String>,
    val optional: List<String>,
    /**
     * Where the religion column goes: how many of the common columns come
     * before it.
     *
     * It is not a column for the end of the sheet. Religion is the sixth
     * subject of the school's order, after Mathematics and before ICT, and
     * the sheet reads in that order like every other screen -- see
     * SubjectOrder.kt. Only the group columns and the 4th subject are
     * gathered at the right, because those are as many columns as the widest
     * stream needs.
     */
    val religionAt: Int,
)

/**
 * The sheet's shape, from the students actually on it.
 *
 * Nothing is assumed about how many group papers a stream has: the sheet is
 * as wide as the widest student needs and no wider, so a section that has not
 * been streamed yet simply has no group columns at all.
 */
/**
 * The stream this student's group papers agree on, or null if they agree on
 * none.
 *
 * Not read from the student -- it is read from the papers they sit, because
 * that is what the sheet has to lay out. A Science student's four papers are
 * all Science; a Humanities student's four are all Humanities. A student
 * with NO stream recorded is excluded by nothing (see excludedBy in
 * Exams.kt, where a missing field means "not known yet" rather than "does
 * not match"), so they sit every group paper there is and their papers agree
 * on nothing at all.
 */
fun streamOf(group: List<GradedSubject>): String? {
    if (group.isEmpty()) return null
    var shared: List<String>? = null
    for (c in group) {
        val names = c.mark.groupNames
        shared = shared?.filter { it in names } ?: names.toList()
    }
    return shared?.firstOrNull()
}

fun layout(results: List<Tabulation>): Layout {
    val common = mutableListOf<Pair<String, String>>()
    val seen = mutableSetOf<String>()
    val groupSlots = mutableListOf<MutableList<String>>()
    val religion = mutableListOf<String>()
    val optional = mutableListOf<String>()

    /** Adds a name to a slot's list, keeping the order it was first seen in. */
    fun note(into: MutableList<String>, name: String?) {
        if (name != null && name !in into) into.add(name)
    }

    // Kept to be ranked, not to be shown: every religion paper sits in the one
    // slot, so the first one found places the column for all of them.
    var relCell: GradedSubject? = null

    /*
     * WHO DECIDES HOW MANY GROUP COLUMNS THERE ARE: the students who have a
     * stream, and only them.
     *
     * One student with no stream recorded sits every group paper in the
     * school -- eleven of them here, where a stream sits four. Left to set
     * the width, that single student gave the sheet seven extra columns,
     * each one holding a subject already paired into one of the four real
     * ones, and pushed the whole thing off the page.
     *
     * The slots exist to line PARALLEL papers up across streams: Physics
     * above History above Accounting, one column. A student with no stream
     * has no parallel papers -- they have everybody's -- so they do not get
     * a say in how many columns that takes.
     *
     * Unless nobody has a stream at all. A class that has not been streamed
     * still sits its group papers and still needs somewhere to show them, so
     * then every student counts, as before.
     */
    val streamed = results.filter { streamOf(slot(it).group) != null }
    val setsTheWidth = if (streamed.isNotEmpty()) streamed else results

    for (t in results) {
        val s = slot(t)
        if (relCell == null) relCell = s.religion
        for (c in s.common) {
            if (seen.add(c.mark.subjectId)) common.add(c.mark.subjectId to c.mark.subjectName)
        }
        note(religion, s.religion?.mark?.subjectName)
        note(optional, s.optional?.mark?.subjectName)
    }

    for (t in setsTheWidth) {
        slot(t).group.forEachIndexed { i, c ->
            while (groupSlots.size <= i) groupSlots.add(mutableListOf())
            note(groupSlots[i], c.mark.subjectName)
        }
    }

    // A common subject the order has never heard of counts as coming after the
    // religion paper, which is where it sits everywhere else in the app.
    val relRank = relCell?.let {
        subjectRank(SubjectKey(it.mark.subjectId, it.mark.subjectName))
    } ?: UNRANKED
    val religionAt = common.count { (id, name) ->
        subjectRank(SubjectKey(subjectId = id, subjectName = name)) < relRank
    }

    return Layout(common, groupSlots.map { it.toList() }, religion, optional, religionAt)
}
