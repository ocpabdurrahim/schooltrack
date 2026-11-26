package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The SAME cases exist in web/src/data/cellparts.test.ts. If a case is added
 * here, add it there: a cell that reads one way on the sheet and another way
 * on the phone is worse than no cell at all.
 */
class CellPartsTest {

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
        group: String? = null,
    ) = SubjectMark(
        subjectId = name,
        subjectName = name,
        fullMarks = components.sumOf { it.max },
        marks = null,
        absent = absent,
        components = components,
        parts = parts,
        combineGroup = group,
    )

    /** A cell as the tabulation holds it: the mark with its grade worked out. */
    private fun cell(m: SubjectMark) = GradedSubject(m, gradeForSubject(m))

    @Test
    fun putsThePartsAboveAndTheTotalWithItsLetterBelow() {
        val got = cellText(
            cell(parted("Physics", science, mapOf("CQ" to 40.0, "MCQ" to 22.0, "PRACTICAL" to 20.0))),
        )
        assertEquals(listOf("40", "22", "20"), got.parts.map { it.text })
        assertEquals("82", got.main)
        assertEquals("A+", got.letter)
    }

    @Test
    fun keepsThePartsInTheOrderThePaperIsMarkedIn() {
        val got = partBits(
            parted("Physics", science, mapOf("PRACTICAL" to 20.0, "MCQ" to 22.0, "CQ" to 40.0)),
        )
        assertEquals(listOf("CQ", "MCQ", "PRACTICAL"), got.map { it.label })
    }

    @Test
    fun isTheWholePoint68AndStillFWithTheFailingPartMarked() {
        // The mark that explains the letter. 60 + 8 = 68, and the MCQ pass is 10.
        val got = cellText(cell(parted("Maths", cqMcq, mapOf("CQ" to 60.0, "MCQ" to 8.0))))
        assertEquals("68", got.main)
        assertEquals("F", got.letter)
        assertEquals(listOf(false, true), got.parts.map { it.failed })
    }

    @Test
    fun marksAPartBelowItsPassEvenWhileTheSubjectHasNoTotal() {
        // The subject is not being judged -- main is still a dash. This part
        // is finished and it did fail, and that is worth seeing now.
        val got = cellText(cell(parted("Maths", cqMcq, mapOf("CQ" to null, "MCQ" to 4.0))))
        assertEquals("\u2014", got.main)
        assertEquals("", got.letter)
        assertEquals(listOf("\u2013", "4"), got.parts.map { it.text })
        assertTrue(got.parts[1].failed)
    }

    @Test
    fun showsWhichPartIsMissingInsteadOfABracketedSum() {
        val got = cellText(cell(parted("Geography", cqMcq, mapOf("CQ" to 55.0, "MCQ" to null))))
        assertEquals(listOf("55", "\u2013"), got.parts.map { it.text })
        assertEquals("\u2014", got.main)
        assertFalse(got.provisional)
    }

    @Test
    fun leavesTheUpperTierEmptyForAPaperNotMarkedInParts() {
        val eng = SubjectMark("E1", "English First Paper", 100.0, 71.0)
        val got = cellText(cell(eng))
        assertEquals(emptyList<PartBit>(), got.parts)
        assertEquals("71", got.main)
        assertEquals("A", got.letter)
    }

    @Test
    fun stillReadsAResultEnteredBeforeComponentsExisted() {
        val old = SubjectMark("M", "Maths", 100.0, 68.0, components = cqMcq)
        val got = cellText(cell(old))
        assertEquals("68", got.main)
        assertEquals("A-", got.letter)
        // Nothing was entered part by part, so there is nothing to show above
        // -- a tier of dashes over a perfectly good 68 would be a lie about it.
        assertEquals(emptyList<PartBit>(), got.parts)
    }

    @Test
    fun saysAbsAndNothingElseForAnAbsentStudent() {
        val got = cellText(
            cell(parted("Maths", cqMcq, mapOf("CQ" to 60.0, "MCQ" to 20.0), absent = true)),
        )
        assertEquals("abs", got.main)
        assertEquals("", got.letter)
        assertEquals(emptyList<PartBit>(), got.parts)
    }

    @Test
    fun staysQuietInACellWhereNothingHasBeenEnteredAtAll() {
        // The 4th subject of a student who has not taken one, and every cell
        // on a sheet opened halfway through mark entry.
        val got = cellText(cell(parted("Higher Maths", cqMcq, emptyMap())))
        assertEquals(emptyList<PartBit>(), got.parts)
        assertEquals("\u2014", got.main)
    }

    @Test
    fun keepsAHalfMarkAndPrintsAWholeOneWhole() {
        assertEquals("50", fmtMark(50.0))
        assertEquals("50.5", fmtMark(50.5))
        val got = cellText(cell(parted("Maths", cqMcq, mapOf("CQ" to 60.5, "MCQ" to 20.0))))
        assertEquals("60.5", got.parts[0].text)
        assertEquals("80.5", got.main)
    }

    // --- a subject that is two papers graded as one -------------------------

    private val ban1 =
        parted("Bangla 1st Paper", cqMcq, mapOf("CQ" to 50.0, "MCQ" to 22.0), group = "BAN")
    private val ban2 =
        parted("Bangla 2nd Paper", cqMcq, mapOf("CQ" to 48.0, "MCQ" to 20.0), group = "BAN")
    private val unit = combineUnits(listOf(ban1, ban2)).first()

    @Test
    fun showsAllFourPartsInPaperOrder() {
        val got = cellText(cell(unit))
        assertEquals(listOf("50", "22", "48", "20"), got.parts.map { it.text })
        assertEquals("140", got.main)
    }

    @Test
    fun labelsThemBareWithoutThePaperInFront() {
        assertEquals(listOf("CQ", "MCQ", "CQ", "MCQ"), partBits(unit).map { it.label })
        assertEquals("MCQ", partLabel("Bangla 1st Paper MCQ", "Bangla 1st Paper"))
        assertEquals("MCQ", partLabel("MCQ", null))
    }

    @Test
    fun saysWhereTheSecondPaperStarts() {
        assertEquals(listOf(false, false, true, false), partBits(unit).map { it.opensPaper })
    }

    @Test
    fun namesThePaperInTheTooltipBecauseMcqTwiceOverSaysNothing() {
        val title = partsTitle(unit)
        assertTrue(title.contains("Bangla 1st Paper CQ 50"))
        assertTrue(title.contains("Bangla 2nd Paper MCQ 20"))
    }

    @Test
    fun leavesThePaperOutOfTheTooltipWhenThereIsOnlyOne() {
        assertEquals(
            "CQ 60 \u00b7 MCQ 20",
            partsTitle(parted("Maths", cqMcq, mapOf("CQ" to 60.0, "MCQ" to 20.0))),
        )
    }

    @Test
    fun saysInTheTooltipWhatAFailingPartFellBelow() {
        assertEquals(
            "CQ 60 \u00b7 MCQ 8 (below pass 10)",
            partsTitle(parted("Maths", cqMcq, mapOf("CQ" to 60.0, "MCQ" to 8.0))),
        )
    }
}
