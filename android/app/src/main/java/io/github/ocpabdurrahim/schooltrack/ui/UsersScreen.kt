package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import io.github.ocpabdurrahim.schooltrack.data.AdminRepository
import io.github.ocpabdurrahim.schooltrack.data.GuardianRow
import io.github.ocpabdurrahim.schooltrack.data.MemberRow
import io.github.ocpabdurrahim.schooltrack.data.PeopleRepository
import io.github.ocpabdurrahim.schooltrack.data.ROLES
import io.github.ocpabdurrahim.schooltrack.data.StudentDetail
import io.github.ocpabdurrahim.schooltrack.data.lockoutRisk
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val ROLE_TEXT = mapOf(
    "ADMIN" to "Administrator — everything, including permissions",
    "TEACHER" to "Teacher — attendance and student lookup",
    "ACCOUNTS" to "Accounts — fees and expenses",
    "OFFICE" to "Office — student records and documents",
)

/**
 * Who may sign in.
 *
 * Signing in grants nothing by itself: access comes from these two records,
 * and only an administrator may write them. Nothing here creates the Firebase
 * account — the person signs up themselves, with their own password, and
 * confirms their email address.
 */
@Composable
fun UsersScreen(
    onBack: () -> Unit,
    admin: AdminRepository = remember { AdminRepository() },
    people: PeopleRepository = remember { PeopleRepository() },
) {
    val scope = rememberCoroutineScope()
    var members by remember { mutableStateOf<List<MemberRow>>(emptyList()) }
    var guardians by remember { mutableStateOf<List<GuardianRow>>(emptyList()) }
    var m by remember { mutableStateOf(MemberRow("", "", "TEACHER", true)) }
    var g by remember { mutableStateOf(GuardianRow("", "", emptyList(), true)) }
    var children by remember { mutableStateOf<List<StudentDetail>>(emptyList()) }
    var search by remember { mutableStateOf("") }
    var found by remember { mutableStateOf<List<StudentDetail>>(emptyList()) }
    var busy by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf("") }

    suspend fun load() {
        members = try { admin.listMembers() } catch (_: Exception) { emptyList() }
        guardians = try { admin.listGuardians() } catch (_: Exception) { emptyList() }
        busy = false
    }

    LaunchedEffect(Unit) { load() }

    // the child picker searches only when asked, so typing an email costs nothing
    LaunchedEffect(search) {
        if (search.trim().length < 2) { found = emptyList(); return@LaunchedEffect }
        delay(250)
        found = try { people.findStudents(null, search).take(8) } catch (_: Exception) { emptyList() }
    }

    val refused = "That save was refused. Only an administrator may change who can sign in."

    AdminScaffold(
        "Who can sign in",
        "Access comes from these records, never from the account itself",
        onBack,
    ) {
        // ---- staff -------------------------------------------------------
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text("Staff access", style = MaterialTheme.typography.titleMedium)

                // Shown here rather than on the dashboard because the fix is
                // on this screen: whoever reads it can act on it without
                // going anywhere.
                val risk = lockoutRisk(members)
                if (risk.atRisk) {
                    Text(
                        (if (risk.admins == 1) "Only one person can get in. "
                         else "Nobody can grant access. ") + risk.warning,
                        style = MaterialTheme.typography.bodySmall,
                        color = Bad,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }

                members.forEach { row ->
                    Row(
                        Modifier.fillMaxWidth()
                            .clickable { m = row; problem = "" }
                            .padding(vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(row.name, style = MaterialTheme.typography.bodyLarge)
                            Text(
                                row.email + "  ·  " + (if (row.active) row.role else "no access"),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Text("edit", color = MaterialTheme.colorScheme.primary)
                    }
                    HorizontalDivider()
                }

                Field("Email", m.email) { m = m.copy(email = it) }
                Field("Name", m.name) { m = m.copy(name = it) }
                Picker("Role", ROLES.map { it to (ROLE_TEXT[it] ?: it) }, m.role) {
                    m = m.copy(role = it)
                }
                Row(
                    Modifier.fillMaxWidth().padding(top = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(checked = m.active, onCheckedChange = { m = m.copy(active = it) })
                    Text("Can sign in")
                }

                Button(
                    enabled = !busy,
                    onClick = {
                        if (!m.email.contains("@")) {
                            problem = "A member needs the email they sign in with."
                            return@Button
                        }
                        busy = true; problem = ""
                        scope.launch {
                            try {
                                admin.saveMember(m)
                                m = MemberRow("", "", "TEACHER", true)
                                load()
                            } catch (_: Exception) { problem = refused; busy = false }
                        }
                    },
                    modifier = Modifier.padding(top = 12.dp),
                ) { Text("Save staff access") }

                Text(
                    "Access is removed by unticking “can sign in”, not by deleting the " +
                        "record: their name stays readable on the attendance they marked.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }

        // ---- parents -----------------------------------------------------
        Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(Modifier.padding(16.dp)) {
                Text("Parent access", style = MaterialTheme.typography.titleMedium)

                guardians.forEach { row ->
                    Row(
                        Modifier.fillMaxWidth()
                            .clickable {
                                g = row
                                problem = ""
                                scope.launch {
                                    children = row.studentIds.mapNotNull {
                                        try { people.getStudent(it) } catch (_: Exception) { null }
                                    }
                                }
                            }
                            .padding(vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(row.name, style = MaterialTheme.typography.bodyLarge)
                            Text(
                                row.email + "  ·  " + row.studentIds.size + " linked" +
                                    (if (!row.active) "  ·  no access" else ""),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Text("edit", color = MaterialTheme.colorScheme.primary)
                    }
                    HorizontalDivider()
                }

                Field("Email", g.email) { g = g.copy(email = it) }
                Field("Name", g.name) { g = g.copy(name = it) }

                Text("Children", style = MaterialTheme.typography.labelMedium,
                     modifier = Modifier.padding(top = 12.dp))
                children.forEach { c ->
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            c.fullName + "  ·  " + c.className + " " + c.section,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Text(
                            "remove",
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.clickable {
                                g = g.copy(studentIds = g.studentIds - c.studentId)
                                children = children - c
                            },
                        )
                    }
                }

                Field("Search a student by name or roll", search) { search = it }
                found.forEach { s ->
                    Row(
                        Modifier.fillMaxWidth()
                            .clickable {
                                if (s.studentId !in g.studentIds) {
                                    g = g.copy(studentIds = g.studentIds + s.studentId)
                                    children = children + s
                                }
                                search = ""; found = emptyList()
                            }
                            .padding(vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            s.fullName + "  ·  " + s.className + " " + s.section +
                                "  ·  roll " + s.rollNo,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Text("add", color = MaterialTheme.colorScheme.primary)
                    }
                }

                Row(
                    Modifier.fillMaxWidth().padding(top = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(checked = g.active, onCheckedChange = { g = g.copy(active = it) })
                    Text("Can sign in")
                }

                Button(
                    enabled = !busy,
                    onClick = {
                        if (!g.email.contains("@")) {
                            problem = "A parent needs the email they sign in with."
                            return@Button
                        }
                        if (g.studentIds.isEmpty()) {
                            problem = "Link at least one student, or the parent sees nothing."
                            return@Button
                        }
                        busy = true; problem = ""
                        scope.launch {
                            try {
                                admin.saveGuardian(g)
                                g = GuardianRow("", "", emptyList(), true)
                                children = emptyList()
                                load()
                            } catch (_: Exception) { problem = refused; busy = false }
                        }
                    },
                    modifier = Modifier.padding(top = 12.dp),
                ) { Text("Save parent access") }

                if (g.email.isNotEmpty()) {
                    TextButton(onClick = {
                        g = GuardianRow("", "", emptyList(), true)
                        children = emptyList()
                    }) { Text("cancel") }
                }

                Text(
                    "A parent sees exactly the children listed here and nothing else.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
                Problem(problem)
            }
        }
    }
}
