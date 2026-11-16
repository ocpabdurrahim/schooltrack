package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The same cases exist in web/src/data/payroll.test.ts. Two apps must not
 * disagree about what someone is owed.
 */
class PayrollTest {

    private fun structure(
        basic: Double = 20000.0,
        houseRent: Double = 8000.0,
        medical: Double = 1000.0,
        transport: Double = 500.0,
        tax: Double = 500.0,
        providentFund: Double = 2000.0,
        incrementAmount: Double = 0.0,
        lastIncrementDate: String? = null,
    ) = SalaryStructure(
        staffId = "7",
        staffName = "A Teacher",
        basic = basic,
        houseRent = houseRent,
        medical = medical,
        transport = transport,
        providentFund = providentFund,
        tax = tax,
        incrementAmount = incrementAmount,
        lastIncrementDate = lastIncrementDate,
    )

    @Test
    fun addsAllowancesAndTakesOffDeductions() {
        val s = computeSalary(structure())
        assertEquals(29500.0, s.gross, 0.001)
        assertEquals(2500.0, s.totalDeduction, 0.001)
        assertEquals(27000.0, s.net, 0.001)
    }

    @Test
    fun missingFiguresCountAsZero() {
        val s = computeSalary(SalaryStructure("1", "New", basic = 1000.0))
        assertEquals(1000.0, s.gross, 0.001)
        assertEquals(0.0, s.totalDeduction, 0.001)
        assertEquals(1000.0, s.net, 0.001)
    }

    @Test
    fun netIsNeverNegative() {
        val s = computeSalary(
            structure(basic = 1000.0, houseRent = 0.0, medical = 0.0, transport = 0.0, tax = 9000.0),
        )
        assertEquals(0.0, s.net, 0.001)
    }

    @Test
    fun monthsBetweenCountsWholeMonthsOnly() {
        assertEquals(12, monthsBetween("2025-01-15", "2026-01-15"))
        assertEquals(11, monthsBetween("2025-01-15", "2026-01-14"))   // a day short
        assertEquals(12, monthsBetween("2025-01-15", "2026-02-01"))
        assertEquals(0, monthsBetween("2026-01-01", "2026-01-01"))
    }

    @Test
    fun incrementIsDueTwelveMonthsAfterTheLastOneNotInJanuary() {
        val joinedNovember = structure(incrementAmount = 1000.0, lastIncrementDate = "2025-11-20")
        assertFalse(dueForIncrement(joinedNovember, "2026-01-31"))
        assertFalse(dueForIncrement(joinedNovember, "2026-11-19"))
        assertTrue(dueForIncrement(joinedNovember, "2026-11-20"))
    }

    @Test
    fun incrementIsDueAtOnceWhenNoneHasEverBeenGiven() {
        assertTrue(dueForIncrement(structure(incrementAmount = 500.0), "2026-11-16"))
    }

    @Test
    fun incrementIsNeverDueWhenThereIsNoneToGive() {
        assertFalse(dueForIncrement(structure(incrementAmount = 0.0), "2030-01-01"))
    }

    @Test
    fun applyingAnIncrementRaisesTheBasicAndRecordsTheDate() {
        val before = structure(incrementAmount = 1500.0, lastIncrementDate = "2025-11-20")
        val after = applyIncrement(before, "2026-11-20")
        assertEquals(21500.0, after.basic, 0.001)
        assertEquals("2026-11-20", after.lastIncrementDate)
        // allowances untouched: they are amounts, not percentages
        assertEquals(before.houseRent, after.houseRent, 0.001)
    }

    @Test
    fun anIncrementIsNotDueAgainStraightAfterwards() {
        val after = applyIncrement(structure(incrementAmount = 1500.0), "2026-11-20")
        assertFalse(dueForIncrement(after, "2026-11-21"))
    }

    @Test
    fun paymentIdIsOnePerPersonPerMonth() {
        assertEquals("7_2026-11", paymentId("7", "2026-11"))
        assertEquals(paymentId("7", "2026-11"), paymentId("7", "2026-11"))
        assertNotEquals(paymentId("7", "2026-12"), paymentId("7", "2026-11"))
    }
}
