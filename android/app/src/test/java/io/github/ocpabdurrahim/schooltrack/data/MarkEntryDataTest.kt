package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The SAME cases exist in web/src/data/markentry.test.ts. A mark typed on a
 * phone and the same mark typed in a browser must be stored identically.
 */
class MarkEntryDataTest {

    private val whole = Subject(
        subjectId = "ENG1",
        subjectName = "English First Paper",
        classNames = listOf("Class 9"),
        fullMarks = 100.0,
    )

    private val parted = whole.copy(
        subjectId = "MATH",
        subjectName = "Mathematics",
        components = listOf(Component("CQ", 70.0, 23.0), Component("MCQ", 30.0, 10.0)),
    )

    @Test
    fun readsANumberHoweverItWasTyped() {
        assertEquals(12.0, numOrNull("12")!!, 0.001)
        assertEquals(12.0, numOrNull("  12  ")!!, 0.001)
        assertEquals(12.5, numOrNull("12.5")!!, 0.001)
        assertEquals(0.0, numOrNull("0")!!, 0.001)
    }

    @Test
    fun isNullForAnEmptyBoxAndForNonsense() {
        assertNull(numOrNull(""))
        assertNull(numOrNull("   "))
        assertNull(numOrNull("ab"))
        // a zero is a real mark and must never be read as "not entered"
        assertNotNull(numOrNull("0"))
    }

    @Test
    fun storesNoPartsAtAllForAPaperMarkedAsOneMark() {
        val (parts, marks) = partsAndTotal(whole, Typed(marks = "71"))
        assertNull(parts)
        assertEquals(71.0, marks!!, 0.001)
    }

    @Test
    fun addsThePartsUp() {
        val (parts, marks) = partsAndTotal(
            parted, Typed(parts = mapOf("CQ" to "55", "MCQ" to "22")),
        )
        assertEquals(mapOf("CQ" to 55.0, "MCQ" to 22.0), parts)
        assertEquals(77.0, marks!!, 0.001)
    }

    @Test
    fun keepsTheTotalNullWhileAPartIsBlank() {
        val (parts, marks) = partsAndTotal(
            parted, Typed(parts = mapOf("CQ" to "55", "MCQ" to "")),
        )
        assertEquals(mapOf("CQ" to 55.0, "MCQ" to null), parts)
        assertNull(marks)
    }

    @Test
    fun ignoresABoxTheSubjectHasNoComponentFor() {
        val (parts, marks) = partsAndTotal(
            parted, Typed(parts = mapOf("CQ" to "55", "MCQ" to "22", "PRACTICAL" to "20")),
        )
        assertEquals(mapOf("CQ" to 55.0, "MCQ" to 22.0), parts)
        assertEquals(77.0, marks!!, 0.001)
    }

    @Test
    fun countsAZeroAsAMarkNotAsABlank() {
        val (_, marks) = partsAndTotal(parted, Typed(parts = mapOf("CQ" to "40", "MCQ" to "0")))
        assertEquals(40.0, marks!!, 0.001)
    }

    @Test
    fun putsTheStoredNumbersBackInTheBoxes() {
        assertEquals(
            Typed("77", mapOf("CQ" to "55", "MCQ" to "22"), false),
            typedFrom(77.0, mapOf("CQ" to 55.0, "MCQ" to 22.0), false),
        )
    }

    @Test
    fun leavesABoxEmptyWhereNothingWasStored() {
        assertEquals(
            Typed("", mapOf("CQ" to "55", "MCQ" to ""), true),
            typedFrom(null, mapOf("CQ" to 55.0, "MCQ" to null), true),
        )
        assertEquals(Typed("", emptyMap(), false), typedFrom(null, null, false))
    }

    @Test
    fun catchesAPartTypedAboveWhatThatPartIsOutOf() {
        assertTrue(overMax(parted, Typed(parts = mapOf("CQ" to "55", "MCQ" to "31"))))
        assertFalse(overMax(parted, Typed(parts = mapOf("CQ" to "70", "MCQ" to "30"))))
    }

    @Test
    fun catchesAWholePaperTypedAboveItsFullMarks() {
        assertTrue(overMax(whole, Typed(marks = "101")))
        assertFalse(overMax(whole, Typed(marks = "100")))
    }
}
