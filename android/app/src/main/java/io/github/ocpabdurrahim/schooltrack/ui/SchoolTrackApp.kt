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
import io.github.ocpabdurrahim.schooltrack.data.canCollectFees
import io.github.ocpabdurrahim.schooltrack.data.canEditStudents
import io.github.ocpabdurrahim.schooltrack.data.canMarkAttendance
import io.github.ocpabdurrahim.schooltrack.data.isAdmin
import kotlinx.coroutines.launch

enum class Screen {
    Home, Register, Scan, Students, Student, Children,
    Setup, Classes, StaffAdmin, Users, StudentEdit,
    FeeSetup, Collect, Receipts, Receipt, Dues,
}

/**
 * Sign-in gate. The access record — not the account — decides what is shown,
 * exactly as on the web: signing in successfully grants nothing by itself.
 */
@Composable
fun SchoolTrackApp(repo: AccessRepository = remember { AccessRepository() }) {
    var access by remember { mutableStateOf<Access>(Access.Loading) }
    var screen by remember { mutableStateOf(Screen.Home) }
    var openStudent by remember { mutableStateOf("") }
    var editStudent by remember { mutableStateOf("") }
    var openReceipt by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    suspend fun refresh() {
        access = if (repo.isSignedIn()) repo.resolve() else Access.SignedOut
    }

    LaunchedEffect(Unit) { refresh() }

    when (val current = access) {
        is Access.Loading -> LoadingScreen()
        is Access.SignedOut -> SignInScreen(
            onSignIn = { email, password ->
                val verified = repo.signIn(email, password)
                if (verified) refresh()
                verified
            },
            onSignUp = { email, password -> repo.signUp(email, password) },
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
                    onAdd = if (current.canEditStudents) {
                        { editStudent = ""; screen = Screen.StudentEdit }
                    } else {
                        null
                    },
                    onBack = { screen = Screen.Home },
                )

                screen == Screen.Children && current is Access.Guardian -> ChildrenScreen(
                    studentIds = current.studentIds,
                    onOpen = { openStudent = it; screen = Screen.Student },
                    onBack = { screen = Screen.Home },
                )

                screen == Screen.Student && mayOpen(openStudent) -> StudentScreen(
                    studentId = openStudent,
                    onEdit = if (current.canEditStudents) {
                        { editStudent = openStudent; screen = Screen.StudentEdit }
                    } else {
                        null
                    },
                    onBack = {
                        screen = if (isStaff) Screen.Students else Screen.Children
                    },
                )

                screen == Screen.StudentEdit && current.canEditStudents -> StudentEditScreen(
                    studentId = editStudent,
                    onSaved = { id -> openStudent = id; screen = Screen.Student },
                    onBack = {
                        screen = if (editStudent.isEmpty()) Screen.Students else Screen.Student
                    },
                )

                screen == Screen.Collect && current is Access.Staff &&
                    current.canCollectFees -> CollectScreen(
                    email = current.email,
                    onCollected = { openReceipt = it; screen = Screen.Receipt },
                    onBack = { screen = Screen.Home },
                )

                screen == Screen.Receipts && current.canCollectFees -> ReceiptsScreen(
                    onOpen = { openReceipt = it; screen = Screen.Receipt },
                    onBack = { screen = Screen.Home },
                )

                screen == Screen.Receipt && current.canCollectFees -> ReceiptScreen(
                    receiptNo = openReceipt,
                    onBack = { screen = Screen.Receipts },
                )

                screen == Screen.Dues && current.canCollectFees ->
                    DuesScreen(onBack = { screen = Screen.Home })

                screen == Screen.FeeSetup && current.isAdmin ->
                    FeeSetupScreen(onBack = { screen = Screen.Home })

                screen == Screen.Setup && current.isAdmin ->
                    SchoolSetupScreen(onBack = { screen = Screen.Home })

                screen == Screen.Classes && current.isAdmin ->
                    ClassesScreen(onBack = { screen = Screen.Home })

                screen == Screen.StaffAdmin && current.isAdmin ->
                    StaffScreen(onBack = { screen = Screen.Home })

                screen == Screen.Users && current.isAdmin ->
                    UsersScreen(onBack = { screen = Screen.Home })

                else -> HomeScreen(
                    access = current,
                    onOpenRegister = { screen = Screen.Register },
                    onOpenScan = { screen = Screen.Scan },
                    onOpenStudents = { screen = Screen.Students },
                    onOpenChildren = { screen = Screen.Children },
                    onOpen = { screen = it },
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
