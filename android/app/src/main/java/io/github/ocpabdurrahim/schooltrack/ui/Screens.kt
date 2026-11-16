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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import io.github.ocpabdurrahim.schooltrack.data.Access
import io.github.ocpabdurrahim.schooltrack.data.AdminRepository
import io.github.ocpabdurrahim.schooltrack.data.PeopleRepository
import io.github.ocpabdurrahim.schooltrack.data.SchoolStats
import io.github.ocpabdurrahim.schooltrack.data.canCollectFees
import io.github.ocpabdurrahim.schooltrack.data.canEditStudents
import io.github.ocpabdurrahim.schooltrack.data.isAdmin
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
fun SignInScreen(
    onSignIn: suspend (String, String) -> Boolean,
    onSignUp: suspend (String, String) -> Unit,
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var signingUp by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("SchoolTrack", style = MaterialTheme.typography.headlineMedium)
        Text(
            if (signingUp) "Create your account" else "Sign in to continue",
            style = MaterialTheme.typography.bodyMedium,
        )

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
                note = ""
                scope.launch {
                    try {
                        if (signingUp) {
                            onSignUp(email, password)
                            signingUp = false
                            note = "Account created. Confirm your email address using the " +
                                "link we just sent, then sign in. An administrator still has " +
                                "to grant you access before you can see anything."
                            busy = false
                        } else if (!onSignIn(email, password)) {
                            note = "Confirm your email address first — check your inbox " +
                                "for the link, then sign in again."
                            busy = false
                        }
                    } catch (_: Exception) {
                        // One message for every sign-in failure: naming the reason
                        // would tell a stranger which addresses exist.
                        error = if (signingUp) {
                            "That account could not be created. It may already exist, " +
                                "or the password may be too short."
                        } else {
                            "That email and password did not match."
                        }
                        busy = false
                    }
                }
            },
            modifier = Modifier.padding(top = 16.dp),
        ) {
            Text(
                when {
                    busy && signingUp -> "Creating…"
                    busy -> "Signing in…"
                    signingUp -> "Create account"
                    else -> "Sign in"
                },
            )
        }

        TextButton(
            onClick = { signingUp = !signingUp; error = ""; note = "" },
            modifier = Modifier.padding(top = 4.dp),
        ) {
            Text(if (signingUp) "I already have an account" else "First time here? Create an account")
        }

        if (error.isNotEmpty()) {
            Text(
                error,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 12.dp),
            )
        }
        if (note.isNotEmpty()) {
            Text(
                note,
                color = MaterialTheme.colorScheme.primary,
                style = MaterialTheme.typography.bodyMedium,
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
    onOpen: (Screen) -> Unit,
    onSignOut: () -> Unit,
    people: PeopleRepository = remember { PeopleRepository() },
    admin: AdminRepository = remember { AdminRepository() },
) {
    var stats by remember { mutableStateOf<SchoolStats?>(null) }
    var schoolName by remember { mutableStateOf("") }

    LaunchedEffect(access) {
        // The name comes from settings/school, which an administrator edits in
        // the app. Nothing is hardcoded: this app is no longer tied to one school.
        schoolName = admin.getSettings()?.instituteName.orEmpty()
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
        if (schoolName.isNotEmpty()) {
            Text(
                schoolName,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

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

                    HorizontalDivider(Modifier.padding(top = 16.dp, bottom = 4.dp))
                    Text(
                        "Attendance reports",
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.padding(bottom = 4.dp),
                    )
                    OutlinedButton(
                        onClick = { onOpen(Screen.MonthlySheet) },
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    ) { Text("Monthly sheet") }
                    OutlinedButton(
                        onClick = { onOpen(Screen.LowAttendance) },
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    ) { Text("Low attendance") }
                    if (access.isAdmin) {
                        OutlinedButton(
                            onClick = { onOpen(Screen.HolidayCalendar) },
                            modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                        ) { Text("Holidays") }
                    }
                }

                if (access is Access.Guardian) {
                    Button(
                        onClick = onOpenChildren,
                        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                    ) { Text("My children") }
                }

                if (access is Access.Staff) {
                    HorizontalDivider(Modifier.padding(top = 16.dp, bottom = 4.dp))
                    Text(
                        "Exams",
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.padding(bottom = 4.dp),
                    )
                    OutlinedButton(
                        onClick = { onOpen(Screen.MarkEntry) },
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    ) { Text("Mark entry") }
                    OutlinedButton(
                        onClick = { onOpen(Screen.Results) },
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    ) { Text("Result sheet") }
                    OutlinedButton(
                        onClick = { onOpen(Screen.SeatPlan) },
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    ) { Text("Seat plan") }
                    if (access.canEditStudents) {
                        OutlinedButton(
                            onClick = { onOpen(Screen.AdmitCards) },
                            modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                        ) { Text("Admit cards") }
                    }
                    if (access.isAdmin) {
                        OutlinedButton(
                            onClick = { onOpen(Screen.Routine) },
                            modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                        ) { Text("Exam routine") }
                        OutlinedButton(
                            onClick = { onOpen(Screen.ExamSetup) },
                            modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                        ) { Text("Exams and subjects") }
                    }
                }

                if (access.canEditStudents) {
                    HorizontalDivider(Modifier.padding(top = 16.dp, bottom = 4.dp))
                    Text(
                        "Documents",
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.padding(bottom = 4.dp),
                    )
                    OutlinedButton(
                        onClick = { onOpen(Screen.Certificates) },
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    ) { Text("Certificates") }
                }

                if (access.canCollectFees) {
                    HorizontalDivider(Modifier.padding(top = 16.dp, bottom = 4.dp))
                    Text(
                        "Fees",
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.padding(bottom = 4.dp),
                    )
                    Button(
                        onClick = { onOpen(Screen.Collect) },
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    ) { Text("Collect fee") }
                    OutlinedButton(
                        onClick = { onOpen(Screen.Receipts) },
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    ) { Text("Receipts and collection") }
                    OutlinedButton(
                        onClick = { onOpen(Screen.Dues) },
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    ) { Text("Dues") }
                    OutlinedButton(
                        onClick = { onOpen(Screen.Expenses) },
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    ) { Text("Expenses") }
                    OutlinedButton(
                        onClick = { onOpen(Screen.IncomeExpense) },
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    ) { Text("Income and expense") }
                    if (access.isAdmin) {
                        OutlinedButton(
                            onClick = { onOpen(Screen.FeeSetup) },
                            modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                        ) { Text("Fee setup") }
                    }
                }

                if (access.isAdmin) {
                    HorizontalDivider(Modifier.padding(top = 16.dp, bottom = 4.dp))
                    Text(
                        "Payroll",
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.padding(bottom = 4.dp),
                    )
                    OutlinedButton(
                        onClick = { onOpen(Screen.PaySalary) },
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    ) { Text("Pay salary") }
                    OutlinedButton(
                        onClick = { onOpen(Screen.SalaryRegister) },
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    ) { Text("Salary register") }
                    OutlinedButton(
                        onClick = { onOpen(Screen.Payroll) },
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    ) { Text("Salary structure") }
                }

                if (access.isAdmin) {
                    HorizontalDivider(Modifier.padding(top = 16.dp, bottom = 4.dp))
                    Text(
                        "Setting up the school",
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.padding(bottom = 4.dp),
                    )
                    OutlinedButton(
                        onClick = { onOpen(Screen.Classes) },
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    ) { Text("Classes and sections") }
                    OutlinedButton(
                        onClick = { onOpen(Screen.StaffAdmin) },
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    ) { Text("Staff") }
                    OutlinedButton(
                        onClick = { onOpen(Screen.Users) },
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    ) { Text("Who can sign in") }
                    OutlinedButton(
                        onClick = { onOpen(Screen.Setup) },
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    ) { Text("School setup") }
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
            "Exam routine, admit cards and the attendance reports are still to come.",
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
