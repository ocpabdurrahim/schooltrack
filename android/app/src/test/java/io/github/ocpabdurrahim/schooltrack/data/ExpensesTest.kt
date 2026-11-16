package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Test

/** The same cases exist in web/src/data/expenses.test.ts. */
class ExpensesTest {

    private fun e(headId: String, headName: String, amount: Double) = Expense(
        voucherNo = "EXP-000001",
        expenseHeadId = headId,
        headName = headName,
        amount = amount,
        expenseDate = "2026-11-16",
        enteredBy = "x@y.z",
    )

    @Test
    fun monthRangeEndsOnTheRealLastDay() {
        assertEquals("2026-11-01" to "2026-11-30", monthRange("2026-11"))
        assertEquals("2026-12-01" to "2026-12-31", monthRange("2026-12"))
        assertEquals("2026-02-01" to "2026-02-28", monthRange("2026-02"))
    }

    @Test
    fun monthRangeKnowsFebruaryInALeapYear() {
        assertEquals("2028-02-29", monthRange("2028-02").second)
    }

    @Test
    fun lastMonthsEndsWithTodaysMonthOldestFirst() {
        assertEquals(listOf("2026-09", "2026-10", "2026-11"), lastMonths("2026-11-16", 3))
    }

    @Test
    fun lastMonthsCrossesTheYearBoundary() {
        assertEquals(
            listOf("2025-11", "2025-12", "2026-01", "2026-02"),
            lastMonths("2026-02-01", 4),
        )
    }

    @Test
    fun breakdownTotalsByHeadBiggestFirst() {
        val (total, byHead) = expenseBreakdown(
            listOf(
                e("SALARY", "Salary", 1000.0),
                e("REPAIR", "Repair", 2500.0),
                e("SALARY", "Salary", 500.0),
            ),
        )
        assertEquals(4000.0, total, 0.001)
        assertEquals(listOf("Repair" to 2500.0, "Salary" to 1500.0), byHead)
    }

    @Test
    fun breakdownCopesWithNothingSpent() {
        val (total, byHead) = expenseBreakdown(emptyList())
        assertEquals(0.0, total, 0.001)
        assertEquals(emptyList<Pair<String, Double>>(), byHead)
    }

    @Test
    fun headIdIsReadableAndStable() {
        assertEquals("REPAIR", expenseHeadIdFor("repair"))
        assertEquals("OFFICE_STATIONERY", expenseHeadIdFor("Office & stationery"))
        assertEquals("TIFFIN", expenseHeadIdFor("  tiffin  "))
    }
}
