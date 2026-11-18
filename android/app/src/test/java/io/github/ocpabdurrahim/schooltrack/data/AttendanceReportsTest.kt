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

    // ---- one student's month, as a parent is shown it ----------------------
    // The same cases as the web's "one student's month" block.

    private val novHolidays = mapOf("2026-11-16" to "Victory Day")
    private val novMarks = listOf(
        "2026-11-10" to Status.P,
        "2026-11-11" to Status.A,
        "2026-11-12" to Status.L,
        "2026-11-17" to Status.E,
    )

    @Test
    fun `the month is laid out day by day, in order`() {
        val month = studentMonth("2026-11", novMarks, weekend, novHolidays)
        assertEquals(30, month.days.size)
        assertEquals("2026-11-01", month.days.first().date)
        assertEquals("2026-11-30", month.days.last().date)
    }

    @Test
    fun `a late counts as present, and also as late`() {
        val month = studentMonth("2026-11", novMarks, weekend, novHolidays)
        assertEquals(2, month.present)
        assertEquals(1, month.late)
        assertEquals(1, month.absent)
        assertEquals(1, month.leave)
        assertEquals(4, month.marked)
        assertEquals(50.0, month.percent!!, 0.001)
    }

    @Test
    fun `the weekend is marked and the holiday is named`() {
        val month = studentMonth("2026-11", novMarks, weekend, novHolidays)
        val byDate = month.days.associateBy { it.date }
        assertEquals(DayKind.WEEKEND, byDate["2026-11-13"]!!.kind)
        assertEquals(DayKind.HOLIDAY, byDate["2026-11-16"]!!.kind)
        assertEquals("Victory Day", byDate["2026-11-16"]!!.holiday)
        assertEquals(DayKind.WORKING, byDate["2026-11-17"]!!.kind)
    }

    @Test
    fun `working days nobody marked are reported, not counted as absences`() {
        val month = studentMonth("2026-11", novMarks, weekend, novHolidays)
        assertEquals(21, month.workingDays)
        assertEquals(21 - 4, month.notMarked)
        assertEquals(1, month.absent)
    }

    @Test
    fun `a month with nothing marked has no percentage at all`() {
        val month = studentMonth("2026-11", emptyList(), weekend, novHolidays)
        assertNull(month.percent)
        assertEquals(0, month.marked)
        assertEquals(21, month.notMarked)
    }

    @Test
    fun `a mark made on a holiday still counts - the register is the truth`() {
        val month = studentMonth("2026-11", listOf("2026-11-16" to Status.P), weekend, novHolidays)
        assertEquals(1, month.marked)
        assertEquals(100.0, month.percent!!, 0.001)
        assertEquals(21, month.workingDays)
    }

    // ----------------------------------------------------------------------
    // the figure on the student list

    @Test
    fun countsPresentAndLateAsPresentTheSameAsEverywhereElse() {
        val got = attendanceTotals(
            listOf("a", "b", "c"),
            listOf(
                Triple("a", "2026-11-01", Status.P),
                Triple("a", "2026-11-02", Status.L),
                Triple("a", "2026-11-03", Status.A),
                Triple("a", "2026-11-04", Status.E),
            ),
        )
        assertEquals(2, got.getValue("a").present)
        assertEquals(4, got.getValue("a").marked)
        assertEquals(50.0, got.getValue("a").percent!!, 0.001)
    }

    @Test
    fun isOfTheDaysMarkedNotOfTheDaysInTheRange() {
        // A week nobody took the register is not a week of truancy.
        val got = attendanceTotals(
            listOf("a", "b"), listOf(Triple("b", "2026-11-01", Status.P)),
        )
        assertEquals(100.0, got.getValue("b").percent!!, 0.001)
        assertEquals(1, got.getValue("b").marked)
    }

    @Test
    fun givesAStudentWithNothingMarkedNoPercentageAtAll() {
        val got = attendanceTotals(listOf("c"), emptyList())
        assertEquals(0, got.getValue("c").marked)
        assertNull(got.getValue("c").percent)
    }

    @Test
    fun ignoresAMarkBelongingToSomebodyNotOnThisList() {
        val got = attendanceTotals(
            listOf("a"),
            listOf(Triple("a", "2026-11-01", Status.P), Triple("zzz", "2026-11-01", Status.A)),
        )
        assertEquals(1, got.size)
        assertEquals(1, got.getValue("a").marked)
    }
}
