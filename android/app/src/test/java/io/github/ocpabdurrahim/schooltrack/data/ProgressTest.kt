package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The SAME cases exist in web/src/data/progress.test.ts. */
class ProgressTest {

    private fun sub(
        name: String,
        marks: Double?,
        full: Double = 100.0,
        absent: Boolean = false,
    ) = SubjectMark(name, name, full, marks, absent)

    /** Three compulsory subjects, as a section has. */
    private fun exam(bangla: Double?, english: Double?, maths: Double?) = tabulate(
        listOf(sub("BANGLA", bangla), sub("ENGLISH", english), sub("MATHEMATICS", maths)),
    )

    @Test
    fun putsEachSubjectOnOneLineWithTheMoveBetweenThem() {
        val got = progressFor(exam(60.0, 55.0, 70.0), exam(72.0, 51.0, 70.0))
        assertEquals(
            listOf(
                Triple("BANGLA", 60.0, 72.0),
                Triple("ENGLISH", 55.0, 51.0),
                Triple("MATHEMATICS", 70.0, 70.0),
            ),
            got.subjects.map { Triple(it.subjectName, it.before, it.after) },
        )
        assertEquals(listOf(12.0, -4.0, 0.0), got.subjects.map { it.change })
    }

    @Test
    fun carriesTheGradeFromEachExamNotJustTheMarks() {
        val got = progressFor(exam(60.0, 55.0, 70.0), exam(82.0, 51.0, 70.0))
        assertEquals("A-", got.subjects[0].beforeLetter)
        assertEquals("A+", got.subjects[0].afterLetter)
    }

    @Test
    fun putsTheSubjectsInTheSchoolsOrder() {
        val got = progressFor(exam(60.0, 55.0, 70.0), exam(72.0, 51.0, 70.0))
        assertEquals(
            listOf("BANGLA", "ENGLISH", "MATHEMATICS"),
            got.subjects.map { it.subjectName },
        )
    }

    @Test
    fun totalsAndTheGpaMoveToo() {
        val got = progressFor(exam(60.0, 55.0, 70.0), exam(72.0, 51.0, 70.0))
        assertEquals(185.0, got.totalBefore!!, 0.001)
        assertEquals(193.0, got.totalAfter!!, 0.001)
        assertEquals(8.0, got.totalChange!!, 0.001)
        assertEquals(3.5, got.gpaBefore!!, 0.01)
        assertEquals(3.67, got.gpaAfter!!, 0.01)
        assertEquals("better", got.verdict)
    }

    @Test
    fun saysWorseWhenTheGpaFellAndSameWhenItDidNotMove() {
        assertEquals("worse", progressFor(exam(80.0, 80.0, 80.0), exam(50.0, 50.0, 50.0)).verdict)
        assertEquals("same", progressFor(exam(80.0, 80.0, 80.0), exam(81.0, 82.0, 83.0)).verdict)
    }

    // --- what it refuses to compare ----------------------------------------

    @Test
    fun refusesToCallAPaperThatWasNotSatAFallOfSeventyMarks() {
        // The figure that gets a child shouted at.
        val before = tabulate(
            listOf(sub("BANGLA", 70.0), sub("ENGLISH", 60.0), sub("AGRICULTURE", 70.0)),
        )
        val after = tabulate(listOf(sub("BANGLA", 72.0), sub("ENGLISH", 61.0)))
        val agri = progressFor(before, after).subjects.first { it.subjectName == "AGRICULTURE" }
        assertEquals(70.0, agri.before!!, 0.001)
        assertNull(agri.after)
        assertNull(agri.change)
    }

    @Test
    fun leavesThatSubjectOutOfBothTotals() {
        val before = tabulate(
            listOf(sub("BANGLA", 70.0), sub("ENGLISH", 60.0), sub("AGRICULTURE", 70.0)),
        )
        val after = tabulate(listOf(sub("BANGLA", 72.0), sub("ENGLISH", 61.0)))
        val got = progressFor(before, after)
        assertEquals(130.0, got.totalBefore!!, 0.001)
        assertEquals(133.0, got.totalAfter!!, 0.001)
        assertEquals(3.0, got.totalChange!!, 0.001)
    }

    @Test
    fun showsASubjectThatIsNewInTheLaterExam() {
        val got = progressFor(
            tabulate(listOf(sub("BANGLA", 70.0))),
            tabulate(listOf(sub("BANGLA", 72.0), sub("ICT", 44.0, full = 50.0))),
        )
        val ict = got.subjects.first { it.subjectName == "ICT" }
        assertNull(ict.before)
        assertEquals(44.0, ict.after!!, 0.001)
        assertNull(ict.change)
    }

    @Test
    fun withholdsTheGpaMoveWhileEitherExamIsUnfinished() {
        val got = progressFor(exam(60.0, 55.0, 70.0), exam(72.0, null, 70.0))
        assertNull(got.gpaAfter)
        assertNull(got.gpaChange)
        assertEquals("unknown", got.verdict)   // not "same": not in yet is not level
    }

    @Test
    fun countsAnAbsenceAsNoughtBecauseTheChildDidSitTheExam() {
        val after = tabulate(
            listOf(
                sub("BANGLA", null, absent = true),
                sub("ENGLISH", 51.0),
                sub("MATHEMATICS", 70.0),
            ),
        )
        val got = progressFor(exam(60.0, 55.0, 70.0), after)
        assertEquals(0.0, got.subjects[0].after!!, 0.001)
        assertEquals(-60.0, got.subjects[0].change!!, 0.001)
        assertEquals("F", got.subjects[0].afterLetter)
    }

    @Test
    fun copesWithAStudentWhoHasOnlyOneOfTheTwoExams() {
        val only = progressFor(null, exam(72.0, 51.0, 70.0))
        assertEquals(3, only.subjects.size)
        assertTrue(only.subjects.all { it.before == null })
        assertNull(only.totalBefore)
        assertEquals("unknown", only.verdict)
        assertEquals(emptyList<SubjectProgress>(), progressFor(null, null).subjects)
    }

    // --- the merit position ------------------------------------------------

    @Test
    fun turnsTheSignOverTwelfthToSeventhIsFivePlacesBetter() {
        val got = progressFor(
            exam(60.0, 55.0, 70.0), exam(72.0, 51.0, 70.0),
            positionBefore = 12, positionAfter = 7,
        )
        assertEquals(5, got.positionChange)
    }

    @Test
    fun andSeventhToTwelfthIsFiveWorse() {
        val got = progressFor(
            exam(60.0, 55.0, 70.0), exam(72.0, 51.0, 70.0),
            positionBefore = 7, positionAfter = 12,
        )
        assertEquals(-5, got.positionChange)
    }

    @Test
    fun saysNothingWhenEitherExamLeftThemUnranked() {
        val got = progressFor(
            exam(60.0, 55.0, 70.0), exam(72.0, 51.0, 70.0),
            positionBefore = 12, positionAfter = null,
        )
        assertNull(got.positionChange)
        assertEquals(12, got.positionBefore)
    }

    // --- signed ------------------------------------------------------------

    @Test
    fun alwaysShowsTheSignBecauseTheSignIsThePoint() {
        assertEquals("+12", signed(12.0))
        assertEquals("−4", signed(-4.0))
        assertEquals("+0.33", signed(0.33, 2))
        assertEquals("−0.33", signed(-0.33, 2))
    }

    @Test
    fun writesNoSignOnNothingAtAll() {
        assertEquals("0", signed(0.0))
        assertEquals("0.00", signed(0.0, 2))
    }

    @Test
    fun writesADashWhereThereIsNoFigure() {
        assertEquals("—", signed(null))
    }
}
