package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import io.github.ocpabdurrahim.schooltrack.data.AdminRepository
import io.github.ocpabdurrahim.schooltrack.data.AttendanceReportsRepository
import io.github.ocpabdurrahim.schooltrack.data.DayCell
import io.github.ocpabdurrahim.schooltrack.data.DayKind
import io.github.ocpabdurrahim.schooltrack.data.PeopleRepository
import io.github.ocpabdurrahim.schooltrack.data.Status
import io.github.ocpabdurrahim.schooltrack.data.StudentDetail
import io.github.ocpabdurrahim.schooltrack.data.StudentMonthReport
import io.github.ocpabdurrahim.schooltrack.data.WEEKDAY_CODES
import io.github.ocpabdurrahim.schooltrack.data.holidayMap
import io.github.ocpabdurrahim.schooltrack.data.longMonth
import io.github.ocpabdurrahim.schooltrack.data.percentText
import io.github.ocpabdurrahim.schooltrack.data.studentMonth
import io.github.ocpabdurrahim.schooltrack.data.weekdayOf

/**
 * One child's attendance, month by month — the Compose twin of the web's
 * StudentAttendance page, and the report a parent opens.
 *
 * A calendar rather than a list, because a parent reads a month the way it sits
 * on a wall. Weekends and holidays are drawn as what they are, so a blank
 * Tuesday cannot be mistaken for an absence: the two look nothing alike, and
 * the summary counts them apart.
 */
@Composable
fun StudentAttendanceScreen(
    studentId: String,
    onBack: () -> Unit,
    people: PeopleRepository = remember { PeopleRepository() },
    reports: AttendanceReportsRepository = remember { AttendanceReportsRepository() },
    admin: AdminRepository = remember { AdminRepository() },
) {
    var student by remember { mutableStateOf<StudentDetail?>(null) }
    var weekend by remember { mutableStateOf(listOf("FRI", "SAT")) }
    var month by remember { mutableStateOf(java.time.YearMonth.now().toString()) }
    var sheet by remember { mutableStateOf<StudentMonthReport?>(null) }
    var problem by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(true) }

    LaunchedEffect(studentId) {
        student = try {
            people.getStudent(studentId)
        } catch (_: Exception) {
            problem = "Those records could not be read."
            null
        }
        // A guardian may read the settings; if that ever changes, the calendar
        // simply falls back to a Friday/Saturday weekend rather than failing.
        admin.getSettings()?.weekendDays?.takeIf { it.isNotEmpty() }?.let { weekend = it }
    }

    LaunchedEffect(studentId, month, weekend) {
        busy = true
        val marks = try {
            reports.marksForStudentMonth(studentId, month)
        } catch (_: Exception) {
            problem = "Those attendance records could not be read."
            emptyList()
        }
        val holidays = try {
            holidayMap(reports.listHolidays(month + "-01", month + "-31"))
        } catch (_: Exception) {
            emptyMap()
        }
        sheet = studentMonth(month, marks, weekend, holidays)
        busy = false
    }

    AdminScaffold(
        title = "Attendance report",
        subtitle = student?.let { "${it.fullName} · ${it.className} - ${it.section} · Roll ${it.rollNo}" },
        onBack = onBack,
    ) {
        Problem(problem)

        Row(
            Modifier.fillMaxWidth().padding(top = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = { month = java.time.YearMonth.parse(month).minusMonths(1).toString() }) {
                Text("‹ Previous")
            }
            Spacer(Modifier.weight(1f))
            Text(
                longMonth(month),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.weight(1f))
            val next = java.time.YearMonth.parse(month).plusMonths(1)
            TextButton(
                onClick = { month = next.toString() },
                // there is nothing to report from a month that has not happened
                enabled = !next.isAfter(java.time.YearMonth.now()),
            ) { Text("Next ›") }
        }

        if (busy && sheet == null) {
            Text("Loading…", Modifier.padding(top = 12.dp), color = Muted)
            return@AdminScaffold
        }

        val report = sheet ?: return@AdminScaffold

        Card(
            Modifier.fillMaxWidth().padding(top = 8.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            border = BorderStroke(1.dp, Line),
            elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        ) {
            Column(Modifier.padding(14.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Figure(percentText(report.percent), "of days marked",
                        if (report.percent != null && report.percent < 75.0) Bad else Green, Modifier.weight(1f))
                    Figure(report.present.toString(), "present", Green, Modifier.weight(1f))
                    Figure(report.absent.toString(), "absent", Bad, Modifier.weight(1f))
                }
                Row(
                    Modifier.fillMaxWidth().padding(top = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Figure(report.late.toString(), "late", Amber, Modifier.weight(1f))
                    Figure(report.leave.toString(), "leave", InkSoft, Modifier.weight(1f))
                    Figure(report.workingDays.toString(), "working days", InkSoft, Modifier.weight(1f))
                }

                Spacer(Modifier.height(16.dp))
                Calendar(report)

                Spacer(Modifier.height(14.dp))
                Legend()

                val holidays = report.days.filter { it.kind == DayKind.HOLIDAY }
                if (holidays.isNotEmpty()) {
                    Text(
                        "Holidays: " + holidays.joinToString(" · ") {
                            (it.date.takeLast(2).trimStart('0') + " " + (it.holiday ?: "")).trim()
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = Muted,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                }

                Text(
                    buildString {
                        append("The percentage is of the days attendance was actually taken")
                        if (report.notMarked > 0) {
                            append(" — ${report.notMarked} working day")
                            if (report.notMarked != 1) append("s")
                            append(" this month ")
                            append(if (report.notMarked == 1) "was" else "were")
                            append(" not marked at all, and ")
                            append(if (report.notMarked == 1) "that day is" else "those days are")
                            append(" left out rather than counted against your child")
                        }
                        append(". A late arrival counts as present, and is also shown on its own.")
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = Muted,
                    modifier = Modifier.padding(top = 10.dp),
                )
            }
        }
    }
}

@Composable
private fun Calendar(report: StudentMonthReport) {
    Column {
        Row(Modifier.fillMaxWidth()) {
            WEEKDAY_CODES.forEach { code ->
                Text(
                    code,
                    style = MaterialTheme.typography.labelSmall,
                    color = Muted,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        // The month starts on its own weekday, not on Sunday.
        val lead = WEEKDAY_CODES.indexOf(weekdayOf(report.days.first().date))
        val cells: List<DayCell?> = List(lead) { null } + report.days
        cells.chunked(7).forEach { week ->
            Row(Modifier.fillMaxWidth().padding(top = 4.dp)) {
                week.forEach { cell ->
                    if (cell == null) {
                        Spacer(Modifier.weight(1f).aspectRatio(1f))
                    } else {
                        Day(cell, Modifier.weight(1f))
                    }
                }
                repeat(7 - week.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun Day(cell: DayCell, modifier: Modifier = Modifier) {
    val fill = when {
        cell.status == Status.P -> GreenSoft
        cell.status == Status.A -> BadSoft
        cell.status == Status.L -> AmberSoft
        cell.status == Status.E -> Color(0xFFE8F1FA)
        cell.kind == DayKind.HOLIDAY -> AmberSoft
        cell.kind == DayKind.WEEKEND -> LineSoft
        else -> Color.White
    }
    val ink = when (cell.status) {
        Status.P -> GreenDeep
        Status.A -> Bad
        Status.L -> Amber
        Status.E -> Color(0xFF1D6FB8)
        else -> Muted
    }

    Box(
        modifier
            .padding(2.dp)
            .aspectRatio(1f)
            .clip(RoundedCornerShape(8.dp))
            .background(fill)
            .border(BorderStroke(1.dp, if (fill == Color.White) Line else fill), RoundedCornerShape(8.dp)),
    ) {
        Text(
            cell.date.takeLast(2).trimStart('0'),
            style = MaterialTheme.typography.labelSmall,
            color = Muted,
            modifier = Modifier.align(Alignment.TopStart).padding(start = 4.dp, top = 2.dp),
        )
        Text(
            cell.status?.name ?: if (cell.kind == DayKind.HOLIDAY) "·" else "",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
            color = ink,
            modifier = Modifier.align(Alignment.Center),
        )
    }
}

@Composable
private fun Legend() {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        LegendDot("P present", GreenSoft)
        LegendDot("A absent", BadSoft)
        LegendDot("L late", AmberSoft)
        LegendDot("E leave", Color(0xFFE8F1FA))
    }
    Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        LegendDot("holiday", AmberSoft)
        LegendDot("weekend", LineSoft)
        Spacer(Modifier.weight(1f))
    }
}

@Composable
private fun LegendDot(label: String, colour: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(12.dp).clip(RoundedCornerShape(4.dp)).background(colour)
            .border(BorderStroke(1.dp, Line), RoundedCornerShape(4.dp)))
        Spacer(Modifier.width(5.dp))
        Text(label, style = MaterialTheme.typography.labelSmall, color = Muted)
    }
}

@Composable
private fun Figure(value: String, label: String, colour: Color, modifier: Modifier = Modifier) {
    Column(
        modifier
            .clip(RoundedCornerShape(10.dp))
            .border(BorderStroke(1.dp, Line), RoundedCornerShape(10.dp))
            .padding(vertical = 10.dp, horizontal = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = colour)
        Text(label, style = MaterialTheme.typography.labelSmall, color = Muted, textAlign = TextAlign.Center)
    }
}
