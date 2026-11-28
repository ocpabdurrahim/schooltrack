package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The same cases exist in web/src/data/privileges.test.ts. */
class PrivilegesTest {

    @Test
    fun keepsTheFourTheOfficeNamed() {
        assertEquals(listOf("Regular", "Scholarship", "Donor family", "Half fee"), PRIVILEGES)
        for (p in PRIVILEGES) assertEquals(p, normalPrivilege(p))
    }

    @Test
    fun readsABlankAsRegularBecauseEveryOlderRecordHasOne() {
        assertEquals("Regular", normalPrivilege(""))
        assertEquals("Regular", normalPrivilege("   "))
        assertEquals("Regular", normalPrivilege(null))
    }

    @Test
    fun readsTheSpellingsAnOfficeActuallyTypes() {
        assertEquals("Half fee", normalPrivilege("HALF"))
        assertEquals("Half fee", normalPrivilege("half-fee"))
        assertEquals("Half fee", normalPrivilege("50%"))
        assertEquals("Donor family", normalPrivilege("donor"))
        assertEquals("Donor family", normalPrivilege("Donor Family"))
        assertEquals("Donor family", normalPrivilege("free"))
        assertEquals("Scholarship", normalPrivilege("  scholarship "))
        assertEquals("Scholarship", normalPrivilege("stipend"))
        assertEquals("Regular", normalPrivilege("none"))
    }

    @Test
    fun leavesAWordItDoesNotKnowAlone() {
        assertEquals("Orphan fund", normalPrivilege("Orphan fund"))
    }

    @Test
    fun offersTheFourAndKeepsOneThePickerHasNoRoomFor() {
        assertEquals(PRIVILEGES, privilegeOptions("Regular"))
        assertEquals(PRIVILEGES, privilegeOptions(""))
        assertEquals(PRIVILEGES + "Orphan fund", privilegeOptions("Orphan fund"))
    }

    @Test
    fun chargesARegularStudentTheCardRate() {
        assertEquals(0, tuitionWaiverPercent("Regular"))
        assertEquals(0.0, waiverOn(TUITION_HEAD, 200.0, "Regular"), 1e-9)
        assertEquals(200.0, netRate(TUITION_HEAD, 200.0, "Regular"), 1e-9)
    }

    @Test
    fun chargesAScholarshipAndADonorFamilyNoTuitionAtAll() {
        for (p in listOf("Scholarship", "Donor family")) {
            assertEquals(100, tuitionWaiverPercent(p))
            assertEquals(200.0, waiverOn(TUITION_HEAD, 200.0, p), 1e-9)
            assertEquals(0.0, netRate(TUITION_HEAD, 200.0, p), 1e-9)
        }
    }

    @Test
    fun halvesTuitionForAHalfFeeStudent() {
        assertEquals(50, tuitionWaiverPercent("Half fee"))
        assertEquals(100.0, waiverOn(TUITION_HEAD, 200.0, "Half fee"), 1e-9)
        assertEquals(100.0, netRate(TUITION_HEAD, 200.0, "Half fee"), 1e-9)
    }

    @Test
    fun givesTheOddTakaToTheWaiverNeverToTheBill() {
        // 175 halves to 87.5. The family pays 87 and the school waives 88.
        assertEquals(88.0, waiverOn(TUITION_HEAD, 175.0, "Half fee"), 1e-9)
        assertEquals(87.0, netRate(TUITION_HEAD, 175.0, "Half fee"), 1e-9)
    }

    @Test
    fun waivesNothingOnAnyHeadButTuition() {
        for (head in listOf("SESSION", "EXAM", "ADMISSION", "REGISTRATION", "LABFEE", "FINE")) {
            assertEquals(0.0, waiverOn(head, 500.0, "Donor family"), 1e-9)
            assertEquals(0.0, waiverOn(head, 500.0, "Half fee"), 1e-9)
            assertEquals(500.0, netRate(head, 500.0, "Scholarship"), 1e-9)
        }
    }

    @Test
    fun waivesNothingItCannotMakeSenseOfRatherThanGuessing() {
        assertEquals(0.0, waiverOn(TUITION_HEAD, 200.0, "Orphan fund"), 1e-9)
        assertEquals(0.0, waiverOn(TUITION_HEAD, null, "Donor family"), 1e-9)
        assertEquals(0.0, waiverOn(TUITION_HEAD, 0.0, "Donor family"), 1e-9)
        assertEquals(0.0, waiverOn(TUITION_HEAD, -50.0, "Half fee"), 1e-9)
        assertEquals(0.0, netRate(TUITION_HEAD, null, "Regular"), 1e-9)
    }

    @Test
    fun explainsItselfInWordsTheCollectorCanReadOffTheScreen() {
        assertEquals("50% off tuition", explainPrivilege("Half fee"))
        assertEquals("no tuition fee", explainPrivilege("Donor family"))
        assertEquals("no tuition fee", explainPrivilege("Scholarship"))
        assertTrue(explainPrivilege("").contains("full rate"))
    }
}
