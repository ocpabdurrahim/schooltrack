package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The SAME cases exist in web/src/data/marksheet.test.ts.
 *
 * Built from the school's own setup: Bangla first and second paper marked in
 * CQ 70 + MCQ 30 and graded together out of 200, English the same way as one
 * written paper each, and a science subject with a practical.
 */
class MarkSheetTest {

    private val cqMcq = listOf(Component("CQ", 70.0, 23.0), Component("MCQ", 30.0, 10.0))
    private val written = listOf(Component("WRITTEN", 100.0, 0.0))
    private val withPractical = listOf(
        Component("CQ", 50.0, 17.0),
        Component("MCQ", 25.0, 8.0),
        Component("PRACTICAL", 25.0, 8.0),
    )

    private val base = Subject(
        subjectId = "X", subjectName = "X", classNames = listOf("Class 9"), fullMarks = 100.0,
    )
    private val ban1 = base.copy(
        subjectId = "BAN1", subjectName = "BANGLA 1ST PAPER",
        combineGroup = "BAN", components = cqMcq, sortOrder = 1,
    )
    private val ban2 = base.copy(
        subjectId = "BAN2", subjectName = "BANGLA 2ND PAPER",
        combineGroup = "BAN", components = cqMcq, sortOrder = 2,
    )
    private val eng1 = base.copy(
        subjectId = "ENG1", subjectName = "ENGLISH 1ST PAPER",
        combineGroup = "ENG", components = written, sortOrder = 3,
    )
    private val eng2 = base.copy(
        subjectId = "ENG2", subjectName = "ENGLISH 2ND PAPER",
        combineGroup = "ENG", components = written, sortOrder = 4,
    )
    private val physics = base.copy(
        subjectId = "PHY", subjectName = "Physics", components = withPractical, sortOrder = 5,
    )
    private val all = listOf(ban1, ban2, eng1, eng2, physics)
    private val who = Sitter("Class 9")

    private fun mark(subjectId: String, parts: Map<String, Double?>): ResultRow {
        val total = if (parts.values.any { it == null }) null else parts.values.sumOf { it!! }
        return ResultRow(
            examId = "ex1", studentId = "s1", subjectId = subjectId, subjectName = subjectId,
            marks = total, absent = false, classId = "C9A", rollNo = 1,
            fullMarks = 100.0, isOptional = false, parts = parts,
        )
    }

    @Test
    fun isOneLinePerGradedSubjectWithThePapersInsideIt() {
        val lines = markSheet(all, who, emptyList())
        assertEquals(listOf("BANGLA", "ENGLISH", "Physics"), lines.map { it.unitName })
        assertEquals(
            listOf("BANGLA 1ST PAPER", "BANGLA 2ND PAPER"),
            lines[0].papers.map { it.subjectName },
        )
        assertEquals(1, lines[2].papers.size)
    }

    @Test
    fun keepsEveryPartWhereItWasMarked() {
        val lines = markSheet(
            all, who,
            listOf(
                mark("BAN1", mapOf("CQ" to 55.0, "MCQ" to 22.0)),
                mark("BAN2", mapOf("CQ" to 50.0, "MCQ" to 25.0)),
            ),
        )
        assertEquals(mapOf("CQ" to 55.0, "MCQ" to 22.0), lines[0].papers[0].parts)
        assertEquals(77.0, lines[0].papers[0].marks!!, 0.001)
        assertEquals(75.0, lines[0].papers[1].marks!!, 0.001)
        assertEquals(152.0, lines[0].marks!!, 0.001)       // the pair, out of 200
        assertEquals(200.0, lines[0].fullMarks, 0.001)
        assertEquals("A", lines[0].letter)
    }

    @Test
    fun showsWhatIsInWhileTheOtherPaperIsNot() {
        val english = markSheet(all, who, listOf(mark("ENG1", mapOf("WRITTEN" to 60.0))))
            .first { it.unitName == "ENGLISH" }
        assertNull(english.marks)                          // one paper is not a subject
        assertEquals(60.0, english.soFar!!, 0.001)         // but 60 of it has arrived
        assertEquals("-", english.letter)
    }

    @Test
    fun failsASubjectOnAPartBelowItsOwnPassMarkAndSaysWhich() {
        val phy = markSheet(
            all, who,
            listOf(mark("PHY", mapOf("CQ" to 40.0, "MCQ" to 20.0, "PRACTICAL" to 5.0))),
        ).first { it.unitName == "Physics" }
        assertEquals(65.0, phy.marks!!, 0.001)             // 65 out of 100 …
        assertEquals("F", phy.letter)                      // … and still an F
        assertEquals(listOf("PRACTICAL"), phy.failedParts)
    }

    @Test
    fun stillListsASubjectNobodyHasMarked() {
        // A sheet that quietly drops the unmarked subject looks finished.
        assertEquals(listOf("-", "-", "-"), markSheet(all, who, emptyList()).map { it.letter })
    }

    @Test
    fun isOnlyThePartsThesePapersActuallyHaveInReadingOrder() {
        assertEquals(
            listOf("CQ", "MCQ", "PRACTICAL", "WRITTEN"),
            partColumns(markSheet(all, who, emptyList())),
        )
        assertEquals(
            listOf("WRITTEN"),
            partColumns(markSheet(listOf(eng1, eng2), who, emptyList())),
        )
    }

    @Test
    fun isEmptyForASchoolThatMarksEveryPaperAsOneMark() {
        val plain = base.copy(subjectId = "REL", subjectName = "Religion")
        assertEquals(emptyList<String>(), partColumns(markSheet(listOf(plain), who, emptyList())))
    }

    @Test
    fun addsTheSubjectsUpOnceEveryOneOfThemIsIn() {
        val lines = markSheet(
            listOf(ban1, ban2), who,
            listOf(
                mark("BAN1", mapOf("CQ" to 55.0, "MCQ" to 22.0)),
                mark("BAN2", mapOf("CQ" to 50.0, "MCQ" to 25.0)),
            ),
        )
        val (obtained, outOf) = sheetTotal(lines)
        assertEquals(152.0, obtained!!, 0.001)
        assertEquals(200.0, outOf, 0.001)
    }

    @Test
    fun withholdsTheTotalWhileAMarkIsMissing() {
        val lines = markSheet(all, who, listOf(mark("BAN1", mapOf("CQ" to 55.0, "MCQ" to 22.0))))
        val (obtained, outOf) = sheetTotal(lines)
        assertNull(obtained)                               // a part total is a lie
        assertEquals(500.0, outOf, 0.001)
    }
}
