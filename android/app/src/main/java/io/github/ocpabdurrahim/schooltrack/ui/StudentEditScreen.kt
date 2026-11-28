package io.github.ocpabdurrahim.schooltrack.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import io.github.ocpabdurrahim.schooltrack.data.AdminRepository
import io.github.ocpabdurrahim.schooltrack.data.ClassRow
import io.github.ocpabdurrahim.schooltrack.data.PeopleRepository
import io.github.ocpabdurrahim.schooltrack.data.PhotosRepository
import io.github.ocpabdurrahim.schooltrack.data.StudentDetail
import io.github.ocpabdurrahim.schooltrack.data.decodePhoto
import io.github.ocpabdurrahim.schooltrack.data.groupOptions
import io.github.ocpabdurrahim.schooltrack.data.normalGroup
import io.github.ocpabdurrahim.schooltrack.data.explainPrivilege
import io.github.ocpabdurrahim.schooltrack.data.normalPrivilege
import io.github.ocpabdurrahim.schooltrack.data.normalReligion
import io.github.ocpabdurrahim.schooltrack.data.privilegeOptions
import io.github.ocpabdurrahim.schooltrack.data.religionOptions
import io.github.ocpabdurrahim.schooltrack.data.uriToCardPhoto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private fun blank() = StudentDetail(
    studentId = "", fullName = "", rollNo = 0, regNo = null, classId = "",
    className = "", section = "", groupName = null, religion = null,
    privilege = "Regular", gender = null,
    dob = null,
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
    email: String = "",
    admin: AdminRepository = remember { AdminRepository() },
    people: PeopleRepository = remember { PeopleRepository() },
    photos: PhotosRepository = remember { PhotosRepository() },
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var form by remember { mutableStateOf(blank()) }
    var classes by remember { mutableStateOf<List<ClassRow>>(emptyList()) }
    var busy by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf("") }

    // The photo is held here until the record is saved, so backing out of a
    // half-finished form leaves nothing behind -- and so a NEW student gets
    // their picture filed under the number the save hands back.
    var photo by remember { mutableStateOf<String?>(null) }
    var photoChanged by remember { mutableStateOf(false) }
    var photoBusy by remember { mutableStateOf(false) }

    val pick = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        photoBusy = true
        problem = ""
        scope.launch {
            try {
                // off the main thread: decoding a 12-megapixel photo there
                // drops frames on a cheap handset
                photo = withContext(Dispatchers.Default) { uriToCardPhoto(context, uri) }
                photoChanged = true
            } catch (e: Exception) {
                problem = e.message ?: "That photo could not be read."
            }
            photoBusy = false
        }
    }

    LaunchedEffect(studentId) {
        try {
            // ALL classes, not only those in use: a student may sit in a section
            // that has since been retired, and dropping it here would silently
            // blank their section the next time anyone saved the record.
            classes = admin.listAllClasses()
            if (studentId.isNotEmpty()) {
                photo = runCatching { photos.get(studentId) }.getOrNull()
                val s = people.getStudent(studentId)
                if (s == null) {
                    problem = "No student with that number."
                } else {
                    // Through normalGroup, so a record written "commerce" by hand
                    // or by an older import arrives as one of the picker's own
                    // options. Left raw it would match none of them, the picker
                    // would read as none, and the next save would wipe the group.
                    form = s.copy(
                        groupName = normalGroup(s.groupName).ifEmpty { null },
                        religion = normalReligion(s.religion).ifEmpty { null },
                        // Blank reads as Regular: what every record written
                        // before this field existed means -- the full rate.
                        privilege = normalPrivilege(s.privilege),
                    )
                }
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
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier
                            .size(width = 72.dp, height = 90.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .border(
                                1.dp,
                                MaterialTheme.colorScheme.outlineVariant,
                                RoundedCornerShape(8.dp),
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        val shown = remember(photo) { photo?.let { decodePhoto(it) } }
                        when {
                            shown != null -> Image(
                                bitmap = shown.asImageBitmap(),
                                contentDescription = "Student photo",
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize(),
                            )
                            photoBusy -> Text("…", style = MaterialTheme.typography.bodySmall)
                            else -> Text(
                                "no photo",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }

                    Column(Modifier.padding(start = 12.dp)) {
                        TextButton(
                            enabled = !photoBusy,
                            onClick = {
                                pick.launch(
                                    PickVisualMediaRequest(
                                        ActivityResultContracts.PickVisualMedia.ImageOnly,
                                    ),
                                )
                            },
                        ) { Text(if (photo == null) "Choose photo" else "Change photo") }

                        if (photo != null) {
                            TextButton(onClick = { photo = null; photoChanged = true }) {
                                Text("Remove")
                            }
                        }
                    }
                }
                Text(
                    "The photo goes on the ID card, and is shrunk to card size as it is " +
                        "picked. It is kept apart from the record itself, so the student " +
                        "list does not drag it along.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 8.dp),
                )

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
                Picker(
                    "Group",
                    listOf("" to "— none —") +
                        groupOptions(form.groupName).map { it to it },
                    form.groupName.orEmpty(),
                ) { form = form.copy(groupName = it) }

                Picker(
                    "Religion",
                    listOf("" to "— none —") +
                        religionOptions(form.religion).map { it to it },
                    form.religion.orEmpty(),
                ) { form = form.copy(religion = it) }
                Text(
                    "The religion decides which religion paper this student sits. " +
                        "“Other” means neither. Left blank, the student is expected to " +
                        "sit both and their result stays unfinished.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Picker(
                    "Privilege",
                    privilegeOptions(form.privilege).map { it to it },
                    normalPrivilege(form.privilege),
                ) { form = form.copy(privilege = it) }
                Text(
                    normalPrivilege(form.privilege) + ": " +
                        explainPrivilege(form.privilege) + ". A privilege changes the " +
                        "tuition this student is charged from now on, every month -- it " +
                        "is not a discount on one receipt, and it never touches the " +
                        "session, exam or other fees. Receipts already written are left " +
                        "exactly as they were.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

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
                                val id = admin.saveStudent(form, classes)

                                // After the record, never before: a new
                                // student has no number to file a photo under
                                // until the save has handed one back.
                                if (photoChanged) {
                                    val jpeg = photo
                                    if (jpeg != null) photos.save(id, jpeg, email)
                                    else photos.remove(id)
                                }

                                onSaved(id)
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
