package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The SAME cases exist in web/src/data/lockout.test.ts. */
private fun admin(active: Boolean = true) = MemberRow("a@x", "A", "ADMIN", active)
private fun teacher() = MemberRow("t@x", "T", "TEACHER", true)

class LockoutTest {

    @Test
    fun `is fine with two administrators`() {
        val got = lockoutRisk(listOf(admin(), admin(), teacher()))
        assertFalse(got.atRisk)
        assertEquals(2, got.admins)
        assertEquals("", got.warning)
    }

    @Test
    fun `WARNS on one, which is how the live school ran for a fortnight`() {
        val got = lockoutRisk(listOf(admin()))
        assertTrue(got.atRisk)
        assertEquals(1, got.admins)
        assertTrue(got.warning.contains("Only one administrator"))
        assertTrue(got.warning.contains("head teacher"))
    }

    @Test
    fun `counts only ADMINS - a teacher cannot grant access`() {
        // Ten teachers and one administrator is exactly as stuck.
        val got = lockoutRisk(listOf(admin(), teacher(), teacher(), teacher()))
        assertTrue(got.atRisk)
        assertEquals(1, got.admins)
    }

    @Test
    fun `does not count an administrator who has been switched off`() {
        assertTrue(lockoutRisk(listOf(admin(), admin(active = false))).atRisk)
        assertEquals(1, activeAdmins(listOf(admin(), admin(active = false))))
    }

    @Test
    fun `says something different, and sharper, when there is none at all`() {
        val got = lockoutRisk(listOf(teacher()))
        assertTrue(got.atRisk)
        assertEquals(0, got.admins)
        assertTrue(got.warning.contains("No active administrator"))
    }

    @Test
    fun `treats an empty list as no administrator`() {
        assertEquals(0, lockoutRisk(emptyList()).admins)
        assertTrue(lockoutRisk(emptyList()).atRisk)
    }
}
