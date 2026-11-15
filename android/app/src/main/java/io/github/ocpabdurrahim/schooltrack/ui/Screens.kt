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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
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
    onSignOut: () -> Unit,
) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
    ) {
        Text("SchoolTrack", style = MaterialTheme.typography.headlineSmall)

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
                        InfoRow("Access", access.studentIds.size.toString() + " student")
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
                        modifier = Modifier.padding(top = 12.dp),
                    ) { Text("Today's register") }
                    Button(
                        onClick = onOpenScan,
                        modifier = Modifier.padding(top = 8.dp),
                    ) { Text("Scan at the gate") }
                }
                TextButton(
                    onClick = onSignOut,
                    modifier = Modifier.padding(top = 8.dp),
                ) { Text("Sign out") }
            }
        }
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
