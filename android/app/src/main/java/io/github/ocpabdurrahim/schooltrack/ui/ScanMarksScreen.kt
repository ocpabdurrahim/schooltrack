package io.github.ocpabdurrahim.schooltrack.ui

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.Card
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.Modifier
import androidx.compose.foundation.text.KeyboardOptions
import io.github.ocpabdurrahim.schooltrack.data.AttendanceRepository
import io.github.ocpabdurrahim.schooltrack.data.Chosen
import io.github.ocpabdurrahim.schooltrack.data.Exam
import io.github.ocpabdurrahim.schooltrack.data.ExamsRepository
import io.github.ocpabdurrahim.schooltrack.data.IntegrationsRepository
import io.github.ocpabdurrahim.schooltrack.data.Level
import io.github.ocpabdurrahim.schooltrack.data.PeopleRepository
import io.github.ocpabdurrahim.schooltrack.data.ResultRow
import io.github.ocpabdurrahim.schooltrack.data.SchoolClass
import io.github.ocpabdurrahim.schooltrack.data.ScanRead
import io.github.ocpabdurrahim.schooltrack.data.ScanRow
import io.github.ocpabdurrahim.schooltrack.data.ScanStudent
import io.github.ocpabdurrahim.schooltrack.data.SheetImage
import io.github.ocpabdurrahim.schooltrack.data.SheetShot
import io.github.ocpabdurrahim.schooltrack.data.StudentDetail
import io.github.ocpabdurrahim.schooltrack.data.asSitter
import io.github.ocpabdurrahim.schooltrack.data.Subject
import io.github.ocpabdurrahim.schooltrack.data.Typed
import io.github.ocpabdurrahim.schooltrack.data.checkScan
import io.github.ocpabdurrahim.schooltrack.data.discardSheetPhoto
import io.github.ocpabdurrahim.schooltrack.data.listModels
import io.github.ocpabdurrahim.schooltrack.data.newSheetPhotoUri
import io.github.ocpabdurrahim.schooltrack.data.matchComponent
import io.github.ocpabdurrahim.schooltrack.data.normalColumn
import io.github.ocpabdurrahim.schooltrack.data.partsAndTotal
import io.github.ocpabdurrahim.schooltrack.data.modelsToTry
import io.github.ocpabdurrahim.schooltrack.data.rankVisionModels
import io.github.ocpabdurrahim.schooltrack.data.readSheets
import io.github.ocpabdurrahim.schooltrack.data.sitsSubject
import io.github.ocpabdurrahim.schooltrack.data.subjectsForClass
import io.github.ocpabdurrahim.schooltrack.data.sheetSizeLabel
import io.github.ocpabdurrahim.schooltrack.data.uriToSheetShot
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Reading a photographed mark sheet into marks.
 *
 * The flow is deliberately four steps with a person at the end of each: say
 * what the sheet IS, photograph it, read it, then look at what was read before
 * any of it is saved. Nothing here writes until Save, and that uses the same
 * saveMarks() the typed grid has always used.
 *
 * What is NOT done here: believing the reader. Every row is checked against
 * the subject's own parts and against the total the teacher wrote; rows that
 * do not survive are shown with their problem and left out of the save. See
 * ScanMarks.kt, where all of that lives and is tested.
 *
 * The twin of web/src/pages/ScanMarks.tsx.
 */
@Composable
fun ScanMarksScreen(
    onBack: () -> Unit,
    repo: ExamsRepository = remember { ExamsRepository() },
    people: PeopleRepository = remember { PeopleRepository() },
    attendance: AttendanceRepository = remember { AttendanceRepository() },
    keys: IntegrationsRepository = remember { IntegrationsRepository() },
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var exams by remember { mutableStateOf<List<Exam>>(emptyList()) }
    var subjects by remember { mutableStateOf<List<Subject>>(emptyList()) }
    var classes by remember { mutableStateOf<List<SchoolClass>>(emptyList()) }
    var examId by remember { mutableStateOf("") }
    var classId by remember { mutableStateOf("") }
    var subjectId by remember { mutableStateOf("") }
    var students by remember { mutableStateOf<List<StudentDetail>>(emptyList()) }

    var shots by remember { mutableStateOf<List<SheetShot>>(emptyList()) }
    var read by remember { mutableStateOf<ScanRead?>(null) }

    var busy by remember { mutableStateOf(true) }
    var reading by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var hasKey by remember { mutableStateOf<Boolean?>(null) }

    LaunchedEffect(Unit) {
        try {
            exams = repo.listExams()
            subjects = repo.listSubjects()
            classes = attendance.listClasses()
            examId = exams.firstOrNull { !it.published }?.examId
                ?: exams.firstOrNull()?.examId.orEmpty()
            classId = classes.firstOrNull()?.classId.orEmpty()
            hasKey = keys.get().geminiApiKey.isNotEmpty()
        } catch (_: Exception) {
            problem = "Could not load the exams and sections."
        }
        busy = false
    }

    LaunchedEffect(classId) {
        if (classId.isBlank()) return@LaunchedEffect
        busy = true
        try {
            students = people.findStudents(classId, "")
            problem = ""
        } catch (_: Exception) {
            problem = "Could not read the section."
        }
        busy = false
    }

    val exam = exams.firstOrNull { it.examId == examId }
    val section = classes.firstOrNull { it.classId == classId }
    val className = students.firstOrNull()?.className
        ?: section?.className.orEmpty()
    val classSubjects = if (className.isBlank()) subjects else subjectsForClass(subjects, className)
    val subject = classSubjects.firstOrNull { it.subjectId == subjectId }

    LaunchedEffect(className, subjects) {
        if (classSubjects.isNotEmpty() && classSubjects.none { it.subjectId == subjectId }) {
            subjectId = classSubjects.first().subjectId
        }
    }

    // A change of what the sheet is supposed to be invalidates the reading of
    // it: the header check is against these three, and a stale pass would be
    // the most dangerous thing on the screen.
    LaunchedEffect(examId, classId, subjectId) { read = null; note = "" }

    val sitters = subject?.let { sub -> students.filter { sitsSubject(sub, it.asSitter()) } }
        ?: students
    val components = subject?.components.orEmpty()

    val chosen = if (subject != null && section != null) {
        Chosen(
            sectionName = section.displayName,
            className = section.className,
            subjectName = subject.subjectName,
            examName = exam?.examName.orEmpty(),
            fullMarks = subject.fullMarks,
            components = components,
        )
    } else {
        null
    }

    val checked = read?.let { r ->
        chosen?.let { c ->
            checkScan(r, sitters.map { ScanStudent(it.studentId, it.rollNo.toInt(), it.fullName) }, c)
        }
    }
    val stopped = checked?.findings?.any { it.level == Level.STOP } == true
    val ready = checked?.rows?.count { it.problem.isEmpty() && it.studentId != null } ?: 0

    /**
     * Both ways in land here: a sheet just photographed and one picked out of
     * the gallery are the same thing by the time they are read.
     *
     * [ours] says the files are the camera's, written into our own cache: those
     * are deleted once read. A picked file belongs to the gallery and is left
     * exactly where it was found.
     */
    fun addShots(uris: List<Uri>, ours: Boolean = false) {
        if (uris.isEmpty()) return
        scope.launch {
            problem = ""; note = ""
            try {
                val added = withContext(Dispatchers.IO) {
                    uris.map { uriToSheetShot(context, it) }
                }
                shots = shots + added
                read = null
            } catch (e: Exception) {
                problem = e.message ?: "That photograph could not be read."
            } finally {
                if (ours) withContext(Dispatchers.IO) {
                    uris.forEach { discardSheetPhoto(context, it) }
                }
            }
        }
    }

    val pick = rememberLauncherForActivityResult(
        ActivityResultContracts.GetMultipleContents(),
    ) { uris ->
        addShots(uris.orEmpty())
    }

    // Held across the trip to the camera app: TakePicture hands back only
    // whether a picture was taken, never where it put it.
    var pendingPhoto by remember { mutableStateOf<Uri?>(null) }

    val takePhoto = rememberLauncherForActivityResult(
        ActivityResultContracts.TakePicture(),
    ) { taken ->
        val uri = pendingPhoto
        pendingPhoto = null
        if (uri == null) return@rememberLauncherForActivityResult
        // Backing out of the camera still leaves the empty file behind.
        if (taken) addShots(listOf(uri), ours = true) else discardSheetPhoto(context, uri)
    }

    val startCamera = {
        try {
            val uri = newSheetPhotoUri(context)
            pendingPhoto = uri
            takePhoto.launch(uri)
        } catch (e: Exception) {
            problem = "The camera could not be opened. " +
                "A photograph taken in the camera app can still be chosen here."
        }
    }

    val askCamera = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) {
            startCamera()
        } else {
            // Not a dead end: the camera app itself needs no permission from us.
            problem = "Without the camera, photograph the sheet in the camera " +
                "app and add it with Choose a photograph."
        }
    }

    /** A correction on screen goes back into what was read, and is re-checked. */
    fun setCell(index: Int, column: String, text: String) {
        val current = read ?: return
        val value = text.trim().takeIf { it.isNotEmpty() }?.toIntOrNull()
        if (text.trim().isNotEmpty() && value == null) return
        read = current.copy(
            rows = current.rows.mapIndexed { i, r ->
                if (i != index) {
                    r
                } else {
                    val values = LinkedHashMap<String, Int?>()
                    // Whatever column used to stand for this one is dropped, so
                    // a "Prac" read off the paper cannot sit beside the
                    // PRACTICAL just corrected.
                    for ((k, v) in r.values) {
                        val same = if (column == "Total") {
                            normalColumn(k) == "TOTAL"
                        } else {
                            matchComponent(k, components)?.name == column
                        }
                        if (!same) values[k] = v
                    }
                    values[column] = value
                    r.copy(values = values)
                }
            },
        )
    }

    fun setRoll(index: Int, text: String) {
        val current = read ?: return
        read = current.copy(
            rows = current.rows.mapIndexed { i, r ->
                if (i == index) r.copy(roll = text.trim().toIntOrNull()) else r
            },
        )
    }

    AdminScaffold(
        "Scan a mark sheet",
        listOfNotNull(
            exam?.let { it.examName + " " + it.examYear },
            section?.displayName,
            subject?.subjectName,
        ).joinToString(" · ").ifBlank { "Pick an exam" },
        onBack,
    ) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text(
                    "Photograph the filled-in sheet and the marks are read off it. " +
                        "Nothing is saved until you have looked at what was read.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (hasKey == false) {
                    Problem(
                        "No Gemini key has been set up yet, so nothing can be read. " +
                            "An admin can paste one in on the Setup screen.",
                    )
                }
                Picker(
                    "Exam",
                    exams.map { it.examId to (it.examName + " " + it.examYear) },
                    examId,
                ) { examId = it }
                Picker("Section", classes.map { it.classId to it.displayName }, classId) {
                    classId = it
                }
                Picker(
                    "Subject",
                    classSubjects.map {
                        it.subjectId to it.subjectName + if (it.isOptional) " (4th)" else ""
                    },
                    subjectId,
                ) { subjectId = it }

                subject?.let { sub ->
                    Text(
                        (
                            if (components.isEmpty()) {
                                "${sub.subjectName} is marked as one mark out of " +
                                    "${sub.fullMarks.toInt()}."
                            } else {
                                "${sub.subjectName} is marked " +
                                    components.joinToString(" + ") {
                                        "${it.name} out of ${it.max.toInt()}"
                                    } + "."
                            }
                            ) + "  ${sitters.size} student(s) sit it.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
                if (exam?.published == true) {
                    Problem("This exam is published. Unpublish it before correcting a mark.")
                }
                Problem(problem)
                if (note.isNotEmpty()) {
                    Text(note, color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(top = 8.dp))
                }
            }
        }

        Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(Modifier.padding(16.dp)) {
                Text("The photograph", style = MaterialTheme.typography.titleMedium)
                Text(
                    "One picture of the whole sheet, taken square on in good light. " +
                        "If the sheet runs to more than one page, add them all before " +
                        "reading — they are read together.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = 8.dp),
                )

                // Stacked, not side by side: at 360dp the two labels do not fit
                // on one line, and a teacher holding a phone over a sheet wants
                // a target the width of the card.
                Button(
                    onClick = {
                        val allowed = ContextCompat.checkSelfPermission(
                            context, Manifest.permission.CAMERA,
                        ) == PackageManager.PERMISSION_GRANTED
                        if (allowed) startCamera() else askCamera.launch(Manifest.permission.CAMERA)
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Take a photograph")
                }
                Spacer(Modifier.height(8.dp))
                OutlinedButton(
                    onClick = { pick.launch("image/*") },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Choose a photograph")
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (shots.isNotEmpty()) {
                        TextButton(onClick = { shots = emptyList(); read = null }) {
                            Text("Clear")
                        }
                    }
                }

                shots.forEachIndexed { i, s ->
                    Row(
                        Modifier.fillMaxWidth().padding(top = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Image(
                            bitmap = s.bitmap.asImageBitmap(),
                            contentDescription = "Sheet ${i + 1}",
                            modifier = Modifier.width(72.dp).height(96.dp),
                        )
                        Spacer(Modifier.width(12.dp))
                        Text(
                            "${s.width}×${s.height} · ${sheetSizeLabel(s.base64)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.weight(1f))
                        TextButton(onClick = {
                            shots = shots.filterIndexed { j, _ -> j != i }
                            read = null
                        }) { Text("Remove") }
                    }
                }

                Button(
                    onClick = {
                        val c = chosen ?: return@Button
                        scope.launch {
                            reading = true; problem = ""; note = ""
                            try {
                                val k = keys.get()
                                if (k.geminiApiKey.isEmpty()) {
                                    hasKey = false
                                    throw IllegalStateException("No Gemini key is set up yet.")
                                }
                                // More than one, because the best model on an
                                // account is also the busiest: a sheet should
                                // step around "high demand" rather than ask the
                                // teacher to come back later.
                                val remembered = modelsToTry(k.geminiModel, k.geminiModels)
                                // One model and no runners-up is what a key
                                // saved before fallbacks looks like. Rather
                                // than make somebody re-save it, the list is
                                // filled in here, once.
                                val models = if (remembered.size > 1) {
                                    remembered
                                } else {
                                    val ranked = rankVisionModels(listModels(k.geminiApiKey))
                                    if (ranked.isEmpty()) {
                                        throw IllegalStateException(
                                            "This key has no model on it that can read a picture.",
                                        )
                                    }
                                    // A teacher may not write here; only a cache.
                                    runCatching {
                                        keys.save(
                                            model = k.geminiModel.ifEmpty { ranked.first() },
                                            models = ranked,
                                        )
                                    }
                                    modelsToTry(k.geminiModel, ranked)
                                }
                                val got = readSheets(
                                    k.geminiApiKey, models,
                                    shots.map { SheetImage(it.mimeType, it.base64) },
                                    c.components.map { it.name },
                                )
                                read = got
                                if (got.rows.isEmpty()) {
                                    problem = "Nothing written was found on that photograph."
                                }
                            } catch (e: Exception) {
                                problem = e.message ?: "That sheet could not be read."
                            }
                            reading = false
                        }
                    },
                    enabled = !reading && !busy && shots.isNotEmpty() &&
                        chosen != null && hasKey != false,
                    modifier = Modifier.padding(top = 12.dp),
                ) {
                    Text(if (reading) "Reading…" else "Read ${shots.size} sheet(s)")
                }
            }
        }

        if (checked != null) {
            Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text("What was read", style = MaterialTheme.typography.titleMedium)

                    checked.findings.forEach { f ->
                        Text(
                            (if (f.level == Level.STOP) "Stop: " else "Check: ") + f.message,
                            color = if (f.level == Level.STOP) {
                                MaterialTheme.colorScheme.error
                            } else {
                                MaterialTheme.colorScheme.tertiary
                            },
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                    }

                    read?.let { r ->
                        Text(
                            "The sheet reads: ${r.header.exam.ifBlank { "—" }} ${r.header.year}, " +
                                "class ${r.header.className.ifBlank { "—" }}, " +
                                r.header.subject.ifBlank { "—" } + ".",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                    }

                    Text(
                        "${checked.rows.size} row(s) had something written on them. " +
                            "$ready will be saved" +
                            (if (checked.held > 0) ", ${checked.held} held back below" else "") +
                            ".  A total is only a check — what gets stored is the parts.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(vertical = 8.dp),
                    )

                    checked.rows.forEach { row ->
                        Column(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                SmallBox(
                                    row.rollNo?.toString().orEmpty(),
                                    "Roll",
                                ) { setRoll(row.index, it) }
                                Spacer(Modifier.width(10.dp))
                                Text(
                                    row.studentName.ifBlank { "—" },
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Medium,
                                )
                            }
                            Row(
                                Modifier.fillMaxWidth().padding(top = 6.dp),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                if (components.isEmpty()) {
                                    SmallBox(row.marks, "Mark") { setCell(row.index, "Total", it) }
                                } else {
                                    components.forEach { c ->
                                        SmallBox(row.parts[c.name].orEmpty(), c.name) {
                                            setCell(row.index, c.name, it)
                                        }
                                    }
                                }
                                SmallBox(row.written?.toString().orEmpty(), "Total") {
                                    setCell(row.index, "Total", it)
                                }
                                Column(Modifier.padding(top = 6.dp)) {
                                    Text(
                                        "= " + (row.computed?.toString() ?: "—"),
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = if (row.written != null &&
                                            row.computed != row.written
                                        ) {
                                            MaterialTheme.colorScheme.error
                                        } else {
                                            MaterialTheme.colorScheme.onSurface
                                        },
                                    )
                                }
                            }
                            if (row.problem.isNotEmpty()) {
                                Text(
                                    row.problem,
                                    color = MaterialTheme.colorScheme.error,
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            } else if (row.note.isNotEmpty()) {
                                Text(
                                    row.note,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                        }
                    }

                    Button(
                        onClick = {
                            val sub = subject ?: return@Button
                            val ex = exam ?: return@Button
                            if (ex.published) {
                                problem = "That exam is published. Unpublish it first."
                                return@Button
                            }
                            scope.launch {
                                busy = true; problem = ""; note = ""
                                try {
                                    // ONLY the rows that were read and survived. A
                                    // student not on this sheet is not touched at all.
                                    val rows = checked.rows
                                        .filter { it.problem.isEmpty() && it.studentId != null }
                                        .mapNotNull { r ->
                                            val s = sitters.firstOrNull {
                                                it.studentId == r.studentId
                                            } ?: return@mapNotNull null
                                            val (parts, marks) = partsAndTotal(
                                                sub,
                                                Typed(r.marks, r.parts, false),
                                            )
                                            ResultRow(
                                                examId = examId,
                                                studentId = s.studentId,
                                                subjectId = sub.subjectId,
                                                subjectName = sub.subjectName,
                                                marks = marks,
                                                parts = parts,
                                                absent = false,
                                                classId = classId,
                                                rollNo = s.rollNo,
                                                fullMarks = sub.fullMarks,
                                                isOptional = sub.isOptional,
                                            )
                                        }
                                    repo.saveMarks(rows)
                                    note = "${rows.size} mark(s) saved from the sheet."
                                    read = null
                                    shots = emptyList()
                                } catch (_: Exception) {
                                    problem = "That save was refused. " +
                                        "Only a teacher or the head may enter marks."
                                }
                                busy = false
                            }
                        },
                        enabled = !busy && !stopped && ready > 0,
                        modifier = Modifier.padding(top = 12.dp),
                    ) {
                        Text(
                            if (stopped) "Cannot save this sheet" else "Save $ready mark(s)",
                        )
                    }
                }
            }
        }
    }
}

/** A narrow number box with its column name under it. */
@Composable
private fun SmallBox(value: String, label: String, onChange: (String) -> Unit) {
    Column {
        OutlinedTextField(
            value = value,
            onValueChange = onChange,
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.width(78.dp),
        )
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.width(78.dp),
        )
    }
}
