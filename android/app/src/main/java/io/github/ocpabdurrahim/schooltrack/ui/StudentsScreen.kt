package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import io.github.ocpabdurrahim.schooltrack.data.AttendanceReportsRepository
import io.github.ocpabdurrahim.schooltrack.data.AttendanceRepository
import io.github.ocpabdurrahim.schooltrack.data.AttendanceTotal
import io.github.ocpabdurrahim.schooltrack.data.Dues
import io.github.ocpabdurrahim.schooltrack.data.FeesRepository
import io.github.ocpabdurrahim.schooltrack.data.PeopleRepository
import io.github.ocpabdurrahim.schooltrack.data.SchoolClass
import io.github.ocpabdurrahim.schooltrack.data.StudentDetail
import io.github.ocpabdurrahim.schooltrack.data.attendanceTotals
import io.github.ocpabdurrahim.schooltrack.data.money
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StudentsScreen(
    onOpen: (String) -> Unit,
    onAdd: (() -> Unit)?,
    onBack: () -> Unit,
    canSeeMoney: Boolean = false,
    people: PeopleRepository = remember { PeopleRepository() },
    attendance: AttendanceRepository = remember { AttendanceRepository() },
    reports: AttendanceReportsRepository = remember { AttendanceReportsRepository() },
    fees: FeesRepository = remember { FeesRepository() },
) {
    var classes by remember { mutableStateOf<List<SchoolClass>>(emptyList()) }
    var selected by remember { mutableStateOf<SchoolClass?>(null) }
    var expanded by remember { mutableStateOf(false) }
    var text by remember { mutableStateOf("") }
    var rows by remember { mutableStateOf<List<StudentDetail>>(emptyList()) }
    var busy by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf("") }
    var thisYear by remember { mutableStateOf(false) }
    var totals by remember { mutableStateOf<Map<String, AttendanceTotal>>(emptyMap()) }
    var owed by remember { mutableStateOf<Map<String, Dues>>(emptyMap()) }

    LaunchedEffect(Unit) {
        try {
            classes = attendance.listClasses()
        } catch (_: Exception) {
            problem = "Could not read the class list."
        }
    }

    // The query itself is not re-run per keystroke — only the local filter is.
    // 250 ms of quiet is enough to stop a search of "Afroza" costing six reads.
    LaunchedEffect(selected, text) {
        delay(250)
        busy = true
        problem = ""
        try {
            rows = people.findStudents(selected?.classId, text)
        } catch (_: Exception) {
            problem = "Could not search the students."
        }
        busy = false
    }

    // Attendance, once there is a section to fetch it for: one query for the
    // whole section, so a figure per student costs nothing extra. A year of
    // marks for the whole school is not worth pulling to decorate a list.
    LaunchedEffect(selected, rows, thisYear) {
        val section = selected
        if (section == null || rows.isEmpty()) {
            totals = emptyMap()
            return@LaunchedEffect
        }
        totals = try {
            val from = if (thisYear) people.startOfYear() else people.startOfMonth()
            val marks = reports.marksBetween(section.classId, from, attendance.todayInDhaka())
            attendanceTotals(
                rows.map { it.studentId },
                marks.map { Triple(it.studentId, it.date, it.status) },
            )
        } catch (_: Exception) {
            emptyMap()
        }
    }

    // The money: three queries however many students are listed, so it does
    // not need a section first. ADMIN and ACCOUNTS only -- /payments is closed
    // to everybody else, so asking would only earn a refusal.
    LaunchedEffect(rows, canSeeMoney) {
        if (!canSeeMoney || rows.isEmpty()) {
            owed = emptyMap()
            return@LaunchedEffect
        }
        owed = try {
            fees.duesFor(rows, fees.currentYear()).associateBy { it.student.studentId }
        } catch (_: Exception) {
            emptyMap()
        }
    }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("Students", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.weight(1f))
            if (onAdd != null) TextButton(onClick = onAdd) { Text("Add") }
            TextButton(onClick = onBack) { Text("Back") }
        }

        OutlinedTextField(
            value = text,
            onValueChange = { text = it },
            label = { Text("Name, roll or registration no.") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Text,
                imeAction = ImeAction.Search,
            ),
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
        )

        ExposedDropdownMenuBox(
            expanded = expanded,
            onExpandedChange = { expanded = !expanded },
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        ) {
            OutlinedTextField(
                value = selected?.displayName ?: "All sections",
                onValueChange = {},
                readOnly = true,
                label = { Text("Section") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
            )
            ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                DropdownMenuItem(
                    text = { Text("All sections") },
                    onClick = { selected = null; expanded = false },
                )
                classes.forEach { c ->
                    DropdownMenuItem(
                        text = { Text(c.displayName) },
                        onClick = { selected = c; expanded = false },
                    )
                }
            }
        }

        Row(
            Modifier.fillMaxWidth().padding(top = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FilterChip(
                selected = !thisYear,
                onClick = { thisYear = false },
                label = { Text("This month") },
            )
            FilterChip(
                selected = thisYear,
                onClick = { thisYear = true },
                label = { Text("This year") },
            )
        }

        Text(
            when {
                busy -> "Searching…"
                problem.isNotEmpty() -> problem
                rows.isEmpty() -> "No student matched."
                else -> rows.size.toString() + " student(s)"
            },
            style = MaterialTheme.typography.bodyMedium,
            color = if (problem.isNotEmpty()) MaterialTheme.colorScheme.error
            else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 12.dp, bottom = 4.dp),
        )

        LazyColumn(Modifier.fillMaxWidth()) {
            items(rows, key = { it.studentId }) { s ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable { onOpen(s.studentId) }
                        .padding(vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        s.rollNo.toString(),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(end = 12.dp),
                    )
                    Column(Modifier.weight(1f)) {
                        Text(s.fullName, style = MaterialTheme.typography.bodyLarge)
                        Text(
                            s.className + " " + s.section +
                                (s.groupName?.let { "  ·  " + it } ?: ""),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )

                        val t = totals[s.studentId]
                        val d = owed[s.studentId]
                        val bits = buildList {
                            val pc = t?.percent
                            when {
                                selected == null -> Unit
                                t == null -> Unit
                                pc == null -> add("register not taken")
                                // The count as well as the percentage: nobody
                                // should have to guess what it is a
                                // percentage OF.
                                else -> add(
                                    "present " + percent(pc) +
                                        " (" + t.present + " of " + t.marked +
                                        (if (t.marked == 1) " day)" else " days)"),
                                )
                            }
                            if (d != null) {
                                add("paid " + money(d.paid))
                                if (d.due > 0) add("due " + money(d.due))
                            }
                        }
                        if (bits.isNotEmpty()) {
                            val thin = t?.percent?.let { it < 70 } ?: false
                            Text(
                                bits.joinToString("  ·  "),
                                style = MaterialTheme.typography.bodySmall,
                                // Below 70%, or anything still owed, is what
                                // the school chases -- so it is what is worth
                                // seeing from across the room.
                                color = if (thin || (d != null && d.due > 0)) {
                                    MaterialTheme.colorScheme.error
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                },
                            )
                        }
                    }
                    Text("›", style = MaterialTheme.typography.titleLarge)
                }
                HorizontalDivider()
            }
        }
    }
}

/** The guardian's own landing list: just their children, no search. */
@Composable
fun ChildrenScreen(
    studentIds: List<String>,
    onOpen: (String) -> Unit,
    onBack: () -> Unit,
    people: PeopleRepository = remember { PeopleRepository() },
) {
    var rows by remember { mutableStateOf<List<StudentDetail>>(emptyList()) }
    var busy by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf("") }

    LaunchedEffect(studentIds) {
        busy = true
        try {
            rows = studentIds.mapNotNull { people.getStudent(it) }
            if (rows.isEmpty() && studentIds.isNotEmpty()) {
                problem = "Those student records could not be read."
            }
        } catch (_: Exception) {
            problem = "Those student records could not be read."
        }
        busy = false
    }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("My children", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.weight(1f))
            TextButton(onClick = onBack) { Text("Back") }
        }

        if (busy) Text("Loading…", modifier = Modifier.padding(top = 16.dp))
        if (problem.isNotEmpty()) {
            Text(
                problem,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 16.dp),
            )
        }

        Column(Modifier.fillMaxWidth().padding(top = 8.dp)) {
            rows.forEach { s ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable { onOpen(s.studentId) }
                        .padding(vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column {
                        Text(s.fullName, style = MaterialTheme.typography.bodyLarge)
                        Text(
                            s.className + " " + s.section + "  ·  Roll " + s.rollNo,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Text("›", style = MaterialTheme.typography.titleLarge)
                }
                HorizontalDivider()
            }
        }
    }
}

/** 92.5 -> "92.5%", 92.0 -> "92%": a whole number reads better than 92.0%. */
private fun percent(p: Double): String =
    if (p % 1.0 == 0.0) p.toInt().toString() + "%" else p.toString() + "%"
