package io.github.ocpabdurrahim.schooltrack.data

/**
 * One student, two exams, side by side.
 *
 * A result sheet answers "how did the class do". A parent at a desk asks
 * something else: is my child doing better than last time? That is two
 * exams' marks on one line per subject, and the difference spelled out, so
 * nobody has to subtract eleven pairs of numbers in their head and nobody
 * has to be trusted to have done it right.
 *
 * WHAT IT WILL NOT DO is compare two things that are not comparable. A
 * subject sat in one exam and not the other has no difference to report, and
 * says so with a dash rather than counting the missing one as nought -- the
 * same rule the rest of the app keeps, and the one that matters most here,
 * because "down 70 marks" against a paper the child never sat is the kind of
 * figure that gets a child shouted at.
 *
 * The twin of web/src/data/progress.ts.
 */

/** One subject's line: what it was, what it is, and the move between them. */
data class SubjectProgress(
    val subjectId: String,
    val subjectName: String,
    val fullMarks: Double,
    /**
     * What each exam marked this subject OUT OF, kept apart because they can
     * differ: a half-yearly paper out of 50 and an annual out of 100 is
     * ordinary, and a percentage worked out against the wrong denominator is
     * worse than no percentage at all. Null when that exam did not sit it.
     */
    val fullBefore: Double?,
    val fullAfter: Double?,
    /** The earlier exam, then the later one. Null: not sat, or not marked. */
    val before: Double?,
    val after: Double?,
    val beforeLetter: String,
    val afterLetter: String,
    /** after minus before, and null unless BOTH are real figures. */
    val change: Double?,
    /**
     * The component marks of each exam, added up per label -- MCQ, CQ,
     * PRACTICAL, WRITTEN. Papers merged into one graded unit (Bangla 1st and
     * 2nd) have their like parts SUMMED, so a combined Bangla out of 200
     * shows one MCQ figure rather than two, which is what a column headed
     * MCQ can honestly hold. A label the subject is not marked in is absent.
     */
    val partsBefore: Map<String, Double> = emptyMap(),
    val partsAfter: Map<String, Double> = emptyMap(),
)

data class Progress(
    val subjects: List<SubjectProgress>,
    val totalBefore: Double?,
    val totalAfter: Double?,
    val totalChange: Double?,
    /**
     * What those totals were out of, one per exam. Added up over the SAME
     * subjects the totals are, so a percentage made from them compares like
     * with like.
     */
    val fullBefore: Double?,
    val fullAfter: Double?,
    /**
     * Which component columns this student's sheet needs, in the order a
     * marksheet prints them. Only the ones they ACTUALLY have marks in: a
     * humanities student gets MCQ and CQ, a science student also Practical,
     * and printing all four always would leave empty columns.
     */
    val partLabels: List<String> = emptyList(),
    val gpaBefore: Double?,
    val gpaAfter: Double?,
    val gpaChange: Double?,
    /** Merit position in each exam, where the sheet gave one. */
    val positionBefore: Int?,
    val positionAfter: Int?,
    /** Positive means they moved UP the list -- 12th to 7th is +5, not -5. */
    val positionChange: Int?,
    /**
     * What to say in one word, from the GPA: a figure a parent already knows
     * how to read, and the one the school itself is judged on.
     *
     * "unknown" while either exam is unfinished. Not "same" -- a result that
     * is not in yet is not a result that stood still.
     */
    val verdict: String,
)

private fun real(n: Double?): Boolean = n != null && !n.isNaN() && !n.isInfinite()

private fun diff(before: Double?, after: Double?): Double? =
    if (real(before) && real(after)) after!! - before!! else null

/** The subject's total as the sheet prints it; absent is nought, not blank. */
private fun markOf(c: GradedSubject?): Double? {
    if (c == null) return null
    if (c.mark.absent) return 0.0
    return if (real(c.grade.total)) c.grade.total else null
}

private fun letterOf(c: GradedSubject?): String =
    if (c == null) "" else if (c.mark.absent) "F" else c.grade.letter

/**
 * The two tabulations as one list of subjects.
 *
 * The union of both, in the school's order, because a student may have
 * changed stream between the exams or sat a 4th subject in only one of them.
 * Matched on subjectId: a renamed subject is still the same subject, and two
 * subjects that happen to share a name are not.
 */
fun progressFor(
    before: Tabulation?,
    after: Tabulation?,
    positionBefore: Int? = null,
    positionAfter: Int? = null,
): Progress {
    val was = before?.subjects.orEmpty().associateBy { it.mark.subjectId }
    val now = after?.subjects.orEmpty().associateBy { it.mark.subjectId }

    val ids = LinkedHashSet<String>()
    ids.addAll(was.keys)
    ids.addAll(now.keys)

    val subjects = ids.map { id ->
        val a = was[id]
        val b = now[id]
        val any = (b ?: a)!!
        val beforeMark = markOf(a)
        val afterMark = markOf(b)
        SubjectProgress(
            subjectId = id,
            subjectName = any.mark.subjectName,
            fullMarks = any.mark.fullMarks,
            fullBefore = a?.mark?.fullMarks,
            fullAfter = b?.mark?.fullMarks,
            before = beforeMark,
            after = afterMark,
            beforeLetter = letterOf(a),
            afterLetter = letterOf(b),
            change = diff(beforeMark, afterMark),
            partsBefore = partsByLabel(a),
            partsAfter = partsByLabel(b),
        )
    }.sortedWith(
        compareBy(
            { subjectRank(SubjectKey(it.subjectId, it.subjectName)) },
            { it.subjectName },
        ),
    )

    // The totals are added up from the subjects BOTH exams have, so the two
    // figures are of the same thing. A subject in only one of them would make
    // one total bigger for a reason that has nothing to do with the child.
    var totalBefore: Double? = null
    var totalAfter: Double? = null
    var fullBefore: Double? = null
    var fullAfter: Double? = null
    for (s in subjects) {
        if (!real(s.before) || !real(s.after)) continue
        totalBefore = (totalBefore ?: 0.0) + s.before!!
        totalAfter = (totalAfter ?: 0.0) + s.after!!
        fullBefore = (fullBefore ?: 0.0) + (s.fullBefore ?: 0.0)
        fullAfter = (fullAfter ?: 0.0) + (s.fullAfter ?: 0.0)
    }

    val seen = LinkedHashSet<String>()
    for (sp in subjects) {
        seen.addAll(sp.partsBefore.keys)
        seen.addAll(sp.partsAfter.keys)
    }
    val partLabels = seen.sortedWith(compareBy({ partRank(it) }, { it }))

    val gpaBefore = if (before != null && !before.incomplete) before.gpa else null
    val gpaAfter = if (after != null && !after.incomplete) after.gpa else null
    val gpaChange = diff(gpaBefore, gpaAfter)

    return Progress(
        subjects = subjects,
        totalBefore = totalBefore,
        totalAfter = totalAfter,
        totalChange = diff(totalBefore, totalAfter),
        fullBefore = fullBefore,
        fullAfter = fullAfter,
        partLabels = partLabels,
        gpaBefore = gpaBefore,
        gpaAfter = gpaAfter,
        gpaChange = gpaChange,
        positionBefore = positionBefore,
        positionAfter = positionAfter,
        // Up the list is a SMALLER number, so the sign is turned over: a
        // parent reading "+5" should not have to be told it means fifth
        // better.
        positionChange = if (positionBefore != null && positionAfter != null) {
            positionBefore - positionAfter
        } else {
            null
        },
        verdict = when {
            gpaChange == null -> "unknown"
            gpaChange > 0 -> "better"
            gpaChange < 0 -> "worse"
            else -> "same"
        },
    )
}

/** "+0.33", "-12", "0" -- the sign always shown, because that is the point. */
fun signed(n: Double?, places: Int = 0): String {
    if (!real(n)) return "—"
    val fixed = String.format("%.${places}f", Math.abs(n!!))
    if (fixed.toDouble() == 0.0) return if (places > 0) "0." + "0".repeat(places) else "0"
    return (if (n > 0) "+" else "−") + fixed
}

/**
 * How much of the combined figure each exam carries.
 *
 * Shares, not necessarily percentages: Weights(30, 70) and Weights(3, 7)
 * mean the same thing, because they are divided by their own sum before
 * use. A school that counts the half-yearly for 30 and the annual for 70
 * writes it the way it says it out loud.
 */
data class Weights(val before: Double, val after: Double)

/** Both exams counting the same -- the obvious starting point. */
val EVEN = Weights(50.0, 50.0)

/**
 * The two shares as fractions of one, or null when there is nothing to
 * divide by. Negatives are floored at nought rather than allowed to pull a
 * percentage below zero or above a hundred.
 */
private fun share(w: Weights): Pair<Double, Double>? {
    val b = maxOf(0.0, if (real(w.before)) w.before else 0.0)
    val a = maxOf(0.0, if (real(w.after)) w.after else 0.0)
    val sum = b + a
    return if (sum > 0) Pair(b / sum, a / sum) else null
}

/** Marks as a percentage of what they were out of. */
fun percentOf(mark: Double?, full: Double?): Double? {
    if (!real(mark) || !real(full) || full!! <= 0) return null
    return (mark!! / full) * 100
}

/**
 * One subject's mark across both exams, weighted.
 *
 * Each exam is turned into a percentage FIRST and the two percentages are
 * then weighed, rather than adding the raw marks: that is the only way the
 * split means what it says when the papers are out of different totals. A
 * 30/70 split on a 50-mark paper and a 100-mark one is still 30/70 here,
 * where adding the marks would quietly make it 18/82.
 *
 * Null unless BOTH exams marked it -- the rule the whole file keeps. A
 * percentage that silently counts an unsat paper as nought is the figure
 * that gets a child shouted at.
 */
fun subjectPercent(s: SubjectProgress, w: Weights): Double? {
    val sh = share(w) ?: return null
    val b = percentOf(s.before, s.fullBefore) ?: return null
    val a = percentOf(s.after, s.fullAfter) ?: return null
    return b * sh.first + a * sh.second
}

/**
 * The whole report's combined percentage.
 *
 * Worked from the TOTALS, not by averaging the subject percentages, so a
 * subject out of 50 does not weigh as heavily as one out of 100. Same
 * subjects, same rule, same answer a teacher would get on paper.
 */
fun overallPercent(p: Progress, w: Weights): Double? {
    val sh = share(w) ?: return null
    val b = percentOf(p.totalBefore, p.fullBefore) ?: return null
    val a = percentOf(p.totalAfter, p.fullAfter) ?: return null
    return b * sh.first + a * sh.second
}

/** "73.25%", or a dash when there is no honest figure to print. */
fun pctText(n: Double?, places: Int = 2): String =
    if (real(n)) String.format("%.${places}f%%", n) else "—"

/**
 * The order a marksheet prints the parts in. Anything the school invents
 * later still appears -- after these, alphabetically -- rather than
 * vanishing because this list had not heard of it.
 */
private val PART_ORDER = listOf("MCQ", "CQ", "PRACTICAL", "WRITTEN")

private fun partRank(label: String): Int {
    val i = PART_ORDER.indexOf(label)
    return if (i == -1) PART_ORDER.size else i
}

/**
 * One exam's component marks for one subject, added up per label.
 *
 * An absent student has no parts to show: the row says so with its grade,
 * and a line of noughts across the components would be a different claim --
 * that they sat it and scored nothing in each.
 */
private fun partsByLabel(c: GradedSubject?): Map<String, Double> {
    val out = LinkedHashMap<String, Double>()
    val mark = c?.mark ?: return out
    if (mark.absent) return out
    val comps = mark.components ?: return out
    for (comp in comps) {
        val v = mark.parts?.get(comp.name) ?: continue
        if (!real(v)) continue
        val label = partLabel(comp.name, comp.paper).uppercase()
        out[label] = (out[label] ?: 0.0) + v
    }
    return out
}

/** "Pract", "Writ" -- the headings p43 prints, short enough for a column. */
fun shortPart(label: String): String = when (label) {
    "PRACTICAL" -> "Pract"
    "WRITTEN" -> "Writ"
    "MCQ", "CQ" -> label
    else -> label.take(1) + label.drop(1).lowercase()
}

/**
 * One exam's own bottom line, for the summary table under the subjects.
 *
 * Every figure comes straight from that exam's result, never recomputed
 * here, so the progress report can never contradict the result sheet the
 * same exam already printed. That is p43's rule and it is worth keeping.
 */
data class ExamSummary(
    val total: Double?,
    val gpa: Double?,
    val letter: String,
    val position: Int?,
    /** "Passed", "Failed", or a dash while the marks are not all in. */
    val result: String,
)

fun examSummary(t: Tabulation?, total: Double?, position: Int?): ExamSummary {
    if (t == null) {
        return ExamSummary(null, null, "—", null, "—")
    }
    return ExamSummary(
        total = if (real(total)) total else null,
        gpa = if (t.incomplete) null else t.gpa,
        letter = if (t.incomplete) "—" else t.letter,
        position = position,
        // An unfinished exam has not been passed OR failed yet, and saying
        // either would be a claim about a mark nobody has entered.
        result = if (t.incomplete) "—" else if (t.failed.isNotEmpty()) "Failed" else "Passed",
    )
}
