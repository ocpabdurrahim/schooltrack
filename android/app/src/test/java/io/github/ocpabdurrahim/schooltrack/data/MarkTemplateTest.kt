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
}
