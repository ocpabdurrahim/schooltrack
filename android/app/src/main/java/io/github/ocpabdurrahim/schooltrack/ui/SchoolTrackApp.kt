package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import io.github.ocpabdurrahim.schooltrack.data.Access
import io.github.ocpabdurrahim.schooltrack.data.AccessRepository
import io.github.ocpabdurrahim.schooltrack.data.canMarkAttendance
import kotlinx.coroutines.launch

enum class Screen { Home, Register, Scan }

/**
 * Sign-in gate. The access record — not the account — decides what is shown,
 * exactly as on the web: signing in successfully grants nothing by itself.
 */
@Composable
fun SchoolTrackApp(repo: AccessRepository = remember { AccessRepository() }) {
    var access by remember { mutableStateOf<Access>(Access.Loading) }
    var screen by remember { mutableStateOf(Screen.Home) }
    val scope = rememberCoroutineScope()

    suspend fun refresh() {
        access = if (repo.isSignedIn()) repo.resolve() else Access.SignedOut
    }

    LaunchedEffect(Unit) { refresh() }

    when (val current = access) {
        is Access.Loading -> LoadingScreen()
        is Access.SignedOut -> SignInScreen(
            onSignIn = { email, password ->
                repo.signIn(email, password)
                refresh()
            },
        )
        else -> {
            if (screen == Screen.Scan && current is Access.Staff) {
                ScanScreen(
                    email = current.email,
                    onBack = { screen = Screen.Home },
                )
            } else if (screen == Screen.Register && current is Access.Staff) {
                RegisterScreen(
                    email = current.email,
                    canMark = current.canMarkAttendance,
                    onBack = { screen = Screen.Home },
                )
            } else {
                HomeScreen(
                    access = current,
                    onOpenRegister = { screen = Screen.Register },
                    onOpenScan = { screen = Screen.Scan },
                    onSignOut = {
                        repo.signOut()
                        scope.launch { refresh() }
                    },
                )
            }
        }
    }
}
