package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The SAME cases exist in web/src/data/reset.test.ts. */
class ResetTest {

    @Test
    fun `clears everything but who you are and how you get in`() {
        val p = planFor(ResetMode.ALL)
        assertEquals(listOf("integrations", "members", "settings"), p.keep)
        for (gone in listOf("students", "payments", "classes", "counters", "results")) {
            assertTrue(gone, p.clear.contains(gone))
        }
    }

    @Test
    fun `NEVER clears members, or the school is locked out of its own app`() {
        for (mode in ResetMode.entries) {
            assertFalse(mode.name, planFor(mode).clear.contains("members"))
        }
        assertTrue(ALWAYS_KEPT.contains("members"))
    }

    @Test
    fun `keeps the Gemini key, because re-pasting it is a nuisance not a guard`() {
        assertFalse(planFor(ResetMode.ALL).clear.contains("integrations"))
    }

    @Test
    fun `keeps settings, which holds the name the confirmation is typed against`() {
        assertFalse(planFor(ResetMode.ALL).clear.contains("settings"))
    }

    @Test
    fun `RECORDS keeps the school's shape and clears its history`() {
        val p = planFor(ResetMode.RECORDS)
        for (kept in listOf("classes", "subjects", "feeHeads", "feeStructure", "holidays", "staff")) {
            assertTrue(kept, p.keep.contains(kept))
        }
        for (gone in listOf("students", "results", "attendanceMarks", "payments", "studentPhotos")) {
            assertTrue(gone, p.clear.contains(gone))
        }
    }

    @Test
    fun `every collection is accounted for, in one list or the other`() {
        // The blind spot this guards: a client cannot ask Firestore what
        // collections exist, so one left out of ALL_COLLECTIONS is simply
        // never cleared and the new school starts with last year's records.
        for (mode in ResetMode.entries) {
            val p = planFor(mode)
            assertEquals(ALL_COLLECTIONS.sorted(), (p.clear + p.keep).sorted())
        }
    }

    @Test
    fun `names the collections the rules know about`() {
        for (
            named in listOf(
                "students", "studentPhotos", "results", "exams", "attendance", "attendanceMarks",
                "classes", "subjects", "holidays", "feeHeads", "feeStructure", "discounts",
                "payments", "counters", "expenseHeads", "expenses", "staff", "salaryStructure",
                "salaryPayments", "documents", "guardians", "members", "settings", "integrations",
            )
        ) {
            assertTrue(named, ALL_COLLECTIONS.contains(named))
        }
    }

    @Test
    fun `takes only the school's own name`() {
        assertTrue(confirms("Matkhola ML High School", "Matkhola ML High School"))
        assertFalse(confirms("yes", "Matkhola ML High School"))
        assertFalse(confirms("", "Matkhola ML High School"))
        assertFalse(confirms("Matkhola", "Matkhola ML High School"))
    }

    @Test
    fun `forgives a typing slip, not a doubt`() {
        assertTrue(confirms("  matkhola ml high school ", "Matkhola ML High School"))
        assertTrue(confirms("Matkhola  ML   High School", "Matkhola ML High School"))
    }

    @Test
    fun `cannot be satisfied by typing nothing at a school with no name`() {
        assertFalse(confirms("", ""))
        assertFalse(confirms("  ", " "))
    }
}
