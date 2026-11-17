package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import io.github.ocpabdurrahim.schooltrack.data.AttendanceRepository
import io.github.ocpabdurrahim.schooltrack.data.Exam
import io.github.ocpabdurrahim.schooltrack.data.ExamsRepository
import io.github.ocpabdurrahim.schooltrack.data.Lookup
import io.github.ocpabdurrahim.schooltrack.data.PeopleRepository
import io.github.ocpabdurrahim.schooltrack.data.RosterRow
import io.github.ocpabdurrahim.schooltrack.data.RosterStudent
import io.github.ocpabdurrahim.schooltrack.data.SchoolClass
import io.github.ocpabdurrahim.schooltrack.data.Subject
import io.github.ocpabdurrahim.schooltrack.data.Typed
import io.github.ocpabdurrahim.schooltrack.data.boxNames
import io.github.ocpabdurrahim.schooltrack.data.buildRoster
import io.github.ocpabdurrahim.schooltrack.data.cleanMark
import io.github.ocpabdurrahim.schooltrack.data.enteredLog
import io.github.ocpabdurrahim.schooltrack.data.fieldBad
import io.github.ocpabdurrahim.schooltrack.data.gradeForSubject
import io.github.ocpabdurrahim.schooltrack.data.hasEntry
import io.github.ocpabdurrahim.schooltrack.data.lookupRoll
import io.github.ocpabdurrahim.schooltrack.data.markFor
import io.github.ocpabdurrahim.schooltrack.data.nextBox
import io.github.ocpabdurrahim.schooltrack.data.progress
import io.github.ocpabdurrahim.schooltrack.data.resultRowFor
import io.github.ocpabdurrahim.schooltrack.data.subjectsForClass
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Quick entry, one subject at a time — the twin of web/src/pages/QuickBySubject.tsx,
 * and the APEX "Quick Mark Entry" page as this app does it.
 *
 * The exam, the section and the subject are chosen once. After that it is all
 * keyboard: type a roll, the student's name appears, type the marks, and the
 * last key saves the row and puts the cursor back in the roll box for the next
 * script.
 *
 * The whole section is read once and held in memory, so the roll lookup is
 * instant — the difference between keying in forty scripts and waiting forty
 * times.
 */

/** The single box a paper marked as one mark has, as a name the walk can use. */
private const val WHOLE = "total"

@Composable
fun QuickBySubjectBody(
    repo: ExamsRepository = remember { ExamsRepository() },
    people: PeopleRepository = remember { PeopleRepository() },
    attendance: AttendanceRepository = remember { AttendanceRepository() },
) {
    val scope = rememberCoroutineScope()
    var exams by remember { mutableStateOf<List<Exam>>(emptyList()) }
    var subjects by remember { mutableStateOf<List<Subject>>(emptyList()) }
    var classes by remember { mutableStateOf<List<SchoolClass>>(emptyList()) }

    var examId by remember { mutableStateOf("") }
    var className by remember { mutableStateOf("") }
    var classId by remember { mutableStateOf("") }
    var subjectId by remember { mutableStateOf("") }

    var roster by remember { mutableStateOf<Map<String, RosterRow>>(emptyMap()) }
    var roll by remember { mutableStateOf("") }
    var open by remember { mutableStateOf<RosterRow?>(null) }
    var typed by remember { mutableStateOf(Typed()) }

    var busy by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf("") }
    var problem by remember { mutableStateOf("") }
    var savedTick by remember { mutableIntStateOf(0) }

    val rollFocus = remember { FocusRequester() }
    val boxFocus = remember { List(6) { FocusRequester() } }

    LaunchedEffect(Unit) {
        try {
            exams = repo.listExams()
            subjects = repo.listSubjects()
            classes = attendance.listClasses()
            examId = exams.firstOrNull { !it.published }?.examId
                ?: exams.firstOrNull()?.examId.orEmpty()
            className = classes.firstOrNull()?.className.orEmpty()
            classId = classes.firstOrNull()?.classId.orEmpty()
        } catch (_: Exception) {
            problem = "Could not read the exams."
        }
    }

    val classNames = classes.map { it.className }.distinct()
    val sections = classes.filter { it.className == className }
    val mySubjects = subjectsForClass(subjects, className)
    val exam = exams.firstOrNull { it.examId == examId }
    val section = classes.firstOrNull { it.classId == classId }
    val subject = mySubjects.firstOrNull { it.subjectId == subjectId }

    // Keep the section and the subject inside the chosen class.
    LaunchedEffect(className, classes, subjects) {
        if (sections.isNotEmpty() && sections.none { it.classId == classId }) {
            classId = sections.first().classId
        }
        subjectId = if (mySubjects.isEmpty()) {
            ""
        } else if (mySubjects.none { it.subjectId == subjectId }) {
            mySubjects.first().subjectId
        } else {
            subjectId
        }
    }

    /**
     * The roster and the marks already entered, read once per subject. Every
     * roll typed afterwards is answered from here.
     */
    LaunchedEffect(examId, classId, subjectId, subjects) {
        val want = subjects.firstOrNull { it.subjectId == subjectId }
        if (examId.isBlank() || classId.isBlank() || want == null) {
            roster = emptyMap()
            return@LaunchedEffect
        }
        busy = true
        open = null
        roll = ""
        note = ""
        try {
            val students = people.findStudents(classId, "").map {
                RosterStudent(it.studentId, it.rollNo, it.fullName, it.className, it.groupName)
            }
            roster = buildRoster(students, want, repo.marksForExam(examId, classId))
            problem = ""
        } catch (_: Exception) {
            problem = "Could not read the roll for that section."
        }
        busy = false
    }

    val boxes = subject?.let { if (boxNames(it).isEmpty()) listOf(WHOLE) else boxNames(it) }
        ?: listOf(WHOLE)

    LaunchedEffect(open?.studentId) {
        if (open != null) runCatching { boxFocus[0].requestFocus() }
    }
    LaunchedEffect(savedTick) {
        if (savedTick > 0) runCatching { rollFocus.requestFocus() }
    }

    fun rawOf(name: String) = if (name == WHOLE) typed.marks else typed.parts[name].orEmpty()

    fun bad(name: String): Boolean {
        val s = subject ?: return false
        val c = s.components.firstOrNull { it.name == name }
        return fieldBad(c?.max ?: s.fullMarks, rawOf(name))
    }

    val anyBad = boxes.any { bad(it) }
    val live = subject?.let { markFor(it, typed) }
    val grade = live?.let { gradeForSubject(it) }
    val done = progress(roster)

    suspend fun save() {
        val who = open ?: return
        val s = subject ?: return
        if (exam?.published == true) {
            problem = "That exam is published. Unpublish it before correcting a mark."
            return
        }
        if (anyBad) {
            problem = "A mark is above what that part is out of."
            return
        }
        busy = true
        problem = ""
        try {
            val row = resultRowFor(examId, classId, s, who, typed)
            repo.saveMarks(listOf(row))
            // The roster is this screen's memory of the section: keeping it in
            // step means the entered list and the count are right without
            // reading the whole section back after every single row.
            roster = roster + (
                who.rollNo.toString() to roster.getValue(who.rollNo.toString())
                    .copy(typed = typed, stored = hasEntry(row), savedAt = System.currentTimeMillis())
                )
            note = "Saved roll " + who.rollNo + " — " + who.fullName + "."
            open = null
            typed = Typed()
            roll = ""
            savedTick += 1
        } catch (_: Exception) {
            problem = "That save was refused. Only a teacher or the head may enter marks."
        }
        busy = false
    }

    fun commitRoll() {
        when (val got = lookupRoll(roster, roll)) {
            is Lookup.Blank -> open = null
            is Lookup.NotFound -> {
                open = null
                problem = "No roll " + got.roll + " in " +
                    (section?.displayName ?: "this section") + "."
            }
            is Lookup.NotTaken -> {
                open = null
                problem = got.row.fullName + " is " +
                    got.row.groupName.ifBlank { got.row.className } +
                    ", which does not sit " + (subject?.subjectName ?: "this subject") + "."
            }
            is Lookup.Found -> {
                problem = ""
                note = ""
                open = got.row
                typed = got.row.typed
            }
        }
    }

    Column(Modifier.fillMaxWidth()) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Picker(
                    "Exam",
                    exams.map { it.examId to (it.examName + " " + it.examYear) },
                    examId,
                ) { examId = it }
                Picker("Class", classNames.map { it to it }, className) { className = it }
                Picker(
                    "Section",
                    sections.map { it.classId to (it.section.ifBlank { it.displayName }) },
                    classId,
                ) { classId = it }
                Picker(
                    "Subject",
                    mySubjects.map {
                        it.subjectId to (it.subjectName + if (it.isOptional) " (4th)" else "")
                    },
                    subjectId,
                ) { subjectId = it }

                if (classes.isNotEmpty() && mySubjects.isEmpty()) {
                    Problem("No subject is set up for " + className + " yet.")
                }
                if (exam?.published == true) {
                    Problem("This exam is published. Unpublish it before correcting a mark.")
                }
                if (subject != null) {
                    Text(
                        (
                            if (subject.components.isEmpty()) {
                                "One mark out of " + subject.fullMarks.toInt()
                            } else {
                                subject.components.joinToString(" · ") {
                                    it.name + " " + it.max.toInt() + " (pass " + it.pass.toInt() + ")"
                                }
                            }
                            ) + (
                            if (subject.groupNames.isEmpty()) {
                                ""
                            } else {
                                " · " + subject.groupNames.joinToString(" and ") + " only"
                            }
                            ) + " · " + done.first + " of " + done.second + " entered",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 10.dp),
                    )
                }
            }
        }

        if (subject != null) {
            Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                Column(Modifier.padding(16.dp)) {
                    OutlinedTextField(
                        value = roll,
                        onValueChange = { roll = cleanMark(it) },
                        label = { Text("Roll") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Number,
                            imeAction = ImeAction.Done,
                        ),
                        keyboardActions = KeyboardActions(onDone = { commitRoll() }),
                        modifier = Modifier.fillMaxWidth().focusRequester(rollFocus),
                    )

                    val who = open
                    val peek = lookupRoll(roster, roll)
                    Text(
                        when {
                            who != null -> who.rollNo.toString() + " · " + who.fullName
                            peek is Lookup.Found ->
                                peek.row.rollNo.toString() + " · " + peek.row.fullName +
                                    " — press the keyboard's done key"
                            peek is Lookup.NotTaken ->
                                peek.row.rollNo.toString() + " · " + peek.row.fullName
                            roll.isNotBlank() -> "press the keyboard's done key to look it up"
                            else -> "type a roll"
                        },
                        style = MaterialTheme.typography.titleMedium,
                        color = if (who != null) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 10.dp),
                    )

                    if (who != null) {
                        boxes.forEachIndexed { i, name ->
                            val c = subject.components.firstOrNull { it.name == name }
                            OutlinedTextField(
                                value = rawOf(name),
                                onValueChange = { raw ->
                                    val v = cleanMark(raw)
                                    typed = if (name == WHOLE) {
                                        typed.copy(marks = v)
                                    } else {
                                        typed.copy(parts = typed.parts + (name to v))
                                    }
                                },
                                label = {
                                    Text(
                                        if (c != null) {
                                            c.name + " /" + c.max.toInt() +
                                                " · pass " + c.pass.toInt()
                                        } else {
                                            "Out of " + subject.fullMarks.toInt()
                                        },
                                    )
                                },
                                singleLine = true,
                                enabled = !typed.absent && !busy,
                                isError = bad(name),
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.Number,
                                    imeAction = if (nextBox(boxes, name) == null) ImeAction.Done
                                    else ImeAction.Next,
                                ),
                                keyboardActions = KeyboardActions(
                                    onNext = {
                                        if (!bad(name) && i + 1 < boxFocus.size) {
                                            runCatching { boxFocus[i + 1].requestFocus() }
                                        }
                                    },
                                    onDone = { if (!bad(name)) scope.launch { save() } },
                                ),
                                modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
                                    .focusRequester(boxFocus[i]),
                            )
                        }

                        Row(
                            Modifier.fillMaxWidth().padding(top = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                "Total " + (
                                    live?.marks?.let {
                                        it.toInt().toString() + "/" + subject.fullMarks.toInt()
                                    } ?: "—"
                                    ),
                                style = MaterialTheme.typography.titleMedium,
                                modifier = Modifier.weight(1f),
                            )
                            Text(
                                if (grade != null && grade.letter != "-") {
                                    grade.letter + " " + String.format(Locale.US, "%.1f", grade.point)
                                } else {
                                    "—"
                                },
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = if (grade?.letter == "F") MaterialTheme.colorScheme.error
                                else MaterialTheme.colorScheme.primary,
                            )
                        }

                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(
                                checked = typed.absent,
                                onCheckedChange = { typed = typed.copy(absent = it) },
                            )
                            Text("Absent", style = MaterialTheme.typography.bodyMedium)
                        }

                        if (grade != null && grade.failedParts.isNotEmpty()) {
                            Text(
                                grade.failedParts.joinToString(" and ") +
                                    " below the pass mark — this subject is F however high " +
                                    "the total.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                        }

                        Row(
                            Modifier.fillMaxWidth().padding(top = 10.dp),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Button(
                                enabled = !busy && !anyBad && exam?.published != true,
                                onClick = { scope.launch { save() } },
                            ) { Text(if (busy) "Saving…" else "Save and next roll") }
                            OutlinedButton(
                                enabled = !busy,
                                onClick = { open = null; typed = Typed(); roll = "" },
                            ) { Text("Cancel") }
                        }
                    }

                    Problem(problem)
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

            val log = enteredLog(roster, subject)
            if (log.isNotEmpty()) {
                Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                    Column(Modifier.padding(16.dp)) {
                        Text(
                            "Entered marks · " + subject.subjectName,
                            style = MaterialTheme.typography.titleMedium,
                        )
                        Text(
                            "Newest first, so the row just keyed in is at the top.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(bottom = 4.dp),
                        )
                        val clock = remember { SimpleDateFormat("HH:mm", Locale.getDefault()) }
                        log.forEach { r ->
                            Row(
                                Modifier.fillMaxWidth().padding(top = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(
                                        r.rollNo.toString() + " · " + r.fullName,
                                        style = MaterialTheme.typography.bodyMedium,
                                    )
                                    Text(
                                        subject.components.joinToString(" · ") { c ->
                                            c.name + " " + (
                                                r.parts[c.name]?.toInt()?.toString() ?: "—"
                                                )
                                        }.ifBlank {
                                            r.savedAt?.let { clock.format(Date(it)) }.orEmpty()
                                        },
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                Text(
                                    if (r.absent) "absent" else r.total?.toInt()?.toString() ?: "—",
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Bold,
                                )
                                Text(
                                    "  " + r.grade.letter,
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = if (r.grade.letter == "F") {
                                        MaterialTheme.colorScheme.error
                                    } else {
                                        MaterialTheme.colorScheme.onSurfaceVariant
                                    },
                                )
                                Text(
                                    "  " + (r.savedAt?.let { clock.format(Date(it)) } ?: ""),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            HorizontalDivider(Modifier.padding(top = 6.dp))
                        }
                    }
                }
            }
        }
    }
}
