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

    // -----------------------------------------------------------------------
    // what is still there afterwards

    @Test
    fun `is nothing when the clearing worked`() {
        assertEquals(
            emptyList<Leftover>(),
            stillThere(mapOf("students" to 0, "results" to 0), listOf("students", "results")),
        )
    }

    @Test
    fun `names what survived, biggest first`() {
        // A refused batch — the armed window ran out, the connection dropped
        // — leaves records the new school starts with and nobody expects.
        assertEquals(
            listOf(Leftover("students", 78), Leftover("results", 36)),
            stillThere(
                mapOf("students" to 78, "results" to 36, "payments" to 0),
                listOf("students", "results", "payments"),
            ),
        )
    }

    @Test
    fun `ignores a collection that was never going to be cleared`() {
        assertEquals(
            emptyList<Leftover>(),
            stillThere(mapOf("members" to 1, "students" to 0), listOf("students")),
        )
    }

    @Test
    fun `treats a count it never got as nothing left, not as a failure`() {
        // A collection the count could not read says nothing either way; the
        // alternative is crying wolf on every reset.
        assertEquals(emptyList<Leftover>(), stillThere(emptyMap(), listOf("students")))
    }

    @Test
    fun `reads as a sentence`() {
        assertEquals("students (78)", leftoverList(listOf(Leftover("students", 78))))
        assertEquals(
            "students (78) and results (36)",
            leftoverList(listOf(Leftover("students", 78), Leftover("results", 36))),
        )
        assertEquals(
            "students (78), results (36) and exams (2)",
            leftoverList(
                listOf(Leftover("students", 78), Leftover("results", 36), Leftover("exams", 2)),
            ),
        )
    }
}
