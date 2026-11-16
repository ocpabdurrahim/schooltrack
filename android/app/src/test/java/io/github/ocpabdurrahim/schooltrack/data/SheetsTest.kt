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

    // ---- the results a parent reads ---------------------------------------
    // The same cases as the web's resultLines block.

    private fun exam(examId: String, examName: String, examYear: String, published: Boolean = true) =
        Exam(
            examId = examId,
            examName = examName,
            examYear = examYear,
            periodLabel = "$examName-$examYear".uppercase(),
            published = published,
        )

    private fun tabulationFor(marks: Map<String, Double>, absent: List<String> = emptyList()) =
        tabulate(
            subjects.map { s ->
                SubjectMark(
                    subjectId = s.subjectId,
                    subjectName = s.subjectName,
                    fullMarks = 100.0,
                    marks = marks[s.subjectId],
                    absent = absent.contains(s.subjectId),
                    isOptional = s.isOptional,
                )
            },
        )

    @Test
    fun `the results run oldest first, so progress reads forwards`() {
        val lines = resultLines(
            listOf(
                exam("final-2026", "Final", "2026") to
                    tabulationFor(mapOf("Bangla" to 80.0, "English" to 80.0, "Maths" to 80.0)),
                exam("half-2025", "Half yearly", "2025") to
                    tabulationFor(mapOf("Bangla" to 60.0, "English" to 60.0, "Maths" to 60.0)),
            ),
        )
        assertEquals(listOf("2025", "2026"), lines.map { it.examYear })
    }

    @Test
    fun `the marks are out of the full marks of every subject sat`() {
        val line = resultLines(
            listOf(
                exam("e", "Exam", "2026") to tabulationFor(
                    mapOf("Bangla" to 80.0, "English" to 70.0, "Maths" to 60.0, "Agri" to 90.0),
                ),
            ),
        ).first()
        assertEquals(300.0, line.obtained!!, 0.001)
        assertEquals(400.0, line.outOf, 0.001)   // the optional subject counts here
        assertEquals(75.0, line.percent!!, 0.001)
    }

    @Test
    fun `the total and the percentage are withheld while a mark is missing`() {
        val line = resultLines(
            listOf(exam("e", "Exam", "2026") to tabulationFor(mapOf("Bangla" to 80.0, "English" to 70.0))),
        ).first()
        assertEquals(true, line.incomplete)
        assertNull(line.obtained)
        assertNull(line.percent)
        assertNull(line.gpa)
    }

    @Test
    fun `the marks still show when one compulsory subject failed the exam`() {
        val line = resultLines(
            listOf(
                exam("e", "Exam", "2026") to tabulationFor(
                    mapOf("Bangla" to 80.0, "English" to 20.0, "Maths" to 70.0, "Agri" to 50.0),
                ),
            ),
        ).first()
        assertEquals("F", line.letter)
        assertEquals(0.0, line.gpa!!, 0.001)
        assertEquals(listOf("English"), line.failed)
        assertEquals(220.0, line.obtained!!, 0.001)
        assertEquals(55.0, line.percent!!, 0.001)
    }

    @Test
    fun `the total is withheld when the OPTIONAL mark is missing, but the GPA stays`() {
        // The GPA ignores a missing optional subject on purpose — the 4th
        // subject only ever helps — but a total that silently left one subject
        // out would be a different total from the one on the result sheet.
        val line = resultLines(
            listOf(
                exam("e", "Exam", "2026") to
                    tabulationFor(mapOf("Bangla" to 80.0, "English" to 70.0, "Maths" to 60.0)),
            ),
        ).first()
        assertEquals(false, line.incomplete)
        assertEquals(true, line.gpa != null)
        assertNull(line.obtained)
        assertNull(line.percent)
    }

    @Test
    fun `whether the exam is published is carried, since that is what a parent may see`() {
        val line = resultLines(
            listOf(
                exam("e", "Exam", "2026", published = false) to
                    tabulationFor(mapOf("Bangla" to 80.0, "English" to 70.0, "Maths" to 60.0)),
            ),
        ).first()
        assertEquals(false, line.published)
    }

    @Test
    fun `a student with no results at all has no lines`() {
        assertEquals(emptyList<ResultLine>(), resultLines(emptyList()))
    }
}
