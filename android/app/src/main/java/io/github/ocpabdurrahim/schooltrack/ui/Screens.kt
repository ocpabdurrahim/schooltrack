package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
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
