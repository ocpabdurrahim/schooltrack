package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
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
import androidx.compose.ui.unit.dp
import io.github.ocpabdurrahim.schooltrack.data.AdminRepository
import io.github.ocpabdurrahim.schooltrack.data.ClassRow
import io.github.ocpabdurrahim.schooltrack.data.PeopleRepository
import io.github.ocpabdurrahim.schooltrack.data.StudentDetail
import kotlinx.coroutines.launch

private fun blank() = StudentDetail(
    studentId = "", fullName = "", rollNo = 0, regNo = null, classId = "",
    className = "", section = "", groupName = null, gender = null, dob = null,
    fatherName = null, motherName = null, bloodGroup = null, mobileNo = null,
    status = "A",
)

/**
 * Add or edit one student. An empty [studentId] means a new record, and the
 * student number is then handed out by the counter when it is saved — never
 * guessed here, because that number becomes the QR code on the ID card.
 */
@Composable
fun StudentEditScreen(
    studentId: String,
    onSaved: (String) -> Unit,
    onBack: () -> Unit,
    admin: AdminRepository = remember { AdminRepository() },
    people: PeopleRepository = remember { PeopleRepository() },
) {
    val scope = rememberCoroutineScope()
    var form by remember { mutableStateOf(blank()) }
    var classes by remember { mutableStateOf<List<ClassRow>>(emptyList()) }
    var busy by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf("") }

    LaunchedEffect(studentId) {
        try {
            // ALL classes, not only those in use: a student may sit in a section
            // that has since been retired, and dropping it here would silently
            // blank their section the next time anyone saved the record.
            classes = admin.listAllClasses()
            if (studentId.isNotEmpty()) {
                val s = people.getStudent(studentId)
                if (s == null) problem = "No student with that number." else form = s
            } else {
                classes.firstOrNull { it.active }?.let { form = form.copy(classId = it.classId) }
            }
        } catch (_: Exception) {
            problem = "Could not load this screen."
        }
        busy = false
    }

    AdminScaffold(
        title = if (studentId.isEmpty()) "New student" else "Edit student",
        subtitle = if (studentId.isEmpty()) {
            "The student number is given automatically and becomes the QR code"
        } else {
            "Card code SMS-STU-$studentId"
        },
        onBack = onBack,
    ) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Field("Full name", form.fullName) { form = form.copy(fullName = it) }
                // Shown empty rather than "0" on a new record: a prefilled zero
                // has to be deleted before every single student is typed in.
                Field(
                    "Roll",
                    if (form.rollNo == 0L) "" else form.rollNo.toString(),
                    numeric = true,
                ) { form = form.copy(rollNo = it.toLongOrNull() ?: 0L) }

                Picker(
                    "Section",
                    classes
                        .filter { it.active || it.classId == form.classId }
                        .map { it.classId to it.displayName + if (!it.active) " (retired)" else "" },
                    form.classId,
                ) { form = form.copy(classId = it) }

                Field("Registration no.", form.regNo.orEmpty()) { form = form.copy(regNo = it) }
                Field("Group", form.groupName.orEmpty()) { form = form.copy(groupName = it) }

                Picker(
                    "Gender",
                    listOf("" to "—", "M" to "Male", "F" to "Female"),
                    form.gender.orEmpty(),
                ) { form = form.copy(gender = it) }

                Field("Date of birth (YYYY-MM-DD)", form.dob.orEmpty()) { form = form.copy(dob = it) }
                Field("Blood group", form.bloodGroup.orEmpty()) { form = form.copy(bloodGroup = it) }
                Field("Father's name", form.fatherName.orEmpty()) { form = form.copy(fatherName = it) }
                Field("Mother's name", form.motherName.orEmpty()) { form = form.copy(motherName = it) }
                Field("Guardian's mobile", form.mobileNo.orEmpty()) { form = form.copy(mobileNo = it) }

                Picker(
                    "Status",
                    listOf("A" to "Studying", "I" to "Left"),
                    form.status,
                ) { form = form.copy(status = it) }

                Text(
                    "A student who leaves is marked Left rather than removed: their " +
                        "attendance and documents all point at this record.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 12.dp),
                )

                Button(
                    enabled = !busy,
                    onClick = {
                        if (form.fullName.isBlank()) {
                            problem = "A student needs a name."
                            return@Button
                        }
                        if (form.classId.isBlank()) {
                            problem = "Pick a section. If there are none, add one first."
                            return@Button
                        }
                        busy = true; problem = ""
                        scope.launch {
                            try {
                                onSaved(admin.saveStudent(form, classes))
                            } catch (_: Exception) {
                                problem = REFUSED
                                busy = false
                            }
                        }
                    },
                    modifier = Modifier.padding(top = 12.dp),
                ) { Text(if (busy) "Saving…" else "Save student") }

                TextButton(onClick = onBack) { Text("cancel") }
                Problem(problem)
            }
        }
    }
}
