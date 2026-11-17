package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Test

/** The same cases exist in web/src/data/groups.test.ts. */
class GroupsTest {

    @Test
    fun `keeps the three proper names as they are`() {
        assertEquals("Science", normalGroup("Science"))
        assertEquals("Humanities", normalGroup("Humanities"))
        assertEquals("Business Studies", normalGroup("Business Studies"))
    }

    @Test
    fun `reads the spellings an office actually types`() {
        assertEquals("Science", normalGroup("science"))
        assertEquals("Science", normalGroup("SCI"))
        assertEquals("Science", normalGroup("Science Group"))
        assertEquals("Humanities", normalGroup("arts"))
        assertEquals("Humanities", normalGroup("HUM"))
        assertEquals("Business Studies", normalGroup("commerce"))
        assertEquals("Business Studies", normalGroup("Business"))
        assertEquals("Business Studies", normalGroup("business studies"))
        assertEquals("Business Studies", normalGroup("  Business  Studies  "))
    }

    @Test
    fun `treats nothing as nothing - classes 6 to 8 have no group`() {
        assertEquals("", normalGroup(""))
        assertEquals("", normalGroup("   "))
        assertEquals("", normalGroup(null))
    }

    @Test
    fun `leaves a name it does not know alone rather than guessing`() {
        assertEquals("Vocational", normalGroup("Vocational"))
        assertEquals("General", normalGroup("  General "))
    }

    @Test
    fun `offers the three groups and nothing else on a blank record`() {
        assertEquals(GROUPS, groupOptions(""))
        assertEquals(GROUPS, groupOptions(null))
    }

    @Test
    fun `does not repeat a group the record already has`() {
        assertEquals(GROUPS, groupOptions("Humanities"))
        // and the same when it was written some other way
        assertEquals(GROUPS, groupOptions("commerce"))
    }

    @Test
    fun `keeps an unknown group on the end so saving cannot wipe it`() {
        assertEquals(GROUPS + "Vocational", groupOptions("Vocational"))
    }
}
