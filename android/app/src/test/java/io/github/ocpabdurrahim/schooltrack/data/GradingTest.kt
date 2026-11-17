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

    // -----------------------------------------------------------------
    // components

    private val mcqCq = listOf(
        Component("MCQ", 30.0, 10.0),
        Component("CQ", 70.0, 23.0),
    )

    private val science = listOf(
        Component("MCQ", 25.0, 8.0),
        Component("CQ", 50.0, 17.0),
        Component("PRACTICAL", 25.0, 8.0),
    )

    private fun parted(
        name: String,
        components: List<Component>,
        parts: Map<String, Double?>,
        absent: Boolean = false,
        optional: Boolean = false,
        group: String? = null,
    ) = SubjectMark(
        subjectId = name,
        subjectName = name,
        fullMarks = components.sumOf { it.max },
        marks = null,
        absent = absent,
        isOptional = optional,
        components = components,
        parts = parts,
        combineGroup = group,
    )

    @Test
    fun addsThePartsUpAndGradesTheTotal() {
        val g = gradeForSubject(parted("Maths", mcqCq, mapOf("MCQ" to 22.0, "CQ" to 55.0)))
        assertEquals(77.0, g.total!!, 0.001)
        assertEquals("A", g.letter)
        assertEquals(4.0, g.point, 0.001)
        assertEquals(emptyList<String>(), g.failedParts)
    }

    @Test
    fun failsTheSubjectWhenOnePartIsBelowItsOwnPassMark() {
        // 68 out of 100 is a C by percentage, but the MCQ pass is 10.
        val g = gradeForSubject(parted("Maths", mcqCq, mapOf("MCQ" to 8.0, "CQ" to 60.0)))
        assertEquals(68.0, g.total!!, 0.001)
        assertEquals("F", g.letter)
        assertEquals(0.0, g.point, 0.001)
        assertEquals(listOf("MCQ"), g.failedParts)
    }

    @Test
    fun namesEveryPartThatFailedNotJustTheFirst() {
        val g = gradeForSubject(
            parted("Physics", science, mapOf("MCQ" to 5.0, "CQ" to 40.0, "PRACTICAL" to 3.0)),
        )
        assertEquals(listOf("MCQ", "PRACTICAL"), g.failedParts)
        assertEquals("F", g.letter)
    }

    @Test
    fun gradesAPracticalSubjectOnAllThreeParts() {
        val g = gradeForSubject(
            parted("Physics", science, mapOf("MCQ" to 20.0, "CQ" to 40.0, "PRACTICAL" to 20.0)),
        )
        assertEquals(80.0, g.total!!, 0.001)
        assertEquals("A+", g.letter)
        assertEquals(5.0, g.point, 0.001)
    }

    @Test
    fun treatsOneBlankPartAsNotEnteredNotAsAZero() {
        // The practical has not been marked yet. Scoring it 0 would fail a
        // child who has not sat it.
        val g = gradeForSubject(
            parted("Physics", science, mapOf("MCQ" to 20.0, "CQ" to 40.0, "PRACTICAL" to null)),
        )
        assertNull(g.total)
        assertEquals("-", g.letter)
        assertEquals(emptyList<String>(), g.failedParts)
    }

    @Test
    fun stillReadsAResultEnteredBeforeComponentsExisted() {
        // Components are defined on the subject, but this row has only a total.
        val g = gradeForSubject(
            SubjectMark("Maths", "Maths", 100.0, 68.0, components = mcqCq),
        )
        assertEquals(68.0, g.total!!, 0.001)
        assertEquals("A-", g.letter)
        assertEquals(emptyList<String>(), g.failedParts)
    }

    @Test
    fun isFWhenAbsentWhateverIsInTheParts() {
        val g = gradeForSubject(
            parted("Maths", mcqCq, mapOf("MCQ" to 30.0, "CQ" to 70.0), absent = true),
        )
        assertEquals("F", g.letter)
        assertEquals(0.0, g.point, 0.001)
    }

    // -----------------------------------------------------------------
    // papers graded as one unit

    private val ban1 = parted(
        "Bengali First Paper", mcqCq, mapOf("MCQ" to 25.0, "CQ" to 45.0), group = "BAN",
    )
    private val ban2 = parted(
        "Bengali Second Paper", mcqCq, mapOf("MCQ" to 24.0, "CQ" to 56.0), group = "BAN",
    )

    @Test
    fun mergesTheTwoPapersIntoOneSubjectOutOf200() {
        val unit = combineUnits(listOf(ban1, ban2))[0]
        assertEquals("Bengali", unit.subjectName)
        assertEquals(200.0, unit.fullMarks, 0.001)
        assertEquals(150.0, subjectTotal(unit)!!, 0.001)
        assertEquals("A", gradeForSubject(unit).letter)
    }

    @Test
    fun keepsTheUnitWhereTheFirstPaperWasNotAtTheEnd() {
        val maths = parted("Maths", mcqCq, mapOf("MCQ" to 20.0, "CQ" to 50.0))
        val names = combineUnits(listOf(ban1, maths, ban2)).map { it.subjectName }
        assertEquals(listOf("Bengali", "Maths"), names)
    }

    @Test
    fun keepsEachPaperNameOnItsComponents() {
        val low = parted(
            "Bengali Second Paper", mcqCq, mapOf("MCQ" to 4.0, "CQ" to 56.0), group = "BAN",
        )
        val unit = combineUnits(listOf(ban1, low))[0]
        assertEquals(listOf("Bengali Second Paper MCQ"), gradeForSubject(unit).failedParts)
    }

    @Test
    fun countsTheUnitOnceInTheGpaNotTwice() {
        // English 150/200 = 75% = 4.0, Maths 90 = 5.0 -> 4.5
        val eng1 = sub("English First Paper", 70.0).copy(combineGroup = "ENG")
        val eng2 = sub("English Second Paper", 80.0).copy(combineGroup = "ENG")
        val t = tabulate(listOf(eng1, eng2, sub("Maths", 90.0)))
        assertEquals(listOf("English", "Maths"), t.subjects.map { it.mark.subjectName })
        assertEquals(4.5, t.gpa!!, 0.001)
    }

    @Test
    fun leavesALonePaperAloneWhenItsPartnerIsNotInTheList() {
        val only = sub("Bengali First Paper", 70.0).copy(combineGroup = "BAN")
        assertEquals(
            listOf("Bengali First Paper"),
            combineUnits(listOf(only)).map { it.subjectName },
        )
    }

    @Test
    fun isIncompleteWhileEitherPaperIsUnmarked() {
        val eng1 = sub("English First Paper", 70.0).copy(combineGroup = "ENG")
        val blank = sub("English Second Paper", null).copy(combineGroup = "ENG")
        assertTrue(tabulate(listOf(eng1, blank)).incomplete)
    }

    @Test
    fun unitNameTakesTheCommonBeginningOfThePaperNames() {
        assertEquals("Bengali", unitName(listOf("Bengali First Paper", "Bengali Second Paper"), "BAN"))
        assertEquals("English", unitName(listOf("English 1st Paper", "English 2nd Paper"), "ENG"))
    }

    @Test
    fun unitNameFallsBackToTheGroupWhenTheNamesShareNothing() {
        assertEquals("BAN", unitName(listOf("Bangla", "Sahitya"), "BAN"))
        assertEquals("ENG", unitName(emptyList(), "ENG"))
    }
}
