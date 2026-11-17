package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Test

/** The same cases exist in web/src/data/religions.test.ts. */
class ReligionsTest {

    @Test
    fun keepsTheThreeTheSchoolsOwnTableAllows() {
        assertEquals("Islam", normalReligion("Islam"))
        assertEquals("Hindu", normalReligion("Hindu"))
        assertEquals("Other", normalReligion("Other"))
        assertEquals(listOf("Islam", "Hindu", "Other"), RELIGIONS)
    }

    @Test
    fun readsTheSpellingsAnOfficeActuallyTypes() {
        assertEquals("Islam", normalReligion("muslim"))
        assertEquals("Islam", normalReligion("MUSLIM"))
        assertEquals("Islam", normalReligion("Islami"))
        assertEquals("Hindu", normalReligion("hinduism"))
        assertEquals("Hindu", normalReligion("  Hindu  "))
        assertEquals("Hindu", normalReligion("Sanatan"))
    }

    @Test
    fun foldsTheOnesTheSchoolHasNoColumnForIntoOther() {
        // students_info allows Islam, Hindu or Other and nothing else, so this
        // is the school's own decision, not ours.
        assertEquals("Other", normalReligion("Christian"))
        assertEquals("Other", normalReligion("Buddhist"))
    }

    @Test
    fun treatsNothingAsNothing() {
        assertEquals("", normalReligion(""))
        assertEquals("", normalReligion("   "))
        assertEquals("", normalReligion(null))
    }

    @Test
    fun leavesAWordItDoesNotKnowAloneRatherThanGuessing() {
        assertEquals("Jain", normalReligion("Jain"))
    }

    @Test
    fun offersTheThree() {
        assertEquals(listOf("Islam", "Hindu", "Other"), religionOptions(""))
        assertEquals(listOf("Islam", "Hindu", "Other"), religionOptions("Islam"))
    }

    @Test
    fun keepsWhateverIsAlreadyOnTheRecordSoSavingCannotWipeIt() {
        assertEquals(listOf("Islam", "Hindu", "Other", "Jain"), religionOptions("Jain"))
    }
}
