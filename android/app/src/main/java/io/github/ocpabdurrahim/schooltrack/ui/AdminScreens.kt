package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import io.github.ocpabdurrahim.schooltrack.data.AdminRepository
import io.github.ocpabdurrahim.schooltrack.data.ClassRow
import io.github.ocpabdurrahim.schooltrack.data.SchoolSettings
import io.github.ocpabdurrahim.schooltrack.data.STAFF_STATUS
import io.github.ocpabdurrahim.schooltrack.data.StaffRow
import io.github.ocpabdurrahim.schooltrack.data.classIdFor
import kotlinx.coroutines.launch

/** The message every refused write gets. */
const val REFUSED = "That save was refused. Your account may not change this."

@Composable
fun AdminScaffold(
    title: String,
    subtitle: String?,
    onBack: () -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(title, style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.weight(1f))
            TextButton(onClick = onBack) { Text("Back") }
        }
        if (subtitle != null) {
            Text(
                subtitle,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 8.dp),
            )
        }
        content()
        Spacer(Modifier.padding(bottom = 24.dp))
    }
}

@Composable
// The lambda comes LAST on purpose: a trailing lambda binds to the final
// parameter, so putting `modifier` after it made every call site bind the
// lambda to the modifier instead.
fun Field(
    label: String,
    value: String,
    numeric: Boolean = false,
    modifier: Modifier = Modifier,
    onChange: (String) -> Unit,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(
            keyboardType = if (numeric) KeyboardType.Number else KeyboardType.Text,
            imeAction = ImeAction.Next,
        ),
        modifier = modifier.fillMaxWidth().padding(top = 8.dp),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Picker(
    label: String,
    options: List<Pair<String, String>>,   // value to shown text
    selected: String,
    modifier: Modifier = Modifier,
    onPick: (String) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(
        expanded = open,
        onExpandedChange = { open = !open },
        modifier = modifier.fillMaxWidth().padding(top = 8.dp),
    ) {
        OutlinedTextField(
            value = options.firstOrNull { it.first == selected }?.second ?: "",
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = open) },
            modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
        )
        ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEach { (value, text) ->
                DropdownMenuItem(text = { Text(text) }, onClick = { onPick(value); open = false })
            }
        }
    }
}

@Composable
fun Problem(text: String) {
    if (text.isNotEmpty()) {
        Text(
            text,
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(top = 10.dp),
        )
    }
}

// ===========================================================================
// school setup + ownership

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SchoolSetupScreen(
    onBack: () -> Unit,
    repo: AdminRepository = remember { AdminRepository() },
) {
    val scope = rememberCoroutineScope()
    var s by remember { mutableStateOf(SchoolSettings()) }
    var busy by remember { mutableStateOf(true) }
    var note by remember { mutableStateOf("") }
    var problem by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        repo.getSettings()?.let { s = it }
        busy = false
    }

    val days = listOf("SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT")

    AdminScaffold("School setup", "The name and session shown on every screen", onBack) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Field("School name", s.instituteName) { s = s.copy(instituteName = it) }
                Field("Session", s.sessionLabel.orEmpty()) { s = s.copy(sessionLabel = it) }
                Field("Address", s.address.orEmpty()) { s = s.copy(address = it) }
                Field("EIIN", s.eiin.orEmpty()) { s = s.copy(eiin = it) }
                Field("Head teacher", s.headTeacher.orEmpty()) { s = s.copy(headTeacher = it) }

                Text("Weekend days", style = MaterialTheme.typography.labelMedium,
                     modifier = Modifier.padding(top = 14.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    days.forEach { d ->
                        FilterChip(
                            selected = d in s.weekendDays,
                            onClick = {
                                s = s.copy(
                                    weekendDays = if (d in s.weekendDays) s.weekendDays - d
                                    else s.weekendDays + d,
                                )
                            },
                            label = { Text(d) },
                        )
                    }
                }

                Button(
                    enabled = !busy,
                    onClick = {
                        busy = true; note = ""; problem = ""
                        scope.launch {
                            try { repo.saveSettings(s); note = "Saved." }
                            catch (_: Exception) { problem = REFUSED }
                            busy = false
                        }
                    },
                    modifier = Modifier.padding(top = 14.dp),
                ) { Text(if (busy) "Savingâ€¦" else "Save settings") }

                if (note.isNotEmpty()) {
                    Text(note, color = MaterialTheme.colorScheme.primary,
                         modifier = Modifier.padding(top = 8.dp))
                }
                Problem(problem)
            }
        }
    }
}

// ===========================================================================
// classes

@Composable
fun ClassesScreen(
    onBack: () -> Unit,
    repo: AdminRepository = remember { AdminRepository() },
) {
    val scope = rememberCoroutineScope()
    var rows by remember { mutableStateOf<List<ClassRow>>(emptyList()) }
    var editingId by remember { mutableStateOf<String?>(null) }
    var className by remember { mutableStateOf("") }
    var section by remember { mutableStateOf("") }
    var order by remember { mutableStateOf("0") }
    var active by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf("") }

    suspend fun load() {
        rows = try { repo.listAllClasses() } catch (_: Exception) { emptyList() }
        busy = false
    }

    LaunchedEffect(Unit) { load() }

    fun clear() {
        editingId = null; className = ""; section = ""
        order = ((rows.lastOrNull()?.sortOrder ?: 0L) + 1).toString(); active = true
    }

    AdminScaffold(
        "Classes and sections",
        if (busy) "Workingâ€¦" else "${rows.size} section(s)",
        onBack,
    ) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                rows.forEach { c ->
                    Row(
                        Modifier.fillMaxWidth()
                            .clickable {
                                editingId = c.classId
                                className = c.className; section = c.section
                                order = c.sortOrder.toString(); active = c.active
                                problem = ""
                            }
                            .padding(vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column {
                            Text(c.displayName, style = MaterialTheme.typography.bodyLarge)
                            Text(
                                c.classId + (if (!c.active) "  Â·  retired" else ""),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Text("edit", color = MaterialTheme.colorScheme.primary)
                    }
                    HorizontalDivider()
                }
                if (!busy && rows.isEmpty()) {
                    Text(
                        "No sections yet. Students cannot be added until a section " +
                            "exists to put them in.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }

        Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(Modifier.padding(16.dp)) {
                Text(
                    if (editingId != null) "Edit section" else "New section",
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(
                    editingId ?: classIdFor(className, section).ifBlank {
                        "the id is made from the name"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Field("Class name", className) { className = it }
                Field("Section", section) { section = it }
                Field("Order", order, numeric = true) { order = it }

                Row(
                    Modifier.fillMaxWidth().padding(top = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(checked = active, onCheckedChange = { active = it })
                    Text("In use")
                }

                Button(
                    enabled = !busy,
                    onClick = {
                        if (className.isBlank() || section.isBlank()) {
                            problem = "A class needs both a name and a section."
                            return@Button
                        }
                        val id = editingId ?: classIdFor(className, section)
                        if (editingId == null && rows.any { it.classId == id }) {
                            problem = "There is already a section with the id $id."
                            return@Button
                        }
                        busy = true; problem = ""
                        scope.launch {
                            try {
                                repo.saveClass(
                                    ClassRow(
                                        classId = id,
                                        className = className,
                                        section = section,
                                        displayName = "",
                                        sortOrder = order.toLongOrNull() ?: 0L,
                                        active = active,
                                    ),
                                )
                                clear()
                                load()
                            } catch (_: Exception) {
                                problem = REFUSED
                                busy = false
                            }
                        }
                    },
                    modifier = Modifier.padding(top = 12.dp),
                ) { Text(if (busy) "Savingâ€¦" else "Save section") }

                if (editingId != null) {
                    TextButton(onClick = { clear(); problem = "" }) { Text("cancel") }
                }
                Problem(problem)
            }
        }
    }
}

// ===========================================================================
// staff register

@Composable
fun StaffScreen(
    onBack: () -> Unit,
    repo: AdminRepository = remember { AdminRepository() },
) {
    val scope = rememberCoroutineScope()
    var rows by remember { mutableStateOf<List<StaffRow>>(emptyList()) }
    var form by remember { mutableStateOf(StaffRow(staffId = "", fullName = "")) }
    var busy by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf("") }

    suspend fun load() {
        rows = try {
            repo.listStaff()
        } catch (_: Exception) {
            problem = "Could not read the staff list â€” it is visible to the head, " +
                "the accounts user and the office only."
            emptyList()
        }
        busy = false
    }

    LaunchedEffect(Unit) { load() }

    AdminScaffold("Staff", if (busy) "Workingâ€¦" else "${rows.size} record(s)", onBack) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                rows.forEach { p ->
                    Row(
                        Modifier.fillMaxWidth()
                            .clickable { form = p; problem = "" }
                            .padding(vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column {
                            Text(p.fullName, style = MaterialTheme.typography.bodyLarge)
                            Text(
                                listOfNotNull(
                                    p.designation,
                                    if (p.staffStatus != "ACTIVE") p.staffStatus else null,
                                ).joinToString("  Â·  "),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Text("edit", color = MaterialTheme.colorScheme.primary)
                    }
                    HorizontalDivider()
                }
                if (!busy && rows.isEmpty()) Text("No staff records yet.")
            }
        }

        Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(Modifier.padding(16.dp)) {
                Text(
                    if (form.staffId.isNotEmpty()) "Edit staff member" else "New staff member",
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(
                    "This is the staff register. Letting someone sign in is a separate " +
                        "step, on the Users screen.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Field("Full name", form.fullName) { form = form.copy(fullName = it) }
                Field("Designation", form.designation.orEmpty()) { form = form.copy(designation = it) }
                Field("Mobile", form.mobileNo.orEmpty()) { form = form.copy(mobileNo = it) }
                Field("Joined (YYYY-MM-DD)", form.joinDate.orEmpty()) { form = form.copy(joinDate = it) }

                Picker(
                    "Status",
                    STAFF_STATUS.map { it to it.lowercase().replace('_', ' ') },
                    form.staffStatus,
                ) { form = form.copy(staffStatus = it) }

                Button(
                    enabled = !busy,
                    onClick = {
                        if (form.fullName.isBlank()) {
                            problem = "A staff record needs a name."
                            return@Button
                        }
                        busy = true; problem = ""
                        scope.launch {
                            try {
                                repo.saveStaff(form)
                                form = StaffRow(staffId = "", fullName = "")
                                load()
                            } catch (_: Exception) {
                                problem = REFUSED
                                busy = false
                            }
                        }
                    },
                    modifier = Modifier.padding(top = 12.dp),
                ) { Text(if (busy) "Savingâ€¦" else "Save staff member") }

                if (form.staffId.isNotEmpty()) {
                    TextButton(onClick = { form = StaffRow(staffId = "", fullName = "") }) {
                        Text("cancel")
                    }
                }
                Problem(problem)
            }
        }
    }
}
