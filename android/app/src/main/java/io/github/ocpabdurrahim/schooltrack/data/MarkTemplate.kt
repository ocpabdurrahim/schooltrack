package io.github.ocpabdurrahim.schooltrack.data

/**
 * The blank mark sheet the app hands out, for a class and a subject.
 *
 * THE LAYOUT IS THE READER'S, not a guess at it. Mark entry reads an upload
 * with parseMarkParts(), which looks for the first row carrying a roll
 * heading AND at least one column it wants, then reads those columns BY NAME.
 * Three things follow, and all three are used here:
 *
 *   - A COLUMN IT DOES NOT WANT IS IGNORED, so Name and Group can sit in the
 *     sheet for whoever fills it in and the app never looks at them.
 *   - THE HEADING ROW NEED NOT BE FIRST, so row 1 can say what the sheet is
 *     and what to do with it.
 *   - headingKey() STRIPS ANYTHING IN BRACKETS, so "CQ (70)" still matches
 *     the part called CQ and the teacher can see what it is out of.
 *
 * THE MARK CELLS ARE LEFT EMPTY, never zeroed. A zero is a mark, and a
 * failing one; "nobody has written this yet" and "the child scored nothing"
 * must not arrive at a teacher looking the same. parseMarkParts drops a row
 * that carries a roll and no marks, so an unfilled sheet uploaded by mistake
 * changes precisely nothing.
 *
 * THE SAME SHEET CARRIES THE MARKS ALREADY ENTERED, when it is asked to
 * (withMarks). That is not a second format: it is this one with the boxes
 * filled in, so it reads back through the same parser and a teacher can
 * correct a mark in Excel and upload the file to change it. An empty box
 * still means not entered and still changes nothing on the way back, which
 * is what makes a correction safe -- you alter the one box you meant to.
 *
 * This file has a twin: web/src/data/marktemplate.ts.
 */

/**
 * What has been entered for one student in one subject.
 *
 * Deliberately not a SubjectMark: a sheet needs the parts as they were typed
 * and the total as the app worked it out, and nothing else about grading.
 */
data class EnteredMark(
    /** By component name, as the subject names them. Absent or null: empty. */
    val parts: Map<String, Double?> = emptyMap(),
    /**
     * The subject's total, for the Total column -- or the only column, on a
     * paper marked out of one number. Null while a part is missing.
     */
    val total: Double? = null,
    val absent: Boolean = false,
)

/**
 * Just enough of a student to put on a form, mirroring the web's
 * TemplateStudent: a roll to match on, a name to read, a group to glance at.
 * Taking the whole record would tie this to every field a student has.
 */
data class TemplateStudent(
    val rollNo: Long,
    val fullName: String = "",
    val groupName: String? = null,
    /** Read only when the sheet is asked for withMarks. */
    val entered: EnteredMark? = null,
)

/** The columns the app will actually read, labelled with what each is out of. */
fun markColumns(subject: Subject): List<String> {
    val comps = subject.components
    if (comps.isNotEmpty()) {
        return comps.map { if (it.max > 0) "${it.name} (${fmt(it.max)})" else it.name }
    }
    return listOf("Marks (${fmt(if (subject.fullMarks > 0) subject.fullMarks else 100.0)})")
}

/** 100.0 reads as 100 on a form; a half mark keeps its half. */
private fun fmt(n: Double) = if (n == n.toLong().toDouble()) n.toLong().toString() else n.toString()

/** The line at the top, which the parser skips and a person reads. */
fun templateNote(subject: Subject, classLabel: String, withMarks: Boolean = false): String {
    val comps = subject.components.map { it.name }
    val which = if (comps.isEmpty()) "Marks" else comps.joinToString(" and ")
    // It must say that uploading it back CHANGES things, because it is the
    // one sheet somebody might open expecting a read-only report.
    if (withMarks) {
        return "${subject.subjectName} — $classLabel — the marks entered so far. " +
            "Correct a box and upload this file to change that mark. An empty box " +
            "is a mark not yet entered and uploading it changes nothing; A is " +
            "absent. Do not change the Roll column."
    }
    return "${subject.subjectName} — $classLabel — fill in the $which column" +
        (if (comps.size > 1) "s" else "") +
        ". Leave a box empty for a student who did not sit it. Write A for absent. " +
        "Do not change the Roll column."
}

/**
 * The whole sheet: a note, a heading row, then one row per student.
 *
 * The students handed in are the ones who SIT this paper — the caller works
 * that out with the app's own rule, so a Science paper does not arrive with
 * the Humanities half of the class on it.
 */
fun templateRows(
    subject: Subject,
    students: List<TemplateStudent>,
    classLabel: String,
    withMarks: Boolean = false,
): List<List<Any?>> {
    val marks = markColumns(subject)
    val comps = subject.components
    val full = if (subject.fullMarks > 0) subject.fullMarks else 100.0

    val headings = mutableListOf<Any?>("Roll", "Name", "Group")
    headings.addAll(marks)
    // A Total for the person filling it in to check against. The app ignores
    // it on a sheet marked in parts and works the total out itself, which is
    // the whole reason a mistyped part gets noticed.
    if (comps.isNotEmpty()) headings.add("Total (${fmt(full)})")

    /** A mark as a sheet carries it: a number, or nothing at all. */
    fun box(n: Double?): Any = if (n == null || n.isNaN()) "" else n

    fun cellsFor(s: TemplateStudent): List<Any?> {
        val got = if (withMarks) s.entered else null
        if (got == null) {
            return marks.map { "" } + if (comps.isNotEmpty()) listOf("") else emptyList()
        }
        // Absent is one A, in the first column the parser reads. It sets the
        // whole row absent on the way back, and an A in every column would
        // say the same thing four times to somebody reading the sheet.
        if (got.absent) {
            return marks.mapIndexed { i, _ -> if (i == 0) "A" else "" } +
                if (comps.isNotEmpty()) listOf("") else emptyList()
        }
        val cells = if (comps.isNotEmpty()) comps.map { box(got.parts[it.name]) }
        else listOf(box(got.total))
        return if (comps.isNotEmpty()) cells + listOf(box(got.total)) else cells
    }

    val rows = mutableListOf<List<Any?>>()
    rows.add(listOf(templateNote(subject, classLabel, withMarks)))
    rows.add(headings)
    for (s in students.sortedBy { it.rollNo }) {
        rows.add(listOf<Any?>(s.rollNo, s.fullName, s.groupName ?: "") + cellsFor(s))
    }
    return rows
}

/**
 * "Class 9 - A — MATHEMATICS.xlsx", or "… — marks entered.xlsx".
 *
 * The two must not share a name. A blank form and a filled one look alike in
 * a downloads folder, and handing a teacher the wrong one wastes an evening.
 */
fun templateFileName(classLabel: String, subjectName: String, withMarks: Boolean = false) =
    "$classLabel — $subjectName" + (if (withMarks) " — marks entered" else "") + ".xlsx"
