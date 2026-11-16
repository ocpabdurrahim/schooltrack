package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The same cases exist in web/src/data/attendanceReports.test.ts. */
class AttendanceReportsTest {

    private val weekend = listOf("FRI", "SAT")

    private fun student(id: String, roll: Long) = Student(
        studentId = id, fullName = id, rollNo = roll,
        classId = "61", className = "Class 6", section = "A",
    )

    @Test
    fun `the weekday is read from the date alone, so a handset clock cannot shift it`() {
        assertEquals("MON", weekdayOf("2026-11-16"))
        assertEquals("FRI", weekdayOf("2026-11-20"))
        assertEquals("SAT", weekdayOf("2026-11-21"))
    }

    @Test
    fun `a month ends on its real last day`() {
        assertEquals(30, daysInMonth("2026-11").size)
        assertEquals(28, daysInMonth("2026-02").size)
        assertEquals(29, daysInMonth("2028-02").size)
    }

    @Test
    fun `a holiday, a weekend and a working day are told apart`() {
        val holidays = mapOf("2026-11-16" to "Test holiday")
        assertEquals(DayKind.HOLIDAY, kindOf("2026-11-16", weekend, holidays))
        assertEquals(DayKind.WEEKEND, kindOf("2026-11-20", weekend, holidays))
        assertEquals(DayKind.WORKING, kindOf("2026-11-17", weekend, holidays))
    }

    @Test
    fun `a holiday on a weekend is still a holiday`() {
        val onFriday = mapOf("2026-11-20" to "Falls on a Friday")
        assertEquals(DayKind.HOLIDAY, kindOf("2026-11-20", weekend, onFriday))
    }

    @Test
    fun `weekends and holidays drop out, and a holiday on a weekend counts once`() {
        // November 2026 has 30 days; 8 of them are Fri/Sat
        assertEquals(22, workingDays("2026-11", weekend, emptyMap()).size)
        assertEquals(21, workingDays("2026-11", weekend, mapOf("2026-11-17" to "x")).size)
        // already not a working day, so the month does not shrink twice
        assertEquals(22, workingDays("2026-11", weekend, mapOf("2026-11-20" to "x")).size)
    }

    private val students = listOf(student("1", 1), student("2", 2), student("3", 3))

    private val marks = listOf(
        MonthMark("1", "2026-11-16", Status.P),
        MonthMark("1", "2026-11-17", Status.L),
        MonthMark("1", "2026-11-18", Status.A),
        MonthMark("2", "2026-11-16", Status.A),
        MonthMark("2", "2026-11-17", Status.A),
        MonthMark("2", "2026-11-18", Status.E),
    )

    private val rows = monthlySheet(students, marks)

    @Test
    fun `late counts as present`() {
        assertEquals(2, rows[0].present)
        assertEquals(1, rows[0].absent)
        assertEquals(66.7, rows[0].percent!!, 0.001)
    }

    @Test
    fun `leave is counted apart from absence`() {
        assertEquals(1, rows[1].leave)
        assertEquals(2, rows[1].absent)
        assertEquals(0, rows[1].present)
        assertEquals(0.0, rows[1].percent!!, 0.001)
    }

    @Test
    fun `a student with nothing marked gets no percentage at all`() {
        assertEquals(0, rows[2].marked)
        assertNull(rows[2].percent)
    }

    @Test
    fun `each day is kept so the grid can be drawn`() {
        assertEquals(Status.L, rows[0].byDay["2026-11-17"])
    }

    private val twoMarks = monthlySheet(
        students,
        listOf(
            MonthMark("1", "2026-11-16", Status.P),
            MonthMark("2", "2026-11-16", Status.A),
        ),
    )

    @Test
    fun `a percentage is written the way the web writes it`() {
        assertEquals("50%", percentText(50.0))
        assertEquals("66.7%", percentText(66.7))
        assertEquals("—", percentText(null))
    }

    @Test
    fun `the low list puts the worst first`() {
        assertEquals(listOf("2"), belowThreshold(twoMarks, 75.0).map { it.studentId })
    }

    @Test
    fun `a student with nothing marked is left out — unmarked is not absent`() {
        val listed = belowThreshold(twoMarks, 100.0).map { it.studentId }
        assertTrue(listed.contains("2"))
        assertFalse(listed.contains("3"))
    }

    @Test
    fun `a student exactly on the threshold is not listed`() {
        assertFalse(belowThreshold(twoMarks, 100.0).map { it.studentId }.contains("1"))
    }
}
