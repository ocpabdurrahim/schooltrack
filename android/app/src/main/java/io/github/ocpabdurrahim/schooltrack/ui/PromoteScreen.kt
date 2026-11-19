package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import io.github.ocpabdurrahim.schooltrack.data.AdminRepository
import io.github.ocpabdurrahim.schooltrack.data.Candidate
import io.github.ocpabdurrahim.schooltrack.data.ClassAbove
import io.github.ocpabdurrahim.schooltrack.data.ClassRow
import io.github.ocpabdurrahim.schooltrack.data.Exam
import io.github.ocpabdurrahim.schooltrack.data.ExamsRepository
import io.github.ocpabdurrahim.schooltrack.data.PeopleRepository
import io.github.ocpabdurrahim.schooltrack.data.Standing
import io.github.ocpabdurrahim.schooltrack.data.StudentDetail
import io.github.ocpabdurrahim.schooltrack.data.Subject
import io.github.ocpabdurrahim.schooltrack.data.What
import io.github.ocpabdurrahim.schooltrack.data.marksTotal
import io.github.ocpabdurrahim.schooltrack.data.nextClassAbove
import io.github.ocpabdurrahim.schooltrack.data.promotionPlan
import io.github.ocpabdurrahim.schooltrack.data.sheetFor
import io.github.ocpabdurrahim.schooltrack.data.standing
import kotlinx.coroutines.launch

/**
 * Moving a class up at the end of the year.
 *
 * The merit list of the final exam decides next year's roll numbers: first in
 * merit becomes roll 1. Class Ten has nowhere above it, so its students are
 * archived instead.
 *
 * Everything here is a PROPOSAL until the button is pressed. It rewrites every
 * child's class and roll number, which is why it is not done as a side effect
 * of publishing a result — and why the whole plan is on screen, named child by
 * child, before anything is written.
 *
 * The twin of web/src/pages/Promote.tsx.
 */
@Composable
fun PromoteScreen(
    onBack: () -> Unit,
    exams0: ExamsRepository = remember { ExamsRepository() },
    admin: AdminRepository = remember { AdminRepository() },
    people: PeopleRepository = remember { PeopleRepository() },
) {
    val scope = rememberCoroutineScope()

    var exams by remember { mutableStateOf<List<Exam>>(emptyList()) }
    var classes by remember { mutableStateOf<List<ClassRow>>(emptyList()) }
    var subjects by remember { mutableStateOf<List<Subject>>(emptyList()) }
    var students by remember { mutableStateOf<List<StudentDetail>>(emptyList()) }
    var intoCount by remember { mutableStateOf(0) }
    var marks by remember { mutableStateOf<List<io.github.ocpabdurrahim.schooltrack.data.ResultRow>>(emptyList()) }

    var examId by remember { mutableStateOf("") }
    var classId by remember { mutableStateOf("") }
    var takeAnyway by remember { mutableStateOf<Set<String>>(emptySet()) }

    var busy by remember { mutableStateOf(true) }
    var working by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        try {
            exams = exams0.listExams()
            classes = admin.listAllClasses()
            subjects = exams0.listSubjects()
            // Only a final exam can move a class up, and only once published.
            examId = exams.firstOrNull { it.isFinal && it.published }?.examId.orEmpty()
        } catch (_: Exception) {
            problem = "Could not load the exams."
        }
        busy = false
    }

    val exam = exams.firstOrNull { it.examId == examId }
    val here = classes.firstOrNull { it.classId == classId }
    val above = here?.let {
        nextClassAbove(
            ClassAbove(it.classId, it.className, it.section),
            classes.map { c -> ClassAbove(c.classId, c.className, c.section) },
        )
    }

    LaunchedEffect(classId, examId, above?.classId) {
        if (classId.isBlank() || examId.isBlank()) {
            students = emptyList(); marks = emptyList(); intoCount = 0
            return@LaunchedEffect
        }
        busy = true
        try {
            students = people.findStudents(classId, "")
            marks = exams0.marksForExam(examId, classId)
            // Promoting into an occupied class would hand out roll numbers
            // somebody already has.
            intoCount = above?.let { people.findStudents(it.classId, "").size } ?: 0
            takeAnyway = emptySet()
            problem = ""; note = ""
        } catch (_: Exception) {
            problem = "Could not load that class."
        }
        busy = false
    }

    val candidates: List<Candidate> = remember(students, subjects, marks, examId) {
        if (students.isEmpty()) {
            emptyList()
        } else {
            sheetFor(students, subjects, marks, examId).map { r ->
                Candidate(
                    studentId = r.student.studentId,
                    fullName = r.student.fullName,
                    rollNo = r.student.rollNo.toInt(),
                    gpa = r.tabulation.gpa,
                    total = marksTotal(r.tabulation.subjects.map { it.mark }).first,
                    failed = r.tabulation.failed,
                    incomplete = r.tabulation.incomplete,
                )
            }
        }
    }

    val plan = remember(classId, above?.classId, candidates, intoCount, takeAnyway) {
        promotionPlan(
            fromClassId = classId,
            toClassId = above?.classId,
            candidates = candidates,
            alreadyThere = intoCount,
            takeAnyway = takeAnyway,
        )
    }

    val goingUp = plan.moves.count { it.what == What.UP }
    val archiving = plan.moves.count { it.what == What.ARCHIVED }
    val staying = plan.moves.count { it.what == What.STAYS }
    val finals = exams.filter { it.isFinal }

    AdminScaffold(
        "Move a class up",
        listOfNotNull(
            exam?.let { it.examName + " " + it.examYear },
            here?.displayName,
            above?.className?.let { "to $it" } ?: here?.let { "to nowhere — archived" },
        ).joinToString(" · ").ifBlank { "Pick a final exam and a class" },
        onBack,
    ) {

        Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(Modifier.padding(16.dp)) {
                Text(
                    "The merit list of the final exam decides next year's roll " +
                        "numbers: first in merit becomes roll 1. Nothing is written " +
                        "until you press the button at the bottom, and a student's " +
                        "past results are not touched — a result remembers the class " +
                        "and roll it was entered under.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Muted,
                )

                if (finals.isEmpty()) {
                    Problem(
                        "No exam is marked as the final exam of the year. Tick " +
                            "\"the final exam of the year\" on one, in Exams and subjects.",
                    )
                }

                Picker(
                    "Final exam",
                    finals.map {
                        it.examId to (
                            it.examName + " " + it.examYear +
                                if (it.published) "" else " (not published)"
                            )
                    },
                    examId,
                ) { examId = it }

                Picker("Class", classes.map { it.classId to it.displayName }, classId) {
                    classId = it
                }

                OutlinedTextField(
                    value = when {
                        above != null -> above.className
                        here != null -> "nowhere — archived"
                        else -> "—"
                    },
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Moving to") },
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                )

                if (exam != null && !exam.published) {
                    Problem(
                        "That exam is not published yet. Publish the result before " +
                            "moving the class up, so the merit list everyone can see " +
                            "is the one that decided the roll numbers.",
                    )
                }
                if (here != null && above == null) {
                    Text(
                        "There is no class above ${here.displayName}, so these students " +
                            "have finished with the school. They will be archived: kept " +
                            "with all their results, and off every register, mark sheet " +
                            "and fee list.",
                        style = MaterialTheme.typography.bodySmall,
                        color = Muted,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
                Problem(problem)
                if (note.isNotEmpty()) {
                    Text(
                        note,
                        style = MaterialTheme.typography.bodyMedium,
                        color = Green,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
            }
        }

        // Not an error on the back of a success. Once a class has been moved
        // up it IS empty, and "that class has no students on the roll" shown
        // under "4 student(s) moved up" reads like the write failed.
        if (plan.problem.isNotEmpty() && note.isEmpty()) {
            Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                Column(Modifier.padding(16.dp)) { Problem(plan.problem) }
            }
        }

        if (!busy && plan.problem.isEmpty() && plan.moves.isNotEmpty()) {
            Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                Column(Modifier.padding(16.dp)) {
                    // Joined rather than concatenated, so a count of nought
                    // cannot leave a dangling separator at the front.
                    Text(
                        listOfNotNull(
                            if (goingUp > 0) "$goingUp going up" else null,
                            if (archiving > 0) "$archiving archived" else null,
                            if (staying > 0) "$staying staying down" else null,
                        ).joinToString(" · ").ifEmpty { "Nothing to do" },
                        style = MaterialTheme.typography.titleMedium,
                    )
                    for (w in plan.warnings) {
                        Text(
                            w,
                            style = MaterialTheme.typography.bodySmall,
                            color = Muted,
                            modifier = Modifier.padding(top = 6.dp),
                        )
                    }

                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())
                            .padding(top = 10.dp),
                    ) {
                        Column {
                            Row(Modifier.padding(vertical = 6.dp)) {
                                Cell("Merit", 56)
                                Cell("Name", 160)
                                Cell("Roll", 52)
                                Cell("GPA", 56)
                                Cell("Result", 170)
                                Cell("New roll", 80)
                                Cell("Take up", 70)
                            }
                            plan.moves.forEachIndexed { i, m ->
                                val c = candidates.firstOrNull { it.studentId == m.studentId }
                                val how = c?.let { standing(it) } ?: Standing.INCOMPLETE
                                Row(
                                    Modifier.fillMaxWidth().padding(vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Cell(if (m.what == What.UP) "${i + 1}" else "—", 56)
                                    Cell(m.fullName, 160)
                                    Cell("${m.fromRoll}", 52)
                                    Cell(c?.gpa?.let { "%.2f".format(it) } ?: "—", 56)
                                    Cell(
                                        when (how) {
                                            Standing.PASSED -> "Passed"
                                            Standing.FAILED ->
                                                "Failed " + c?.failed.orEmpty().joinToString(", ")
                                            Standing.INCOMPLETE -> "No full result yet"
                                        },
                                        170,
                                    )
                                    Cell(
                                        when (m.what) {
                                            What.UP -> "${m.toRoll}"
                                            What.ARCHIVED -> "archived"
                                            What.STAYS -> "stays"
                                        },
                                        80,
                                        bold = true,
                                    )
                                    Row(Modifier.width(70.dp)) {
                                        if (how != Standing.PASSED) {
                                            Checkbox(
                                                checked = m.studentId in takeAnyway,
                                                onCheckedChange = { on ->
                                                    takeAnyway = if (on) {
                                                        takeAnyway + m.studentId
                                                    } else {
                                                        takeAnyway - m.studentId
                                                    }
                                                },
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }

                    Row(
                        Modifier.fillMaxWidth().padding(top = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Button(
                            enabled = !working && (goingUp + archiving) > 0 &&
                                exam?.published == true,
                            onClick = {
                                working = true; problem = ""; note = ""
                                scope.launch {
                                    try {
                                        val (up, gone) =
                                            admin.carryOutPromotion(plan.moves, classes)
                                        note = "$up student(s) moved up" +
                                            (if (gone > 0) " and $gone archived" else "") +
                                            ". Their results stay exactly where they were."
                                        students = people.findStudents(classId, "")
                                        takeAnyway = emptySet()
                                    } catch (_: Exception) {
                                        problem = "That could not be saved. Nothing was changed."
                                    }
                                    working = false
                                }
                            },
                        ) {
                            Text(
                                when {
                                    working -> "Working…"
                                    archiving > 0 && goingUp == 0 -> "Archive $archiving student(s)"
                                    else -> "Move $goingUp student(s) up"
                                },
                            )
                        }
                        TextButton(onClick = onBack) { Text("Not now") }
                    }
                }
            }
        }
    }
}

@Composable
private fun Cell(text: String, width: Int, bold: Boolean = false) {
    Text(
        text,
        style = MaterialTheme.typography.bodySmall,
        fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Normal,
        modifier = Modifier.width(width.dp).padding(end = 6.dp),
    )
}
