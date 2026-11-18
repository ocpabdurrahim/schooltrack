package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import io.github.ocpabdurrahim.schooltrack.data.AdminRepository
import io.github.ocpabdurrahim.schooltrack.data.ClassRow
import io.github.ocpabdurrahim.schooltrack.data.Editable
import io.github.ocpabdurrahim.schooltrack.data.Existing
import io.github.ocpabdurrahim.schooltrack.data.PeopleRepository
import io.github.ocpabdurrahim.schooltrack.data.StudentDetail
import io.github.ocpabdurrahim.schooltrack.data.Update
import io.github.ocpabdurrahim.schooltrack.data.matchByRoll
import io.github.ocpabdurrahim.schooltrack.data.parseStudentRows
import io.github.ocpabdurrahim.schooltrack.data.renames
import kotlinx.coroutines.launch

/**
 * A list that CORRECTS the students already here, matched by roll — the twin
 * of web/src/pages/StudentsUpdate.tsx.
 *
 * The other batch screen adds people. This one changes them, which is the job
 * nobody could do: a section is created from a spreadsheet, the office adds a
 * Group column to that same spreadsheet a week later, and the only way to get
 * 78 groups into the app is 78 visits to the edit form. So they never go in —
 * and a student with no group sits every paper in the class.
 *
 * Nothing here creates anybody. A roll this section does not have is reported
 * and skipped.
 */

private fun label(field: Editable) = when (field) {
    Editable.FULL_NAME -> "Name"
    Editable.REG_NO -> "Registration"
    Editable.GROUP_NAME -> "Group"
    Editable.RELIGION -> "Religion"
    Editable.GENDER -> "Gender"
    Editable.DOB -> "Date of birth"
    Editable.FATHER -> "Father"
    Editable.MOTHER -> "Mother"
    Editable.BLOOD -> "Blood group"
    Editable.MOBILE -> "Mobile"
}

private fun asExisting(s: StudentDetail) = Existing(
    studentId = s.studentId,
    rollNo = s.rollNo,
    fullName = s.fullName,
    regNo = s.regNo.orEmpty(),
    groupName = s.groupName.orEmpty(),
    religion = s.religion.orEmpty(),
    gender = s.gender.orEmpty(),
    dob = s.dob.orEmpty(),
    fatherName = s.fatherName.orEmpty(),
    motherName = s.motherName.orEmpty(),
    bloodGroup = s.bloodGroup.orEmpty(),
    mobileNo = s.mobileNo.orEmpty(),
)

private fun withChanges(s: StudentDetail, u: Update): StudentDetail {
    var out = s
    for (c in u.changes) {
        out = when (c.field) {
            Editable.FULL_NAME -> out.copy(fullName = c.to)
            Editable.REG_NO -> out.copy(regNo = c.to)
            Editable.GROUP_NAME -> out.copy(groupName = c.to)
            Editable.RELIGION -> out.copy(religion = c.to)
            Editable.GENDER -> out.copy(gender = c.to)
            Editable.DOB -> out.copy(dob = c.to)
            Editable.FATHER -> out.copy(fatherName = c.to)
            Editable.MOTHER -> out.copy(motherName = c.to)
            Editable.BLOOD -> out.copy(bloodGroup = c.to)
            Editable.MOBILE -> out.copy(mobileNo = c.to)
        }
    }
    return out
}

@Composable
fun StudentsUpdateScreen(
    onBack: () -> Unit,
    admin: AdminRepository = remember { AdminRepository() },
    people: PeopleRepository = remember { PeopleRepository() },
) {
    val scope = rememberCoroutineScope()
    var classes by remember { mutableStateOf<List<ClassRow>>(emptyList()) }
    var classId by remember { mutableStateOf("") }
    var text by remember { mutableStateOf("") }
    var fromFile by remember { mutableStateOf("") }
    var here by remember { mutableStateOf<List<StudentDetail>>(emptyList()) }
    var rows by remember { mutableStateOf<List<Update>?>(null) }
    var savedIds by remember { mutableStateOf<Set<String>>(emptySet()) }
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

    val pickFile = rememberSheetPicker(
        onText = { name, loaded ->
            text = loaded; fromFile = name; rows = null; done = false; problem = ""
        },
        onProblem = { problem = it; fromFile = "" },
    )

    val section = classes.firstOrNull { it.classId == classId }
    val willChange = rows?.count { it.studentId != null && it.changes.isNotEmpty() } ?: 0
    val alreadyRight = rows?.count { it.studentId != null && it.changes.isEmpty() } ?: 0
    val notFound = rows?.count { it.studentId == null } ?: 0
    val renaming = rows?.let { renames(it) } ?: 0

    AdminScaffold(
        title = "Update from a list",
        subtitle = "Matched by roll — nothing new is created",
        onBack = onBack,
    ) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Picker(
                    "Section",
                    classes.filter { it.active }.map { it.classId to it.displayName },
                    classId,
                ) { classId = it; rows = null; done = false }

                OutlinedButton(
                    onClick = pickFile,
                    modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                ) {
                    Text(
                        if (fromFile.isBlank()) "Choose an Excel or CSV file"
                        else "Choose another file",
                    )
                }

                OutlinedTextField(
                    value = text,
                    onValueChange = { text = it; fromFile = "" },
                    label = {
                        Text(if (fromFile.isBlank()) "The list" else "The list · $fromFile")
                    },
                    singleLine = false,
                    minLines = 5,
                    textStyle = MaterialTheme.typography.bodyMedium
                        .copy(fontFamily = FontFamily.Monospace),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Text,
                        imeAction = ImeAction.Default,
                    ),
                    modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                )

                Text(
                    "Put a heading line at the top so the columns can be named — " +
                        "\"roll, group\" is enough to record a whole section's streams, and " +
                        "\"roll, religion\" for the religion papers. Every line must carry " +
                        "the roll: that is what finds the student. A column you leave out " +
                        "is left alone, so the same file can be read twice without harm.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Muted,
                    modifier = Modifier.padding(top = 10.dp),
                )

                Button(
                    enabled = !busy && classId.isNotBlank(),
                    onClick = {
                        problem = ""; done = false; busy = true
                        scope.launch {
                            try {
                                val roll = people.findStudents(classId, "")
                                here = roll
                                // nameRequired false: "Roll, Group" is a complete
                                // instruction when the student already exists.
                                val got = matchByRoll(
                                    parseStudentRows(text, false),
                                    roll.map(::asExisting),
                                )
                                rows = if (got.isEmpty()) {
                                    problem = "There is nothing in the box."
                                    null
                                } else {
                                    savedIds = emptySet()
                                    got
                                }
                            } catch (_: Exception) {
                                problem = "Could not read this section."
                            }
                            busy = false
                        }
                    },
                    modifier = Modifier.padding(top = 12.dp),
                ) { Text(if (busy) "Reading…" else "Read the list") }

                Problem(problem)
            }
        }

        val shown = rows
        if (shown != null) {
            Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text(
                        shown.size.toString() + " line(s) read · " +
                            (section?.displayName ?: ""),
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        willChange.toString() + " will change · " + alreadyRight +
                            " already right · " + notFound + " not found here",
                        style = MaterialTheme.typography.bodySmall,
                        color = Muted,
                    )

                    if (renaming > 2 && !done) {
                        Problem(
                            renaming.toString() + " of these lines would change a " +
                                "student's NAME. One or two are corrections; this many " +
                                "usually means the list belongs to another section.",
                        )
                    }

                    shown.forEach { u ->
                        val found = here.firstOrNull { it.studentId == u.studentId }
                        Row(
                            Modifier.fillMaxWidth().padding(top = 8.dp),
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    "Roll " + (u.row.rollNo?.toString() ?: "—") + " · " +
                                        (found?.fullName ?: "—"),
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                                if (u.problem.isNotEmpty()) {
                                    Text(
                                        u.problem,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.error,
                                    )
                                } else if (u.changes.isEmpty()) {
                                    Text(
                                        "nothing to change",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = Muted,
                                    )
                                } else {
                                    u.changes.forEach { c ->
                                        Text(
                                            label(c.field) + ": " +
                                                c.from.ifBlank { "not set" } + " → " + c.to,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = Muted,
                                        )
                                    }
                                }
                            }
                            if (u.studentId != null && u.studentId in savedIds) {
                                Text(
                                    "updated",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.primary,
                                )
                            }
                        }
                        HorizontalDivider(Modifier.padding(top = 6.dp))
                    }

                    if (!done) {
                        Button(
                            enabled = !busy && willChange > 0,
                            onClick = {
                                busy = true; problem = ""
                                scope.launch {
                                    val ok = savedIds.toMutableSet()
                                    try {
                                        for (u in shown) {
                                            val id = u.studentId ?: continue
                                            if (u.changes.isEmpty()) continue
                                            val found =
                                                here.firstOrNull { it.studentId == id }
                                                    ?: continue
                                            admin.saveStudent(withChanges(found, u), classes)
                                            ok.add(id)
                                        }
                                        savedIds = ok
                                        done = true
                                    } catch (_: Exception) {
                                        savedIds = ok
                                        problem = "That save was refused, so the rest " +
                                            "were left alone. Only the head or the " +
                                            "office may change students."
                                    }
                                    busy = false
                                }
                            },
                            modifier = Modifier.padding(top = 12.dp),
                        ) { Text(if (busy) "Saving…" else "Update " + willChange + " student(s)") }
                    } else {
                        Text(
                            savedIds.size.toString() + " student(s) updated.",
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.padding(top = 12.dp),
                        )
                    }
                }
            }
        }
    }
}
