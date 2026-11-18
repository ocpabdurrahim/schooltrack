package io.github.ocpabdurrahim.schooltrack.data

/**
 * One student's mark sheet, in the two shapes a school hands out.
 *
 * BRIEF is what goes home: one line per graded subject, its total and its
 * grade. DETAILED is what the office and the teacher argue over: the same
 * subjects, but with every part shown — CQ, MCQ, Practical — because that is
 * where a disputed mark actually lives, and because a part below its own pass
 * mark fails the subject however high the total.
 *
 * Both come from the same lines, so the brief sheet can never say something
 * the detailed one contradicts. The grades come from gradeForSubject(), the
 * same call the tabulation makes, so a mark sheet can never disagree with the
 * result sheet it was printed beside.
 *
 * Papers graded together are ONE line with both papers inside it: Bangla
 * first and second are a single subject out of 200, so one grade, two sets of
 * parts.
 *
 * The twin of web/src/data/marksheet.ts.
 */

/** One paper, with what was entered for each of its parts. */
data class PaperLine(
    val subjectId: String,
    val subjectName: String,
    /** By component name — CQ, MCQ, PRACTICAL, WRITTEN. Null: not entered. */
    val parts: Map<String, Double?>,
    /** This paper's own total, out of its own full marks. */
    val marks: Double?,
    val fullMarks: Double,
    val absent: Boolean,
)

/** One graded subject: a single paper, or several graded as one. */
data class UnitLine(
    val unitId: String,
    val unitName: String,
    /** One for an ordinary subject, two for Bangla or English. */
    val papers: List<PaperLine>,
    /** The subject total. Null while any part of it is missing. */
    val marks: Double?,
    /** What has been entered while the total is still null. */
    val soFar: Double?,
    val fullMarks: Double,
    val point: Double,
    val letter: String,
    /** Parts below their own pass mark — why an F can look like a pass. */
    val failedParts: List<String>,
    val isOptional: Boolean,
    val absent: Boolean,
)

/** The part columns a detailed sheet needs, in the order a teacher reads them. */
private val ORDER = listOf("CQ", "MCQ", "PRACTICAL", "WRITTEN")

/**
 * The columns this sheet actually needs.
 *
 * Taken from the papers in front of us rather than fixed: a school that marks
 * everything as one whole paper gets no part columns at all, and one that
 * invents a fourth part gets a column for it without anybody editing this.
 */
fun partColumns(lines: List<UnitLine>): List<String> {
    // A column appears because a paper HAS that part, not because somebody has
    // got round to marking it: a blank Practical column is information.
    val seen = LinkedHashSet<String>()
    for (u in lines) for (p in u.papers) seen.addAll(p.parts.keys)
    return ORDER.filter { it in seen } + seen.filter { it !in ORDER }.sorted()
}

/** The papers behind one graded unit. */
private fun papersOf(unit: SubjectMark, all: List<SubjectMark>): List<SubjectMark> {
    val own = all.filter { it.subjectId == unit.subjectId }
    if (own.isNotEmpty()) return own
    return all.filter { !it.combineGroup.isNullOrEmpty() && it.combineGroup == unit.combineGroup }
}

/**
 * One student's sheet: every subject they sit, in the school's own order.
 *
 * A subject with no mark is still a line. Leaving it out would print a sheet
 * that looks finished and is not, which is the one thing a mark sheet must
 * never do.
 */
fun markSheet(subjects: List<Subject>, who: Sitter, marks: List<ResultRow>): List<UnitLine> {
    val all = subjectsForStudent(subjects, who).map { subject ->
        subjectMarkFor(subject, marks.firstOrNull { it.subjectId == subject.subjectId })
    }

    return combineUnits(all).map { unit ->
        val grade = gradeForSubject(unit)
        UnitLine(
            unitId = unit.subjectId,
            unitName = unit.subjectName,
            papers = papersOf(unit, all).map { m ->
                PaperLine(
                    subjectId = m.subjectId,
                    subjectName = m.subjectName,
                    parts = m.components.associate { c -> c.name to m.parts[c.name] },
                    marks = m.marks,
                    fullMarks = m.fullMarks,
                    absent = m.absent,
                )
            },
            marks = grade.total,
            soFar = if (grade.total == null) enteredSoFar(unit) else null,
            fullMarks = unit.fullMarks,
            point = grade.point,
            letter = grade.letter,
            failedParts = grade.failedParts,
            isOptional = unit.isOptional,
            absent = unit.absent,
        )
    }
}

/**
 * What the foot of the sheet adds up — the marks, not the GPA.
 *
 * The same marksTotal() the result sheet and the progress report use, so the
 * three can never disagree about what a student scored.
 */
fun sheetTotal(lines: List<UnitLine>): Pair<Double?, Double> = marksTotal(
    lines.map {
        SubjectMark(
            subjectId = it.unitId,
            subjectName = it.unitName,
            fullMarks = it.fullMarks,
            marks = it.marks,
            absent = it.absent,
            isOptional = it.isOptional,
        )
    },
)
