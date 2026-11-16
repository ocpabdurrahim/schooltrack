package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.github.ocpabdurrahim.schooltrack.data.AdminRepository
import io.github.ocpabdurrahim.schooltrack.data.AttendanceReportsRepository
import io.github.ocpabdurrahim.schooltrack.data.AttendanceRepository
import io.github.ocpabdurrahim.schooltrack.data.Holiday
import io.github.ocpabdurrahim.schooltrack.data.MonthlyRow
import io.github.ocpabdurrahim.schooltrack.data.PeopleRepository
import io.github.ocpabdurrahim.schooltrack.data.SchoolClass
import io.github.ocpabdurrahim.schooltrack.data.SchoolSettings
import io.github.ocpabdurrahim.schooltrack.data.StudentDetail
import io.github.ocpabdurrahim.schooltrack.data.WEEKDAY_CODES
import io.github.ocpabdurrahim.schooltrack.data.belowThreshold
import io.github.ocpabdurrahim.schooltrack.data.forReport
import io.github.ocpabdurrahim.schooltrack.data.holidayMap
import io.github.ocpabdurrahim.schooltrack.data.monthlySheet
import io.github.ocpabdurrahim.schooltrack.data.percentText
import io.github.ocpabdurrahim.schooltrack.data.weekdayOf
import io.github.ocpabdurrahim.schooltrack.data.workingDays
import kotlinx.coroutines.launch

/**
 * Attendance reports on the phone: the monthly sheet, the low-attendance list
 * and the holiday calendar — the twins of the web pages of the same names.
 *
 * The grid the web prints does not fit a handset, so the month is shown a
 * student at a time: the counts, the percentage, and the days that were not a
 * plain present.
 */

private fun monthNow(): String = java.time.YearMonth.now().toString()

// ===========================================================================
// monthly sheet

@Composable
fun MonthlySheetScreen(
    onBack: () -> Unit,
    attendance: AttendanceRepository = remember { AttendanceRepository() },
    people: PeopleRepository = remember { PeopleRepository() },
    reports: AttendanceReportsRepository = remember { AttendanceReportsRepository() },
    admin: AdminRepository = remember { AdminRepository() },
) {
    var classes by remember { mutableStateOf<List<SchoolClass>>(emptyList()) }
    var settings by remember { mutableStateOf<SchoolSettings?>(null) }
    var classId by remember { mutableStateOf("") }
    var month by remember { mutableStateOf(monthNow()) }
    var rows by remember { mutableStateOf<List<MonthlyRow>>(emptyList()) }
    var holidays by remember { mutableStateOf<List<Holiday>>(emptyList()) }
    var busy by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        try {
            classes = attendance.listClasses()
            settings = admin.getSettings()
            classId = classes.firstOrNull()?.classId.orEmpty()
        } catch (_: Exception) {
            problem = "Could not read the class list."
        }
        busy = false
    }

    LaunchedEffect(classId, month) {
        if (classId.isEmpty()) return@LaunchedEffect
        busy = true
        try {
            holidays = reports.listHolidays("$month-01", "$month-31")
            val roll = people.findStudents(classId, "")
            rows = monthlySheet(roll.map { it.forReport() }, reports.marksForMonth(classId, month))
            problem = ""
        } catch (_: Exception) {
            problem = "Could not read the month."
        }
        busy = false
    }

    val weekend = settings?.weekendDays ?: listOf("FRI", "SAT")
    val map = holidayMap(holidays)
    val working = if (month.length == 7) workingDays(month, weekend, map) else emptyList()

    AdminScaffold(
        "Monthly attendance",
        classes.firstOrNull { it.classId == classId }?.displayName,
        onBack,
    ) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Picker("Section", classes.map { it.classId to it.displayName }, classId) {
                    classId = it
                }
                Field("Month (YYYY-MM)", month) { month = it }

                Row(
                    Modifier.fillMaxWidth().padding(top = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text("Working days this month", style = MaterialTheme.typography.bodyMedium)
                    Text(working.size.toString(), fontWeight = FontWeight.Bold)
                }
                if (holidays.isNotEmpty()) {
                    Text(
                        "Holidays: " + holidays.joinToString(", ") {
                            it.date.takeLast(2) + " " + it.name
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                }
                Problem(problem)
                if (busy) Text("Working…", modifier = Modifier.padding(top = 8.dp))
                Text(
                    "P present, L late (counted present), A absent, E leave. The " +
                        "percentage is of the days actually marked, not of the working " +
                        "days — a fortnight nobody marked would otherwise read as a " +
                        "fortnight of truancy.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 10.dp),
                )
            }
        }

        if (!busy && rows.isEmpty()) {
            Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                Text(
                    "No students in this section.",
                    modifier = Modifier.padding(16.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        rows.forEach { r ->
            Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(r.fullName, style = MaterialTheme.typography.titleMedium)
                            Text(
                                "Roll " + r.rollNo + "  ·  " + r.present + " of " +
                                    r.marked + " marked",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Text(
                            percentText(r.percent),
                            style = MaterialTheme.typography.titleMedium,
                            color = if (r.percent != null && r.percent < 75) {
                                MaterialTheme.colorScheme.error
                            } else {
                                MaterialTheme.colorScheme.onSurface
                            },
                        )
                    }

                    // the days that were not a plain present: the only ones
                    // anybody reads a monthly sheet to find
                    val notable = r.byDay.filterValues { it.name != "P" }.toSortedMap()
                    if (notable.isNotEmpty()) {
                        HorizontalDivider(Modifier.padding(vertical = 10.dp))
                        notable.forEach { (day, status) ->
                            Row(
                                Modifier.fillMaxWidth().padding(vertical = 3.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text(
                                    day + " (" + weekdayOf(day) + ")",
                                    style = MaterialTheme.typography.bodySmall,
                                )
                                Text(
                                    when (status.name) {
                                        "A" -> "Absent"
                                        "L" -> "Late"
                                        else -> "Leave"
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = if (status.name == "A") {
                                        MaterialTheme.colorScheme.error
                                    } else {
                                        MaterialTheme.colorScheme.onSurfaceVariant
                                    },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

// ===========================================================================
// low attendance

@Composable
fun LowAttendanceScreen(
    onOpenStudent: (String) -> Unit,
    onBack: () -> Unit,
    attendance: AttendanceRepository = remember { AttendanceRepository() },
    people: PeopleRepository = remember { PeopleRepository() },
    reports: AttendanceReportsRepository = remember { AttendanceReportsRepository() },
) {
    var classes by remember { mutableStateOf<List<SchoolClass>>(emptyList()) }
    var classId by remember { mutableStateOf("") }          // "" = every section
    var month by remember { mutableStateOf(monthNow()) }
    var threshold by remember { mutableStateOf("75") }
    var rows by remember { mutableStateOf<List<MonthlyRow>>(emptyList()) }
    var detail by remember { mutableStateOf<Map<String, StudentDetail>>(emptyMap()) }
    var busy by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        try {
            classes = attendance.listClasses()
        } catch (_: Exception) {
            problem = "Could not read the class list."
        }
        busy = false
    }

    LaunchedEffect(classes, classId, month) {
        if (classes.isEmpty()) return@LaunchedEffect
        busy = true
        try {
            val wanted = if (classId.isEmpty()) classes else classes.filter {
                it.classId == classId
            }
            val all = mutableListOf<MonthlyRow>()
            val seen = mutableMapOf<String, StudentDetail>()
            for (c in wanted) {
                val roll = people.findStudents(c.classId, "")
                roll.forEach { seen[it.studentId] = it }
                all += monthlySheet(
                    roll.map { it.forReport() },
                    reports.marksForMonth(c.classId, month),
                )
            }
            rows = all
            detail = seen
            problem = ""
        } catch (_: Exception) {
            problem = "Could not read the month."
        }
        busy = false
    }

    val limit = threshold.toDoubleOrNull() ?: 75.0
    val listed = belowThreshold(rows, limit)
    val unmarked = rows.count { it.marked == 0 }

    AdminScaffold("Low attendance", "Below $threshold% in $month", onBack) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Picker(
                    "Section",
                    listOf("" to "Every section") + classes.map { it.classId to it.displayName },
                    classId,
                ) { classId = it }
                Field("Month (YYYY-MM)", month) { month = it }
                Field("Below %", threshold, numeric = true) { threshold = it }
                Problem(problem)
                if (busy) Text("Working…", modifier = Modifier.padding(top = 8.dp))
                if (!busy && unmarked > 0) {
                    Text(
                        "$unmarked students have nothing marked this month and so " +
                            "cannot be judged — they are not on this list.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
            }
        }

        if (!busy && listed.isEmpty()) {
            Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                Text(
                    "Nobody is below $threshold% this month.",
                    modifier = Modifier.padding(16.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        if (listed.isNotEmpty()) {
            Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                Column(Modifier.padding(16.dp)) {
                    listed.forEachIndexed { i, r ->
                        val s = detail[r.studentId]
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = 10.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    "${i + 1}.  " + r.fullName,
                                    style = MaterialTheme.typography.bodyLarge,
                                )
                                Text(
                                    (s?.let { it.className + " - " + it.section } ?: "") +
                                        "  ·  Roll " + r.rollNo + "  ·  " +
                                        r.present + "/" + r.marked + " present" +
                                        (s?.mobileNo?.let { "  ·  " + it } ?: ""),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            TextButton(onClick = { onOpenStudent(r.studentId) }) {
                                Text(percentText(r.percent))
                            }
                        }
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}

// ===========================================================================
// holidays

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun HolidaysScreen(
    onBack: () -> Unit,
    reports: AttendanceReportsRepository = remember { AttendanceReportsRepository() },
    admin: AdminRepository = remember { AdminRepository() },
) {
    val scope = rememberCoroutineScope()
    var settings by remember { mutableStateOf<SchoolSettings?>(null) }
    var holidays by remember { mutableStateOf<List<Holiday>>(emptyList()) }
    var year by remember { mutableStateOf(java.time.Year.now().value.toString()) }
    var date by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }

    suspend fun load() {
        try {
            holidays = reports.listHolidays("$year-01-01", "$year-12-31")
            problem = ""
        } catch (_: Exception) {
            problem = "Could not read the calendar."
        }
        busy = false
    }

    LaunchedEffect(Unit) {
        settings = try { admin.getSettings() } catch (_: Exception) { null }
        load()
    }
    LaunchedEffect(year) { busy = true; load() }

    val weekend = settings?.weekendDays ?: listOf("FRI", "SAT")
    val map = holidayMap(holidays)

    AdminScaffold("Holidays", "What counts as a working day", onBack) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Field("Year", year, numeric = true) { year = it }
                Problem(problem)
                if (note.isNotEmpty()) {
                    Text(note, style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(top = 8.dp))
                }
                if (busy) Text("Working…", modifier = Modifier.padding(top = 8.dp))
            }
        }

        Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(Modifier.padding(16.dp)) {
                Text("Weekend", style = MaterialTheme.typography.titleMedium)
                FlowRow(Modifier.padding(top = 8.dp)) {
                    WEEKDAY_CODES.forEach { code ->
                        val on = weekend.contains(code)
                        FilterChip(
                            selected = on,
                            enabled = !busy && settings != null,
                            onClick = {
                                val current = settings ?: return@FilterChip
                                val next = if (on) weekend - code else weekend + code
                                busy = true; problem = ""; note = ""
                                scope.launch {
                                    try {
                                        val updated = current.copy(weekendDays = next)
                                        admin.saveSettings(updated)
                                        settings = updated
                                    } catch (_: Exception) {
                                        problem = "That was refused. Only an " +
                                            "administrator may change the weekend."
                                    }
                                    busy = false
                                }
                            },
                            label = { Text(code) },
                            modifier = Modifier.padding(end = 6.dp),
                        )
                    }
                }
                Text(
                    if (weekend.isEmpty()) {
                        "With no weekend set, every day that is not a holiday is a working day."
                    } else {
                        weekend.joinToString(" and ") + " are not working days."
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }

        Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(Modifier.padding(16.dp)) {
                Text("Add a holiday", style = MaterialTheme.typography.titleMedium)
                Field("Date (YYYY-MM-DD)", date) { date = it }
                Field("Name", name) { name = it }
                if (date.length == 10) {
                    val day = runCatching { weekdayOf(date) }.getOrNull()
                    if (day != null) {
                        Text(
                            "$date is a $day" + if (weekend.contains(day)) {
                                " — already a weekend, so this changes nothing."
                            } else {
                                "."
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                    }
                }
                Button(
                    enabled = !busy,
                    onClick = {
                        if (date.isBlank() || name.isBlank()) {
                            problem = "A holiday needs a date and a name."
                            return@Button
                        }
                        busy = true; problem = ""; note = ""
                        scope.launch {
                            try {
                                reports.saveHoliday(Holiday(date, name))
                                if (date.take(4) != year) year = date.take(4)
                                note = name.trim() + " saved for " + date + "."
                                name = ""
                                load()
                            } catch (_: Exception) {
                                problem = "That was refused. Only an administrator " +
                                    "may change the calendar."
                                busy = false
                            }
                        }
                    },
                    modifier = Modifier.padding(top = 12.dp),
                ) { Text("Save holiday") }
            }
        }

        Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(Modifier.padding(16.dp)) {
                Text(
                    holidays.size.toString() +
                        (if (holidays.size == 1) " holiday in " else " holidays in ") + year,
                    style = MaterialTheme.typography.titleMedium,
                )
                if (holidays.isEmpty()) {
                    Text(
                        "Nothing in $year yet.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
                holidays.forEach { h ->
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(h.name, style = MaterialTheme.typography.bodyLarge)
                            Text(
                                h.date + " (" + weekdayOf(h.date) + ")",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        TextButton(
                            enabled = !busy,
                            onClick = {
                                busy = true; problem = ""; note = ""
                                scope.launch {
                                    try {
                                        reports.removeHoliday(h.date)
                                        note = h.name + " removed from " + h.date + "."
                                        load()
                                    } catch (_: Exception) {
                                        problem = "That was refused. Only an " +
                                            "administrator may change the calendar."
                                        busy = false
                                    }
                                }
                            },
                        ) { Text("Remove") }
                    }
                    HorizontalDivider()
                }
            }
        }

        Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(Modifier.padding(16.dp)) {
                Text("Working days in $year", style = MaterialTheme.typography.titleMedium)
                (1..12).forEach { m ->
                    val month = year + "-" + "%02d".format(m)
                    val count = runCatching { workingDays(month, weekend, map).size }.getOrNull()
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 6.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            java.time.Month.of(m).name.lowercase().replaceFirstChar {
                                it.uppercase()
                            },
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Text(count?.toString() ?: "—", fontWeight = FontWeight.Bold)
                    }
                }
                Text(
                    "A holiday that falls on a weekend is counted once, not twice.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }
    }
}
