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
        religion = null,
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
        val tabulation = tabulate(subjectMarks)
        // Built the way sheetFor builds it. Bangla is the first paper of the
        // school's order (SubjectOrder.kt), so it is the one the chain breaks
        // a tie on -- and a mark is a mark here, not the 200 a real Bangla
        // unit is.
        return StudentResult(
            student = student(id, roll),
            tabulation = tabulation,
            position = null,
            merit = MeritKey(
                incomplete = tabulation.incomplete,
                gpa = tabulation.gpa,
                failed = tabulation.failed.size,
                total = totalMarks(tabulation),
                firstPaper = marks["Bangla"],
                rollNo = roll,
            ),
        )
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
        val bangla = subjectStats(rows, subjects.map { subjectMarkFor(it, null) }).first { it.subjectId == "Bangla" }
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
        val english = subjectStats(rows, subjects.map { subjectMarkFor(it, null) }).first { it.subjectId == "English" }
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
    fun meritOrderBreaksAnEqualGpaOnTheTotalBeforeItReachesTheRoll() {
        // Both 4.00. Roll 2 is eleven marks ahead and goes first, which the
        // old rule -- GPA then roll -- got backwards.
        val rows = listOf(
            result("1", 1, mapOf("Bangla" to 70.0, "English" to 78.0, "Maths" to 72.0, "Agri" to 40.0)),
            result("2", 2, mapOf("Bangla" to 79.0, "English" to 75.0, "Maths" to 77.0, "Agri" to 40.0)),
        )
        assertEquals(listOf(2L, 1L), meritOrder(rows).map { it.student.rollNo })
    }

    @Test
    fun meritOrderBreaksAnEqualTotalOnBanglaTheFirstPaperOfTheOrder() {
        val rows = listOf(
            result("1", 1, mapOf("Bangla" to 70.0, "English" to 76.0, "Maths" to 74.0, "Agri" to 40.0)),
            result("2", 2, mapOf("Bangla" to 76.0, "English" to 70.0, "Maths" to 74.0, "Agri" to 40.0)),
        )
        assertEquals(listOf(2L, 1L), meritOrder(rows).map { it.student.rollNo })
    }

    @Test
    fun meritOrderRanksTheFailureWithFewerSubjectsFailedAboveTheOneWithMore() {
        // Roll 2 scored more over the exam and still comes second: one
        // subject failed beats two, which is the school's own rule.
        val rows = listOf(
            result("1", 1, mapOf("Bangla" to 60.0, "English" to 20.0, "Maths" to 55.0, "Agri" to 50.0)),
            result("2", 2, mapOf("Bangla" to 70.0, "English" to 20.0, "Maths" to 25.0, "Agri" to 50.0)),
        )
        assertEquals(listOf(1, 2), rows.map { it.tabulation.failed.size })
        assertEquals(listOf(1L, 2L), meritOrder(rows).map { it.student.rollNo })
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

    private fun exam(
        examId: String,
        examName: String,
        examYear: String,
        published: Boolean = true,
        sortOrder: Long = 0,
    ) = Exam(
        examId = examId,
        examName = examName,
        examYear = examYear,
        periodLabel = "$examName-$examYear".uppercase(),
        published = published,
        sortOrder = sortOrder,
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
    fun `the school's order decides within a year, which the name cannot`() {
        // "Annual" sorts before "Half yearly" alphabetically but comes after it
        // in the year — the whole reason the order field exists.
        val marks = mapOf("Bangla" to 70.0, "English" to 70.0, "Maths" to 70.0)
        val lines = resultLines(
            listOf(
                SatExam(exam("annual-2026", "Annual", "2026", sortOrder = 2), tabulationFor(marks)),
                SatExam(exam("half-yearly-2026", "Half yearly", "2026", sortOrder = 1), tabulationFor(marks)),
            ),
        )
        assertEquals(listOf("Half yearly", "Annual"), lines.map { it.examName })
    }

    @Test
    fun `without an order it falls back to the exam id`() {
        val marks = mapOf("Bangla" to 70.0, "English" to 70.0, "Maths" to 70.0)
        val lines = resultLines(
            listOf(
                SatExam(exam("half-yearly-2026", "Half yearly", "2026"), tabulationFor(marks)),
                SatExam(exam("annual-2026", "Annual", "2026"), tabulationFor(marks)),
            ),
        )
        assertEquals(listOf("annual-2026", "half-yearly-2026"), lines.map { it.examId })
        assertEquals(true, lines.all { it.sortOrder == 0L })
    }

    @Test
    fun `the results run oldest year first, so a report reads forwards`() {
        val lines = resultLines(
            listOf(
                SatExam(
                    exam("final-2026", "Final", "2026"),
                    tabulationFor(mapOf("Bangla" to 80.0, "English" to 80.0, "Maths" to 80.0)),
                ),
                SatExam(
                    exam("half-2025", "Half yearly", "2025"),
                    tabulationFor(mapOf("Bangla" to 60.0, "English" to 60.0, "Maths" to 60.0)),
                ),
            ),
        )
        assertEquals(listOf("2025", "2026"), lines.map { it.examYear })
    }

    @Test
    fun `the marks are out of the full marks of every subject sat`() {
        val line = resultLines(
            listOf(
                SatExam(
                    exam("e", "Exam", "2026"),
                    tabulationFor(
                        mapOf("Bangla" to 80.0, "English" to 70.0, "Maths" to 60.0, "Agri" to 90.0),
                    ),
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
            listOf(SatExam(exam("e", "Exam", "2026"), tabulationFor(mapOf("Bangla" to 80.0, "English" to 70.0)))),
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
                SatExam(
                    exam("e", "Exam", "2026"),
                    tabulationFor(
                        mapOf("Bangla" to 80.0, "English" to 20.0, "Maths" to 70.0, "Agri" to 50.0),
                    ),
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
    fun `the marks still total when the OPTIONAL subject was never sat`() {
        // This used to withhold the total, on the grounds that a total leaving
        // one subject out would disagree with the result sheet's. The school
        // found what that looked like on paper: "GPA 4.33" printed beside
        // "Total —", which reads as broken arithmetic. A student sits ONE 4th
        // subject, not every optional one their class is offered, so there was
        // never a mark coming.
        //
        // The objection is answered a better way now: the result sheet, the
        // mark sheets and this report all call marksTotal().
        val line = resultLines(
            listOf(
                SatExam(
                    exam("e", "Exam", "2026"),
                    tabulationFor(mapOf("Bangla" to 80.0, "English" to 70.0, "Maths" to 60.0)),
                ),
            ),
        ).first()
        assertEquals(false, line.incomplete)
        assertEquals(true, line.gpa != null)
        assertEquals(210.0, line.obtained!!, 0.001)   // 80 + 70 + 60, out of the three sat
        assertEquals(300.0, line.outOf, 0.001)        // NOT 400: the unsat 4th is not counted
        assertEquals(70.0, line.percent!!, 0.001)
    }

    @Test
    fun `whether the exam is published is carried, since that is what a parent may see`() {
        val line = resultLines(
            listOf(
                SatExam(
                    exam("e", "Exam", "2026", published = false),
                    tabulationFor(mapOf("Bangla" to 80.0, "English" to 70.0, "Maths" to 60.0)),
                ),
            ),
        ).first()
        assertEquals(false, line.published)
    }

    @Test
    fun `a student with no results at all has no lines`() {
        assertEquals(emptyList<ResultLine>(), resultLines(emptyList()))
    }
}
