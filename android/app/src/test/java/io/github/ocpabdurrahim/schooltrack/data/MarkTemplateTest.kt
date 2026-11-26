package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The SAME cases exist in web/src/data/marktemplate.test.ts. */
private val PARTS = Subject(
    subjectId = "MATHS",
    subjectName = "MATHEMATICS",
    fullMarks = 100.0,
    components = listOf(Component("CQ", 70.0, 23.0), Component("MCQ", 30.0, 10.0)),
)
private val WHOLE = Subject(subjectId = "GEO", subjectName = "GEOGRAPHY", fullMarks = 100.0)

private fun student(roll: Long, name: String, group: String?) =
    TemplateStudent(roll, name, group)

private val ROLL = listOf(
    student(2, "Bashir Uddin", "Science"),
    student(1, "Ayesha Rahman", "Science"),
)

class MarkTemplateTest {

    @Test
    fun `names one column per part, with what it is out of`() {
        assertEquals(listOf("CQ (70)", "MCQ (30)"), markColumns(PARTS))
    }

    @Test
    fun `falls back to one Marks column for a paper with no parts`() {
        assertEquals(listOf("Marks (100)"), markColumns(WHOLE))
    }

    @Test
    fun `leaves out the brackets when a part has no maximum`() {
        val s = Subject(subjectId = "X", subjectName = "X", components = listOf(Component("CQ", 0.0, 0.0)))
        assertEquals(listOf("CQ"), markColumns(s))
    }

    @Test
    fun `is a note, a heading row, then the students by roll`() {
        val rows = templateRows(PARTS, ROLL, "Class 9 - A")
        assertTrue(rows[0][0].toString().contains("MATHEMATICS"))
        assertEquals(
            listOf("Roll", "Name", "Group", "CQ (70)", "MCQ (30)", "Total (100)"),
            rows[1],
        )
        assertEquals(1L, rows[2][0])        // sorted, whatever order they came in
        assertEquals(2L, rows[3][0])
        assertEquals(4, rows.size)
    }

    @Test
    fun `leaves every mark cell EMPTY, never zero`() {
        // A zero is a mark, and a failing one. "Nobody has written this yet"
        // and "the child scored nothing" must not look the same.
        val rows = templateRows(PARTS, ROLL, "Class 9 - A")
        assertEquals(listOf<Any?>("", "", ""), rows[2].drop(3))
    }

    @Test
    fun `gives a whole-paper sheet no Total column, because there is nothing to add up`() {
        val rows = templateRows(WHOLE, ROLL, "Class 9 - A")
        assertEquals(listOf("Roll", "Name", "Group", "Marks (100)"), rows[1])
    }

    @Test
    fun `tells the person which columns are theirs`() {
        assertTrue(templateNote(PARTS, "Class 9 - A").contains("fill in the CQ and MCQ columns"))
        assertTrue(templateNote(WHOLE, "Class 9 - A").contains("fill in the Marks column"))
        assertTrue(templateNote(PARTS, "Class 9 - A").contains("A for absent"))
    }

    @Test
    fun `names the file after the class and the subject`() {
        assertEquals("Class 9 - A — MATHEMATICS.xlsx", templateFileName("Class 9 - A", "MATHEMATICS"))
    }

    // -----------------------------------------------------------------------
    // the round trip: what this writes, the upload reads

    private fun gridOf(rows: List<List<Any?>>): Grid =
        readSheetGrid("x.xlsx", xlsxOf(rows))

    @Test
    fun `is found by the upload, with exactly the columns the subject wants`() {
        val sheet = parseMarkParts(gridOf(templateRows(PARTS, ROLL, "Class 9 - A")), listOf("CQ", "MCQ"))
        assertEquals("", sheet.problem)
        assertEquals(setOf("CQ", "MCQ"), sheet.columns.keys)
    }

    @Test
    fun `changes NOTHING while it is still blank`() {
        // The sheet is handed out empty; uploading it unfilled must be a no-op.
        val sheet = parseMarkParts(gridOf(templateRows(PARTS, ROLL, "Class 9 - A")), listOf("CQ", "MCQ"))
        assertEquals(emptyList<PartsRow>(), sheet.rows)
    }

    @Test
    fun `reads the marks back once they are typed in`() {
        val rows = templateRows(PARTS, ROLL, "Class 9 - A").map { it.toMutableList() }
        rows[2][3] = 51; rows[2][4] = 18          // roll 1
        rows[3][3] = "A"                          // roll 2 was absent

        val sheet = parseMarkParts(gridOf(rows), listOf("CQ", "MCQ"))
        assertEquals(2, sheet.rows.size)
        assertEquals(1L, sheet.rows[0].rollNo)
        assertEquals(mapOf("CQ" to 51.0, "MCQ" to 18.0), sheet.rows[0].parts)
        assertEquals(true, sheet.rows[1].absent)
    }

    @Test
    fun `reads a whole-paper sheet through whichever word it used`() {
        val rows = templateRows(WHOLE, ROLL, "Class 9 - A").map { it.toMutableList() }
        rows[2][3] = 64
        val sheet = parseMarkParts(gridOf(rows), MARK_HEADINGS)
        assertEquals(64.0, sheet.rows[0].parts["Marks"])
    }

    // --- the same sheet, carrying the marks already entered ----------------

    private val entered = listOf(
        TemplateStudent(
            1, "Ayesha Rahman", null,
            EnteredMark(parts = mapOf("CQ" to 51.0, "MCQ" to 18.0), total = 69.0),
        ),
        TemplateStudent(2, "Bashir Uddin", null, EnteredMark(absent = true)),
        // Half entered: the MCQ has not been marked yet, so there is no total.
        TemplateStudent(
            3, "Chaity Das", null,
            EnteredMark(parts = mapOf("CQ" to 44.0, "MCQ" to null), total = null),
        ),
        // Roll 4 has nothing at all against them.
        TemplateStudent(4, "Delwar Hossain", null),
    )

    @Test
    fun `puts each part in its own column, and the total in the Total column`() {
        val rows = templateRows(PARTS, entered, "Class 9 - A", withMarks = true)
        assertEquals(listOf<Any?>(1L, "Ayesha Rahman", "", 51.0, 18.0, 69.0), rows[2])
    }

    @Test
    fun `LEAVES A PART NOT ENTERED EMPTY, never zero`() {
        // A zero is a mark, and a failing one. The total is withheld too, the
        // same way every other sheet withholds it.
        val rows = templateRows(PARTS, entered, "Class 9 - A", withMarks = true)
        assertEquals(listOf<Any?>(3L, "Chaity Das", "", 44.0, "", ""), rows[4])
    }

    @Test
    fun `writes one A for an absence, in the first column the parser reads`() {
        val rows = templateRows(PARTS, entered, "Class 9 - A", withMarks = true)
        assertEquals(listOf<Any?>(2L, "Bashir Uddin", "", "A", "", ""), rows[3])
    }

    @Test
    fun `leaves a student with nothing entered completely empty`() {
        val rows = templateRows(PARTS, entered, "Class 9 - A", withMarks = true)
        assertEquals(listOf<Any?>(4L, "Delwar Hossain", "", "", "", ""), rows[5])
    }

    @Test
    fun `puts the mark in the one column of a paper marked out of one number`() {
        val rows = templateRows(
            WHOLE,
            listOf(TemplateStudent(1, "", null, EnteredMark(total = 71.0))),
            "Class 9 - A",
            withMarks = true,
        )
        assertEquals(listOf<Any?>(1L, "", "", 71.0), rows[2])
    }

    @Test
    fun `IGNORES the marks when a blank form was asked for`() {
        // A blank form must be blank however much the caller knows.
        val rows = templateRows(PARTS, entered, "Class 9 - A")
        assertEquals(listOf<Any?>(1L, "Ayesha Rahman", "", "", "", ""), rows[2])
    }

    @Test
    fun `says what it is, and that uploading it back changes marks`() {
        val note = templateNote(PARTS, "Class 9 - A", withMarks = true)
        assertTrue(note.contains("the marks entered so far"))
        assertTrue(note.contains("upload this file to change"))
        // The warning that matters: an empty box is not a zero on the way back.
        assertTrue(note.contains("changes nothing"))
    }

    @Test
    fun `is named so it cannot be confused with the blank form`() {
        assertEquals(
            "Class 9 - A — MATHEMATICS.xlsx",
            templateFileName("Class 9 - A", "MATHEMATICS"),
        )
        assertEquals(
            "Class 9 - A — MATHEMATICS — marks entered.xlsx",
            templateFileName("Class 9 - A", "MATHEMATICS", withMarks = true),
        )
    }

    @Test
    fun `READS BACK AS THE SAME MARKS -- the whole point of it`() {
        // Downloaded, not touched, uploaded again: every mark must come back
        // exactly as it went out, or correcting one box in Excel would
        // quietly change others.
        val rows = templateRows(PARTS, entered, "Class 9 - A", withMarks = true)
        val sheet = parseMarkParts(gridOf(rows), listOf("CQ", "MCQ"))
        assertEquals("", sheet.problem)
        // Roll 4 carried nothing, so it is not a row at all -- uploading the
        // sheet leaves that student exactly as they were.
        assertEquals(3, sheet.rows.size)
        assertEquals(1L, sheet.rows[0].rollNo)
        assertEquals(mapOf("CQ" to 51.0, "MCQ" to 18.0), sheet.rows[0].parts)
        assertEquals(2L, sheet.rows[1].rollNo)
        assertTrue(sheet.rows[1].absent)
        assertEquals(3L, sheet.rows[2].rollNo)
        assertEquals(mapOf("CQ" to 44.0), sheet.rows[2].parts)
    }

    @Test
    fun `comes back unchanged after a correction, and only there`() {
        val rows = templateRows(PARTS, entered, "Class 9 - A", withMarks = true)
            .map { it.toMutableList() }
        rows[2][4] = 21.0                       // roll 1's MCQ corrected, 18 -> 21
        val sheet = parseMarkParts(gridOf(rows), listOf("CQ", "MCQ"))
        assertEquals(mapOf("CQ" to 51.0, "MCQ" to 21.0), sheet.rows[0].parts)
        assertEquals(mapOf("CQ" to 44.0), sheet.rows[2].parts)
    }
}
