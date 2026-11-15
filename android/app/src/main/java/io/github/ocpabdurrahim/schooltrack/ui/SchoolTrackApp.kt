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

enum class Screen { Home, Register, Scan, Students, Student, Children }

/**
 * Sign-in gate. The access record — not the account — decides what is shown,
 * exactly as on the web: signing in successfully grants nothing by itself.
 */
@Composable
fun SchoolTrackApp(repo: AccessRepository = remember { AccessRepository() }) {
    var access by remember { mutableStateOf<Access>(Access.Loading) }
    var screen by remember { mutableStateOf(Screen.Home) }
    var openStudent by remember { mutableStateOf("") }
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
            // Every screen is gated on the access record, not on the previous
            // screen. A guardian may reach only their own children's pages —
            // the rules enforce that server-side as well, but a refused read
            // shows as an error, and a parent should never see one for simply
            // tapping about.
            val isStaff = current is Access.Staff
            val mayOpen: (String) -> Boolean = { id ->
                isStaff || (current is Access.Guardian && id in current.studentIds)
            }

            when {
                screen == Screen.Scan && current is Access.Staff -> ScanScreen(
                    email = current.email,
                    onBack = { screen = Screen.Home },
                )

                screen == Screen.Register && current is Access.Staff -> RegisterScreen(
                    email = current.email,
                    canMark = current.canMarkAttendance,
                    onBack = { screen = Screen.Home },
                )

                screen == Screen.Students && isStaff -> StudentsScreen(
                    onOpen = { openStudent = it; screen = Screen.Student },
                    onBack = { screen = Screen.Home },
                )

                screen == Screen.Children && current is Access.Guardian -> ChildrenScreen(
                    studentIds = current.studentIds,
                    onOpen = { openStudent = it; screen = Screen.Student },
                    onBack = { screen = Screen.Home },
                )

                screen == Screen.Student && mayOpen(openStudent) -> StudentScreen(
                    studentId = openStudent,
                    onBack = {
                        screen = if (isStaff) Screen.Students else Screen.Children
                    },
                )

                else -> HomeScreen(
                    access = current,
                    onOpenRegister = { screen = Screen.Register },
                    onOpenScan = { screen = Screen.Scan },
                    onOpenStudents = { screen = Screen.Students },
                    onOpenChildren = { screen = Screen.Children },
                    onSignOut = {
                        repo.signOut()
                        screen = Screen.Home
                        scope.launch { refresh() }
                    },
                )
            }
        }
    }
}
