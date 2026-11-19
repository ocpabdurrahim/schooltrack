package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The SAME cases exist in web/src/data/sitting.test.ts. */
private data class Mark(
    override val classId: String,
    override val rollNo: Long,
) : Entered

private fun mark(classId: String, rollNo: Long) = Mark(classId, rollNo)

class SittingTest {

    // -----------------------------------------------------------------------
    // where an exam was sat

    @Test
    fun `is what the marks say, not where the student is now`() {
        // The whole point: these marks were entered in Class 9 and the student
        // is in Class 10 now. Nothing here looks at the student.
        assertEquals(
            Sitting("class-9-a", 7, true),
            satAs(listOf(mark("class-9-a", 7), mark("class-9-a", 7))),
        )
    }

    @Test
    fun `says nothing when the marks say nothing`() {
        assertNull(satAs(emptyList()))
        assertNull(satAs(listOf(mark("", 0), mark("  ", 3))))
    }

    @Test
    fun `ignores a mark stored before the field existed`() {
        // Missing information, not evidence of a different class.
        assertEquals(
            Sitting("class-9-a", 7, true),
            satAs(listOf(mark("", 0), mark("class-9-a", 7), mark("class-9-a", 7))),
        )
    }

    @Test
    fun `takes the commonest when the marks disagree, and says they disagreed`() {
        // One mark entered before the class was moved up, two after.
        assertEquals(
            Sitting("class-10-a", 3, false),
            satAs(listOf(mark("class-9-a", 7), mark("class-10-a", 3), mark("class-10-a", 3))),
        )
    }

    @Test
    fun `settles a tie the same way every time`() {
        val one = satAs(listOf(mark("class-9-a", 7), mark("class-10-a", 3)))
        val other = satAs(listOf(mark("class-10-a", 3), mark("class-9-a", 7)))
        assertEquals(one, other)
        assertEquals(false, one?.agreed)
    }

    @Test
    fun `treats a changed ROLL as a different sitting too`() {
        // Promotion gives new roll numbers in the same class shape; the roll
        // on the paper is the one the marks were entered against.
        assertEquals(
            Sitting("class-9-a", 7, false),
            satAs(listOf(mark("class-9-a", 7), mark("class-9-a", 7), mark("class-9-a", 41))),
        )
    }

    // -----------------------------------------------------------------------
    // naming the class it was sat in

    private val classes = listOf(
        ClassRow("class-9-a", "Class 9", "A", "Class 9 - A", 90, true),
        ClassRow("class-10-a", "Class 10", "A", "Class 10 - A", 100, true),
    )

    @Test
    fun `names the class the marks point at`() {
        assertEquals(
            "Class 9 - A",
            sittingName(Sitting("class-9-a", 7, true), classes, "Class 10 - A"),
        )
    }

    @Test
    fun `falls back only when the marks said nothing`() {
        assertEquals("Class 10 - A", sittingName(null, classes, "Class 10 - A"))
    }

    @Test
    fun `names NOTHING rather than the wrong class when the class is gone`() {
        // Naming a deleted class after the student's current one is the exact
        // mistake this module exists to stop.
        assertEquals("", sittingName(Sitting("class-8-a", 2, true), classes, "Class 10 - A"))
    }
}
