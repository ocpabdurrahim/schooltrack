package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.clickable
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
import io.github.ocpabdurrahim.schooltrack.data.Exam
import io.github.ocpabdurrahim.schooltrack.data.DocumentsRepository
import io.github.ocpabdurrahim.schooltrack.data.ExamsRepository
import io.github.ocpabdurrahim.schooltrack.data.IssuedDocument
import io.github.ocpabdurrahim.schooltrack.data.Tabulation
import io.github.ocpabdurrahim.schooltrack.data.gpaText
import io.github.ocpabdurrahim.schooltrack.data.sheetFor
import io.github.ocpabdurrahim.schooltrack.data.PeopleRepository
import io.github.ocpabdurrahim.schooltrack.data.Status
import io.github.ocpabdurrahim.schooltrack.data.StudentDetail
import io.github.ocpabdurrahim.schooltrack.data.label

@Composable
fun StudentScreen(
    studentId: String,
    onEdit: (() -> Unit)?,
    onOpenReport: (String) -> Unit,
    onOpenCard: () -> Unit,
    onOpenAttendance: () -> Unit,
    onOpenResults: () -> Unit,
    isGuardian: Boolean,
    onBack: () -> Unit,
    people: PeopleRepository = remember { PeopleRepository() },
    examsRepo: ExamsRepository = remember { ExamsRepository() },
    docsRepo: DocumentsRepository = remember { DocumentsRepository() },
) {
    var student by remember { mutableStateOf<StudentDetail?>(null) }
    var summary by remember { mutableStateOf<AttendanceSummary?>(null) }
    var thisMonth by remember { mutableStateOf(true) }
    var results by remember { mutableStateOf<List<Pair<Exam, Tabulation>>>(emptyList()) }
    var docs by remember { mutableStateOf<List<IssuedDocument>>(emptyList()) }
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

        // Results are fetched after the page is usable and never allowed to
        // fail it. A PARENT SEES PUBLISHED RESULTS ONLY — a half-entered
        // result is a number that is still going to move.
        val s = student
        if (s != null) {
            results = try {
                val exams = examsRepo.listExams()
                val subjects = examsRepo.listSubjects()
                val marks = examsRepo.marksForStudent(studentId)
                exams.mapNotNull { exam ->
                    if (marks.none { it.examId == exam.examId }) return@mapNotNull null
                    if (isGuardian && !exam.published) return@mapNotNull null
                    val own = sheetFor(listOf(s), subjects, marks, exam.examId).first()
                    exam to own.tabulation
                }
            } catch (_: Exception) {
                emptyList()
            }

            // The register is the office's, so a teacher's refusal just leaves
            // the card off rather than failing the screen.
            docs = try { docsRepo.forStudent(studentId) } catch (_: Exception) { emptyList() }
        }
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
            if (onEdit != null) TextButton(onClick = onEdit) { Text("Edit") }
            TextButton(onClick = onOpenCard) { Text("Card") }
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
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text("Attendance", style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.weight(1f))
                        TextButton(onClick = onOpenAttendance) { Text("Month by month") }
                    }

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

            if (results.isNotEmpty()) {
                Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                    Column(Modifier.padding(16.dp)) {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text("Results", style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.weight(1f))
                        TextButton(onClick = onOpenResults) { Text("Every exam") }
                    }
                        results.forEach { (exam, t) ->
                            Row(
                                Modifier.fillMaxWidth()
                                    .clickable { onOpenReport(exam.examId) }
                                    .padding(vertical = 10.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(
                                        exam.examName + " " + exam.examYear,
                                        style = MaterialTheme.typography.bodyLarge,
                                    )
                                    Text(
                                        if (t.incomplete) "marks not all in"
                                        else t.letter +
                                            (if (!exam.published) "  ·  not published" else ""),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                Text(
                                    gpaText(t.gpa),
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = if (t.letter == "F") MaterialTheme.colorScheme.error
                                    else MaterialTheme.colorScheme.onSurface,
                                )
                            }
                            HorizontalDivider()
                        }
                    }
                }
            }

            if (docs.isNotEmpty()) {
                Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                    Column(Modifier.padding(16.dp)) {
                        Text("Documents", style = MaterialTheme.typography.titleMedium)
                        docs.forEach { d ->
                            Row(
                                Modifier.fillMaxWidth().padding(vertical = 8.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(d.serialNo, style = MaterialTheme.typography.bodyLarge)
                                    Text(
                                        d.type.label + "  ·  " + d.issueDate,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                            HorizontalDivider()
                        }
                    }
                }
            }

            Spacer(Modifier.padding(bottom = 24.dp))
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
