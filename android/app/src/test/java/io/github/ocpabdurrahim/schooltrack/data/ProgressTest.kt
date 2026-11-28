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

    // ---- a percentage counted from both exams ----------------------------
    // Half: 185/300 = 61.666...%   Annual: 193/300 = 64.333...%

    private fun half() = exam(60.0, 55.0, 70.0)
    private fun annual() = exam(72.0, 51.0, 70.0)

    @Test
    fun weighsTheTwoExamsTheWayTheSplitSays() {
        val p = progressFor(half(), annual())
        assertEquals(63.5333, overallPercent(p, Weights(30.0, 70.0))!!, 0.001)
        assertEquals(62.4667, overallPercent(p, Weights(70.0, 30.0))!!, 0.001)
        assertEquals(63.0, overallPercent(p, EVEN)!!, 0.001)
    }

    @Test
    fun readsASplitByItsProportionsNotItsDigits() {
        val p = progressFor(half(), annual())
        assertEquals(
            overallPercent(p, Weights(30.0, 70.0))!!,
            overallPercent(p, Weights(3.0, 7.0))!!,
            1e-9,
        )
    }

    @Test
    fun givesEachSubjectItsOwnCombinedPercentage() {
        val p = progressFor(half(), annual())
        // 60% x .3 + 72% x .7 = 68.4
        assertEquals(68.4, subjectPercent(p.subjects[0], Weights(30.0, 70.0))!!, 1e-6)
    }

    @Test
    fun holdsTheSplitWhenThePapersAreOutOfDifferentTotals() {
        // Half-yearly out of 50, annual out of 100 -- the case that catches a
        // percentage built by adding raw marks. 30 of 50 is 60%, 72 of 100 is
        // 72%, so a 30/70 split must give 68.4, exactly as above.
        val small = tabulate(listOf(sub("BANGLA", 30.0, full = 50.0)))
        val big = tabulate(listOf(sub("BANGLA", 72.0)))
        val p = progressFor(small, big)
        assertEquals(68.4, subjectPercent(p.subjects[0], Weights(30.0, 70.0))!!, 1e-6)
        assertEquals(68.4, overallPercent(p, Weights(30.0, 70.0))!!, 1e-6)
        // Adding the marks would give 102/150 = 68%, which is NOT a 30/70 split.
        assertTrue(Math.abs(overallPercent(p, Weights(30.0, 70.0))!! - 68.0) > 0.3)
    }

    @Test
    fun refusesASubjectThatOnlyOneExamMarked() {
        val p = progressFor(exam(60.0, 55.0, null), exam(72.0, 51.0, 70.0))
        val maths = p.subjects.first { it.subjectName == "MATHEMATICS" }
        assertNull(subjectPercent(maths, EVEN))
    }

    @Test
    fun countsAnAbsentPaperAsNoughtBecauseTheChildSatTheExam() {
        val p = progressFor(
            exam(60.0, 55.0, 70.0),
            tabulate(
                listOf(
                    sub("BANGLA", null, absent = true),
                    sub("ENGLISH", 51.0),
                    sub("MATHEMATICS", 70.0),
                ),
            ),
        )
        assertEquals(30.0, subjectPercent(p.subjects[0], EVEN)!!, 1e-6)
    }

    @Test
    fun saysNothingAtAllWhenTheSplitIsEmpty() {
        assertNull(overallPercent(progressFor(half(), annual()), Weights(0.0, 0.0)))
    }

    @Test
    fun printsADashRatherThanNaNPercent() {
        assertEquals("—", pctText(null))
        assertEquals("63.53%", pctText(63.5333))
        assertEquals("64%", pctText(63.5333, 0))
    }

    // ---- the component columns, as page 43 prints them --------------------

    private val cqMcq = listOf(
        Component("CQ", 70.0, 23.0),
        Component("MCQ", 30.0, 10.0),
    )
    private val science = listOf(
        Component("CQ", 50.0, 17.0),
        Component("MCQ", 25.0, 8.0),
        Component("PRACTICAL", 25.0, 8.0),
    )

    private fun parted(
        name: String,
        components: List<Component>,
        parts: Map<String, Double?>,
        absent: Boolean = false,
        combineGroup: String? = null,
    ) = SubjectMark(
        subjectId = name,
        subjectName = name,
        fullMarks = components.sumOf { it.max },
        marks = null,
        absent = absent,
        components = components,
        parts = parts,
        combineGroup = combineGroup,
    )

    @Test
    fun printsOnlyTheComponentsTheStudentIsActuallyMarkedIn() {
        val e1 = tabulate(listOf(parted("BANGLA", cqMcq, mapOf("CQ" to 45.0, "MCQ" to 20.0))))
        val e2 = tabulate(listOf(parted("BANGLA", cqMcq, mapOf("CQ" to 50.0, "MCQ" to 22.0))))
        assertEquals(listOf("MCQ", "CQ"), progressFor(e1, e2).partLabels)
    }

    @Test
    fun addsPracticalForAScienceStudentInMarksheetOrder() {
        val m = mapOf("CQ" to 40.0, "MCQ" to 20.0, "PRACTICAL" to 20.0)
        val got = progressFor(
            tabulate(listOf(parted("PHYSICS", science, m))),
            tabulate(listOf(parted("PHYSICS", science, m))),
        )
        assertEquals(listOf("MCQ", "CQ", "PRACTICAL"), got.partLabels)
    }

    @Test
    fun carriesEachExamsComponentMarksOntoTheRow() {
        val a = mapOf("CQ" to 40.0, "MCQ" to 20.0, "PRACTICAL" to 20.0)
        val b = mapOf("CQ" to 42.0, "MCQ" to 21.0, "PRACTICAL" to 22.0)
        val row = progressFor(
            tabulate(listOf(parted("PHYSICS", science, a))),
            tabulate(listOf(parted("PHYSICS", science, b))),
        ).subjects[0]
        assertEquals(mapOf("CQ" to 40.0, "MCQ" to 20.0, "PRACTICAL" to 20.0), row.partsBefore)
        assertEquals(mapOf("CQ" to 42.0, "MCQ" to 21.0, "PRACTICAL" to 22.0), row.partsAfter)
    }

    @Test
    fun sumsLikePartsAcrossPapersMergedIntoOneGradedUnit() {
        // Bangla 1st + 2nd are one unit out of 200. A column headed MCQ can
        // hold one figure, so the two papers' MCQ marks are added.
        fun unit() = combineUnits(
            listOf(
                parted("B1", cqMcq, mapOf("CQ" to 45.0, "MCQ" to 20.0), combineGroup = "BANGLA"),
                parted("B2", cqMcq, mapOf("CQ" to 40.0, "MCQ" to 18.0), combineGroup = "BANGLA"),
            ),
        )
        val got = progressFor(tabulate(unit()), tabulate(unit()))
        assertEquals(listOf("MCQ", "CQ"), got.partLabels)
        assertEquals(mapOf("CQ" to 85.0, "MCQ" to 38.0), got.subjects[0].partsBefore)
    }

    @Test
    fun showsNoPartsForAnAbsentPaperRatherThanARowOfNoughts() {
        val sat = tabulate(
            listOf(parted("PHYSICS", science, mapOf("CQ" to 40.0, "MCQ" to 20.0, "PRACTICAL" to 20.0))),
        )
        val missed = tabulate(listOf(parted("PHYSICS", science, emptyMap(), absent = true)))
        val row = progressFor(sat, missed).subjects[0]
        assertEquals(3, row.partsBefore.size)
        assertTrue(row.partsAfter.isEmpty())
    }

    @Test
    fun leavesOutAComponentWithNothingEnteredInItYet() {
        val m = mapOf("CQ" to 40.0, "MCQ" to 20.0, "PRACTICAL" to null)
        val got = progressFor(
            tabulate(listOf(parted("PHYSICS", science, m))),
            tabulate(listOf(parted("PHYSICS", science, m))),
        )
        assertEquals(listOf("MCQ", "CQ"), got.partLabels)
    }

    @Test
    fun shortensTheHeadingsTheWayTheSheetPrintsThem() {
        assertEquals("MCQ", shortPart("MCQ"))
        assertEquals("CQ", shortPart("CQ"))
        assertEquals("Pract", shortPart("PRACTICAL"))
        assertEquals("Writ", shortPart("WRITTEN"))
    }

    // ---- each exam's own bottom line --------------------------------------

    @Test
    fun reportsAPassWithThatExamsOwnFigures() {
        val t = exam(80.0, 75.0, 70.0)
        val got = examSummary(t, 225.0, 3)
        assertEquals(225.0, got.total!!, 1e-9)
        assertEquals(3, got.position)
        assertEquals("Passed", got.result)
    }

    @Test
    fun reportsAFailWhenACompulsorySubjectWasFailed() {
        assertEquals("Failed", examSummary(exam(20.0, 75.0, 70.0), 165.0, 9).result)
    }

    @Test
    fun saysNeitherPassedNorFailedWhileAMarkIsMissing() {
        val got = examSummary(exam(null, 75.0, 70.0), null, null)
        assertEquals("—", got.result)
        assertNull(got.gpa)
        assertEquals("—", got.letter)
    }

    @Test
    fun hasNothingToSayAboutAnExamTheStudentDidNotSit() {
        val got = examSummary(null, null, null)
        assertNull(got.total)
        assertNull(got.gpa)
        assertNull(got.position)
        assertEquals("—", got.result)
    }
}
