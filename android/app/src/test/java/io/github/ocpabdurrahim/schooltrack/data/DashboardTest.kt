package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The same cases exist in web/src/data/dashboard.test.ts. */
class DashboardTest {

    private fun day(date: String, marked: Int, present: Int, kind: DayKind = DayKind.WORKING) =
        TrendDay(date = date, kind = kind, marked = marked, present = present)

    @Test
    fun `the window ends with today and runs oldest first`() {
        assertEquals(
            listOf(
                "2026-11-10", "2026-11-11", "2026-11-12",
                "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16",
            ),
            lastDays("2026-11-16", 7),
        )
    }

    @Test
    fun `the window crosses a month, a leap day and a year`() {
        assertEquals(
            listOf("2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"),
            lastDays("2026-03-02", 4),
        )
        assertEquals(listOf("2028-02-29", "2028-03-01"), lastDays("2028-03-01", 2))
        assertEquals(listOf("2026-12-31", "2027-01-01"), lastDays("2027-01-01", 2))
    }

    @Test
    fun `a percentage is present out of marked`() {
        assertEquals(75, percentOf(18, 24))
        assertEquals(100, percentOf(24, 24))
    }

    @Test
    fun `nothing marked gives no percentage at all — unmarked is not absent`() {
        assertNull(percentOf(0, 0))
    }

    @Test
    fun `the window is weighed by children marked, not by days`() {
        // One child marked present on Monday must not count as much as four
        // hundred on Tuesday: the mean of the daily percentages would say 75%.
        val days = listOf(day("2026-11-16", 1, 1), day("2026-11-17", 400, 200))
        assertEquals(50, trendSummary(days).average)
    }

    @Test
    fun `weekends and holidays are left out of the window entirely`() {
        val days = listOf(
            day("2026-11-20", 0, 0, DayKind.WEEKEND),
            day("2026-11-21", 0, 0, DayKind.HOLIDAY),
            day("2026-11-22", 10, 9),
        )
        val s = trendSummary(days)
        assertEquals(1, s.working)
        assertEquals(1, s.taken)
        assertEquals(emptyList<String>(), s.missed)
        assertEquals(90, s.average)
    }

    @Test
    fun `the working days nobody marked are named`() {
        val days = listOf(day("2026-11-16", 0, 0), day("2026-11-17", 20, 20))
        val s = trendSummary(days)
        assertEquals(listOf("2026-11-16"), s.missed)
        assertEquals(1, s.taken)
        assertEquals(2, s.working)
        assertEquals(100, s.average)
    }

    @Test
    fun `a window with nothing marked has no figure at all`() {
        assertNull(trendSummary(listOf(day("2026-11-16", 0, 0))).average)
    }

    @Test
    fun `a date and a month are written the way the web writes them`() {
        assertEquals("Monday, 16 November 2026", longDate("2026-11-16"))
        assertEquals("Thursday, 1 January 2026", longDate("2026-01-01"))
        assertEquals("November 2026", longMonth("2026-11"))
    }
}
