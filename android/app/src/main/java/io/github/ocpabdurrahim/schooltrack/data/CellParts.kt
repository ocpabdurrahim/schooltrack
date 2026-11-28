package io.github.ocpabdurrahim.schooltrack.data

/**
 * One cell of the tabulation sheet, in two tiers.
 *
 * A tabulation cell used to say "68 F", which is true and useless: the sheet
 * showed a passing-looking mark beside a fail and gave no way to see why. The
 * reason is always a PART -- 60 in CQ and 8 in MCQ is 68 out of 100 and still
 * F, because the MCQ pass mark is 10 (Grading.kt). The marks that explain the
 * letter were entered, stored and then thrown away at the last step.
 *
 * So the cell is split. The upper tier carries the parts, small, in the order
 * the paper is marked in; the lower tier carries the subject total and its
 * letter. One cell, one subject, nothing hidden:
 *
 *        50  22  20          <- the parts, small
 *          92   A+           <- the total and the grade
 *
 * Four things still have to look different from each other, which is the
 * whole difficulty of this cell: a mark, a mark not entered yet, a subject
 * half entered (the two Bangla papers are ONE subject out of 200), and a
 * paper this student does not sit at all. The last is not here -- a cell with
 * no subject is a dot, drawn by the sheet.
 *
 * The twin of web/src/data/cellparts.ts.
 */

/** A mark as a sheet prints it: 50, not 50.0, and 50.5 kept. */
fun fmtMark(n: Double): String =
    if (n == n.toLong().toDouble()) n.toLong().toString()
    else (Math.round(n * 10.0) / 10.0).toString()

data class PartBit(
    /** The part's own name, without the paper in front of it: "CQ", "MCQ". */
    val label: String,
    /** The mark, or an en dash for a part nobody has entered yet. */
    val text: String,
    /**
     * Below ITS OWN pass mark -- the fact that explains an F with a high
     * total.
     *
     * Set on an entered part even when the subject as a whole has no total
     * yet. The subject is not being judged (it still shows a dash below);
     * this part is finished and it did fail, and a teacher is better off
     * seeing that while the rest of the marks are still coming in than after.
     */
    val failed: Boolean,
    /**
     * The first part of a paper after the first one, in a subject that is
     * several papers graded as one. The sheet draws a thin gap there, so that
     * four numbers read as 1st Paper and 2nd Paper rather than as one run.
     */
    val opensPaper: Boolean,
)

data class CellText(
    /** The upper tier. Empty for a paper that is not marked in parts. */
    val parts: List<PartBit>,
    /** The lower tier's figure: "abs", a total, "(50)" part-way, or a dash. */
    val main: String,
    /** The letter, or "" when there is no grade to show yet. */
    val letter: String,
    /** True when [main] is a part-way figure rather than a total. */
    val provisional: Boolean,
)

private const val NOT_ENTERED = "\u2013"   // en dash: a part not entered
private const val NO_TOTAL = "\u2014"      // em dash: no total for the subject

/** The part's name with its paper stripped off: "Bangla 1st Paper MCQ" -> "MCQ". */
fun partLabel(componentName: String, paper: String?): String =
    if (!paper.isNullOrEmpty() && componentName.startsWith("$paper ")) {
        componentName.substring(paper.length + 1)
    } else {
        componentName
    }

/**
 * The parts, in the order the paper is marked in.
 *
 * Empty when the paper is not marked in parts (English is one written paper
 * out of 100) and empty for an absent student, who has no parts to show --
 * the cell says "abs" and that is the whole of it.
 *
 * Empty too when NOTHING has been entered for the subject. A tier of dashes
 * says no more than the dash below it does, and a sheet opened halfway
 * through mark entry would otherwise be a field of them -- the parts tier is
 * worth its height only once there is a part to put in it.
 */
fun partBits(m: SubjectMark): List<PartBit> {
    if (m.absent || m.components.isEmpty()) return emptyList()
    val entered = m.components.any { m.parts[it.name]?.isNaN() == false }
    if (!entered) return emptyList()
    val out = mutableListOf<PartBit>()
    val failedGroups = partGroups(m)
        .filter { it.mark != null && it.mark < it.pass }
        .map { it.label }
        .toSet()
    var paper: String? = null
    m.components.forEachIndexed { i, c ->
        val v = m.parts[c.name]
        val got = v != null && !v.isNaN()
        out.add(
            PartBit(
                label = partLabel(c.name, c.paper),
                text = if (got) fmtMark(v!!) else NOT_ENTERED,
                // Judged on the GROUP, not this component: one paper under
                // its own half of the pass mark has not failed if the pair
                // clears it together.
                failed = got && partLabel(c.name, c.paper) in failedGroups,
                opensPaper = i > 0 && !c.paper.isNullOrEmpty() && c.paper != paper,
            ),
        )
        paper = c.paper
    }
    return out
}

/**
 * The whole cell.
 *
 * [CellText.main] follows the sheet's existing rules exactly, and the parts
 * tier is why one of them can now be dropped: the bracketed "part of this is
 * in" figure is only reached when there are no parts to show instead of it,
 * so the same number is never printed twice in one cell.
 */
fun cellText(g: GradedSubject): CellText {
    val parts = partBits(g.mark)
    if (g.mark.absent) return CellText(parts, "abs", "", false)
    val total = g.grade.total
    if (total != null) return CellText(parts, fmtMark(total), g.grade.letter, false)
    val sofar = if (parts.isEmpty()) enteredSoFar(g.mark) else null
    if (sofar != null) return CellText(parts, "(" + fmtMark(sofar) + ")", "", true)
    return CellText(parts, NO_TOTAL, "", false)
}

/**
 * The parts spelled out, for the places a cell is too narrow for names.
 *
 * The paper is named only when the subject is more than one paper, because
 * "MCQ" twice over in a Bangla cell says nothing about which paper it is.
 */
fun partsTitle(m: SubjectMark): String {
    val bits = partBits(m)
    if (bits.isEmpty()) return ""
    val many = m.components.map { it.paper ?: "" }.toSet().size > 1
    val groups = partGroups(m)
    return m.components.mapIndexed { i, c ->
        val where = if (many && !c.paper.isNullOrEmpty()) c.paper + " " else ""
        val out = where + bits[i].label + " " + bits[i].text
        // The pass mark named is the one actually applied: for a unit of two
        // papers that is both halves together, not this paper's share.
        val pass = groups.firstOrNull { it.label == bits[i].label }?.pass ?: c.pass
        if (bits[i].failed) out + " (below pass " + fmtMark(pass) + ")" else out
    }.joinToString(" \u00b7 ")
}
