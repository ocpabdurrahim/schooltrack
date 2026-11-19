package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.github.ocpabdurrahim.schooltrack.data.AdminRepository
import io.github.ocpabdurrahim.schooltrack.data.AttendanceRepository
import io.github.ocpabdurrahim.schooltrack.data.Component
import io.github.ocpabdurrahim.schooltrack.data.Exam
import io.github.ocpabdurrahim.schooltrack.data.ExamsRepository
import io.github.ocpabdurrahim.schooltrack.data.MarkFill
import io.github.ocpabdurrahim.schooltrack.data.MarkPaste
import io.github.ocpabdurrahim.schooltrack.data.PeopleRepository
import io.github.ocpabdurrahim.schooltrack.data.ResultRow
import io.github.ocpabdurrahim.schooltrack.data.RollEntry
import io.github.ocpabdurrahim.schooltrack.data.SchoolClass
import io.github.ocpabdurrahim.schooltrack.data.StudentDetail
import io.github.ocpabdurrahim.schooltrack.data.StudentResult
import io.github.ocpabdurrahim.schooltrack.data.Typed
import io.github.ocpabdurrahim.schooltrack.data.Subject
import io.github.ocpabdurrahim.schooltrack.data.enteredSoFar
import io.github.ocpabdurrahim.schooltrack.data.gpaText
import io.github.ocpabdurrahim.schooltrack.data.gradeDistribution
import io.github.ocpabdurrahim.schooltrack.data.gradeForSubject
import io.github.ocpabdurrahim.schooltrack.data.meritOrder
import io.github.ocpabdurrahim.schooltrack.data.MARK_HEADINGS
import io.github.ocpabdurrahim.schooltrack.data.PartsSheet
import io.github.ocpabdurrahim.schooltrack.data.parseMarkParts
import io.github.ocpabdurrahim.schooltrack.data.singleMark
import io.github.ocpabdurrahim.schooltrack.data.partsAndTotal
import io.github.ocpabdurrahim.schooltrack.data.subjectMarkFor
import io.github.ocpabdurrahim.schooltrack.data.subjectStats
import io.github.ocpabdurrahim.schooltrack.data.totalMarks
import io.github.ocpabdurrahim.schooltrack.data.typedFrom
import io.github.ocpabdurrahim.schooltrack.data.gradeFor
import io.github.ocpabdurrahim.schooltrack.data.periodLabelFor
import io.github.ocpabdurrahim.schooltrack.data.sheetFor
import io.github.ocpabdurrahim.schooltrack.data.GROUPS
import io.github.ocpabdurrahim.schooltrack.data.RELIGIONS
import io.github.ocpabdurrahim.schooltrack.data.asSitter
import io.github.ocpabdurrahim.schooltrack.data.shortName
import io.github.ocpabdurrahim.schooltrack.data.sheetColumns
import io.github.ocpabdurrahim.schooltrack.data.sitsSubject
import io.github.ocpabdurrahim.schooltrack.data.subjectsForClass
import kotlinx.coroutines.launch

// ===========================================================================
// exams and subjects

/**
 * The patterns a Bangladeshi secondary school actually uses, so setting up
 * twenty subjects is one tap each rather than typing nine numbers.
 *
 * The pass mark on each part is its own, not a share of the subject's: a paper
 * can total 68 out of 100 and still be F because the MCQ pass is 10. English
 * carries pass 0 because those papers have no part-level pass — the subject's
 * own 33% is the only bar.
 *
 * The same list is in web/src/pages/Exams.tsx.
 */
private val PART_PATTERNS: List<Pair<String, List<Component>>> = listOf(
    "One mark" to emptyList(),
    "CQ 70 + MCQ 30" to listOf(Component("CQ", 70.0, 23.0), Component("MCQ", 30.0, 10.0)),
    "CQ 50 + MCQ 25 + Practical 25" to listOf(
        Component("CQ", 50.0, 17.0),
        Component("MCQ", 25.0, 8.0),
        Component("PRACTICAL", 25.0, 8.0),
    ),
    "CQ 25 + MCQ 25" to listOf(Component("CQ", 25.0, 8.0), Component("MCQ", 25.0, 8.0)),
    "Written 100" to listOf(Component("WRITTEN", 100.0, 0.0)),
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ExamsScreen(
    onBack: () -> Unit,
    exams: ExamsRepository = remember { ExamsRepository() },
    admin: AdminRepository = remember { AdminRepository() },
) {
    val scope = rememberCoroutineScope()
    var examList by remember { mutableStateOf<List<Exam>>(emptyList()) }
    var subjects by remember { mutableStateOf<List<Subject>>(emptyList()) }
    var classNames by remember { mutableStateOf<List<String>>(emptyList()) }

    var exam by remember { mutableStateOf(Exam("", "", "", "", false, 0)) }
    var subject by remember { mutableStateOf(Subject("", "")) }
    var busy by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf("") }

    suspend fun load() {
        try {
            examList = exams.listExams()
            subjects = exams.listSubjects()
            classNames = admin.listAllClasses().filter { it.active }.map { it.className }.distinct()
        } catch (_: Exception) {
            problem = "Could not read the exams."
        }
        busy = false
    }

    LaunchedEffect(Unit) {
        exam = exam.copy(examYear = java.time.Year.now().value.toString())
        load()
    }

    AdminScaffold("Exams and subjects", "What is examined, and who sits what", onBack) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text("Exams", style = MaterialTheme.typography.titleMedium)
                examList.forEach { e ->
                    Row(
                        Modifier.fillMaxWidth().clickable { exam = e; problem = "" }
                            .padding(vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                e.examName + " " + e.examYear,
                                style = MaterialTheme.typography.bodyLarge,
                            )
                            Text(
                                (if (e.sortOrder > 0) "#${e.sortOrder}  ·  " else "") +
                                    e.periodLabel + if (e.published) "  ·  published" else "",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Text("edit", color = MaterialTheme.colorScheme.primary)
                    }
                    HorizontalDivider()
                }

                Field("Exam name", exam.examName) { exam = exam.copy(examName = it) }
                Field("Year", exam.examYear) { exam = exam.copy(examYear = it) }
                Field(
                    "Order in the year",
                    if (exam.sortOrder == 0L) "" else exam.sortOrder.toString(),
                    numeric = true,
                ) { exam = exam.copy(sortOrder = it.toLongOrNull() ?: 0) }
                Text(
                    "The order decides how the exams line up on a parent's results report: 1 for " +
                        "the first exam of the year, 2 for the next. The name cannot do it — " +
                        "\"Annual\" sorts before \"Half yearly\" alphabetically but comes after it " +
                        "in the year. Left empty, the report falls back to that alphabetical order " +
                        "and does not call it progress.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
                Text(
                    "Period label: " + periodLabelFor(
                        exam.examName.ifBlank { "EXAM" }, exam.examYear,
                    ) + " — the same text the fee module uses.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )

                Button(
                    enabled = !busy,
                    onClick = {
                        if (exam.examName.isBlank()) { problem = "An exam needs a name."; return@Button }
                        busy = true; problem = ""
                        scope.launch {
                            try {
                                exams.saveExam(exam)
                                exam = Exam("", "", java.time.Year.now().value.toString(), "", false, 0)
                                load()
                            } catch (_: Exception) { problem = REFUSED; busy = false }
                        }
                    },
                    modifier = Modifier.padding(top = 12.dp),
                ) { Text(if (exam.examId.isBlank()) "Add exam" else "Save exam") }
                Problem(problem)
            }
        }

        Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(Modifier.padding(16.dp)) {
                Text("Subjects", style = MaterialTheme.typography.titleMedium)
                subjects.forEach { s ->
                    Row(
                        Modifier.fillMaxWidth().clickable { subject = s; problem = "" }
                            .padding(vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                s.subjectName + if (s.isOptional) "  (4th subject)" else "",
                                style = MaterialTheme.typography.bodyLarge,
                            )
                            Text(
                                s.classNames.joinToString(", ").ifBlank { "no class" } +
                                    "  ·  " + s.fullMarks.toInt() + " marks" +
                                    if (s.groupNames.isEmpty() ||
                                        s.groupNames.size == GROUPS.size
                                    ) {
                                        ""
                                    } else {
                                        "  ·  " + s.groupNames.joinToString(" and ") + " only"
                                    } +
                                    if (s.religions.isEmpty() ||
                                        s.religions.size == RELIGIONS.size
                                    ) {
                                        ""
                                    } else {
                                        "  ·  " + s.religions.joinToString(" and ") + " only"
                                    },
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Text("edit", color = MaterialTheme.colorScheme.primary)
                    }
                    HorizontalDivider()
                }

                Field("Subject", subject.subjectName) { subject = subject.copy(subjectName = it) }
                Field("Code", subject.subjectCode.orEmpty()) { subject = subject.copy(subjectCode = it) }
                Field("Full marks", subject.fullMarks.toInt().toString(), numeric = true) {
                    subject = subject.copy(fullMarks = it.toDoubleOrNull() ?: 100.0)
                }

                Text("Marked in parts", style = MaterialTheme.typography.labelMedium,
                     modifier = Modifier.padding(top = 12.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    PART_PATTERNS.forEach { pattern ->
                        FilterChip(
                            selected = subject.components == pattern.second,
                            onClick = {
                                subject = subject.copy(
                                    components = pattern.second,
                                    fullMarks = if (pattern.second.isEmpty()) subject.fullMarks
                                    else pattern.second.sumOf { it.max },
                                )
                            },
                            label = { Text(pattern.first) },
                        )
                    }
                }
                if (subject.components.isNotEmpty()) {
                    Text(
                        "Out of " + subject.fullMarks.toInt() + " in total. A part below its " +
                            "own pass mark fails the whole subject, however high the total: " +
                            subject.components.joinToString(", ") {
                                it.name + " passes at " + it.pass.toInt()
                            } + ".",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                Field(
                    "Graded together with (BAN, ENG)",
                    subject.combineGroup.orEmpty(),
                    modifier = Modifier.padding(top = 8.dp),
                ) { subject = subject.copy(combineGroup = it.trim().uppercase().ifBlank { null }) }
                Text(
                    "Papers given the same tag become ONE subject on the marksheet — put BAN " +
                        "on both Bangla papers and they are graded as a single subject out of " +
                        "200, the way the board counts them.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Text("Classes that sit it", style = MaterialTheme.typography.labelMedium,
                     modifier = Modifier.padding(top = 12.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    classNames.forEach { n ->
                        FilterChip(
                            selected = n in subject.classNames,
                            onClick = {
                                subject = subject.copy(
                                    classNames = if (n in subject.classNames) subject.classNames - n
                                    else subject.classNames + n,
                                )
                            },
                            label = { Text(n) },
                        )
                    }
                }

                Text("Groups that sit it", style = MaterialTheme.typography.labelMedium,
                     modifier = Modifier.padding(top = 12.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    GROUPS.forEach { n ->
                        FilterChip(
                            selected = n in subject.groupNames,
                            onClick = {
                                subject = subject.copy(
                                    groupNames = if (n in subject.groupNames) {
                                        subject.groupNames - n
                                    } else {
                                        subject.groupNames + n
                                    },
                                )
                            },
                            label = { Text(n) },
                        )
                    }
                }
                Text(
                    if (subject.groupNames.isEmpty() || subject.groupNames.size == GROUPS.size) {
                        "Tick none and the whole class sits it — Bangla, English, Mathematics. " +
                            "Tick some and it becomes a group paper: Physics for Science, " +
                            "Accounting for Business Studies."
                    } else {
                        "Only " + subject.groupNames.joinToString(" and ") + " students will be " +
                            "asked for this mark, and only their results will wait for it."
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Text("Religions that sit it", style = MaterialTheme.typography.labelMedium,
                     modifier = Modifier.padding(top = 12.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    RELIGIONS.forEach { n ->
                        FilterChip(
                            selected = n in subject.religions,
                            onClick = {
                                subject = subject.copy(
                                    religions = if (n in subject.religions) {
                                        subject.religions - n
                                    } else {
                                        subject.religions + n
                                    },
                                )
                            },
                            label = { Text(n) },
                        )
                    }
                }
                Text(
                    if (subject.religions.isEmpty() || subject.religions.size == RELIGIONS.size) {
                        "Only the two religion papers need this. Tick Islam on Islam & Moral " +
                            "Education and Hindu on Hindu Religion; everything else is left alone."
                    } else {
                        "Only " + subject.religions.joinToString(" and ") +
                            " students will be asked for this mark."
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Row(
                    Modifier.fillMaxWidth().padding(top = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(
                        checked = subject.isOptional,
                        onCheckedChange = { subject = subject.copy(isOptional = it) },
                    )
                    Text("Optional (4th subject)")
                }
                Text(
                    "An optional subject only ever helps: points above 2.00 are added, it is " +
                        "not counted in the average, and failing it does not fail the student.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Button(
                    enabled = !busy,
                    onClick = {
                        if (subject.subjectName.isBlank()) {
                            problem = "A subject needs a name."; return@Button
                        }
                        if (subject.classNames.isEmpty()) {
                            problem = "Tick at least one class that sits this subject."
                            return@Button
                        }
                        busy = true; problem = ""
                        scope.launch {
                            try {
                                // Every group ticked says the same thing as
                                // none ticked — the whole class sits it — so
                                // it is stored the shorter way, and a group
                                // added later is covered without coming back.
                                exams.saveSubject(
                                    subject.copy(
                                        groupNames = if (
                                            subject.groupNames.size == GROUPS.size
                                        ) emptyList() else subject.groupNames,
                                        religions = if (
                                            subject.religions.size == RELIGIONS.size
                                        ) emptyList() else subject.religions,
                                    ),
                                )
                                subject = Subject("", "")
                                load()
                            } catch (_: Exception) { problem = REFUSED; busy = false }
                        }
                    },
                    modifier = Modifier.padding(top = 12.dp),
                ) { Text(if (subject.subjectId.isBlank()) "Add subject" else "Save subject") }
            }
        }
    }
}

// ===========================================================================
// mark entry

@Composable
fun MarkEntryScreen(
    onBack: () -> Unit,
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
    var subjectId by remember { mutableStateOf("") }
    var students by remember { mutableStateOf<List<StudentDetail>>(emptyList()) }
    var entries by remember { mutableStateOf<Map<String, Typed>>(emptyMap()) }
    var busy by remember { mutableStateOf(true) }
    var note by remember { mutableStateOf("") }
    var problem by remember { mutableStateOf("") }

    // the paste panel: a tally read, filled into the grid, and saved by the
    // ordinary Save button like anything typed in by hand
    var fromFile by remember { mutableStateOf("") }

    // A spreadsheet of parts, for a subject marked in CQ/MCQ/Prac.
    var partsRead by remember { mutableStateOf<PartsSheet?>(null) }
    var partsFilled by remember { mutableStateOf(0) }

    LaunchedEffect(Unit) {
        try {
            exams = repo.listExams()
            subjects = repo.listSubjects()
            classes = attendance.listClasses()
            examId = exams.firstOrNull { !it.published }?.examId ?: exams.firstOrNull()?.examId.orEmpty()
            classId = classes.firstOrNull()?.classId.orEmpty()
        } catch (_: Exception) {
            problem = "Could not read the exams."
        }
        busy = false
    }


    val exam = exams.firstOrNull { it.examId == examId }
    val className = students.firstOrNull()?.className.orEmpty()
    val classSubjects = if (className.isBlank()) subjects else subjectsForClass(subjects, className)
    val subject = classSubjects.firstOrNull { it.subjectId == subjectId }

    /**
     * The students who actually sit this paper.
     *
     * A Science paper is not handed to the Humanities half of the class, and a
     * sheet that listed them would invite a mark for a paper they never sat —
     * which the tabulation would then have to explain away.
     */
    val sitters = subject?.let { sub ->
        students.filter { sitsSubject(sub, it.asSitter()) }
    } ?: students

    /**
     * A spreadsheet with one column per part, into the boxes below.
     *
     * Filling is not saving: this changes what is on screen, and the ordinary
     * Save marks button is still the only thing that writes anything.
     */
    val pickPartsFile = rememberGridPicker(
        onGrid = { name, grid ->
            problem = ""; note = ""; fromFile = name
            // A paper marked in parts wants a column per part; a paper
            // marked out of one number wants whichever word the sheet used.
            val comps = subject?.components.orEmpty().map { it.name }
            val got = parseMarkParts(grid, if (comps.isNotEmpty()) comps else MARK_HEADINGS)
            partsRead = got
            if (got.problem.isEmpty()) {
                val byRoll: Map<Long, String> =
                    sitters.associate { it.rollNo to it.studentId }
                var filled = 0
                var next = entries
                for (row in got.rows) {
                    // A roll this section has not got is left alone rather
                    // than guessed at: their marks may already be in.
                    val id = row.rollNo?.let { byRoll[it] } ?: continue
                    val was = next[id] ?: Typed()
                    val show = { v: Double ->
                        if (v == v.toLong().toDouble()) v.toLong().toString() else v.toString()
                    }
                    next = if (comps.isNotEmpty()) {
                        val parts: MutableMap<String, String> = was.parts.toMutableMap()
                        for ((name2, v) in row.parts.entries) parts[name2] = show(v)
                        next + (id to was.copy(parts = parts, absent = row.absent))
                    } else {
                        val one = singleMark(row)
                        if (one == null && !row.absent) continue
                        next + (id to was.copy(
                            marks = one?.let(show).orEmpty(),
                            absent = row.absent,
                        ))
                    }
                    filled += 1
                }
                partsFilled = filled
                if (filled > 0) entries = next
            }
        },
        onProblem = { problem = it; fromFile = ""; partsRead = null },
    )

    LaunchedEffect(classId, examId, subjectId) {
        if (classId.isBlank() || examId.isBlank()) return@LaunchedEffect
        busy = true
        try {
            val roll = people.findStudents(classId, "")
            val marks = repo.marksForExam(examId, classId).filter { it.subjectId == subjectId }
            students = roll
            entries = roll.associate { s ->
                val got = marks.firstOrNull { it.studentId == s.studentId }
                s.studentId to typedFrom(got?.marks, got?.parts, got?.absent ?: false)
            }
            problem = ""
            partsRead = null
        } catch (_: Exception) {
            problem = "Could not load the marks."
        }
        busy = false
    }

    LaunchedEffect(className, subjects) {
        if (classSubjects.isNotEmpty() && classSubjects.none { it.subjectId == subjectId }) {
            subjectId = classSubjects.first().subjectId
        }
    }

    AdminScaffold(
        "Mark entry",
        listOfNotNull(
            exam?.let { it.examName + " " + it.examYear },
            classes.firstOrNull { it.classId == classId }?.displayName,
            subject?.subjectName,
        ).joinToString(" · ").ifBlank { "Pick an exam" },
        onBack,
    ) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Picker("Exam", exams.map { it.examId to (it.examName + " " + it.examYear) }, examId) {
                    examId = it
                }
                Picker("Section", classes.map { it.classId to it.displayName }, classId) { classId = it }
                Picker(
                    "Subject",
                    classSubjects.map {
                        it.subjectId to it.subjectName + if (it.isOptional) " (4th)" else ""
                    },
                    subjectId,
                ) { subjectId = it }

                if (exam?.published == true) {
                    Problem("This exam is published. Unpublish it before correcting a mark.")
                }
                if (classSubjects.isEmpty()) {
                    Problem("No subject is assigned to this class yet.")
                }
                Problem(problem)
            }
        }

        // ONE way in, for every paper: a spreadsheet.
        //
        // The paste box is gone. It could only ever carry one number per
        // student, which is fine for a paper marked out of 100 and useless
        // for one marked CQ + MCQ -- and here it quietly filled the single
        // mark field, which on a paper marked in parts is not even the field
        // this screen shows, so the marks went nowhere a teacher could see.
        // A spreadsheet says which column a number came from, because it has
        // columns, and it is the same shape as the paper form. Marks can
        // still be typed box by box below; this is the faster way in.
        val partColumns = subject?.components.orEmpty().map { it.name }
        Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(Modifier.padding(16.dp)) {
                Text(
                    "A spreadsheet of marks",
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(
                    if (partColumns.isNotEmpty()) {
                        "${subject?.subjectName.orEmpty()} is marked in " +
                            partColumns.joinToString(" and ") +
                            ", so the sheet needs a column for each. Nothing is " +
                            "saved until you press Save marks."
                    } else {
                        "Marks for a whole section at once, off an .xlsx or a CSV. " +
                            "Nothing is saved until you press Save marks."
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = Muted,
                    modifier = Modifier.padding(top = 6.dp),
                )
                OutlinedButton(
                    onClick = pickPartsFile,
                    modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                ) {
                    Text(
                        if (fromFile.isBlank()) "Choose an Excel or CSV file"
                        else "Choose another file",
                    )
                }
                Text(
                    "One heading row, then a row per student: Roll, then " +
                        (
                            if (partColumns.isNotEmpty()) {
                                partColumns.joinToString(", ") +
                                    ", and a Total if you like — it is ignored " +
                                    "here, because it is worked out from the parts."
                            } else {
                                "Marks."
                            }
                            ) +
                        " Write A for absent. Leave a box empty rather than " +
                        "writing 0 in it: a zero is a mark.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Muted,
                    modifier = Modifier.padding(top = 8.dp),
                )
                partsRead?.let { got ->
                    if (got.problem.isNotEmpty()) {
                        Problem(got.problem)
                    } else {
                        Text(
                            "$partsFilled student(s) filled in from " +
                                got.columns.keys.joinToString(" and ") +
                                ". Check them below, then press Save marks.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = Green,
                            modifier = Modifier.padding(top = 10.dp),
                        )
                    }
                    for (row in got.rows.filter { it.problem.isNotEmpty() }) {
                        Text(
                            "Row ${row.line}: ${row.problem}",
                            style = MaterialTheme.typography.bodySmall,
                            color = Muted,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                }
            }
        }

        Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(Modifier.padding(16.dp)) {
                Text(
                    (if (busy) "Working…" else sitters.size.toString() + " student(s)") +
                        (subject?.let { "  ·  out of " + it.fullMarks.toInt() } ?: ""),
                    style = MaterialTheme.typography.titleMedium,
                )
                // Say why the sheet is shorter than the section, or a teacher
                // counting heads has no way to know the rest were left out on
                // purpose.
                val missing = students.size - sitters.size
                val only = subject?.let { it.groupNames + it.religions }.orEmpty()
                if (missing > 0 && only.isNotEmpty()) {
                    Text(
                        missing.toString() + " not shown — only " +
                            only.joinToString(" and ") + " students sit this paper.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                sitters.forEach { s ->
                    val typed = entries[s.studentId] ?: Typed()
                    val absent = typed.absent
                    val totals = subject?.let { partsAndTotal(it, typed) }
                    val grade = subject?.let {
                        gradeForSubject(
                            subjectMarkFor(it, null).copy(
                                marks = totals?.second,
                                parts = totals?.first.orEmpty(),
                                absent = absent,
                            ),
                        )
                    }
                    Row(
                        Modifier.fillMaxWidth().padding(top = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            s.rollNo.toString(),
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.width(28.dp),
                        )
                        Text(s.fullName, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                        Text(
                            grade?.letter.orEmpty(),
                            fontWeight = FontWeight.Bold,
                            color = if (grade?.letter == "F") MaterialTheme.colorScheme.error
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        val comps = subject?.components.orEmpty()
                        if (comps.isEmpty()) {
                            Field(
                                "Marks", typed.marks, numeric = true,
                                modifier = Modifier.weight(1f),
                            ) { entries = entries + (s.studentId to typed.copy(marks = it)) }
                        } else {
                            comps.forEach { c ->
                                Field(
                                    c.name + " /" + c.max.toInt(),
                                    typed.parts[c.name].orEmpty(),
                                    numeric = true,
                                    modifier = Modifier.weight(1f).padding(end = 6.dp),
                                ) {
                                    entries = entries + (
                                        s.studentId to typed.copy(parts = typed.parts + (c.name to it))
                                        )
                                }
                            }
                        }
                        Checkbox(
                            checked = absent,
                            onCheckedChange = {
                                entries = entries + (s.studentId to typed.copy(absent = it))
                            },
                        )
                        Text("absent", style = MaterialTheme.typography.bodySmall)
                    }
                    if (subject?.components.orEmpty().isNotEmpty()) {
                        Text(
                            totals?.second?.let {
                                "Total " + it.toInt() + " / " + (subject?.fullMarks ?: 0.0).toInt()
                            } ?: "Total —",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (grade != null && grade.failedParts.isNotEmpty()) {
                        Text(
                            grade.failedParts.joinToString(" and ") +
                                " below the pass mark — the subject is F.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                    HorizontalDivider()
                }

                Button(
                    enabled = !busy && subject != null && sitters.isNotEmpty() &&
                        exam?.published != true,
                    onClick = {
                        val s = subject ?: return@Button
                        busy = true; problem = ""; note = ""
                        scope.launch {
                            try {
                                repo.saveMarks(
                                    sitters.map { st ->
                                        val typed = entries[st.studentId] ?: Typed()
                                        val (parts, total) = partsAndTotal(s, typed)
                                        ResultRow(
                                            examId = examId,
                                            studentId = st.studentId,
                                            subjectId = s.subjectId,
                                            subjectName = s.subjectName,
                                            marks = total,
                                            parts = parts,
                                            absent = typed.absent,
                                            classId = classId,
                                            rollNo = st.rollNo,
                                            fullMarks = s.fullMarks,
                                            isOptional = s.isOptional,
                                        )
                                    },
                                )
                                note = sitters.size.toString() + " marks saved."
                            } catch (_: Exception) {
                                problem = "That save was refused. Only a teacher or the head " +
                                    "may enter marks."
                            }
                            busy = false
                        }
                    },
                    modifier = Modifier.padding(top = 12.dp),
                ) { Text(if (busy) "Saving…" else "Save marks") }

                if (note.isNotEmpty()) {
                    Text(note, color = MaterialTheme.colorScheme.primary,
                         modifier = Modifier.padding(top = 8.dp))
                }
                Text(
                    "A blank box means not entered yet, which is not a zero: that student has " +
                        "no GPA until it is filled in.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }
    }
}

// ===========================================================================
// the two sheets
//
// TABULATION — the working grid: every subject's mark and grade, the total,
// GPA, grade and position, with subject statistics at the foot.
// RESULT SHEET — what goes on the noticeboard: merit order, passed or failed,
// with the grade distribution.
//
// Both are views over the same marks. Printing is on the web app; a sheet
// wants a sheet of paper.

@Composable
fun ResultsScreen(
    isAdmin: Boolean,
    onOpenStudent: (String) -> Unit,
    onEnterMarks: () -> Unit,
    onBack: () -> Unit,
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
    var view by remember { mutableStateOf("tabulation") }
    var rows by remember { mutableStateOf<List<StudentResult>>(emptyList()) }
    var busy by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        try {
            exams = repo.listExams()
            subjects = repo.listSubjects()
            classes = attendance.listClasses()
            examId = exams.firstOrNull()?.examId.orEmpty()
            classId = classes.firstOrNull()?.classId.orEmpty()
        } catch (_: Exception) {
            problem = "Could not read the exams."
        }
        busy = false
    }

    LaunchedEffect(examId, classId, subjects) {
        if (examId.isBlank() || classId.isBlank()) return@LaunchedEffect
        busy = true
        try {
            rows = sheetFor(
                people.findStudents(classId, ""),
                subjects,
                repo.marksForExam(examId, classId),
                examId,
            )
            problem = ""
        } catch (_: Exception) {
            problem = "Could not build the sheet."
        }
        busy = false
    }

    val exam = exams.firstOrNull { it.examId == examId }
    val className = rows.firstOrNull()?.student?.className.orEmpty()
    val columns = if (className.isBlank()) emptyList() else sheetColumns(subjects, className)
    val complete = rows.count { !it.tabulation.incomplete }
    val passed = rows.count { (it.tabulation.gpa ?: 0.0) > 0 }
    val stats = subjectStats(rows, columns)
    val distribution = gradeDistribution(rows)
    val shown = if (view == "sheet") meritOrder(rows) else rows

    AdminScaffold(
        if (view == "sheet") "Result sheet" else "Tabulation sheet",
        listOfNotNull(
            exam?.let { it.examName + " " + it.examYear },
            classes.firstOrNull { it.classId == classId }?.displayName,
        ).joinToString(" · ").ifBlank { "Pick an exam" },
        onBack,
    ) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                // People look for "upload results" here, where the results are.
                // The marks themselves are entered one subject at a time, and a
                // file is read in on that screen.
                TextButton(onClick = onEnterMarks, modifier = Modifier.align(Alignment.End)) {
                    Text("Enter or upload marks")
                }
                Picker("Exam", exams.map { it.examId to (it.examName + " " + it.examYear) }, examId) {
                    examId = it
                }
                Picker("Section", classes.map { it.classId to it.displayName }, classId) { classId = it }
                Picker(
                    "Sheet",
                    listOf(
                        "tabulation" to "Tabulation (marks and grades)",
                        "sheet" to "Result sheet (merit order)",
                    ),
                    view,
                ) { view = it }

                if (isAdmin && exam != null) {
                    Button(
                        enabled = !busy,
                        onClick = {
                            busy = true
                            scope.launch {
                                try {
                                    repo.publishExam(exam.examId, !exam.published)
                                    exams = repo.listExams()
                                } catch (_: Exception) {
                                    problem = "Only an administrator may publish a result."
                                }
                                busy = false
                            }
                        },
                        modifier = Modifier.padding(top = 12.dp),
                    ) { Text(if (exam.published) "Unpublish" else "Publish result") }
                }
                Problem(problem)
            }
        }

        Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(Modifier.padding(16.dp)) {
                Text(
                    if (busy) "Working…"
                    else rows.size.toString() + " student(s)  ·  " + complete +
                        " complete  ·  " + passed + " passed",
                    style = MaterialTheme.typography.titleMedium,
                )

                shown.forEach { r ->
                    Row(
                        Modifier.fillMaxWidth().clickable { onOpenStudent(r.student.studentId) }
                            .padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            if (view == "sheet") (r.position?.toString() ?: "—")
                            else r.student.rollNo.toString(),
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.width(32.dp),
                        )
                        Column(Modifier.weight(1f)) {
                            Text(r.student.fullName, style = MaterialTheme.typography.bodyMedium)

                            if (view == "tabulation") {
                                // Each student's OWN subjects, named short: a
                                // Science row and a Humanities row sit under
                                // the same headings, so the cell has to say
                                // which paper it holds. Nothing is skipped and
                                // nothing is a dot, because the row is built
                                // from what this student sits.
                                // In the school's order, which is what
                                // tabulation.subjects is already in -- see
                                // SubjectOrder.kt. There is no need to sort
                                // them into slots the way the printed sheet
                                // does: that is for lining fixed columns up
                                // across streams, and here every cell names
                                // its own paper.
                                val cells = r.tabulation.subjects
                                Row(Modifier.horizontalScroll(rememberScrollState())) {
                                    cells.forEach { s ->
                                        Text(
                                            shortName(s.mark.subjectName) + " " +
                                                when {
                                                    // "—" says "theirs, still missing";
                                                    // "(50)" says half of a combined
                                                    // subject is in, which is not the same.
                                                    s.mark.absent -> "abs"
                                                    s.mark.marks == null ->
                                                        enteredSoFar(s.mark)
                                                            ?.let { "(" + it.toInt() + ")" }
                                                            ?: "—"
                                                    else -> s.mark.marks.toInt().toString() +
                                                        " " + s.grade.letter
                                                } + "   ",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = if (s.grade.letter == "F")
                                                MaterialTheme.colorScheme.error
                                            else MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                                Text(
                                    "total " + (totalMarks(r.tabulation)?.toInt()?.toString() ?: "—"),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            } else {
                                Text(
                                    "roll " + r.student.rollNo + "  ·  total " +
                                        (totalMarks(r.tabulation)?.toInt()?.toString() ?: "—") +
                                        "  ·  " + when {
                                            r.tabulation.incomplete -> "marks not all in"
                                            r.tabulation.letter == "F" ->
                                                "Failed" + if (r.tabulation.failed.isNotEmpty())
                                                    " — " + r.tabulation.failed.joinToString(", ")
                                                else ""
                                            else -> "Passed"
                                        },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = if (r.tabulation.letter == "F")
                                        MaterialTheme.colorScheme.error
                                    else MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(
                                gpaText(r.tabulation.gpa),
                                fontWeight = FontWeight.Bold,
                                color = if (r.tabulation.letter == "F")
                                    MaterialTheme.colorScheme.error
                                else MaterialTheme.colorScheme.onSurface,
                            )
                            Text(
                                r.tabulation.letter +
                                    (if (view == "tabulation")
                                        (r.position?.let { "  ·  pos " + it } ?: "") else ""),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    HorizontalDivider()
                }

                if (!busy && rows.isEmpty()) Text("No students in this section.")
            }
        }

        if (view == "tabulation" && stats.isNotEmpty()) {
            Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text("By subject", style = MaterialTheme.typography.titleMedium)
                    stats.forEach { s ->
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = 6.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(s.subjectName, style = MaterialTheme.typography.bodyMedium)
                                Text(
                                    "highest " + (s.highest?.toInt()?.toString() ?: "—") +
                                        "  ·  lowest " + (s.lowest?.toInt()?.toString() ?: "—") +
                                        "  ·  average " + (s.average?.toString() ?: "—"),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Text(
                                s.failed.toString() + " failed",
                                style = MaterialTheme.typography.bodySmall,
                                color = if (s.failed > 0) MaterialTheme.colorScheme.error
                                else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        HorizontalDivider()
                    }
                    Text(
                        "Statistics ignore a mark that has not been entered, and count an " +
                            "absence as a fail. The optional subject adds to the total, and " +
                            "to the GPA only above 2.00.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
            }
        }

        if (view == "sheet" && rows.isNotEmpty()) {
            Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text("Summary", style = MaterialTheme.typography.titleMedium)
                    Row(
                        Modifier.fillMaxWidth().padding(top = 6.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text("Appeared", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(rows.size.toString())
                    }
                    Row(
                        Modifier.fillMaxWidth().padding(top = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text("Passed", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(
                            passed.toString() +
                                if (complete > 0) "  (" + (passed * 100 / complete) + "%)" else "",
                        )
                    }
                    distribution.forEach { (letter, count) ->
                        Row(
                            Modifier.fillMaxWidth().padding(top = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(letter, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(count.toString())
                        }
                    }
                    Text(
                        "Printing is on the web app — a result sheet wants a sheet of paper.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 10.dp),
                    )
                }
            }
        }
    }
}
