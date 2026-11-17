package io.github.ocpabdurrahim.schooltrack.data

/**
 * Subject-first mark entry: one subject, roll after roll.
 *
 * This is the APEX "Quick Mark Entry" page (SMS app 161019, page 13) as this
 * app does it, and it is the flow the office actually uses — pick the exam,
 * the section and the subject once, then type a roll, the marks, and on to the
 * next. Nothing is chosen again until the bundle of scripts runs out.
 *
 * The point of this file is that the roll lookup is INSTANT. The whole
 * section's roster, and whatever is already stored for the chosen subject, is
 * read once and held here; typing a roll then resolves in memory rather than
 * over the network, which is the difference between keying in forty scripts
 * and waiting forty times.
 *
 * This file has a twin: web/src/data/quickentry.ts. The same test cases are
 * written against both.
 */

/** What the roster needs to know about a student. */
data class RosterStudent(
    val studentId: String,
    val rollNo: Long,
    val fullName: String,
    val className: String,
    val groupName: String? = null,
    val religion: String? = null,
)

/** One student on the loaded roster, with whatever is already stored. */
data class RosterRow(
    val studentId: String,
    val rollNo: Long,
    val fullName: String,
    val className: String,
    val groupName: String,
    val religion: String,
    /** Does this student sit the chosen subject — class, group AND religion? */
    val takes: Boolean,
    /** What is stored for them, as text, ready for the boxes. */
    val typed: Typed,
    /** True once this subject has been entered for this student. */
    val stored: Boolean,
    /** When it was last saved, epoch ms — null when nothing says. */
    val savedAt: Long?,
)

private fun anyPart(parts: Map<String, Double?>?): Boolean =
    parts.orEmpty().values.any { it != null }

/**
 * Has this subject actually been entered for this student?
 *
 * A row can exist and still say nothing — clearing a mark typed by mistake
 * leaves one behind — so the test is whether it carries a mark, a part or an
 * absence. One rule, used both when the roster is read and after a save, so
 * the entered list and the "12 of 78" count can never disagree.
 */
fun hasEntry(row: ResultRow): Boolean = row.marks != null || row.absent || anyPart(row.parts)

/**
 * The roster for one section and one subject.
 *
 * Every student in the section is included, even one who does not sit the
 * subject: a roll that exists but should not be marked has to be told apart
 * from a roll that was mistyped, and that is only possible if both are here.
 *
 * Keyed by roll number as text, exactly as it is typed.
 */
fun buildRoster(
    students: List<RosterStudent>,
    subject: Subject,
    marks: List<ResultRow>,
): Map<String, RosterRow> {
    val mine = marks.filter { it.subjectId == subject.subjectId }.associateBy { it.studentId }

    return students.associate { s ->
        val got = mine[s.studentId]
        s.rollNo.toString() to RosterRow(
            studentId = s.studentId,
            rollNo = s.rollNo,
            fullName = s.fullName,
            className = s.className,
            groupName = s.groupName.orEmpty(),
            religion = s.religion.orEmpty(),
            takes = sitsSubject(subject, Sitter(s.className, s.groupName, s.religion)),
            typed = got?.let { typedFrom(it.marks, it.parts, it.absent) } ?: Typed(),
            stored = got != null && hasEntry(got),
            savedAt = got?.updatedAt,
        )
    }
}

/** What typing a roll turned up. */
sealed interface Lookup {
    data object Blank : Lookup
    data class NotFound(val roll: String) : Lookup
    data class NotTaken(val row: RosterRow) : Lookup
    data class Found(val row: RosterRow) : Lookup
}

/**
 * The student behind a typed roll.
 *
 * "007" finds roll 7: the roll is a number, and an operator padding it should
 * not be told the student does not exist.
 */
fun lookupRoll(roster: Map<String, RosterRow>, roll: String): Lookup {
    val key = roll.trim()
    if (key.isEmpty()) return Lookup.Blank

    val row = roster[key] ?: key.toLongOrNull()?.let { roster[it.toString()] }
        ?: return Lookup.NotFound(key)
    return if (row.takes) Lookup.Found(row) else Lookup.NotTaken(row)
}

/**
 * A mark box as the operator is allowed to leave it: digits, and one dot for
 * the half marks some papers carry. Everything else is dropped as it is typed,
 * so a stray letter never reaches the grading engine to be read as a zero.
 */
fun cleanMark(raw: String): String {
    val kept = raw.filter { it.isDigit() || it == '.' }
    val dot = kept.indexOf('.')
    if (dot == -1) return kept
    return kept.substring(0, dot + 1) + kept.substring(dot + 1).replace(".", "")
}

/**
 * A box holding something impossible — not a number, negative, or above what
 * that part is out of. This is the condition that refuses to save.
 *
 * A mark BELOW the part's pass mark is not in here: failing is a real result,
 * and flagging it as a typing mistake would teach the operator to ignore the
 * flag that matters.
 */
fun fieldBad(max: Double, raw: String): Boolean {
    val v = raw.trim()
    if (v.isEmpty()) return false
    val n = numOrNull(v) ?: return true
    return n < 0 || n > max
}

/** The boxes this subject is marked in. Empty means one box for the paper. */
fun boxNames(subject: Subject): List<String> = subject.components.map { it.name }

/**
 * Where the next keystroke goes from here: the next box, or null for "that was
 * the last one, save it". One keystroke per box and the row is away.
 */
fun nextBox(boxes: List<String>, current: String): String? {
    val i = boxes.indexOf(current)
    if (i == -1 || i >= boxes.size - 1) return null
    return boxes[i + 1]
}

/** The subject mark behind one student's boxes — what the grade is read from. */
fun markFor(subject: Subject, typed: Typed): SubjectMark {
    val (parts, total) = partsAndTotal(subject, typed)
    return subjectMarkFor(subject, null)
        .copy(marks = total, parts = parts.orEmpty(), absent = typed.absent)
}

/** One row for the entered-marks list under the boxes. */
data class LogRow(
    val rollNo: Long,
    val fullName: String,
    val parts: Map<String, Double?>,
    val total: Double?,
    val grade: SubjectGrade,
    val absent: Boolean,
    val savedAt: Long?,
)

/**
 * What has been entered for this subject so far, most recent first.
 *
 * Most recent first is the whole value of it: the operator's last few rows sit
 * at the top, where a mistyped mark is spotted while the script is still in
 * hand. Rows with no time known sink below, ordered by roll.
 */
fun enteredLog(roster: Map<String, RosterRow>, subject: Subject): List<LogRow> =
    roster.values
        .filter { it.stored }
        .map { r ->
            val mark = markFor(subject, r.typed)
            LogRow(
                rollNo = r.rollNo,
                fullName = r.fullName,
                parts = mark.parts,
                total = mark.marks,
                grade = gradeForSubject(mark),
                absent = r.typed.absent,
                savedAt = r.savedAt,
            )
        }
        .sortedWith(compareByDescending<LogRow> { it.savedAt ?: 0L }.thenBy { it.rollNo })

/** How far through the section this subject is. */
fun progress(roster: Map<String, RosterRow>): Pair<Int, Int> {
    val rows = roster.values.filter { it.takes }
    return rows.count { it.stored } to rows.size
}

/**
 * The document to write for one student's boxes.
 *
 * Both apps build it here, so a mark keyed on a phone and the same mark keyed
 * in a browser produce the same document — down to the total, which is
 * computed, never typed.
 */
fun resultRowFor(
    examId: String,
    classId: String,
    subject: Subject,
    row: RosterRow,
    typed: Typed,
): ResultRow {
    val (parts, total) = partsAndTotal(subject, typed)
    return ResultRow(
        examId = examId,
        studentId = row.studentId,
        subjectId = subject.subjectId,
        subjectName = subject.subjectName,
        marks = total,
        absent = typed.absent,
        classId = classId,
        rollNo = row.rollNo,
        fullMarks = subject.fullMarks,
        isOptional = subject.isOptional,
        parts = parts,
    )
}
