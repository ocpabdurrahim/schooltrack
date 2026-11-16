package io.github.ocpabdurrahim.schooltrack.data

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.SetOptions
import java.time.LocalDate
import java.time.YearMonth
import kotlin.math.roundToInt

/**
 * Attendance reports — the Kotlin twin of web/src/data/attendanceReports.ts.
 *
 * The monthly sheet, the low-attendance list and the holidays those two depend
 * on. A working day is a day that is neither a weekend nor a holiday; getting
 * that wrong makes every percentage wrong, which is why it is computed in one
 * place and tested on both sides with the same cases.
 */

data class Holiday(val date: String, val name: String, val source: String = "SCHOOL")

val WEEKDAY_CODES = listOf("SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT")

/** The weekday code for a date. LocalDate carries no zone at all, so unlike a
 *  Date it cannot be shifted by the handset's clock or timezone. */
fun weekdayOf(date: String): String {
    val d = LocalDate.parse(date)
    // DayOfWeek is MONDAY=1..SUNDAY=7; WEEKDAY_CODES starts at Sunday
    return WEEKDAY_CODES[d.dayOfWeek.value % 7]
}

fun daysInMonth(month: String): List<String> {
    val ym = YearMonth.parse(month)
    return (1..ym.lengthOfMonth()).map { "%s-%02d".format(month, it) }
}

enum class DayKind { WORKING, WEEKEND, HOLIDAY }

fun kindOf(date: String, weekendDays: List<String>, holidays: Map<String, String>): DayKind =
    when {
        holidays.containsKey(date) -> DayKind.HOLIDAY
        weekendDays.contains(weekdayOf(date)) -> DayKind.WEEKEND
        else -> DayKind.WORKING
    }

/**
 * The working days of a month.
 *
 * A holiday that falls on a weekend is counted once, not twice — it is simply
 * not a working day either way, and double-counting it would quietly shrink
 * the month a school is measured against.
 */
fun workingDays(
    month: String,
    weekendDays: List<String>,
    holidays: Map<String, String>,
): List<String> = daysInMonth(month).filter { kindOf(it, weekendDays, holidays) == DayKind.WORKING }

fun holidayMap(holidays: List<Holiday>): Map<String, String> =
    holidays.associate { it.date to it.name }

data class MonthlyRow(
    val studentId: String,
    val fullName: String,
    val rollNo: Long,
    val byDay: Map<String, Status>,
    val present: Int,     // P and L both count as present
    val absent: Int,
    val leave: Int,
    val marked: Int,
    val percent: Double?,
)

data class MonthMark(val studentId: String, val date: String, val status: Status)

/** The reports only need the three fields a row is drawn from, and the roll
 *  comes from the student list rather than from a mark, so a child who was
 *  never marked still appears on the sheet. */
fun StudentDetail.forReport(): Student = Student(
    studentId = studentId,
    fullName = fullName,
    rollNo = rollNo,
    classId = classId,
    className = className,
    section = section,
)

/**
 * One section's month.
 *
 * The percentage is of days MARKED, the same rule as everywhere else in this
 * app — not of the working days in the month. A section that was not marked
 * for a fortnight would otherwise show every child as a truant.
 */
fun monthlySheet(
    students: List<Student>,
    marks: List<MonthMark>,
): List<MonthlyRow> = students.map { s ->
    val mine = marks.filter { it.studentId == s.studentId }
    val present = mine.count { it.status == Status.P || it.status == Status.L }
    val marked = mine.size
    MonthlyRow(
        studentId = s.studentId,
        fullName = s.fullName,
        rollNo = s.rollNo,
        byDay = mine.associate { it.date to it.status },
        present = present,
        absent = mine.count { it.status == Status.A },
        leave = mine.count { it.status == Status.E },
        marked = marked,
        percent = if (marked > 0) (present * 1000.0 / marked).roundToInt() / 10.0 else null,
    )
}

/** A percentage as the web writes it: 50, not 50.0, and a dash for a student
 *  with nothing marked. The two clients are read side by side. */
fun percentText(percent: Double?): String = when {
    percent == null -> "—"
    percent % 1.0 == 0.0 -> percent.toInt().toString() + "%"
    else -> percent.toString() + "%"
}

/** Everyone below the threshold, worst first. Students with nothing marked
 *  are left out: they are not absentees, they are unmarked. */
fun belowThreshold(rows: List<MonthlyRow>, threshold: Double): List<MonthlyRow> =
    rows.filter { it.percent != null && it.percent < threshold }
        .sortedBy { it.percent ?: 0.0 }

class AttendanceReportsRepository(
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
) {
    private fun school() = db.collection("schools").document(SCHOOL_ID)

    suspend fun listHolidays(from: String? = null, to: String? = null): List<Holiday> {
        val base = school().collection("holidays")
        val q: Query = if (from != null && to != null) {
            base.whereGreaterThanOrEqualTo("date", from)
                .whereLessThanOrEqualTo("date", to)
                .orderBy("date")
        } else {
            base.orderBy("date")
        }
        return q.get().await().documents.map {
            Holiday(
                date = it.getString("date") ?: it.id,
                name = it.getString("name").orEmpty(),
                source = it.getString("source") ?: "SCHOOL",
            )
        }
    }

    suspend fun saveHoliday(holiday: Holiday) {
        school().collection("holidays").document(holiday.date).set(
            mapOf(
                "date" to holiday.date,
                "name" to holiday.name.trim(),
                "source" to holiday.source,
                "updatedAt" to FieldValue.serverTimestamp(),
            ),
            SetOptions.merge(),
        ).await()
    }

    /** Holidays are the one thing in this app that CAN be deleted: a day marked
     *  as a holiday by mistake has to come back, and nothing points at the
     *  record. The rules allow delete for an ADMIN outside the stamp guard. */
    suspend fun removeHoliday(date: String) {
        school().collection("holidays").document(date).delete().await()
    }

    suspend fun marksForMonth(classId: String, month: String): List<MonthMark> {
        val days = daysInMonth(month)
        return school().collection("attendanceMarks")
            .whereEqualTo("classId", classId)
            .whereGreaterThanOrEqualTo("date", days.first())
            .whereLessThanOrEqualTo("date", days.last())
            .get().await().documents.mapNotNull { d ->
                val status = d.getString("status")?.let {
                    runCatching { Status.valueOf(it) }.getOrNull()
                } ?: return@mapNotNull null
                MonthMark(
                    studentId = d.getString("studentId") ?: return@mapNotNull null,
                    date = d.getString("date") ?: return@mapNotNull null,
                    status = status,
                )
            }
    }
}
