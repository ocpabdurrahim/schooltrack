package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Test
import kotlin.math.sign

/**
 * The SAME cases exist in web/src/data/merit.test.ts. If a case is added here,
 * add it there: a student must not be seventh on the phone and eighth on the
 * sheet pinned to the wall.
 */
class MeritTest {

    private fun key(
        incomplete: Boolean = false,
        gpa: Double? = 4.0,
        failed: Int = 0,
        total: Double? = 800.0,
        firstPaper: Double? = 70.0,
        rollNo: Long = 1,
    ) = MeritKey(incomplete, gpa, failed, total, firstPaper, rollNo)

    /** The rolls, best first. */
    private fun order(keys: List<MeritKey>) =
        keys.sortedWith(MERIT).map { it.rollNo }

    @Test
    fun putsTheHigherGpaFirst() {
        assertEquals(
            listOf(2L, 3L, 1L),
            order(listOf(
                key(rollNo = 1, gpa = 3.5),
                key(rollNo = 2, gpa = 4.5),
                key(rollNo = 3, gpa = 4.0),
            )),
        )
    }

    @Test
    fun breaksAnEqualGpaOnTotalMarks() {
        assertEquals(
            listOf(2L, 1L),
            order(listOf(
                key(rollNo = 1, total = 780.0),
                key(rollNo = 2, total = 812.0),
            )),
        )
    }

    @Test
    fun breaksAnEqualTotalOnTheFirstPaperOfTheOrder() {
        // Bangla 1st Paper, for this school.
        assertEquals(
            listOf(2L, 1L),
            order(listOf(
                key(rollNo = 1, firstPaper = 66.0),
                key(rollNo = 2, firstPaper = 71.0),
            )),
        )
    }

    @Test
    fun breaksEverythingElseOnTheRollLowestFirst() {
        assertEquals(
            listOf(2L, 5L, 9L),
            order(listOf(key(rollNo = 9), key(rollNo = 2), key(rollNo = 5))),
        )
    }

    @Test
    fun isTheSchoolRuleFewerSubjectsFailedRanksHigher() {
        // Even though roll 2 scored 90 marks more over the exam.
        assertEquals(
            listOf(1L, 2L),
            order(listOf(
                key(rollNo = 1, gpa = 0.0, failed = 1, total = 510.0),
                key(rollNo = 2, gpa = 0.0, failed = 3, total = 600.0),
            )),
        )
    }

    @Test
    fun stillOrdersTwoEqualFailuresByMarksThenTheFirstPaper() {
        assertEquals(
            listOf(2L, 3L, 1L),
            order(listOf(
                key(rollNo = 1, gpa = 0.0, failed = 2, total = 480.0, firstPaper = 50.0),
                key(rollNo = 2, gpa = 0.0, failed = 2, total = 520.0, firstPaper = 40.0),
                key(rollNo = 3, gpa = 0.0, failed = 2, total = 480.0, firstPaper = 61.0),
            )),
        )
    }

    @Test
    fun putsEveryPassingStudentAboveEveryFailure() {
        assertEquals(
            listOf(2L, 1L),
            order(listOf(
                key(rollNo = 1, gpa = 0.0, failed = 1, total = 700.0),
                key(rollNo = 2, gpa = 1.0, failed = 0, total = 400.0),
            )),
        )
    }

    @Test
    fun sortsAWithheldFigureBelowARealOneNeverAbove() {
        assertEquals(
            listOf(2L, 1L),
            order(listOf(
                key(rollNo = 1, total = null),
                key(rollNo = 2, total = 1.0),
            )),
        )
    }

    @Test
    fun leavesTheUnfinishedAtTheEndWhateverTheyScored() {
        assertEquals(
            listOf(2L, 1L),
            order(listOf(
                key(rollNo = 1, incomplete = true, gpa = null),
                key(rollNo = 2, gpa = 0.0, failed = 5, total = 100.0),
            )),
        )
    }

    @Test
    fun answersTheSameWayWhicheverSideThePairIsHandedIn() {
        val a = key(rollNo = 4)
        val b = key(rollNo = 7)
        assertEquals(
            -compareMerit(b, a).sign,
            compareMerit(a, b).sign,
        )
    }

    // --- the positions on the list -----------------------------------------

    @Test
    fun numbersThem123WithNoTwoSharing() {
        val keys = listOf(
            key(rollNo = 1, gpa = 4.0, total = 800.0),
            key(rollNo = 2, gpa = 4.0, total = 800.0),
            key(rollNo = 3, gpa = 5.0, total = 900.0),
        )
        assertEquals(listOf<Int?>(2, 3, 1), meritPositions(keys))
    }

    @Test
    fun givesAnIncompleteResultNoPositionAtAll() {
        val keys = listOf(
            key(rollNo = 1, gpa = 4.0),
            key(rollNo = 2, incomplete = true, gpa = null),
            key(rollNo = 3, gpa = 5.0),
        )
        assertEquals(listOf<Int?>(2, null, 1), meritPositions(keys))
    }

    @Test
    fun keepsTheAnswersInTheOrderTheStudentsWereHandedIn() {
        val keys = listOf(
            key(rollNo = 9, gpa = 2.0),
            key(rollNo = 4, gpa = 5.0),
            key(rollNo = 7, gpa = 3.0),
        )
        assertEquals(listOf<Int?>(3, 1, 2), meritPositions(keys))
    }

    @Test
    fun sharesAPositionAndSkipsTheNextIfEverTwoCouldBeLevel() {
        val twin = key(rollNo = 5, gpa = 4.0)
        assertEquals(
            listOf<Int?>(1, 1, 3),
            meritPositions(listOf(twin, twin.copy(), key(rollNo = 6, gpa = 3.0))),
        )
    }

    @Test
    fun ranksNobodyInAnEmptySectionWithoutFallingOver() {
        assertEquals(emptyList<Int?>(), meritPositions(emptyList()))
    }
}
