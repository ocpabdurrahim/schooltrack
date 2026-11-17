package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import io.github.ocpabdurrahim.schooltrack.data.AdminRepository
import io.github.ocpabdurrahim.schooltrack.data.ClassRow
import io.github.ocpabdurrahim.schooltrack.data.PeopleRepository
import io.github.ocpabdurrahim.schooltrack.data.StudentDetail
import io.github.ocpabdurrahim.schooltrack.data.StudentRow
import io.github.ocpabdurrahim.schooltrack.data.parseStudentRows
import io.github.ocpabdurrahim.schooltrack.data.prepareStudentRows
import kotlinx.coroutines.launch

private enum class RowState { READY, STOPPED, SAVED, FAILED }

private data class Shown(
    val row: StudentRow,
    val state: RowState,
    val studentId: String = "",
)

/**
 * A whole section typed in at once — the Compose twin of the web's "Add many
 * students".
 *
 * The single form is right for one student and wrong for forty, which is what
 * January is. This reads a pasted list, shows exactly what it understood, and
 * only then saves — through the same saveStudent the single form uses, so the
 * student numbers, the rules and the audit stamp are identical.
 *
 * It shows the reading before it writes anything on purpose: a bulk import that
 * saves first and reports afterwards leaves someone deleting forty records by
 * hand, and this app does not delete students at all.
 */
@Composable
fun StudentsBatchScreen(
    onOpen: (String) -> Unit,
    onBack: () -> Unit,
    admin: AdminRepository = remember { AdminRepository() },
    people: PeopleRepository = remember { PeopleRepository() },
) {
    val scope = rememberCoroutineScope()
    var classes by remember { mutableStateOf<List<ClassRow>>(emptyList()) }
    var classId by remember { mutableStateOf("") }
    var text by remember { mutableStateOf("") }
    var rows by remember { mutableStateOf<List<Shown>?>(null) }
    var taken by remember { mutableStateOf(0) }
    var busy by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf("") }
    var done by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        try {
            classes = admin.listAllClasses()
            classId = classes.firstOrNull { it.active }?.classId.orEmpty()
        } catch (_: Exception) {
            problem = "Could not read the sections."
        }
        busy = false
    }

    val section = classes.firstOrNull { it.classId == classId }
    val ready = rows?.count { it.state == RowState.READY } ?: 0
    val stopped = rows?.count { it.state == RowState.STOPPED } ?: 0
    val saved = rows?.count { it.state == RowState.SAVED } ?: 0

    AdminScaffold(
        title = "Add many students",
        subtitle = "One student a line, pasted out of a list",
        onBack = onBack,
    ) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Picker(
                    "Section",
                    classes.filter { it.active }.map { it.classId to it.displayName },
                    classId,
                ) { classId = it; rows = null; done = false }

                OutlinedTextField(
                    value = text,
                    onValueChange = { text = it },
                    label = { Text("The list") },
                    singleLine = false,
                    minLines = 6,
                    textStyle = MaterialTheme.typography.bodyMedium
                        .copy(fontFamily = FontFamily.Monospace),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Text,
                        imeAction = ImeAction.Default,
                    ),
                    modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                )

                Text(
                    "Columns separated by tabs, by commas or by two spaces. Without a " +
                        "heading line, a list that starts with a number is read as roll, " +
                        "name, father, mother, mobile, date of birth, and one that starts " +
                        "with a name as name, father, mother, mobile, date of birth — rolls " +
                        "are then given out after the highest one in the section. A column " +
                        "of names on their own works. To use another order, put a heading " +
                        "line at the top naming the columns. A date like 05/03/2012 is read " +
                        "as 5 March.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Muted,
                    modifier = Modifier.padding(top = 10.dp),
                )

                Button(
                    enabled = !busy && classId.isNotBlank(),
                    onClick = {
                        problem = ""; done = false
                        busy = true
                        scope.launch {
                            try {
                                // The rolls already in use, so a clash can be named
                                // before anything is written. Only the students still
                                // studying count: a roll left behind by someone who has
                                // gone is free to use again.
                                val here = people.findStudents(classId, "")
                                taken = here.size
                                val parsed = prepareStudentRows(
                                    parseStudentRows(text),
                                    here.map { it.rollNo },
                                )
                                rows = if (parsed.isEmpty()) {
                                    problem = "There is nothing in the box."
                                    null
                                } else {
                                    parsed.map {
                                        Shown(
                                            it,
                                            if (it.problem.isEmpty()) {
                                                RowState.READY
                                            } else {
                                                RowState.STOPPED
                                            },
                                        )
                                    }
                                }
                            } catch (_: Exception) {
                                problem = "Could not read this section. Only the head or " +
                                    "the office may add students."
                            }
                            busy = false
                        }
                    },
                    modifier = Modifier.padding(top = 12.dp),
                ) { Text(if (busy) "Reading…" else "Read the list") }

                Problem(problem)
            }
        }

        val shown = rows ?: return@AdminScaffold

        Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(Modifier.padding(16.dp)) {
                Text(
                    "${shown.size} line(s) read" +
                        (section?.let { "  ·  " + it.displayName } ?: "") +
                        if (taken > 0) "  ·  $taken already in this section" else "",
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(
                    listOfNotNull(
                        if (saved > 0) "$saved saved" else "$ready ready to save",
                        if (stopped > 0) "$stopped need fixing" else null,
                    ).joinToString("  ·  "),
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (stopped > 0) Bad else Muted,
                    modifier = Modifier.padding(top = 4.dp),
                )

                shown.forEach { s ->
                    Row(
                        Modifier.fillMaxWidth().padding(top = 10.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Text(
                            s.row.rollNo?.toString() ?: "—",
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.width(34.dp),
                        )
                        Column(Modifier.weight(1f)) {
                            Text(
                                s.row.fullName.ifBlank { "(no name)" },
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                            val also = listOf(
                                s.row.fatherName, s.row.motherName, s.row.mobileNo,
                                s.row.dob, s.row.bloodGroup, s.row.groupName, s.row.regNo,
                            ).filter { it.isNotBlank() }.joinToString(" · ")
                            if (also.isNotEmpty()) {
                                Text(also, style = MaterialTheme.typography.bodySmall, color = Muted)
                            }
                            when (s.state) {
                                RowState.STOPPED -> Text(
                                    "Line ${s.row.line}: ${s.row.problem}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Bad,
                                )
                                RowState.FAILED -> Text(
                                    "refused",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Bad,
                                )
                                RowState.SAVED -> Text(
                                    "saved as ${s.studentId}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Green,
                                )
                                RowState.READY -> if (s.row.note.isNotEmpty()) {
                                    Text(
                                        s.row.note,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = Muted,
                                    )
                                }
                            }
                        }
                    }
                    HorizontalDivider(color = LineSoft, modifier = Modifier.padding(top = 8.dp))
                }

                if (stopped > 0) {
                    Text(
                        "The $stopped line(s) in red will be left out. Correct them in the " +
                            "box above and read the list again.",
                        style = MaterialTheme.typography.bodySmall,
                        color = Muted,
                        modifier = Modifier.padding(top = 10.dp),
                    )
                }

                if (!done) {
                    Button(
                        enabled = !busy && ready > 0,
                        onClick = {
                            busy = true; problem = ""
                            scope.launch {
                                val out = shown.toMutableList()
                                var stop = false
                                for (i in out.indices) {
                                    if (stop || out[i].state != RowState.READY) continue
                                    val r = out[i].row
                                    try {
                                        // One at a time, deliberately: each save takes
                                        // the next student number from the counter, and
                                        // a counter read in parallel hands out the same
                                        // number twice.
                                        val id = admin.saveStudent(
                                            StudentDetail(
                                                studentId = "",
                                                fullName = r.fullName,
                                                rollNo = r.rollNo ?: 0L,
                                                regNo = r.regNo.ifBlank { null },
                                                classId = classId,
                                                className = "",
                                                section = "",
                                                groupName = r.groupName.ifBlank { null },
                                                gender = r.gender.ifBlank { null },
                                                dob = r.dob.ifBlank { null },
                                                fatherName = r.fatherName.ifBlank { null },
                                                motherName = r.motherName.ifBlank { null },
                                                bloodGroup = r.bloodGroup.ifBlank { null },
                                                mobileNo = r.mobileNo.ifBlank { null },
                                                status = "A",
                                            ),
                                            classes,
                                        )
                                        out[i] = out[i].copy(state = RowState.SAVED, studentId = id)
                                    } catch (_: Exception) {
                                        // Stop at the first refusal. Carrying on would
                                        // pile up forty identical failures and bury the
                                        // one line that says why.
                                        out[i] = out[i].copy(state = RowState.FAILED)
                                        problem = "That save was refused, so the rest were " +
                                            "left alone. Only the head or the office may " +
                                            "add students."
                                        stop = true
                                    }
                                    rows = out.toList()
                                }
                                rows = out.toList()
                                done = !stop
                                busy = false
                            }
                        },
                        modifier = Modifier.padding(top = 12.dp),
                    ) { Text(if (busy) "Saving…" else "Save $ready student(s)") }
                }

                if (done) {
                    Text(
                        "$saved student(s) added to ${section?.displayName.orEmpty()}. They are " +
                            "in the register now, so reading this same list again would add " +
                            "them a second time.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Green,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Button(
                            onClick = { text = ""; rows = null; done = false },
                            modifier = Modifier.padding(top = 10.dp),
                        ) { Text("Start another list") }
                        shown.firstOrNull { it.state == RowState.SAVED }?.let { first ->
                            Button(
                                onClick = { onOpen(first.studentId) },
                                modifier = Modifier.padding(top = 10.dp),
                            ) { Text("Open the first") }
                        }
                    }
                }

                Problem(problem)
            }
        }
    }
}
