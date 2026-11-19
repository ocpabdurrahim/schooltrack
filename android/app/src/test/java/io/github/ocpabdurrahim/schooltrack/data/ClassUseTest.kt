package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The SAME cases exist in web/src/data/classuse.test.ts. */
class ClassUseTest {

    private fun refused(r: Removal) = r as Removal.Refused
    private fun allowed(r: Removal) = r as Removal.Allowed

    @Test
    fun `lets an unused one go`() {
        assertTrue(canRemoveClass(ClassUse(), false) is Removal.Allowed)
    }

    @Test
    fun `REFUSES one that still has students, and says to retire it instead`() {
        // The fault this guards: a student pointing at a section that is not
        // there, which is unreadable everywhere and fixable nowhere.
        val got = refused(canRemoveClass(ClassUse(students = 78), false))
        assertTrue(got.reason.contains("78 students"))
        assertTrue(got.reason.contains("In use"))
        assertEquals(true, got.retire)
    }

    @Test
    fun `counts a student who has LEFT as still in the way`() {
        // Their record still carries the classId, and their results still have
        // to be readable years later.
        assertTrue(canRemoveClass(ClassUse(students = 1), false) is Removal.Refused)
    }

    @Test
    fun `refuses for marks and attendance even with nobody on the roll`() {
        // The promoted-class case: the students have moved on, the marks they
        // sat under this section have not.
        assertTrue(canRemoveClass(ClassUse(results = 36), false) is Removal.Refused)
        assertTrue(canRemoveClass(ClassUse(attendance = 159), false) is Removal.Refused)
    }

    @Test
    fun `refuses for an exam routine entry, which is cheap to redo and easy to miss`() {
        assertTrue(canRemoveClass(ClassUse(routine = 1), false) is Removal.Refused)
    }

    @Test
    fun `names everything in the way, as a sentence`() {
        val got = refused(canRemoveClass(ClassUse(students = 3, results = 2, attendance = 1), false))
        assertTrue(got.reason.contains("3 students, 2 results and 1 attendance mark"))
    }

    @Test
    fun `uses the singular where it should`() {
        val got = refused(canRemoveClass(ClassUse(students = 1), false))
        assertTrue(got.reason.contains("1 student."))
    }

    @Test
    fun `WARNS, not refuses, when it is the last section of its class`() {
        // Subjects and fee rates name the class, not the section.
        val got = allowed(canRemoveClass(ClassUse(), true))
        assertTrue(got.warning.contains("only section of its class"))
    }

    @Test
    fun `says nothing extra when another section of the class remains`() {
        assertEquals("", allowed(canRemoveClass(ClassUse(), false)).warning)
    }
}
