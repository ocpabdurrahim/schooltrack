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
    /** The earlier exam, then the later one. Null: not sat, or not marked. */
    val before: Double?,
    val after: Double?,
    val beforeLetter: String,
    val afterLetter: String,
    /** after minus before, and null unless BOTH are real figures. */
    val change: Double?,
)

data class Progress(
    val subjects: List<SubjectProgress>,
    val totalBefore: Double?,
    val totalAfter: Double?,
    val totalChange: Double?,
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
            before = beforeMark,
            after = afterMark,
            beforeLetter = letterOf(a),
            afterLetter = letterOf(b),
            change = diff(beforeMark, afterMark),
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
    for (s in subjects) {
        if (!real(s.before) || !real(s.after)) continue
        totalBefore = (totalBefore ?: 0.0) + s.before!!
        totalAfter = (totalAfter ?: 0.0) + s.after!!
    }

    val gpaBefore = if (before != null && !before.incomplete) before.gpa else null
    val gpaAfter = if (after != null && !after.incomplete) after.gpa else null
    val gpaChange = diff(gpaBefore, gpaAfter)

    return Progress(
        subjects = subjects,
        totalBefore = totalBefore,
        totalAfter = totalAfter,
        totalChange = diff(totalBefore, totalAfter),
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
