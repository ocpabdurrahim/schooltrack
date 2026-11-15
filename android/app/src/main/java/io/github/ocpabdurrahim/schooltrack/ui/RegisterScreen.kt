package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
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
import io.github.ocpabdurrahim.schooltrack.data.AttendanceRepository
import io.github.ocpabdurrahim.schooltrack.data.RegisterRow
import io.github.ocpabdurrahim.schooltrack.data.SchoolClass
import io.github.ocpabdurrahim.schooltrack.data.Status
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RegisterScreen(
    email: String,
    canMark: Boolean,
    onBack: () -> Unit,
    repo: AttendanceRepository = remember { AttendanceRepository() },
) {
    val scope = rememberCoroutineScope()
    val today = remember { repo.todayInDhaka() }

    var classes by remember { mutableStateOf<List<SchoolClass>>(emptyList()) }
    var selected by remember { mutableStateOf<SchoolClass?>(null) }
    var rows by remember { mutableStateOf<List<RegisterRow>>(emptyList()) }
    var expanded by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        try {
            classes = repo.listClasses()
            selected = classes.firstOrNull()
        } catch (_: Exception) {
            problem = "Could not read the class list."
        }
    }

    LaunchedEffect(selected) {
        val cls = selected ?: return@LaunchedEffect
        busy = true
        problem = ""
        try {
            rows = repo.loadRegister(cls.classId, today)
        } catch (_: Exception) {
            problem = "Could not load the register."
        }
        busy = false
    }

    fun setStatus(row: RegisterRow, status: Status) {
        if (!canMark) return
        // optimistic: the row flips at once, and is put back if the write fails
        val before = rows
        rows = rows.map { if (it.student.studentId == row.student.studentId) it.copy(status = status, via = "MANUAL") else it }
        scope.launch {
            try {
                repo.openSession(today, email)
                repo.mark(row.student, today, status, "MANUAL", email)
            } catch (_: Exception) {
                rows = before
                problem = "That change was refused — attendance may still belong to the APEX app."
            }
        }
    }

    val present = rows.count { it.status == Status.P || it.status == Status.L }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("Today's register", style = MaterialTheme.typography.headlineSmall)
            androidx.compose.foundation.layout.Spacer(Modifier.weight(1f))
            TextButton(onClick = onBack) { Text("Back") }
        }
        Text(
            today + "  ·  " + present + " of " + rows.size + " present",
            style = MaterialTheme.typography.bodyMedium,
        )

        ExposedDropdownMenuBox(
            expanded = expanded,
            onExpandedChange = { expanded = !expanded },
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
        ) {
            OutlinedTextField(
                value = selected?.displayName ?: "",
                onValueChange = {},
                readOnly = true,
                label = { Text("Section") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
            )
            ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                classes.forEach { c ->
                    DropdownMenuItem(
                        text = { Text(c.displayName) },
                        onClick = { selected = c; expanded = false },
                    )
                }
            }
        }

        if (problem.isNotEmpty()) {
            Text(
                problem,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 12.dp),
            )
        }

        if (busy) {
            Text("Loading…", modifier = Modifier.padding(top = 16.dp))
        }

        LazyColumn(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            items(rows, key = { it.student.studentId }) { row ->
                Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            row.student.rollNo.toString(),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(end = 10.dp),
                        )
                        Text(row.student.fullName, style = MaterialTheme.typography.bodyLarge)
                        if (row.via == "SCAN") {
                            Text(
                                "  scanned",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.primary,
                            )
                        }
                    }
                    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(top = 4.dp)) {
                        Status.entries.forEachIndexed { index, status ->
                            SegmentedButton(
                                selected = row.status == status,
                                onClick = { setStatus(row, status) },
                                enabled = canMark,
                                shape = SegmentedButtonDefaults.itemShape(index, Status.entries.size),
                            ) { Text(status.name) }
                        }
                    }
                }
                HorizontalDivider()
            }
        }
    }
}
