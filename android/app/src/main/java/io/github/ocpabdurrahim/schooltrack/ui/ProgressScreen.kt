package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Card
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
import io.github.ocpabdurrahim.schooltrack.data.AttendanceRepository
import io.github.ocpabdurrahim.schooltrack.data.Exam
import io.github.ocpabdurrahim.schooltrack.data.ExamsRepository
import io.github.ocpabdurrahim.schooltrack.data.PeopleRepository
import io.github.ocpabdurrahim.schooltrack.data.Progress
import io.github.ocpabdurrahim.schooltrack.data.SchoolClass
import io.github.ocpabdurrahim.schooltrack.data.StudentResult
import io.github.ocpabdurrahim.schooltrack.data.Subject
import io.github.ocpabdurrahim.schooltrack.data.gpaText
import io.github.ocpabdurrahim.schooltrack.data.progressFor
import io.github.ocpabdurrahim.schooltrack.data.sheetFor
import io.github.ocpabdurrahim.schooltrack.data.signed

/**
 * One student, two exams, side by side.
 *
 * The phone's version of the printed progress report: pick the two exams and
 * a section, tap a student, and read whether they are doing better than last
 * time. The arithmetic is Progress.kt, twinned with the web, so the figure a
 * teacher reads at the gate is the figure on the sheet in the office.
 */
@Composable
fun ProgressScreen(
    repo: ExamsRepository = remember { ExamsRepository() },
    people: PeopleRepository = remember { PeopleRepository() },
    classesRepo: AttendanceRepository = remember { AttendanceRepository() },
    onOpenStudent: (String) -> Unit,
    onBack: () -> Unit,
) {
    var exams by remember { mutableStateOf<List<Exam>>(emptyList()) }
    var subjects by remember { mutableStateOf<List<Subject>>(emptyList()) }
    var classes by remember { mutableStateOf<List<SchoolClass>>(emptyList()) }
    var beforeId by remember { mutableStateOf("") }
    var afterId by remember { mutableStateOf("") }
    var classId by remember { mutableStateOf("") }
    var before by remember { mutableStateOf<List<StudentResult>>(emptyList()) }
    var after by remember { mutableStateOf<List<StudentResult>>(emptyList()) }
    var busy by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        try {
            exams = repo.listExams()
            subjects = repo.listSubjects()
            classes = classesRepo.listClasses()
            // listExams is newest first, so the later exam is the first of
            // them and the earlier one the next: the pair usually wanted.
            afterId = exams.firstOrNull()?.examId.orEmpty()
            beforeId = (exams.getOrNull(1) ?: exams.firstOrNull())?.examId.orEmpty()
            classId = classes.firstOrNull()?.classId.orEmpty()
        } catch (_: Exception) {
            problem = "Could not read the exams."
        }
        busy = false
    }

    LaunchedEffect(beforeId, afterId, classId, subjects) {
        if (beforeId.isBlank() || afterId.isBlank() || classId.isBlank()) return@LaunchedEffect
        busy = true
        try {
            val roll = people.findStudents(classId, "")
            // Ranked within each exam separately -- a position only means
            // anything against the students who sat the same papers.
            before = sheetFor(roll, subjects, repo.marksForExam(beforeId, classId), beforeId)
            after = sheetFor(roll, subjects, repo.marksForExam(afterId, classId), afterId)
            problem = ""
        } catch (_: Exception) {
            problem = "Could not read that section."
        }
        busy = false
    }

    val earlier = exams.firstOrNull { it.examId == beforeId }
    val later = exams.firstOrNull { it.examId == afterId }
    val same = beforeId == afterId && beforeId.isNotBlank()

    AdminScaffold(
        "Progress report",
        listOfNotNull(
            earlier?.let { it.examName + " " + it.examYear },
            later?.let { it.examName + " " + it.examYear },
        ).joinToString(" → ").ifBlank { "Pick two exams" },
        onBack,
    ) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Picker(
                    "Earlier exam",
                    exams.map { it.examId to (it.examName + " " + it.examYear) },
                    beforeId,
                ) { beforeId = it }
                Picker(
                    "Later exam",
                    exams.map { it.examId to (it.examName + " " + it.examYear) },
                    afterId,
                ) { afterId = it }
                Picker(
                    "Section",
                    classes.map { it.classId to it.displayName },
                    classId,
                ) { classId = it }

                if (same) {
                    Text(
                        "Pick two different exams. An exam compared with itself has " +
                            "nothing to report.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
                Problem(problem)
            }
        }

        if (!same) {
            Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text(
                        if (busy) "Working…" else after.size.toString() + " student(s)",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    after.forEach { r ->
                        val p = progressFor(
                            before.firstOrNull {
                                it.student.studentId == r.student.studentId
                            }?.tabulation,
                            r.tabulation,
                            positionBefore = before.firstOrNull {
                                it.student.studentId == r.student.studentId
                            }?.position,
                            positionAfter = r.position,
                        )
                        ProgressRow(r, p) { onOpenStudent(r.student.studentId) }
                        HorizontalDivider()
                    }
                    if (!busy && after.isEmpty()) Text("No students in this section.")
                }
            }
        }
    }
}

@Composable
private fun ProgressRow(r: StudentResult, p: Progress, onOpen: () -> Unit) {
    val better = (p.gpaChange ?: 0.0) > 0
    val worse = (p.gpaChange ?: 0.0) < 0
    val tint = when {
        p.gpaChange == null -> MaterialTheme.colorScheme.onSurfaceVariant
        better -> MaterialTheme.colorScheme.primary
        worse -> MaterialTheme.colorScheme.error
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    Row(
        Modifier.fillMaxWidth().clickable { onOpen() }.padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            r.student.rollNo.toString(),
            fontWeight = FontWeight.Bold,
            modifier = Modifier.width(32.dp),
        )
        Column(Modifier.weight(1f)) {
            Text(r.student.fullName, style = MaterialTheme.typography.bodyMedium)
            Text(
                "GPA " + gpaText(p.gpaBefore) + " → " + gpaText(p.gpaAfter) +
                    "  ·  total " + (p.totalBefore?.toInt()?.toString() ?: "—") +
                    " → " + (p.totalAfter?.toInt()?.toString() ?: "—") +
                    (p.positionChange?.let {
                        "  ·  " + (if (it == 0) "same place" else signed(it.toDouble()) + " places")
                    } ?: ""),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(signed(p.gpaChange, 2), fontWeight = FontWeight.Bold, color = tint)
            Text(
                when (p.verdict) {
                    "better" -> "improved"
                    "worse" -> "slipped"
                    "same" -> "steady"
                    else -> "not complete"
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
