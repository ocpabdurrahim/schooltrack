package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The same cases exist in web/src/data/sheets.test.ts.
 *
 * Three compulsory subjects and one optional, as a real section has: with
 * only two compulsory the optional bonus is divided by two and swamps
 * everything, which is how the first draft of the web test fooled itself.
 */
class SheetsTest {

    private fun subject(id: String, optional: Boolean = false) = Subject(
        subjectId = id,
        subjectName = id,
        classNames = listOf("Class 6"),
        fullMarks = 100.0,
        isOptional = optional,
    )

    private val subjects = listOf(
        subject("Bangla"), subject("English"), subject("Maths"), subject("Agri", true),
    )

    private fun student(id: String, roll: Long) = StudentDetail(
        studentId = id, fullName = "Student $id", rollNo = roll, regNo = null,
        classId = "61", className = "Class 6", section = "A", groupName = null,
        gender = null, dob = null, fatherName = null, motherName = null,
        bloodGroup = null, mobileNo = null, status = "A",
    )

    private fun result(
        id: String,
        roll: Long,
        marks: Map<String, Double>,
        absent: List<String> = emptyList(),
    ): StudentResult {
        val subjectMarks = subjects.map { s ->
            SubjectMark(
                subjectId = s.subjectId,
                subjectName = s.subjectName,
                fullMarks = 100.0,
                marks = marks[s.subjectId],
                absent = s.subjectId in absent,
                isOptional = s.isOptional,
            )
        }
        return StudentResult(student(id, roll), tabulate(subjectMarks), null)
    }

    @Test
    fun totalAddsEverySubjectSatIncludingTheOptional() {
        val r = result("1", 1, mapOf("Bangla" to 80.0, "English" to 70.0, "Maths" to 60.0, "Agri" to 50.0))
        assertEquals(260.0, totalMarks(r.tabulation)!!, 0.001)
    }

    @Test
    fun totalCountsAnAbsenceAsNothing() {
        val r = result(
            "1", 1,
            mapOf("Bangla" to 80.0, "Maths" to 60.0, "Agri" to 50.0),
            absent = listOf("English"),
        )
        assertEquals(190.0, totalMarks(r.tabulation)!!, 0.001)
    }

    @Test
    fun totalRefusesAPartTotalWhileAMarkIsMissing() {
        val r = result("1", 1, mapOf("Bangla" to 80.0, "Agri" to 60.0))
        assertNull(totalMarks(r.tabulation))
    }

    @Test
    fun statsReportHighestLowestAndAverageOfMarksEntered() {
        val rows = listOf(
            result("1", 1, mapOf("Bangla" to 80.0, "English" to 70.0, "Maths" to 65.0, "Agri" to 60.0)),
            result("2", 2, mapOf("Bangla" to 40.0, "English" to 30.0, "Maths" to 45.0, "Agri" to 50.0)),
            result("3", 3, mapOf("Bangla" to 60.0, "Maths" to 55.0, "Agri" to 55.0), listOf("English")),
        )
        val bangla = subjectStats(rows, subjects).first { it.subjectId == "Bangla" }
        assertEquals(80.0, bangla.highest!!, 0.001)
        assertEquals(40.0, bangla.lowest!!, 0.001)
        assertEquals(60.0, bangla.average!!, 0.001)
        assertEquals(3, bangla.passed)
        assertEquals(0, bangla.failed)
    }

    @Test
    fun statsCountAnAbsenceAsFailedAndLeaveItOutOfTheAverage() {
        val rows = listOf(
            result("1", 1, mapOf("Bangla" to 80.0, "English" to 70.0, "Maths" to 65.0, "Agri" to 60.0)),
            result("2", 2, mapOf("Bangla" to 40.0, "English" to 30.0, "Maths" to 45.0, "Agri" to 50.0)),
            result("3", 3, mapOf("Bangla" to 60.0, "Maths" to 55.0, "Agri" to 55.0), listOf("English")),
        )
        val english = subjectStats(rows, subjects).first { it.subjectId == "English" }
        assertEquals(1, english.absent)
        assertEquals(2, english.failed)
        assertEquals(1, english.passed)
        assertEquals(50.0, english.average!!, 0.001)
    }

    @Test
    fun gradeDistributionIsInScaleOrderAndLeavesOutTheUnfinished() {
        val rows = listOf(
            result("1", 1, mapOf("Bangla" to 85.0, "English" to 85.0, "Maths" to 85.0, "Agri" to 85.0)),
            result("2", 2, mapOf("Bangla" to 75.0, "English" to 75.0, "Maths" to 75.0, "Agri" to 40.0)),
            result("3", 3, mapOf("Bangla" to 72.0, "English" to 78.0, "Maths" to 70.0, "Agri" to 30.0)),
            result("4", 4, mapOf("Bangla" to 20.0, "English" to 80.0, "Maths" to 80.0, "Agri" to 80.0)),
            result("5", 5, mapOf("Bangla" to 60.0, "Maths" to 60.0, "Agri" to 60.0)),
        )
        assertEquals(
            listOf("A+" to 1, "A" to 2, "F" to 1),
            gradeDistribution(rows),
        )
    }

    @Test
    fun meritOrderPutsTheBestFirstAndBreaksTiesByRoll() {
        val rows = listOf(
            result("3", 3, mapOf("Bangla" to 75.0, "English" to 75.0, "Maths" to 75.0, "Agri" to 40.0)),
            result("1", 1, mapOf("Bangla" to 85.0, "English" to 85.0, "Maths" to 85.0, "Agri" to 85.0)),
            result("2", 2, mapOf("Bangla" to 75.0, "English" to 75.0, "Maths" to 75.0, "Agri" to 40.0)),
        )
        assertEquals(listOf(1L, 2L, 3L), meritOrder(rows).map { it.student.rollNo })
    }

    @Test
    fun meritOrderPutsTheUnfinishedLastBelowEvenAFail() {
        val rows = listOf(
            result("1", 1, mapOf("Bangla" to 60.0, "Maths" to 60.0, "Agri" to 60.0)),
            result("2", 2, mapOf("Bangla" to 10.0, "English" to 10.0, "Maths" to 10.0, "Agri" to 10.0)),
        )
        assertEquals(listOf(2L, 1L), meritOrder(rows).map { it.student.rollNo })
    }
}
