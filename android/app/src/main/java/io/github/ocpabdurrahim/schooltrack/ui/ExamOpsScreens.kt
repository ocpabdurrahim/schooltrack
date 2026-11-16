package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
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
import io.github.ocpabdurrahim.schooltrack.data.AttendanceRepository
import io.github.ocpabdurrahim.schooltrack.data.Exam
import io.github.ocpabdurrahim.schooltrack.data.ExamOpsRepository
import io.github.ocpabdurrahim.schooltrack.data.ExamsRepository
import io.github.ocpabdurrahim.schooltrack.data.PeopleRepository
import io.github.ocpabdurrahim.schooltrack.data.Room
import io.github.ocpabdurrahim.schooltrack.data.RoomPlan
import io.github.ocpabdurrahim.schooltrack.data.RoutineEntry
import io.github.ocpabdurrahim.schooltrack.data.SchoolClass
import io.github.ocpabdurrahim.schooltrack.data.StudentDetail
import io.github.ocpabdurrahim.schooltrack.data.Subject
import io.github.ocpabdurrahim.schooltrack.data.examDates
import io.github.ocpabdurrahim.schooltrack.data.roomIdFor
import io.github.ocpabdurrahim.schooltrack.data.routineFor
import io.github.ocpabdurrahim.schooltrack.data.seatOf
import io.github.ocpabdurrahim.schooltrack.data.seatPlan
import io.github.ocpabdurrahim.schooltrack.data.subjectsForClass
import io.github.ocpabdurrahim.schooltrack.data.weekdayOf
import kotlinx.coroutines.launch

/**
 * Exam operations on the phone: the routine, the rooms, the seat plan and the
 * admit card — the twins of the web pages of the same names.
 *
 * Printing happens on the web; here the point is that the head can set a
 * routine from home, and an invigilator can look up who sits where without
 * finding the printed sheet.
 */

// ===========================================================================
// routine and rooms

@Composable
fun RoutineScreen(
    onBack: () -> Unit,
    exams: ExamsRepository = remember { ExamsRepository() },
    ops: ExamOpsRepository = remember { ExamOpsRepository() },
    attendance: AttendanceRepository = remember { AttendanceRepository() },
) {
    val scope = rememberCoroutineScope()
    var examList by remember { mutableStateOf<List<Exam>>(emptyList()) }
    var classes by remember { mutableStateOf<List<SchoolClass>>(emptyList()) }
    var subjects by remember { mutableStateOf<List<Subject>>(emptyList()) }
    var rooms by remember { mutableStateOf<List<Room>>(emptyList()) }

    var examId by remember { mutableStateOf("") }
    var classId by remember { mutableStateOf("") }
    var subjectId by remember { mutableStateOf("") }
    var routine by remember { mutableStateOf<List<RoutineEntry>>(emptyList()) }

    var date by remember { mutableStateOf("") }
    var startTime by remember { mutableStateOf("10:00") }
    var endTime by remember { mutableStateOf("13:00") }

    var roomName by remember { mutableStateOf("") }
    var capacity by remember { mutableStateOf("30") }
    var columns by remember { mutableStateOf("2") }

    var busy by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        try {
            examList = exams.listExams()
            subjects = exams.listSubjects()
            classes = attendance.listClasses()
            rooms = ops.listRooms()
            examId = examList.firstOrNull()?.examId.orEmpty()
            classId = classes.firstOrNull()?.classId.orEmpty()
        } catch (_: Exception) {
            problem = "Could not read the exams."
        }
        busy = false
    }

    LaunchedEffect(examId) {
        if (examId.isNotEmpty()) {
            routine = try { ops.getRoutine(examId) } catch (_: Exception) { emptyList() }
        }
    }

    val section = classes.firstOrNull { it.classId == classId }
    val className = section?.displayName?.substringBefore(" - ").orEmpty()
    val classSubjects = if (className.isEmpty()) subjects else subjectsForClass(subjects, className)

    LaunchedEffect(classId, subjects) {
        if (classSubjects.none { it.subjectId == subjectId }) {
            subjectId = classSubjects.firstOrNull()?.subjectId.orEmpty()
        }
    }

    val mine = routineFor(routine, classId)

    AdminScaffold("Exam routine", examList.firstOrNull { it.examId == examId }
        ?.let { it.examName + " " + it.examYear }, onBack) {

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Picker("Exam", examList.map { it.examId to (it.examName + " " + it.examYear) },
                    examId) { examId = it }
                Picker("Section", classes.map { it.classId to it.displayName }, classId) {
                    classId = it
                }
                Problem(problem)
                if (note.isNotEmpty()) {
                    Text(note, style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(top = 8.dp))
                }
            }
        }

        Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(Modifier.padding(16.dp)) {
                Text("Set a paper", style = MaterialTheme.typography.titleMedium)

                if (classSubjects.isEmpty()) {
                    Text(
                        (className.ifBlank { "This section" }) + " sits no subjects yet. " +
                            "Tick it on the subjects under Exams first — otherwise there " +
                            "is nothing to timetable.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                } else {
                    Picker("Subject", classSubjects.map { it.subjectId to it.subjectName },
                        subjectId) { subjectId = it }
                    Field("Date (YYYY-MM-DD)", date) { date = it }
                    Row(Modifier.fillMaxWidth()) {
                        Field("From", startTime, modifier = Modifier.weight(1f)) { startTime = it }
                        Field("To", endTime, modifier = Modifier.weight(1f)) { endTime = it }
                    }
                    Button(
                        enabled = !busy,
                        onClick = {
                            val subject = classSubjects.firstOrNull { it.subjectId == subjectId }
                            if (subject == null || date.isBlank()) {
                                problem = "Pick a subject and a date."
                                return@Button
                            }
                            busy = true; problem = ""; note = ""
                            scope.launch {
                                try {
                                    // the transaction re-reads and merges, so a
                                    // second quick tap cannot overwrite the first
                                    routine = ops.setPaper(
                                        examId,
                                        RoutineEntry(
                                            classId = classId,
                                            subjectId = subject.subjectId,
                                            subjectName = subject.subjectName,
                                            date = date,
                                            startTime = startTime,
                                            endTime = endTime,
                                        ),
                                    )
                                    note = subject.subjectName + " set for " + date + "."
                                } catch (_: Exception) {
                                    problem = "That was refused. Only an administrator " +
                                        "may set the routine."
                                }
                                busy = false
                            }
                        },
                        modifier = Modifier.padding(top = 12.dp),
                    ) { Text("Set paper") }
                    Text(
                        "Setting a subject again moves it rather than adding a second sitting.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
            }
        }

        Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(Modifier.padding(16.dp)) {
                Text(section?.displayName.orEmpty(), style = MaterialTheme.typography.titleMedium)
                if (mine.isEmpty()) {
                    Text(
                        "No papers set for this section yet.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
                mine.forEach { r ->
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(r.subjectName, style = MaterialTheme.typography.bodyLarge)
                            Text(
                                r.date + " (" + weekdayOf(r.date) + ")  ·  " +
                                    r.startTime + "–" + r.endTime,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        TextButton(
                            enabled = !busy,
                            onClick = {
                                busy = true
                                scope.launch {
                                    try {
                                        routine = ops.dropPaper(examId, r.classId, r.subjectId)
                                    } catch (_: Exception) {
                                        problem = "That change was refused."
                                    }
                                    busy = false
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
                Text("Rooms", style = MaterialTheme.typography.titleMedium)
                if (rooms.isEmpty()) {
                    Text(
                        "No rooms yet — the seat plan needs at least one.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
                rooms.forEach { r ->
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(r.roomName, style = MaterialTheme.typography.bodyLarge)
                        Text(
                            r.capacity.toString() + " seats  ·  " + r.columns + " across",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    HorizontalDivider()
                }

                Field("Room", roomName) { roomName = it }
                Row(Modifier.fillMaxWidth()) {
                    Field("Seats", capacity, numeric = true, modifier = Modifier.weight(1f)) {
                        capacity = it
                    }
                    Field("Across", columns, numeric = true, modifier = Modifier.weight(1f)) {
                        columns = it
                    }
                }
                Button(
                    enabled = !busy,
                    onClick = {
                        if (roomName.isBlank()) { problem = "A room needs a name."; return@Button }
                        busy = true; problem = ""
                        scope.launch {
                            try {
                                rooms = ops.saveRoom(
                                    Room(
                                        roomId = roomIdFor(roomName),
                                        roomName = roomName.trim(),
                                        capacity = capacity.toIntOrNull() ?: 30,
                                        columns = columns.toIntOrNull() ?: 2,
                                    ),
                                )
                                roomName = ""
                            } catch (_: Exception) {
                                problem = "That was refused. Only an administrator " +
                                    "may change the rooms."
                            }
                            busy = false
                        }
                    },
                    modifier = Modifier.padding(top = 12.dp),
                ) { Text("Save room") }
            }
        }
    }
}

// ===========================================================================
// seat plan

@Composable
fun SeatPlanScreen(
    onBack: () -> Unit,
    exams: ExamsRepository = remember { ExamsRepository() },
    ops: ExamOpsRepository = remember { ExamOpsRepository() },
    people: PeopleRepository = remember { PeopleRepository() },
) {
    var examList by remember { mutableStateOf<List<Exam>>(emptyList()) }
    var rooms by remember { mutableStateOf<List<Room>>(emptyList()) }
    var examId by remember { mutableStateOf("") }
    var routine by remember { mutableStateOf<List<RoutineEntry>>(emptyList()) }
    var date by remember { mutableStateOf("") }
    var students by remember { mutableStateOf<List<StudentDetail>>(emptyList()) }
    var busy by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        try {
            examList = exams.listExams()
            rooms = ops.listRooms()
            examId = examList.firstOrNull()?.examId.orEmpty()
        } catch (_: Exception) {
            problem = "Could not read the exams."
        }
        busy = false
    }

    LaunchedEffect(examId) {
        if (examId.isEmpty()) return@LaunchedEffect
        busy = true
        routine = try { ops.getRoutine(examId) } catch (_: Exception) { emptyList() }
        val days = examDates(routine)
        if (date !in days) date = days.firstOrNull().orEmpty()
        busy = false
    }

    val sitting = routine.filter { it.date == date }.map { it.classId }.distinct()

    LaunchedEffect(sitting.joinToString("|")) {
        if (sitting.isEmpty()) { students = emptyList(); return@LaunchedEffect }
        busy = true
        students = try {
            sitting.flatMap { people.findStudents(it, "") }
        } catch (_: Exception) {
            problem = "Could not read the students."
            emptyList()
        }
        busy = false
    }

    val plan = seatPlan(students, rooms)

    AdminScaffold("Seat plan", examList.firstOrNull { it.examId == examId }
        ?.let { it.examName + " " + it.examYear }, onBack) {

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Picker("Exam", examList.map { it.examId to (it.examName + " " + it.examYear) },
                    examId) { examId = it }
                val days = examDates(routine)
                Picker("Exam day", days.map { it to (it + " (" + weekdayOf(it) + ")") }, date) {
                    date = it
                }
                if (days.isEmpty()) {
                    Text(
                        "This exam has no routine yet — set the papers first.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
                if (rooms.isEmpty()) {
                    Problem("There are no rooms yet. Add them on the routine screen.")
                }
                if (plan.unseated.isNotEmpty()) {
                    Problem(
                        plan.unseated.size.toString() + " students did not fit in the rooms. " +
                            "Add a room or more seats.",
                    )
                }
                Problem(problem)
                if (busy) {
                    Text("Working…", modifier = Modifier.padding(top = 8.dp))
                }
                Text(
                    "Two students of the same class are never seated side by side while " +
                        "another class still has someone waiting.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }

        plan.plans.forEach { RoomPlanCard(it) }
    }
}

@Composable
private fun RoomPlanCard(plan: RoomPlan) {
    Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
        Column(Modifier.padding(16.dp)) {
            Text(plan.room.roomName, style = MaterialTheme.typography.titleMedium)
            Text(
                plan.seats.size.toString() + " of " + plan.room.capacity + " seats used",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            plan.seats.forEach { seat ->
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        seat.seatNo.toString(),
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Bold,
                    )
                    Column(Modifier.weight(1f).padding(start = 14.dp)) {
                        Text(seat.student.fullName, style = MaterialTheme.typography.bodyLarge)
                        Text(
                            seat.student.className + " - " + seat.student.section +
                                "  ·  Roll " + seat.student.rollNo,
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

// ===========================================================================
// admit cards

@Composable
fun AdmitCardsScreen(
    onBack: () -> Unit,
    exams: ExamsRepository = remember { ExamsRepository() },
    ops: ExamOpsRepository = remember { ExamOpsRepository() },
    attendance: AttendanceRepository = remember { AttendanceRepository() },
    people: PeopleRepository = remember { PeopleRepository() },
) {
    var examList by remember { mutableStateOf<List<Exam>>(emptyList()) }
    var classes by remember { mutableStateOf<List<SchoolClass>>(emptyList()) }
    var rooms by remember { mutableStateOf<List<Room>>(emptyList()) }

    var examId by remember { mutableStateOf("") }
    var classId by remember { mutableStateOf("") }
    var routine by remember { mutableStateOf<List<RoutineEntry>>(emptyList()) }
    var byClass by remember { mutableStateOf<Map<String, List<StudentDetail>>>(emptyMap()) }

    var busy by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        try {
            examList = exams.listExams()
            classes = attendance.listClasses()
            rooms = ops.listRooms()
            examId = examList.firstOrNull()?.examId.orEmpty()
            classId = classes.firstOrNull()?.classId.orEmpty()
        } catch (_: Exception) {
            problem = "Could not read the exams."
        }
        busy = false
    }

    LaunchedEffect(examId) {
        if (examId.isNotEmpty()) {
            routine = try { ops.getRoutine(examId) } catch (_: Exception) { emptyList() }
        }
    }

    // every class with a paper in this exam, because the seat plan interleaves
    // them — a card cannot be built from one section alone
    val examClasses = routine.map { it.classId }.distinct().sorted()

    LaunchedEffect(examClasses.joinToString("|"), classId) {
        val wanted = (examClasses + classId).filter { it.isNotEmpty() }.distinct()
        if (wanted.isEmpty()) return@LaunchedEffect
        busy = true
        byClass = try {
            wanted.associateWith { people.findStudents(it, "") }
        } catch (_: Exception) {
            problem = "Could not read the students."
            emptyMap()
        }
        busy = false
    }

    /** One seat plan per exam day, exactly as the seat plan screen builds it. */
    val seatsByDate = examDates(routine).associateWith { day ->
        val sitting = routine.filter { it.date == day }.map { it.classId }.distinct()
        seatPlan(sitting.flatMap { byClass[it].orEmpty() }, rooms).plans
    }

    val mine = routineFor(routine, classId)
    val students = byClass[classId].orEmpty()

    AdminScaffold("Admit cards", examList.firstOrNull { it.examId == examId }
        ?.let { it.examName + " " + it.examYear }, onBack) {

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Picker("Exam", examList.map { it.examId to (it.examName + " " + it.examYear) },
                    examId) { examId = it }
                Picker("Section", classes.map { it.classId to it.displayName }, classId) {
                    classId = it
                }
                if (mine.isEmpty()) {
                    Problem(
                        "This section has no papers in this exam. Set the routine first.",
                    )
                } else if (rooms.isEmpty()) {
                    Text(
                        "No rooms are set up, so the cards show no room or seat.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
                Problem(problem)
                if (busy) Text("Working…", modifier = Modifier.padding(top = 8.dp))
                Text(
                    "Print the cards from the web app; this screen is for looking one up.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }

        if (mine.isNotEmpty()) {
            students.forEach { s ->
                Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                    Column(Modifier.padding(16.dp)) {
                        Text(s.fullName, style = MaterialTheme.typography.titleMedium)
                        Text(
                            s.className + " - " + s.section + "  ·  Roll " + s.rollNo +
                                (s.regNo?.let { "  ·  Reg " + it } ?: ""),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        HorizontalDivider(Modifier.padding(vertical = 10.dp))
                        mine.forEach { r ->
                            val seat = seatOf(seatsByDate[r.date].orEmpty(), s.studentId)
                            Row(
                                Modifier.fillMaxWidth().padding(vertical = 6.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(r.subjectName,
                                        style = MaterialTheme.typography.bodyMedium)
                                    Text(
                                        r.date + " (" + weekdayOf(r.date) + ")  ·  " +
                                            r.startTime + "–" + r.endTime,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                Text(
                                    seat?.let { it.first + "  ·  seat " + it.second } ?: "—",
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
