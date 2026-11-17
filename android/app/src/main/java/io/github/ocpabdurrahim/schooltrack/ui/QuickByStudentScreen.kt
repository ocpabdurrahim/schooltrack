package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.github.ocpabdurrahim.schooltrack.data.AttendanceRepository
import io.github.ocpabdurrahim.schooltrack.data.Exam
import io.github.ocpabdurrahim.schooltrack.data.ExamsRepository
import io.github.ocpabdurrahim.schooltrack.data.PeopleRepository
import io.github.ocpabdurrahim.schooltrack.data.ResultRow
import io.github.ocpabdurrahim.schooltrack.data.SchoolClass
import io.github.ocpabdurrahim.schooltrack.data.StudentDetail
import io.github.ocpabdurrahim.schooltrack.data.Subject
import io.github.ocpabdurrahim.schooltrack.data.Typed
import io.github.ocpabdurrahim.schooltrack.data.gpaText
import io.github.ocpabdurrahim.schooltrack.data.gradeForSubject
import io.github.ocpabdurrahim.schooltrack.data.overMax
import io.github.ocpabdurrahim.schooltrack.data.partsAndTotal
import io.github.ocpabdurrahim.schooltrack.data.subjectMarkFor
import io.github.ocpabdurrahim.schooltrack.data.subjectsForStudent
import io.github.ocpabdurrahim.schooltrack.data.tabulate
import io.github.ocpabdurrahim.schooltrack.data.typedFrom
import kotlinx.coroutines.launch

/**
 * Quick entry, one student at a time — the twin of web/src/pages/QuickByStudent.tsx.
 *
 * The other two screens go down a column: one subject, forty students. This
 * one goes across — one student, every subject — which is what the office
 * wants when a child sat an exam late, when a mark is being corrected, or when
 * a single marksheet has to be keyed in from paper.
 *
 * The GPA under the boxes is the real tabulation — combined papers, component
 * pass marks and all — so a mistake shows up before it is saved rather than on
 * the printed sheet.
 */
@Composable
fun QuickByStudentBody(
    repo: ExamsRepository = remember { ExamsRepository() },
    people: PeopleRepository = remember { PeopleRepository() },
    attendance: AttendanceRepository = remember { AttendanceRepository() },
) {
    val scope = rememberCoroutineScope()
    var exams by remember { mutableStateOf<List<Exam>>(emptyList()) }
    var subjects by remember { mutableStateOf<List<Subject>>(emptyList()) }
    var classes by remember { mutableStateOf<List<SchoolClass>>(emptyList()) }
    var examId by remember { mutableStateOf("") }
    var classId by remember { mutableStateOf("") }
    var roll by remember { mutableStateOf("") }
    var students by remember { mutableStateOf<List<StudentDetail>>(emptyList()) }
    var student by remember { mutableStateOf<StudentDetail?>(null) }
    var typed by remember { mutableStateOf<Map<String, Typed>>(emptyMap()) }
    var busy by remember { mutableStateOf(true) }
    var note by remember { mutableStateOf("") }
    var problem by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        try {
            exams = repo.listExams()
            subjects = repo.listSubjects()
            classes = attendance.listClasses()
            examId = exams.firstOrNull { !it.published }?.examId
                ?: exams.firstOrNull()?.examId.orEmpty()
            classId = classes.firstOrNull()?.classId.orEmpty()
        } catch (_: Exception) {
            problem = "Could not read the exams."
        }
        busy = false
    }

    LaunchedEffect(classId) {
        if (classId.isBlank()) return@LaunchedEffect
        try {
            students = people.findStudents(classId, "")
        } catch (_: Exception) {
            problem = "Could not read the roll."
        }
    }

    val exam = exams.firstOrNull { it.examId == examId }
    val section = classes.firstOrNull { it.classId == classId }
    val mySubjects = student?.let { subjectsForStudent(subjects, it.className, it.groupName) }
        .orEmpty()

    suspend fun open(wanted: String) {
        val found = students.firstOrNull { it.rollNo.toString() == wanted.trim() }
        if (found == null) {
            student = null
            problem = "No roll " + wanted.trim() + " in " +
                (section?.displayName ?: "this section") + "."
            return
        }
        busy = true; problem = ""; note = ""
        try {
            val mine = repo.marksForExam(examId, classId).filter { it.studentId == found.studentId }
            student = found
            typed = subjectsForStudent(subjects, found.className, found.groupName).associate { s ->
                val got = mine.firstOrNull { it.subjectId == s.subjectId }
                s.subjectId to typedFrom(got?.marks, got?.parts, got?.absent ?: false)
            }
        } catch (_: Exception) {
            problem = "Could not read that student's marks."
        }
        busy = false
    }

    val liveMarks = mySubjects.map { s ->
        val t = typed[s.subjectId] ?: Typed()
        val (parts, total) = partsAndTotal(s, t)
        subjectMarkFor(s, null).copy(marks = total, parts = parts.orEmpty(), absent = t.absent)
    }
    val live = tabulate(liveMarks)
    val over = mySubjects.any { overMax(it, typed[it.subjectId] ?: Typed()) }

    Column(Modifier.fillMaxWidth()) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Picker("Exam", exams.map { it.examId to (it.examName + " " + it.examYear) }, examId) {
                    examId = it; student = null
                }
                Picker("Section", classes.map { it.classId to it.displayName }, classId) {
                    classId = it; student = null
                }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
                    Field("Roll", roll, numeric = true, modifier = Modifier.weight(1f)) { roll = it }
                    Button(
                        enabled = !busy && roll.isNotBlank(),
                        onClick = { scope.launch { open(roll) } },
                        modifier = Modifier.padding(start = 10.dp, top = 8.dp),
                    ) { Text("Open") }
                }
                if (exam?.published == true) {
                    Problem("This exam is published. Unpublish it before correcting a mark.")
                }
                Problem(problem)
            }
        }

        val who = student
        if (who != null) {
            Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text(
                        who.rollNo.toString() + " · " + who.fullName,
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        who.className + (who.groupName?.let { " · " + it } ?: ""),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )

                    if (mySubjects.isEmpty()) {
                        Problem("No subject is assigned to " + who.className + " yet.")
                    }

                    mySubjects.forEach { s ->
                        val t = typed[s.subjectId] ?: Typed()
                        val (parts, total) = partsAndTotal(s, t)
                        val grade = gradeForSubject(
                            subjectMarkFor(s, null)
                                .copy(marks = total, parts = parts.orEmpty(), absent = t.absent),
                        )
                        Row(
                            Modifier.fillMaxWidth().padding(top = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                s.subjectName + if (s.isOptional) " (4th)" else "",
                                Modifier.weight(1f),
                                style = MaterialTheme.typography.bodyMedium,
                            )
                            Text(
                                total?.let { it.toInt().toString() + "/" + s.fullMarks.toInt() }
                                    ?: "—",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Text(
                                "  " + grade.letter,
                                fontWeight = FontWeight.Bold,
                                color = if (grade.letter == "F") MaterialTheme.colorScheme.error
                                else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            if (s.components.isEmpty()) {
                                Field(
                                    "out of " + s.fullMarks.toInt(), t.marks, numeric = true,
                                    modifier = Modifier.weight(1f),
                                ) { typed = typed + (s.subjectId to t.copy(marks = it)) }
                            } else {
                                s.components.forEach { c ->
                                    Field(
                                        c.name + " /" + c.max.toInt(),
                                        t.parts[c.name].orEmpty(),
                                        numeric = true,
                                        modifier = Modifier.weight(1f).padding(end = 6.dp),
                                    ) {
                                        typed = typed + (
                                            s.subjectId to t.copy(parts = t.parts + (c.name to it))
                                            )
                                    }
                                }
                            }
                            Checkbox(
                                checked = t.absent,
                                onCheckedChange = {
                                    typed = typed + (s.subjectId to t.copy(absent = it))
                                },
                            )
                            Text("absent", style = MaterialTheme.typography.bodySmall)
                        }
                        if (grade.failedParts.isNotEmpty()) {
                            Text(
                                grade.failedParts.joinToString(" and ") +
                                    " below the pass mark — this subject is F.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                        HorizontalDivider(Modifier.padding(top = 6.dp))
                    }

                    Text(
                        "GPA " + gpaText(live.gpa) + (if (live.gpa != null) "  " + live.letter else ""),
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                    if (live.incomplete) {
                        Text(
                            "Not every subject has a mark yet, so there is no GPA.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (live.failed.isNotEmpty()) {
                        Text(
                            "Failed " + live.failed.joinToString(", "),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                    if (over) Problem("A mark is above what that part is out of.")

                    Row(
                        Modifier.fillMaxWidth().padding(top = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        val save: suspend (Boolean) -> Unit = { thenNext ->
                            busy = true; problem = ""; note = ""
                            try {
                                repo.saveMarks(
                                    mySubjects.map { s ->
                                        val t = typed[s.subjectId] ?: Typed()
                                        val (parts, total) = partsAndTotal(s, t)
                                        ResultRow(
                                            examId = examId,
                                            studentId = who.studentId,
                                            subjectId = s.subjectId,
                                            subjectName = s.subjectName,
                                            marks = total,
                                            absent = t.absent,
                                            classId = classId,
                                            rollNo = who.rollNo,
                                            fullMarks = s.fullMarks,
                                            isOptional = s.isOptional,
                                            parts = parts,
                                        )
                                    },
                                )
                                note = "Roll " + who.rollNo + " saved — " +
                                    mySubjects.size + " subjects."
                                if (thenNext) {
                                    val next = students.firstOrNull { it.rollNo > who.rollNo }
                                    student = null
                                    typed = emptyMap()
                                    roll = next?.rollNo?.toString().orEmpty()
                                    if (next != null) open(roll)
                                }
                            } catch (_: Exception) {
                                problem = "That save was refused. Only a teacher or the head " +
                                    "may enter marks."
                            }
                            busy = false
                        }
                        Button(
                            enabled = !busy && exam?.published != true && !over &&
                                mySubjects.isNotEmpty(),
                            onClick = { scope.launch { save(false) } },
                        ) { Text(if (busy) "Saving…" else "Save") }
                        OutlinedButton(
                            enabled = !busy && exam?.published != true && !over &&
                                mySubjects.isNotEmpty(),
                            onClick = { scope.launch { save(true) } },
                        ) { Text("Save and next roll") }
                    }
                    if (note.isNotEmpty()) {
                        Text(
                            note,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                    }
                    Text(
                        "A blank box is “not entered yet”, not a zero.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
            }
        }
    }
}
