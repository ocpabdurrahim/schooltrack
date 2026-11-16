package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The SAME cases exist in web/src/data/grading.test.ts. If a case is added
 * here, add it there: the two apps must never show a student two different
 * GPAs.
 */
class GradingTest {

    private fun sub(
        name: String,
        marks: Double?,
        full: Double = 100.0,
        absent: Boolean = false,
        optional: Boolean = false,
    ) = SubjectMark(name, name, full, marks, absent, optional)

    @Test
    fun mapsTheBands() {
        assertEquals(Grade("A+", 5.0), gradeFor(80.0))
        assertEquals(Grade("A", 4.0), gradeFor(79.0))
        assertEquals(Grade("A", 4.0), gradeFor(70.0))
        assertEquals(Grade("A-", 3.5), gradeFor(69.0))
        assertEquals(Grade("B", 3.0), gradeFor(50.0))
        assertEquals(Grade("C", 2.0), gradeFor(40.0))
        assertEquals(Grade("D", 1.0), gradeFor(33.0))
        assertEquals(Grade("F", 0.0), gradeFor(32.0))
        assertEquals(Grade("F", 0.0), gradeFor(0.0))
    }

    @Test
    fun gradesOnThePercentageNotTheRawMark() {
        assertEquals(Grade("C", 2.0), gradeFor(20.0, 50.0))   // 40%
        assertEquals(Grade("D", 1.0), gradeFor(17.0, 50.0))   // 34%
        assertEquals(Grade("F", 0.0), gradeFor(16.0, 50.0))   // 32%
    }

    @Test
    fun absentIsFAndAMissingMarkIsNoGrade() {
        assertEquals(Grade("F", 0.0), gradeFor(90.0, 100.0, absent = true))
        assertEquals(Grade("-", 0.0), gradeFor(null))
    }

    @Test
    fun averagesThePoints() {
        val t = tabulate(listOf(sub("Bangla", 85.0), sub("English", 75.0), sub("Maths", 65.0)))
        assertEquals(4.17, t.gpa!!, 0.001)
        assertEquals("A", t.letter)
        assertTrue(!t.incomplete)
    }

    @Test
    fun failsTheWholeExamOnOneF() {
        val t = tabulate(listOf(sub("Bangla", 95.0), sub("English", 92.0), sub("Maths", 20.0)))
        assertEquals(0.0, t.gpa!!, 0.001)
        assertEquals("F", t.letter)
        assertEquals(listOf("Maths"), t.failed)
    }

    @Test
    fun countsAnAbsenceAsAFail() {
        val t = tabulate(listOf(sub("Bangla", 95.0), sub("Maths", null, absent = true)))
        assertEquals("F", t.letter)
        assertEquals(listOf("Maths"), t.failed)
    }

    @Test
    fun addsOnlyThePointsAboveTwoFromTheOptionalSubject() {
        val t = tabulate(
            listOf(
                sub("Bangla", 75.0), sub("English", 75.0), sub("Maths", 75.0),
                sub("Agriculture", 85.0, optional = true),
            ),
        )
        assertEquals(5.0, t.gpa!!, 0.001)
        assertEquals("A+", t.letter)
    }

    @Test
    fun givesNoBonusForAnOptionalSubjectAtOrBelowTwoPoints() {
        val t = tabulate(
            listOf(
                sub("Bangla", 75.0), sub("English", 75.0), sub("Maths", 75.0),
                sub("Agriculture", 45.0, optional = true),
            ),
        )
        assertEquals(4.0, t.gpa!!, 0.001)
    }

    @Test
    fun doesNotFailAStudentForFailingTheOptionalSubject() {
        val t = tabulate(
            listOf(
                sub("Bangla", 75.0), sub("English", 75.0), sub("Maths", 75.0),
                sub("Agriculture", 10.0, optional = true),
            ),
        )
        assertEquals(4.0, t.gpa!!, 0.001)
        assertEquals("A", t.letter)
        assertTrue(t.failed.isEmpty())
    }

    @Test
    fun neverExceedsFive() {
        val t = tabulate(
            listOf(
                sub("Bangla", 100.0), sub("English", 100.0), sub("Maths", 100.0),
                sub("Agriculture", 100.0, optional = true),
            ),
        )
        assertEquals(5.0, t.gpa!!, 0.001)
    }

    @Test
    fun reportsIncompleteRatherThanGuessingAGpa() {
        val t = tabulate(listOf(sub("Bangla", 75.0), sub("English", null), sub("Maths", 75.0)))
        assertNull(t.gpa)
        assertTrue(t.incomplete)
        assertEquals("-", t.letter)
    }

    @Test
    fun isIncompleteWhenThereAreNoCompulsorySubjectsAtAll() {
        val t = tabulate(listOf(sub("Agriculture", 80.0, optional = true)))
        assertNull(t.gpa)
        assertTrue(t.incomplete)
    }
}
