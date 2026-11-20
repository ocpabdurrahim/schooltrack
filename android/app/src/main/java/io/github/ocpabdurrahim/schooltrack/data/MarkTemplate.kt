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
 * This file has a twin: web/src/data/marktemplate.ts.
 */

/**
 * Just enough of a student to put on a form, mirroring the web's
 * TemplateStudent: a roll to match on, a name to read, a group to glance at.
 * Taking the whole record would tie this to every field a student has.
 */
data class TemplateStudent(
    val rollNo: Long,
    val fullName: String = "",
    val groupName: String? = null,
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
fun templateNote(subject: Subject, classLabel: String): String {
    val comps = subject.components.map { it.name }
    val which = if (comps.isEmpty()) "Marks" else comps.joinToString(" and ")
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

    val rows = mutableListOf<List<Any?>>()
    rows.add(listOf(templateNote(subject, classLabel)))
    rows.add(headings)
    for (s in students.sortedBy { it.rollNo }) {
        val row = mutableListOf<Any?>(s.rollNo, s.fullName, s.groupName ?: "")
        marks.forEach { _ -> row.add("") }
        if (comps.isNotEmpty()) row.add("")
        rows.add(row)
    }
    return rows
}

/** "Class 9 - A — MATHEMATICS.xlsx" */
fun templateFileName(classLabel: String, subjectName: String) =
    "$classLabel — $subjectName.xlsx"
