package io.github.ocpabdurrahim.schooltrack.data

import com.google.firebase.firestore.AggregateSource
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import java.time.LocalDate
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.roundToInt

/**
 * The figures behind the dashboard — the Kotlin twin of web/src/data/dashboard.ts,
 * with the same test cases on both sides.
 *
 * EVERY FIGURE IS BEST EFFORT AND INDEPENDENT, the rule schoolStats already
 * follows. A teacher may not read a payment and a guardian may not read the
 * settings; one refusal must never blank the rest of the screen, and must never
 * be shown as "you have no access". Each call catches its own denial and
 * returns null, and the dashboard leaves that panel out.
 *
 * A zero is a claim — "nothing was collected today" — and making that claim
 * because the read was refused is worse than showing nothing at all.
 */

// ---------------------------------------------------------------------------
// dates (pure)

/** The n days ending with [today], oldest first. LocalDate carries no zone, so
 *  unlike a Date it cannot be shifted by the handset's clock. */
fun lastDays(today: String, n: Int): List<String> {
    val end = LocalDate.parse(today)
    return (n - 1 downTo 0).map { end.minusDays(it.toLong()).toString() }
}

/** "Monday, 16 November 2026" — for the one place a date is read, not sorted. */
fun longDate(date: String): String {
    val d = LocalDate.parse(date)
    val day = d.dayOfWeek.getDisplayName(TextStyle.FULL, Locale.UK)
    val month = d.month.getDisplayName(TextStyle.FULL, Locale.UK)
    return "$day, ${d.dayOfMonth} $month ${d.year}"
}

/** "November 2026". */
fun longMonth(month: String): String {
    val d = LocalDate.parse("$month-01")
    return "${d.month.getDisplayName(TextStyle.FULL, Locale.UK)} ${d.year}"
}

// ---------------------------------------------------------------------------
// attendance over the last few days

data class TrendDay(
    val date: String,
    val kind: DayKind,
    val marked: Int,
    val present: Int,
) {
    val percent: Int? get() = percentOf(present, marked)
}

/**
 * Present out of MARKED, never out of enrolled.
 *
 * A section nobody has marked yet would otherwise drag the figure down and read
 * as truancy. Nothing marked means no percentage at all, not zero.
 */
fun percentOf(present: Int, marked: Int): Int? =
    if (marked <= 0) null else (present * 100.0 / marked).roundToInt()

data class TrendSummary(
    val taken: Int,            // working days with at least one mark
    val working: Int,          // working days in the window
    val missed: List<String>,  // working days with nothing marked
    val average: Int?,         // present of marked across the whole window
)

/**
 * The window's figure is total present over total marked — NOT the mean of the
 * daily percentages. Averaging percentages lets a day where one child was
 * marked count as much as a day where four hundred were, which is how a
 * dashboard ends up flattering a school that stopped taking attendance.
 */
fun trendSummary(days: List<TrendDay>): TrendSummary {
    val working = days.filter { it.kind == DayKind.WORKING }
    val taken = working.filter { it.marked > 0 }
    return TrendSummary(
        taken = taken.size,
        working = working.size,
        missed = working.filter { it.marked == 0 }.map { it.date },
        average = percentOf(taken.sumOf { it.present }, taken.sumOf { it.marked }),
    )
}

// ---------------------------------------------------------------------------
// money this month

data class MoneySnapshot(
    val month: String,
    val collectedToday: Double,
    val collectedMonth: Double,
    val spentMonth: Double?,     // null = this role may not read expenses
    val receipts: Int,           // receipts written this month
    val latest: List<Payment>,   // newest first, at most five
) {
    val net: Double? get() = spentMonth?.let { collectedMonth - it }
}

class DashboardRepository(
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
    private val admin: AdminRepository = AdminRepository(),
    private val attendance: AttendanceRepository = AttendanceRepository(),
    private val reports: AttendanceReportsRepository = AttendanceReportsRepository(),
    private val fees: FeesRepository = FeesRepository(),
    private val expenses: ExpensesRepository = ExpensesRepository(),
) {
    private fun school() = db.collection("schools").document(SCHOOL_ID)

    /** The school's own day, not the handset's. Dhaka, as everywhere else here. */
    fun today(): String = attendance.todayInDhaka()

    private suspend fun count(q: Query): Int = q.count().get(AggregateSource.SERVER).await().count.toInt()

    suspend fun attendanceTrend(days: Int = 7): List<TrendDay>? {
        val today = attendance.todayInDhaka()
        val dates = lastDays(today, days)
        val marks = school().collection("attendanceMarks")

        // Both of these are allowed to fail: without them the bars are still
        // right, they just lose the weekend and holiday shading.
        val weekendDays = admin.getSettings()?.weekendDays?.takeIf { it.isNotEmpty() }
            ?: listOf("FRI", "SAT")
        val holidays = try {
            holidayMap(reports.listHolidays(dates.first(), today))
        } catch (_: Exception) {
            emptyMap()
        }

        return try {
            dates.map { date ->
                TrendDay(
                    date = date,
                    kind = kindOf(date, weekendDays, holidays),
                    marked = count(marks.whereEqualTo("date", date)),
                    present = count(
                        marks.whereEqualTo("date", date).whereIn("status", listOf("P", "L")),
                    ),
                )
            }
        } catch (_: Exception) {
            null   // a role that cannot read marks gets no chart, not an error
        }
    }

    /**
     * One read of the month's payments answers today, the month and the latest
     * receipts, so the panel costs two queries rather than five.
     *
     * Income is what was COLLECTED, never what was charged — a dues figure is a
     * hope, and standing it beside real spending makes a school look solvent on
     * money nobody has handed over.
     */
    suspend fun moneySnapshot(): MoneySnapshot? {
        val today = attendance.todayInDhaka()
        val month = today.substring(0, 7)
        val (from, to) = monthRange(month)

        val payments = try {
            fees.paymentsBetween(from, to)
        } catch (_: Exception) {
            return null   // a teacher cannot read a payment: no money panel
        }

        val spent = try {
            expenses.between(from, to).sumOf { it.amount }
        } catch (_: Exception) {
            null
        }

        return MoneySnapshot(
            month = month,
            collectedToday = payments.filter { it.paymentDate == today }.sumOf { it.totalAmount },
            collectedMonth = payments.sumOf { it.totalAmount },
            spentMonth = spent,
            receipts = payments.size,
            latest = payments
                .sortedWith(compareByDescending<Payment> { it.paymentDate }.thenByDescending { it.receiptNo })
                .take(5),
        )
    }
}
