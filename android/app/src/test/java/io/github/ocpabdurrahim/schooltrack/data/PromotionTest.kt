package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The SAME cases exist in web/src/data/promotion.test.ts. */
class PromotionTest {

    private fun who(
        rollNo: Int,
        gpa: Double?,
        total: Double?,
        failed: List<String> = emptyList(),
        incomplete: Boolean = false,
    ) = Candidate("s$rollNo", "Student $rollNo", rollNo, gpa, total, failed, incomplete)

    // ------------------------------------------------ how a result stands

    @Test
    fun `tells a missing mark apart from a failed subject`() {
        // On a sheet both look like a blank, and they could not be less alike.
        assertEquals(Standing.INCOMPLETE, standing(who(1, null, null, incomplete = true)))
        assertEquals(Standing.FAILED, standing(who(2, 0.0, 300.0, listOf("MATHS"))))
        assertEquals(Standing.PASSED, standing(who(3, 4.5, 700.0)))
    }

    @Test
    fun `counts a null GPA as incomplete even when nothing says so`() {
        assertEquals(Standing.INCOMPLETE, standing(who(1, null, 400.0)))
    }

    // ----------------------------------------------------- the merit list

    @Test
    fun `puts the best GPA first`() {
        val got = meritOrder(listOf(who(1, 3.5, 600.0), who(2, 5.0, 800.0), who(3, 4.2, 700.0)))
        assertEquals(listOf(2, 3, 1), got.map { it.rollNo })
    }

    @Test
    fun `breaks a tie on GPA with the total marks`() {
        val got = meritOrder(listOf(who(1, 5.0, 780.0), who(2, 5.0, 810.0)))
        assertEquals(listOf(2, 1), got.map { it.rollNo })
    }

    @Test
    fun `breaks a dead tie on the roll number, so the list cannot shuffle`() {
        val a = meritOrder(listOf(who(7, 5.0, 800.0), who(3, 5.0, 800.0)))
        val b = meritOrder(listOf(who(3, 5.0, 800.0), who(7, 5.0, 800.0)))
        assertEquals(listOf(3, 7), a.map { it.rollNo })
        assertEquals(listOf(3, 7), b.map { it.rollNo })
    }

    @Test
    fun `sorts failures below everyone who passed, however high the total`() {
        val got = meritOrder(listOf(who(1, 0.0, 900.0, listOf("MATHS")), who(2, 2.5, 400.0)))
        assertEquals(listOf(2, 1), got.map { it.rollNo })
    }

    @Test
    fun `sorts an unfinished result below a failure`() {
        val got = meritOrder(
            listOf(
                who(1, null, null, incomplete = true),
                who(2, 0.0, 300.0, listOf("MATHS")),
            ),
        )
        assertEquals(listOf(2, 1), got.map { it.rollNo })
    }

    @Test
    fun `does not disturb the list it was given`() {
        val given = listOf(who(1, 3.0, 500.0), who(2, 5.0, 800.0))
        meritOrder(given)
        assertEquals(listOf(1, 2), given.map { it.rollNo })
    }

    // -------------------------------------------------- moving a class up

    private val three = listOf(who(5, 4.0, 700.0), who(2, 5.0, 820.0), who(9, 3.2, 560.0))

    @Test
    fun `hands out roll numbers in merit order, starting at one`() {
        val plan = promotionPlan("class-9-a", "class-10-a", three)
        assertEquals("", plan.problem)
        assertEquals(listOf(2 to 1, 5 to 2, 9 to 3), plan.moves.map { it.fromRoll to it.toRoll })
        assertTrue(plan.moves.all { it.toClassId == "class-10-a" })
    }

    @Test
    fun `keeps a failed student where they are, with the roll they have`() {
        val plan = promotionPlan(
            "class-9-a", "class-10-a",
            listOf(who(1, 5.0, 800.0), who(2, 0.0, 300.0, listOf("MATHS"))),
        )
        val stayed = plan.moves.first { it.fromRoll == 2 }
        assertEquals(What.STAYS, stayed.what)
        assertEquals("class-9-a", stayed.toClassId)
        assertNull(stayed.toRoll)
        assertTrue(plan.warnings.joinToString(" ").contains("staying down"))
    }

    @Test
    fun `takes a failed student up when they have been ticked`() {
        val plan = promotionPlan(
            "class-9-a", "class-10-a",
            listOf(who(1, 5.0, 800.0), who(2, 0.0, 300.0, listOf("MATHS"))),
            takeAnyway = setOf("s2"),
        )
        assertEquals(listOf(What.UP, What.UP), plan.moves.map { it.what })
        assertEquals(listOf(1 to 1, 2 to 2), plan.moves.map { it.fromRoll to it.toRoll })
        assertTrue(plan.warnings.joinToString(" ").contains("without a passing result"))
    }

    @Test
    fun `does not number the students who stay, so the numbers run 1, 2, 3`() {
        val plan = promotionPlan(
            "class-9-a", "class-10-a",
            listOf(who(1, 5.0, 800.0), who(2, 0.0, 300.0, listOf("MATHS")), who(3, 4.0, 700.0)),
        )
        assertEquals(listOf(1, 2), plan.moves.filter { it.what == What.UP }.map { it.toRoll })
    }

    @Test
    fun `archives a class with nothing above it, and gives no new roll`() {
        val plan = promotionPlan("class-10-a", null, three)
        assertTrue(plan.moves.all { it.what == What.ARCHIVED })
        assertTrue(plan.moves.all { it.toRoll == null })
        assertTrue(plan.moves.all { it.toClassId == null })
    }

    @Test
    fun `still holds a failure back rather than archiving them`() {
        val plan = promotionPlan(
            "class-10-a", null,
            listOf(who(1, 5.0, 800.0), who(2, 0.0, 300.0, listOf("MATHS"))),
        )
        assertEquals(listOf(What.ARCHIVED, What.STAYS), plan.moves.map { it.what })
    }

    @Test
    fun `refuses to promote into a class that already has students`() {
        val plan = promotionPlan("class-9-a", "class-10-a", three, alreadyThere = 1)
        assertEquals(0, plan.moves.size)
        assertTrue(plan.problem.contains("already has 1 student"))
    }

    @Test
    fun `says so plainly when there is nobody to move`() {
        assertTrue(promotionPlan("c", "d", emptyList()).problem.contains("no students", true))
        assertTrue(promotionPlan("", "d", three).problem.contains("No class", true))
    }

    // --------------------------------------------- which class is above

    private val classes = listOf(
        ClassAbove("c9a", "Class 9", "A"),
        ClassAbove("c10a", "Class 10", "A"),
        ClassAbove("c10b", "Class 10", "B"),
        ClassAbove("c6a", "Class 6", "A"),
    )

    @Test
    fun `reads the number out of the name, in digits or in words`() {
        assertEquals(9, classNumberOf("Class 9"))
        assertEquals(10, classNumberOf("Ten"))
        assertEquals(6, classNumberOf("class six"))
        assertNull(classNumberOf("Nursery"))
    }

    @Test
    fun `goes up one, keeping the section`() {
        assertEquals("c10a", nextClassAbove(classes[0], classes)?.classId)
    }

    @Test
    fun `has nowhere to go above the top class`() {
        assertNull(nextClassAbove(classes[1], classes))
    }

    @Test
    fun `does not use the order the classes happen to be stored in`() {
        // "Class 10" sorts before "Class 6" as text, which is why the number
        // is read rather than the position.
        assertNull(nextClassAbove(classes[3], classes))
    }
}
