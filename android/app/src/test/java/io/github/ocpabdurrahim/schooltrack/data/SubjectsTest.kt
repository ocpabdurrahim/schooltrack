package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The SAME cases exist in web/src/data/subjects.test.ts.
 *
 * Classes 9 and 10 stream into groups and the groups sit different papers.
 * Getting this wrong does not look like a bug: it looks like every Humanities
 * student having an unfinished result, for ever, because Physics has no mark.
 */
class SubjectsTest {

    private val bangla = Subject(
        subjectId = "BAN1",
        subjectName = "Bengali First Paper",
        classNames = listOf("Class 9"),
    )
    private val physics = bangla.copy(
        subjectId = "PHY",
        subjectName = "Physics",
        groupNames = listOf("Science"),
        sortOrder = 2,
    )
    private val history = bangla.copy(
        subjectId = "HIST",
        subjectName = "History",
        groupNames = listOf("Humanities"),
        sortOrder = 3,
    )
    private val all = listOf(bangla, physics, history)

    @Test
    fun givesAPaperWithNoGroupNamedToTheWholeClass() {
        assertTrue(sitsSubject(bangla, "Class 9", "Science"))
        assertTrue(sitsSubject(bangla, "Class 9", "Humanities"))
        assertTrue(sitsSubject(bangla, "Class 9", ""))
    }

    @Test
    fun givesAGroupPaperOnlyToThatGroup() {
        assertTrue(sitsSubject(physics, "Class 9", "Science"))
        assertFalse(sitsSubject(physics, "Class 9", "Humanities"))
        assertTrue(sitsSubject(history, "Class 9", "Humanities"))
        assertFalse(sitsSubject(history, "Class 9", "Science"))
    }

    @Test
    fun understandsTheGroupHoweverTheOfficeWroteIt() {
        assertTrue(sitsSubject(physics, "Class 9", "sci"))
        assertTrue(sitsSubject(history, "Class 9", "ARTS"))
    }

    @Test
    fun givesEveryPaperToAStudentWithNoGroupRecorded() {
        // Deliberate: see the note on sitsSubject. A short GPA nobody can see
        // is worse than a result that openly says it is not finished.
        assertTrue(sitsSubject(physics, "Class 9", null))
        assertTrue(sitsSubject(history, "Class 9", ""))
    }

    @Test
    fun neverGivesAPaperTheClassDoesNotSit() {
        assertFalse(sitsSubject(physics, "Class 7", "Science"))
        assertFalse(sitsSubject(bangla, "Class 7", ""))
    }

    @Test
    fun isTheClassListFilteredToTheStudentsOwnGroup() {
        assertEquals(
            listOf("BAN1", "PHY"),
            subjectsForStudent(all, "Class 9", "Science").map { it.subjectId },
        )
        assertEquals(
            listOf("BAN1"),
            subjectsForStudent(all, "Class 9", "Business Studies").map { it.subjectId },
        )
    }

    // ----------------------------------------------------------------------
    // what it is all for

    private fun student(id: String, name: String, roll: Long, group: String) = StudentDetail(
        studentId = id,
        fullName = name,
        rollNo = roll,
        regNo = null,
        classId = "C9A",
        className = "Class 9",
        section = "A",
        groupName = group,
        gender = null,
        dob = null,
        fatherName = null,
        motherName = null,
        bloodGroup = null,
        mobileNo = null,
        status = "A",
    )

    private fun mark(studentId: String, subjectId: String, marks: Double) = ResultRow(
        examId = "ex1",
        studentId = studentId,
        subjectId = subjectId,
        subjectName = subjectId,
        marks = marks,
        absent = false,
        classId = "C9A",
        rollNo = 1,
        fullMarks = 100.0,
        isOptional = false,
    )

    private val hum = student("s1", "Hasina", 1, "Humanities")
    private val sci = student("s2", "Shakil", 2, "Science")

    @Test
    fun finishesAStudentWhoseOwnPapersAreAllMarked() {
        val rows = sheetFor(
            listOf(hum), all, listOf(mark("s1", "BAN1", 70.0), mark("s1", "HIST", 80.0)), "ex1",
        )
        assertFalse(rows[0].tabulation.incomplete)
        assertEquals(4.5, rows[0].tabulation.gpa!!, 0.001)   // A 4.0 and A+ 5.0
        assertEquals(
            listOf("BAN1", "HIST"),
            rows[0].tabulation.subjects.map { it.mark.subjectId },
        )
    }

    @Test
    fun doesNotHoldAResultOpenForAPaperTheStudentNeverSat() {
        // Physics has no mark for Hasina and never will: she is Humanities.
        val rows = sheetFor(
            listOf(hum), all, listOf(mark("s1", "BAN1", 70.0), mark("s1", "HIST", 80.0)), "ex1",
        )
        assertFalse(rows[0].tabulation.subjects.any { it.mark.subjectId == "PHY" })
    }

    @Test
    fun stillHoldsItOpenForAPaperTheStudentDoesSit() {
        val rows = sheetFor(listOf(sci), all, listOf(mark("s2", "BAN1", 70.0)), "ex1")
        assertTrue(rows[0].tabulation.incomplete)
        assertNull(rows[0].tabulation.gpa)
    }

    @Test
    fun ranksTheTwoGroupsAgainstEachOtherOnTheirOwnPapers() {
        val rows = sheetFor(
            listOf(hum, sci),
            all,
            listOf(
                mark("s1", "BAN1", 70.0), mark("s1", "HIST", 80.0),
                mark("s2", "BAN1", 90.0), mark("s2", "PHY", 90.0),
            ),
            "ex1",
        )
        assertEquals(1, rows.first { it.student.studentId == "s2" }.position)
        assertEquals(2, rows.first { it.student.studentId == "s1" }.position)
    }
}
