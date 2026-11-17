package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The SAME cases exist in web/src/data/quickentry.test.ts. Subject-first entry
 * is the flow the office uses all day; it has to behave identically on the
 * phone and in the browser.
 */
class QuickEntryTest {

    private val maths = Subject(
        subjectId = "MATH",
        subjectName = "Mathematics",
        classNames = listOf("Class 9"),
        fullMarks = 100.0,
        components = listOf(Component("CQ", 70.0, 23.0), Component("MCQ", 30.0, 10.0)),
    )

    private val religion = maths.copy(
        subjectId = "REL",
        subjectName = "Religion",
        components = emptyList(),
    )

    private val roster = listOf(
        RosterStudent("s1", 1, "Abida Sultana", "Class 9"),
        RosterStudent("s2", 2, "Bashir Ahmed", "Class 9"),
        RosterStudent("s3", 7, "Chandni Roy", "Class 10"),
    )

    private fun stored(
        studentId: String = "s1",
        rollNo: Long = 1,
        subjectId: String = "MATH",
        marks: Double? = 77.0,
        parts: Map<String, Double?>? = mapOf("CQ" to 55.0, "MCQ" to 22.0),
        absent: Boolean = false,
        updatedAt: Long? = null,
    ) = ResultRow(
        examId = "half-yearly-exam-2026",
        studentId = studentId,
        subjectId = subjectId,
        subjectName = "Mathematics",
        marks = marks,
        absent = absent,
        classId = "C9A",
        rollNo = rollNo,
        fullMarks = 100.0,
        isOptional = false,
        parts = parts,
        updatedAt = updatedAt,
    )

    // ---------------------------------------------------------------- roster

    @Test
    fun keysTheRosterByRollAsItIsTyped() {
        val r = buildRoster(roster, maths, emptyList())
        assertEquals(listOf("1", "2", "7"), r.keys.sorted())
        assertEquals("Bashir Ahmed", r["2"]!!.fullName)
    }

    @Test
    fun marksTheStudentWhoseClassDoesNotSitThisSubject() {
        val r = buildRoster(roster, maths, emptyList())
        assertTrue(r["1"]!!.takes)
        assertFalse(r["7"]!!.takes)   // Class 10, and Maths is set up for Class 9
    }

    @Test
    fun fillsTheBoxesFromWhatIsAlreadyStored() {
        val r = buildRoster(roster, maths, listOf(stored()))
        assertEquals(mapOf("CQ" to "55", "MCQ" to "22"), r["1"]!!.typed.parts)
        assertTrue(r["1"]!!.stored)
        assertEquals(Typed(), r["2"]!!.typed)
        assertFalse(r["2"]!!.stored)
    }

    @Test
    fun ignoresMarksBelongingToAnotherSubject() {
        val r = buildRoster(roster, maths, listOf(stored(subjectId = "ENG1", marks = 40.0)))
        assertFalse(r["1"]!!.stored)
        assertEquals(Typed(), r["1"]!!.typed)
    }

    @Test
    fun countsAnAbsentStudentAsEnteredAndAnEmptyRowAsNot() {
        val absent = buildRoster(
            roster, maths, listOf(stored(marks = null, parts = null, absent = true)),
        )
        assertTrue(absent["1"]!!.stored)
        assertTrue(absent["1"]!!.typed.absent)

        val nothing = buildRoster(
            roster, maths,
            listOf(stored(marks = null, parts = mapOf("CQ" to null, "MCQ" to null))),
        )
        assertFalse(nothing["1"]!!.stored)
    }

    @Test
    fun keepsTheSaveTimeForTheEnteredList() {
        val r = buildRoster(roster, maths, listOf(stored(updatedAt = 1_700_000_000_000L)))
        assertEquals(1_700_000_000_000L, r["1"]!!.savedAt)
        assertNull(r["2"]!!.savedAt)
    }

    // ---------------------------------------------------------------- lookup

    @Test
    fun saysNothingAtAllForAnEmptyBox() {
        val r = buildRoster(roster, maths, emptyList())
        assertEquals(Lookup.Blank, lookupRoll(r, ""))
        assertEquals(Lookup.Blank, lookupRoll(r, "   "))
    }

    @Test
    fun findsTheStudent() {
        val got = lookupRoll(buildRoster(roster, maths, emptyList()), "2")
        assertTrue(got is Lookup.Found)
        assertEquals("Bashir Ahmed", (got as Lookup.Found).row.fullName)
    }

    @Test
    fun findsARollTypedWithPadding() {
        val got = lookupRoll(buildRoster(roster, maths, emptyList()), "007")
        assertTrue(got is Lookup.NotTaken)        // roll 7 exists, but sits Class 10
        assertEquals(7L, (got as Lookup.NotTaken).row.rollNo)
    }

    @Test
    fun tellsAMistypedRollApartFromOneThatDoesNotSitTheSubject() {
        val r = buildRoster(roster, maths, emptyList())
        assertTrue(lookupRoll(r, "99") is Lookup.NotFound)
        assertTrue(lookupRoll(r, "7") is Lookup.NotTaken)
    }

    @Test
    fun isNotFooledByABoxHoldingLetters() {
        assertTrue(lookupRoll(buildRoster(roster, maths, emptyList()), "ab") is Lookup.NotFound)
    }

    // ------------------------------------------------------------- the boxes

    @Test
    fun keepsDigitsOnly() {
        assertEquals("55", cleanMark("55"))
        assertEquals("55", cleanMark("5a5"))
        assertEquals("12", cleanMark("-12"))
    }

    @Test
    fun allowsOneDotForThePapersMarkedInHalves() {
        assertEquals("12.5", cleanMark("12.5"))
        assertEquals("12.57", cleanMark("12.5.7"))
    }

    @Test
    fun isQuietAboutAnEmptyBox() {
        assertFalse(fieldBad(70.0, ""))
        assertFalse(fieldBad(70.0, "   "))
    }

    @Test
    fun catchesAMarkAboveWhatThePartIsOutOf() {
        assertTrue(fieldBad(70.0, "71"))
        assertFalse(fieldBad(70.0, "70"))
    }

    @Test
    fun catchesNonsenseAndNegatives() {
        assertTrue(fieldBad(70.0, "ab"))
        assertTrue(fieldBad(70.0, "-5"))
    }

    @Test
    fun doesNotFlagAFailingMarkBecauseFailingIsARealResult() {
        assertFalse(fieldBad(30.0, "8"))   // MCQ pass is 10; 8 is a fail, not a typo
    }

    @Test
    fun listsThePartsThePaperIsMarkedIn() {
        assertEquals(listOf("CQ", "MCQ"), boxNames(maths))
        assertEquals(emptyList<String>(), boxNames(religion))
    }

    @Test
    fun walksThePartsAndThenSaysToSave() {
        assertEquals("MCQ", nextBox(listOf("CQ", "MCQ"), "CQ"))
        assertNull(nextBox(listOf("CQ", "MCQ"), "MCQ"))
        assertNull(nextBox(emptyList(), ""))
    }

    // ---------------------------------------------------------------- the log

    private fun twoEntered() = buildRoster(
        roster, maths,
        listOf(
            stored(updatedAt = 1_000L),
            stored(
                studentId = "s2", rollNo = 2,
                parts = mapOf("CQ" to 60.0, "MCQ" to 8.0), marks = 68.0, updatedAt = 2_000L,
            ),
        ),
    )

    @Test
    fun listsOnlyWhatHasBeenEntered() {
        assertEquals(listOf(2L, 1L), enteredLog(twoEntered(), maths).map { it.rollNo })
    }

    @Test
    fun putsTheRowJustKeyedInAtTheTop() {
        assertEquals(2L, enteredLog(twoEntered(), maths).first().rollNo)
    }

    @Test
    fun appliesTheComponentPassMarkNotJustTheTotal() {
        val log = enteredLog(twoEntered(), maths)
        assertEquals(68.0, log[0].total!!, 0.001)
        assertEquals("F", log[0].grade.letter)              // 68/100, but MCQ 8 is below 10
        assertEquals(listOf("MCQ"), log[0].grade.failedParts)
        assertEquals(77.0, log[1].total!!, 0.001)
        assertEquals("A", log[1].grade.letter)
    }

    @Test
    fun fallsBackToRollOrderWhereNoTimeIsKnown() {
        val r = buildRoster(
            roster, maths, listOf(stored(studentId = "s2", rollNo = 2), stored()),
        )
        assertEquals(listOf(1L, 2L), enteredLog(r, maths).map { it.rollNo })
    }

    @Test
    fun countsOnlyTheStudentsWhoSitTheSubject() {
        assertEquals(1 to 2, progress(buildRoster(roster, maths, listOf(stored()))))
    }

    // --------------------------------------------------------- what is saved

    @Test
    fun worksTheTotalOutFromThePartsRatherThanTrustingOne() {
        val r = buildRoster(roster, maths, emptyList())["1"]!!
        val row = resultRowFor(
            "ex1", "C9A", maths, r, Typed(parts = mapOf("CQ" to "55", "MCQ" to "22")),
        )
        assertEquals(77.0, row.marks!!, 0.001)
        assertEquals(mapOf("CQ" to 55.0, "MCQ" to 22.0), row.parts)
        assertEquals("Mathematics", row.subjectName)
        assertEquals(100.0, row.fullMarks, 0.001)
    }

    @Test
    fun storesNoPartsForAPaperMarkedAsOneMark() {
        val r = buildRoster(roster, religion, emptyList())["1"]!!
        val row = resultRowFor("ex1", "C9A", religion, r, Typed(marks = "71"))
        assertNull(row.parts)
        assertEquals(71.0, row.marks!!, 0.001)
    }

    @Test
    fun keepsAnAbsentStudentWithNoMarksAtAll() {
        val r = buildRoster(roster, maths, emptyList())["1"]!!
        val row = resultRowFor("ex1", "C9A", maths, r, Typed(absent = true))
        assertTrue(row.absent)
        assertNull(row.marks)
    }
}
