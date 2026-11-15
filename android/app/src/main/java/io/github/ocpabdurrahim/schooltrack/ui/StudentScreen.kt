package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
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
import androidx.compose.ui.unit.dp
import io.github.ocpabdurrahim.schooltrack.data.AttendanceSummary
import io.github.ocpabdurrahim.schooltrack.data.PeopleRepository
import io.github.ocpabdurrahim.schooltrack.data.Status
import io.github.ocpabdurrahim.schooltrack.data.StudentDetail
import io.github.ocpabdurrahim.schooltrack.data.label

@Composable
fun StudentScreen(
    studentId: String,
    onBack: () -> Unit,
    people: PeopleRepository = remember { PeopleRepository() },
) {
    var student by remember { mutableStateOf<StudentDetail?>(null) }
    var summary by remember { mutableStateOf<AttendanceSummary?>(null) }
    var thisMonth by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf("") }

    LaunchedEffect(studentId) {
        busy = true
        problem = ""
        try {
            student = people.getStudent(studentId)
            if (student == null) problem = "No student with that number."
        } catch (_: Exception) {
            problem = "That student record could not be read."
        }
        busy = false
    }

    LaunchedEffect(studentId, thisMonth) {
        summary = null
        try {
            summary = people.attendanceFor(
                studentId,
                if (thisMonth) people.startOfMonth() else people.startOfYear(),
            )
        } catch (_: Exception) {
            // The bio is still worth showing without the attendance — the same
            // rule as the dashboard: one refusal must not empty the screen.
        }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("Student", style = MaterialTheme.typography.headlineSmall)
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

        student?.let { s ->
            Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text(s.fullName, style = MaterialTheme.typography.titleLarge)
                    Text(
                        s.className + " " + s.section + "  ·  Roll " + s.rollNo +
                            (s.groupName?.let { "  ·  " + it } ?: ""),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (s.status != "A") {
                        Text(
                            "This student is no longer active (status " + s.status + ").",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                    }

                    HorizontalDivider(Modifier.padding(vertical = 12.dp))

                    Field("Student no.", s.studentId)
                    Field("Registration", s.regNo)
                    Field("Father", s.fatherName)
                    Field("Mother", s.motherName)
                    Field("Date of birth", s.dob)
                    Field("Gender", s.gender)
                    Field("Blood group", s.bloodGroup)
                    Field("Mobile", s.mobileNo)

                    HorizontalDivider(Modifier.padding(vertical = 12.dp))

                    // The same payload the ID card's QR carries, so a card that
                    // will not scan can be checked against what it should hold.
                    Text("Card code", style = MaterialTheme.typography.labelMedium)
                    Text(
                        "SMS-STU-" + s.studentId,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }

            Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text("Attendance", style = MaterialTheme.typography.titleMedium)

                    SingleChoiceSegmentedButtonRow(
                        Modifier.fillMaxWidth().padding(top = 8.dp),
                    ) {
                        SegmentedButton(
                            selected = thisMonth,
                            onClick = { thisMonth = true },
                            shape = SegmentedButtonDefaults.itemShape(0, 2),
                        ) { Text("This month") }
                        SegmentedButton(
                            selected = !thisMonth,
                            onClick = { thisMonth = false },
                            shape = SegmentedButtonDefaults.itemShape(1, 2),
                        ) { Text("This year") }
                    }

                    val sum = summary
                    if (sum == null) {
                        Text("Loading…", modifier = Modifier.padding(top = 12.dp))
                    } else if (sum.marked == 0) {
                        Text(
                            "No attendance has been recorded in this period.",
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(top = 12.dp),
                        )
                    } else {
                        Row(
                            Modifier.fillMaxWidth().padding(top = 12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Stat((sum.percent?.toString() ?: "–") + "%", "present")
                            Stat(sum.present.toString(), "days present")
                            Stat(sum.marked.toString(), "days marked")
                        }
                        Text(
                            "Out of the days attendance was actually taken.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 8.dp),
                        )

                        HorizontalDivider(Modifier.padding(vertical = 12.dp))
                        Text("Recent days", style = MaterialTheme.typography.labelMedium)
                        sum.recent.forEach { d ->
                            Row(
                                Modifier.fillMaxWidth().padding(top = 8.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text(d.date, style = MaterialTheme.typography.bodyMedium)
                                Text(
                                    d.status.label + (if (d.markedVia == "SCAN") " (scanned)" else ""),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = if (d.status == Status.A) MaterialTheme.colorScheme.error
                                    else MaterialTheme.colorScheme.onSurface,
                                )
                            }
                        }
                    }
                }
            }

            Text(
                "Fees, results and certificates for this student are still kept in " +
                    "the APEX app. This page shows only what SchoolTrack owns.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 16.dp, bottom = 24.dp),
            )
        }
    }
}

@Composable
private fun Field(label: String, value: String?) {
    if (value.isNullOrBlank()) return
    Row(
        Modifier.fillMaxWidth().padding(top = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(value, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun Stat(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.headlineSmall)
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
