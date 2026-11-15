package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import io.github.ocpabdurrahim.schooltrack.data.Access
import io.github.ocpabdurrahim.schooltrack.data.PeopleRepository
import io.github.ocpabdurrahim.schooltrack.data.SchoolStats
import kotlinx.coroutines.launch

@Composable
fun LoadingScreen() {
    Column(
        Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) { CircularProgressIndicator() }
}

@Composable
fun SignInScreen(onSignIn: suspend (String, String) -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("SchoolTrack", style = MaterialTheme.typography.headlineMedium)
        Text("Matkhola ML High School", style = MaterialTheme.typography.bodyMedium)

        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Email,
                imeAction = ImeAction.Next,
            ),
            modifier = Modifier.fillMaxWidth().padding(top = 24.dp),
        )
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Password,
                imeAction = ImeAction.Done,
            ),
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        )

        Button(
            enabled = !busy,
            onClick = {
                busy = true
                error = ""
                scope.launch {
                    try {
                        onSignIn(email, password)
                    } catch (_: Exception) {
                        // One message for every failure: naming the reason
                        // would tell a stranger which addresses exist.
                        error = "That email and password did not match."
                        busy = false
                    }
                }
            },
            modifier = Modifier.padding(top = 16.dp),
        ) { Text(if (busy) "Signing in..." else "Sign in") }

        if (error.isNotEmpty()) {
            Text(
                error,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 12.dp),
            )
        }
    }
}

@Composable
fun HomeScreen(
    access: Access,
    onOpenRegister: () -> Unit,
    onOpenScan: () -> Unit,
    onOpenStudents: () -> Unit,
    onOpenChildren: () -> Unit,
    onSignOut: () -> Unit,
    people: PeopleRepository = remember { PeopleRepository() },
) {
    var stats by remember { mutableStateOf<SchoolStats?>(null) }

    LaunchedEffect(access) {
        if (access is Access.Staff) {
            stats = try {
                people.schoolStats()
            } catch (_: Exception) {
                null
            }
        }
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
    ) {
        Text("SchoolTrack", style = MaterialTheme.typography.headlineSmall)
        Text(
            "Matkhola ML High School",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Card(Modifier.fillMaxWidth().padding(top = 16.dp)) {
            Column(Modifier.padding(16.dp)) {
                when (access) {
                    is Access.Staff -> {
                        Text(access.name, style = MaterialTheme.typography.titleMedium)
                        InfoRow("Account", access.email)
                        InfoRow("Access", access.role)
                    }
                    is Access.Guardian -> {
                        Text(access.name, style = MaterialTheme.typography.titleMedium)
                        InfoRow("Account", access.email)
                        InfoRow(
                            "Access",
                            access.studentIds.size.toString() +
                                (if (access.studentIds.size == 1) " student" else " students"),
                        )
                    }
                    is Access.None -> {
                        Text("No access granted", style = MaterialTheme.typography.titleMedium)
                        Text(
                            "Your sign-in worked, but nobody has been given access under " +
                                access.email + ". An administrator has to add you first.",
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                    }
                    else -> Unit
                }

                if (access is Access.Staff) {
                    Button(
                        onClick = onOpenRegister,
                        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                    ) { Text("Today's register") }
                    Button(
                        onClick = onOpenScan,
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    ) { Text("Scan at the gate") }
                    Button(
                        onClick = onOpenStudents,
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    ) { Text("Students") }
                }

                if (access is Access.Guardian) {
                    Button(
                        onClick = onOpenChildren,
                        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                    ) { Text("My children") }
                }

                TextButton(
                    onClick = onSignOut,
                    modifier = Modifier.padding(top = 8.dp),
                ) { Text("Sign out") }
            }
        }

        if (access is Access.Staff) {
            DashboardCard(stats)
        }

        Text(
            "Fees, results, certificates and payroll are still kept in the APEX " +
                "app. SchoolTrack owns attendance.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 16.dp, bottom = 24.dp),
        )
    }
}

/**
 * Every figure stands on its own and a missing one prints as a dash. A teacher
 * is not allowed to read `staff`, and that refusal must not blank the card nor
 * be reported as a lack of access.
 */
@Composable
private fun DashboardCard(stats: SchoolStats?) {
    Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
        Column(Modifier.padding(16.dp)) {
            Text("At a glance", style = MaterialTheme.typography.titleMedium)

            if (stats == null) {
                Text("Loading…", modifier = Modifier.padding(top = 12.dp))
                return@Column
            }

            val n = { v: Int? -> v?.toString() ?: "–" }

            Row(
                Modifier.fillMaxWidth().padding(top = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Tile(n(stats.students), "students")
                Tile(n(stats.classes), "sections")
                Tile(n(stats.staff), "staff")
            }

            HorizontalDivider(Modifier.padding(vertical = 14.dp))

            Text("Today", style = MaterialTheme.typography.labelMedium)
            if (!stats.takenToday && stats.markedToday == 0) {
                Text(
                    "Attendance has not been taken yet today.",
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(top = 6.dp),
                )
            } else {
                Row(
                    Modifier.fillMaxWidth().padding(top = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Tile(n(stats.presentToday), "present")
                    Tile(n(stats.markedToday), "marked")
                    Tile(
                        if (stats.presentToday != null && stats.markedToday != null &&
                            stats.markedToday > 0
                        ) {
                            (stats.presentToday * 100 / stats.markedToday).toString() + "%"
                        } else {
                            "–"
                        },
                        "of marked",
                    )
                }
            }
        }
    }
}

@Composable
private fun Tile(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.headlineSmall)
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        Modifier.fillMaxWidth().padding(top = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium)
        Text(value, style = MaterialTheme.typography.bodyMedium)
    }
}
