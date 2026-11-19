package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import io.github.ocpabdurrahim.schooltrack.data.AdminRepository
import io.github.ocpabdurrahim.schooltrack.data.AttendanceSummary
import io.github.ocpabdurrahim.schooltrack.data.ClassRow
import io.github.ocpabdurrahim.schooltrack.data.Exam
import io.github.ocpabdurrahim.schooltrack.data.ExamsRepository
import io.github.ocpabdurrahim.schooltrack.data.PeopleRepository
import io.github.ocpabdurrahim.schooltrack.data.Sitting
import io.github.ocpabdurrahim.schooltrack.data.StudentDetail
import io.github.ocpabdurrahim.schooltrack.data.Tabulation
import io.github.ocpabdurrahim.schooltrack.data.UnitLine
import io.github.ocpabdurrahim.schooltrack.data.asSitter
import io.github.ocpabdurrahim.schooltrack.data.gpaText
import io.github.ocpabdurrahim.schooltrack.data.markSheet
import io.github.ocpabdurrahim.schooltrack.data.satAs
import io.github.ocpabdurrahim.schooltrack.data.sheetFor
import io.github.ocpabdurrahim.schooltrack.data.sittingName
import io.github.ocpabdurrahim.schooltrack.data.subjectsForClass

/**
 * One student's progress report — the phone's version of the printed card.
 *
 * Attendance is on it because a report without it tells half the story, and
 * this app owns both. Position comes from the whole section, so the section's
 * marks are read even though one student is shown; if that read is refused the
 * position is simply left off rather than failing the screen.
 */
@Composable
fun ReportCardScreen(
    examId: String,
    studentId: String,
    isGuardian: Boolean,
    onBack: () -> Unit,
    exams: ExamsRepository = remember { ExamsRepository() },
    people: PeopleRepository = remember { PeopleRepository() },
    admin: AdminRepository = remember { AdminRepository() },
) {
    var schoolName by remember { mutableStateOf("") }
    var headTeacher by remember { mutableStateOf("") }
    var exam by remember { mutableStateOf<Exam?>(null) }
    var student by remember { mutableStateOf<StudentDetail?>(null) }
    var tabulation by remember { mutableStateOf<Tabulation?>(null) }
    var position by remember { mutableStateOf<Int?>(null) }
    var outOf by remember { mutableStateOf(0) }
    var sat by remember { mutableStateOf<Sitting?>(null) }
    var classes by remember { mutableStateOf<List<ClassRow>>(emptyList()) }
    var attendance by remember { mutableStateOf<AttendanceSummary?>(null) }
    var problem by remember { mutableStateOf("") }

    var lines by remember { mutableStateOf<List<UnitLine>>(emptyList()) }
    var detailed by remember { mutableStateOf(false) }

    LaunchedEffect(examId, studentId) {
        try {
            admin.getSettings()?.let { schoolName = it.instituteName; headTeacher = it.headTeacher.orEmpty() }
            val all = exams.listExams()
            val e = all.firstOrNull { it.examId == examId }
            val s = people.getStudent(studentId)
            exam = e
            student = s
            if (e == null || s == null) { problem = "Could not build this report."; return@LaunchedEffect }

            // A parent must not read a result that is still being entered.
            if (isGuardian && !e.published) {
                problem = "This report is not published yet."
                return@LaunchedEffect
            }

            val subjects = exams.listSubjects()
            val mine = exams.marksForStudent(studentId)
            val own = sheetFor(listOf(s), subjects, mine, examId).first()
            tabulation = own.tabulation
            // The same lines the printed mark sheet is built from, so the
            // phone and the paper can never disagree.
            lines = markSheet(subjects, s.asSitter(), mine.filter { it.examId == examId })

            // Where this exam was SAT, from its own marks — not where the
            // student is now. Everything below that names a class uses this.
            val where = satAs(mine.filter { it.examId == examId })
            sat = where
            classes = try {
                AdminRepository().listAllClasses()
            } catch (_: Exception) {
                emptyList()
            }

            try {
                // The cohort comes from the MARKS, not from the class roster.
                //
                // A roster is who is in the class TODAY, which is the wrong
                // question about an exam sat last year: a student who has been
                // moved up is missing from it, and a new intake is in it.
                // Everyone whose marks for this exam carry this class sat it,
                // and nobody else did.
                val marks = exams.marksForExam(examId, where?.classId ?: s.classId)
                val ids = marks.map { it.studentId }.distinct()
                val classmates = ids.mapNotNull { people.getStudent(it) }
                if (classmates.size > 1) {
                    val sheet = sheetFor(classmates, subjects, marks, examId)
                    val ranked = sheet.count { it.position != null }
                    position = if (ranked > 1) {
                        sheet.firstOrNull { it.student.studentId == studentId }?.position
                    } else {
                        null
                    }
                    // Out of how many SAT it, not how many are on the roster.
                    outOf = ranked
                }
            } catch (_: Exception) {
                // no position on this copy
            }

            attendance = try {
                people.attendanceFor(studentId, people.startOfYear())
            } catch (_: Exception) {
                null
            }
        } catch (_: Exception) {
            problem = "Could not build this report."
        }
    }

    AdminScaffold(
        "Progress report",
        listOfNotNull(student?.fullName, exam?.let { it.examName + " " + it.examYear })
            .joinToString(" · "),
        onBack,
    ) {
        Problem(problem)

        val t = tabulation
        val s = student
        if (t != null && s != null) {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    if (schoolName.isNotEmpty()) {
                        Text(schoolName, style = MaterialTheme.typography.titleLarge)
                    }
                    Text(
                        "PROGRESS REPORT — " + (exam?.examName?.uppercase().orEmpty()) + " " +
                            exam?.examYear.orEmpty(),
                        style = MaterialTheme.typography.labelLarge,
                    )
                    if (exam?.published == false) {
                        Text(
                            "Not published yet — parents cannot see this.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }

                    HorizontalDivider(Modifier.padding(vertical = 10.dp))
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text("Name", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(s.fullName)
                    }
                    Row(
                        Modifier.fillMaxWidth().padding(top = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text("Class", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        // The class this exam was SAT in. A promoted
                        // student's older report used to print their new class
                        // here, which is the right marks under the wrong
                        // heading.
                        Text(
                            (sittingName(sat, classes, s.className + " - " + s.section)
                                .ifBlank { "—" }) +
                                " · Roll " + (sat?.rollNo ?: s.rollNo),
                        )
                    }
                    HorizontalDivider(Modifier.padding(vertical = 10.dp))

                    // Two shapes of the same sheet: brief is what goes home,
                    // detailed is what a disputed mark is settled with.
                    Row(
                        Modifier.fillMaxWidth().padding(bottom = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        FilterChip(
                            selected = !detailed,
                            onClick = { detailed = false },
                            label = { Text("Brief") },
                        )
                        FilterChip(
                            selected = detailed,
                            onClick = { detailed = true },
                            label = { Text("Detailed") },
                        )
                    }

                    lines.forEach { u ->
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = 6.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    u.unitName + if (u.isOptional) " (optional)" else "",
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                                Text(
                                    // A 4th subject with no mark is one the
                                    // student did not take — nobody sits two —
                                    // so it counts towards neither the total
                                    // nor what the total is out of.
                                    if (u.isOptional && u.marks == null && !u.absent) {
                                        "4th subject — not sat"
                                    } else {
                                        "out of " + u.fullMarks.toInt()
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Text(
                                when {
                                    u.absent -> "absent"
                                    u.marks != null -> u.marks.toInt().toString()
                                    u.soFar != null -> "(" + u.soFar.toInt() + ")"
                                    else -> "—"
                                },
                                modifier = Modifier.padding(end = 16.dp),
                            )
                            Text(
                                u.letter,
                                fontWeight = FontWeight.Bold,
                                color = if (u.letter == "F") MaterialTheme.colorScheme.error
                                else MaterialTheme.colorScheme.onSurface,
                            )
                        }

                        if (detailed) {
                            u.papers.forEach { p ->
                                val parts = p.parts.entries.joinToString("  ") { (name, v) ->
                                    name + " " + (v?.toInt()?.toString() ?: "—")
                                }
                                Text(
                                    (if (u.papers.size > 1) p.subjectName + " — " else "") +
                                        (if (parts.isEmpty()) "one mark" else parts) +
                                        "   = " + (p.marks?.toInt()?.toString() ?: "—") +
                                        "/" + p.fullMarks.toInt(),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(start = 8.dp, bottom = 4.dp),
                                )
                            }
                            if (u.failedParts.isNotEmpty()) {
                                Text(
                                    u.failedParts.joinToString(" and ") +
                                        " below the pass mark — this subject is F.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.error,
                                    modifier = Modifier.padding(start = 8.dp, bottom = 4.dp),
                                )
                            }
                        }
                        HorizontalDivider()
                    }

                    Row(
                        Modifier.fillMaxWidth().padding(top = 14.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Stat2(gpaText(t.gpa), "GPA")
                        Stat2(t.letter, "grade")
                        if (position != null) Stat2(position.toString(), "of $outOf")
                        attendance?.takeIf { it.marked > 0 }?.let {
                            Stat2((it.percent?.toString() ?: "—") + "%", "attendance")
                        }
                    }

                    if (t.failed.isNotEmpty()) {
                        Text(
                            "Failed: " + t.failed.joinToString(", "),
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(top = 12.dp),
                        )
                    }
                    if (t.incomplete) {
                        Text(
                            "Some marks have not been entered, so there is no GPA yet.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 12.dp),
                        )
                    }
                    if (headTeacher.isNotEmpty()) {
                        Text(
                            headTeacher,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 24.dp),
                        )
                        Text(
                            "Head teacher",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun Stat2(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.headlineSmall)
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
