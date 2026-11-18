package io.github.ocpabdurrahim.schooltrack.ui

import io.github.ocpabdurrahim.schooltrack.data.Access
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The same cases exist in web/src/nav.test.ts. */
class MenuTest {

    private fun staff(role: String) = Access.Staff(role = role, name = role, email = "$role@test.local")
    private val guardian = Access.Guardian("Parent", "p@test.local", listOf("76"))
    private val none = Access.None("nobody@test.local")

    private fun groups(access: Access) = menuFor(access).map { it.label }
    private fun items(access: Access, group: String) =
        menuFor(access).find { it.label == group }?.items?.map { it.label } ?: emptyList()

    @Test
    fun `an administrator gets every menu`() {
        assertEquals(
            listOf("Students", "Attendance", "Exams", "Fees", "Finance", "Setup"),
            groups(staff("ADMIN")),
        )
    }

    @Test
    fun `a teacher gets no money and no setup at all`() {
        // Not an empty Fees section — no Fees section. A teacher cannot read a
        // payment, so every item in it would refuse.
        assertEquals(listOf("Students", "Attendance", "Exams"), groups(staff("TEACHER")))
        assertEquals(listOf("All students"), items(staff("TEACHER"), "Students"))
        assertTrue("Holidays" !in items(staff("TEACHER"), "Attendance"))
        assertEquals(
            listOf("Enter marks", "Quick entry", "Results", "Seat plan"),
            items(staff("TEACHER"), "Exams"),
        )
    }

    @Test
    fun `the accounts user gets the money screens but not the records`() {
        assertEquals(
            listOf("Students", "Attendance", "Exams", "Fees", "Finance"),
            groups(staff("ACCOUNTS")),
        )
        assertEquals(listOf("Collect a fee", "Receipts", "Dues"), items(staff("ACCOUNTS"), "Fees"))
        assertEquals(listOf("Expenses", "Income and expense"), items(staff("ACCOUNTS"), "Finance"))
        assertEquals(listOf("All students"), items(staff("ACCOUNTS"), "Students"))
    }

    @Test
    fun `the office gets the student records but no money`() {
        assertEquals(listOf("Students", "Attendance", "Exams"), groups(staff("OFFICE")))
        assertEquals(
            listOf(
                "All students", "Add a student", "Add many students",
                "Update from a list", "Certificates",
            ),
            items(staff("OFFICE"), "Students"),
        )
    }

    @Test
    fun `a guardian and an unknown account get no menu whatsoever`() {
        assertEquals(emptyList<MenuGroup>(), menuFor(guardian))
        assertEquals(emptyList<MenuGroup>(), menuFor(none))
    }

    @Test
    fun `every entry points at a screen only its role may open`() {
        // The drawer must never offer a screen the gate in SchoolTrackApp would
        // bounce: an item that opens and immediately returns home is worse than
        // no item at all.
        for (group in menuFor(staff("TEACHER"))) {
            for (item in group.items) {
                assertTrue("${item.label} is offered to a teacher", allows(staff("TEACHER"), item.needs))
            }
        }
    }
}
