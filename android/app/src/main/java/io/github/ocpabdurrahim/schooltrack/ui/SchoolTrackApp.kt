package io.github.ocpabdurrahim.schooltrack.ui

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
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
    ExamSetup, MarkEntry, Results, ReportCard,
    Routine, SeatPlan, AdmitCards,
    MonthlySheet, LowAttendance, HolidayCalendar, StudentAttendance,
    Certificates, Certificate, IdCard,
    Payroll, PaySalary, SalaryRegister, Payslip,
    Expenses, IncomeExpense,
    FeeSetup, Collect, Receipts, Receipt, Dues,
}

/**
 * Sign-in gate. The access record — not the account — decides what is shown,
 * exactly as on the web: signing in successfully grants nothing by itself.
 */
@Composable
fun SchoolTrackApp(repo: AccessRepository = remember { AccessRepository() }) {
    var access by remember { mutableStateOf<Access>(Access.Loading) }
    // A REAL BACK STACK, so the handset's Back button goes back instead of
    // closing the app. Every screen is pushed when it opens and popped when it
    // closes. Home is the floor: there the BackHandler is off and Back belongs
    // to Android again, which leaves the app — what a home screen should do.
    val history = remember { mutableStateListOf(Screen.Home) }
    val screen = history.last()
    fun go(target: Screen) { if (history.last() != target) history.add(target) }
    // A few steps REPLACE the screen they came from: going back from a receipt
    // must not land on the collection form that has already been spent.
    fun replaceWith(target: Screen) { history[history.lastIndex] = target }
    fun back() { if (history.size > 1) history.removeAt(history.lastIndex) }
    fun home() { history.clear(); history.add(Screen.Home) }
    var openStudent by remember { mutableStateOf("") }
    var editStudent by remember { mutableStateOf("") }
    var openReceipt by remember { mutableStateOf("") }
    var openExam by remember { mutableStateOf("") }
    var openDoc by remember { mutableStateOf("") }
    // the register opened from Home should show THIS month, not an empty one
    var openMonth by remember { mutableStateOf(java.time.YearMonth.now().toString()) }
    var openSlip by remember { mutableStateOf("") }
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
            // Back goes BACK. Without this the Activity closed instead, which is
            // what "the back button exits the app" meant. On Home it stays off,
            // so Back there leaves the app, as it should.
            BackHandler(enabled = history.size > 1) { back() }

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
                    onBack = { back() },
                )

                screen == Screen.Register && current is Access.Staff -> RegisterScreen(
                    email = current.email,
                    canMark = current.canMarkAttendance,
                    onBack = { back() },
                )

                screen == Screen.Students && isStaff -> StudentsScreen(
                    onOpen = { openStudent = it; go(Screen.Student) },
                    onAdd = if (current.canEditStudents) {
                        { editStudent = ""; go(Screen.StudentEdit) }
                    } else {
                        null
                    },
                    onBack = { back() },
                )

                screen == Screen.Children && current is Access.Guardian -> ChildrenScreen(
                    studentIds = current.studentIds,
                    onOpen = { openStudent = it; go(Screen.Student) },
                    onBack = { back() },
                )

                screen == Screen.Student && mayOpen(openStudent) -> StudentScreen(
                    onOpenReport = { openExam = it; go(Screen.ReportCard) },
                    onOpenCard = { go(Screen.IdCard) },
                    onOpenAttendance = { go(Screen.StudentAttendance) },
                    isGuardian = current is Access.Guardian,
                    studentId = openStudent,
                    onEdit = if (current.canEditStudents) {
                        { editStudent = openStudent; go(Screen.StudentEdit) }
                    } else {
                        null
                    },
                    onBack = { back() },
                )

                screen == Screen.StudentEdit && current.canEditStudents -> StudentEditScreen(
                    studentId = editStudent,
                    onSaved = { id -> openStudent = id; replaceWith(Screen.Student) },
                    onBack = { back() },
                )

                screen == Screen.Collect && current is Access.Staff &&
                    current.canCollectFees -> CollectScreen(
                    email = current.email,
                    onCollected = { openReceipt = it; replaceWith(Screen.Receipt) },
                    onBack = { back() },
                )

                screen == Screen.Receipts && current.canCollectFees -> ReceiptsScreen(
                    onOpen = { openReceipt = it; go(Screen.Receipt) },
                    onBack = { back() },
                )

                screen == Screen.Receipt && current.canCollectFees -> ReceiptScreen(
                    receiptNo = openReceipt,
                    onBack = { back() },
                )

                screen == Screen.Dues && current.canCollectFees ->
                    DuesScreen(onBack = { back() })

                screen == Screen.MarkEntry && isStaff ->
                    MarkEntryScreen(onBack = { back() })

                screen == Screen.Results && isStaff -> ResultsScreen(
                    isAdmin = current.isAdmin,
                    onOpenStudent = { openStudent = it; go(Screen.Student) },
                    onBack = { back() },
                )

                screen == Screen.ReportCard && mayOpen(openStudent) -> ReportCardScreen(
                    examId = openExam,
                    studentId = openStudent,
                    isGuardian = current is Access.Guardian,
                    onBack = { back() },
                )

                screen == Screen.Certificates && current is Access.Staff &&
                    current.canEditStudents -> CertificatesScreen(
                    email = current.email,
                    onOpen = { openDoc = it; go(Screen.Certificate) },
                    onBack = { back() },
                )

                screen == Screen.Certificate && current.canEditStudents -> CertificateScreen(
                    serialNo = openDoc,
                    onBack = { back() },
                )

                screen == Screen.IdCard && mayOpen(openStudent) -> IdCardScreen(
                    studentId = openStudent,
                    onBack = { back() },
                )

                screen == Screen.Expenses && current is Access.Staff &&
                    current.canCollectFees -> ExpensesScreen(
                    email = current.email,
                    isAdmin = current.isAdmin,
                    onBack = { back() },
                )

                screen == Screen.IncomeExpense && current.canCollectFees ->
                    IncomeExpenseScreen(onBack = { back() })

                screen == Screen.Payroll && current.isAdmin ->
                    SalaryStructureScreen(onBack = { back() })

                screen == Screen.PaySalary && current is Access.Staff && current.isAdmin ->
                    PaySalaryScreen(
                        email = current.email,
                        onPaid = { openMonth = it; replaceWith(Screen.SalaryRegister) },
                        onBack = { back() },
                    )

                screen == Screen.SalaryRegister && current.isAdmin -> SalaryRegisterScreen(
                    month = openMonth,
                    onOpenPayslip = { openSlip = it; go(Screen.Payslip) },
                    onBack = { back() },
                )

                screen == Screen.Payslip && current.isAdmin -> PayslipScreen(
                    id = openSlip,
                    onBack = { back() },
                )

                screen == Screen.ExamSetup && current.isAdmin ->
                    ExamsScreen(onBack = { back() })

                screen == Screen.Routine && current.isAdmin ->
                    RoutineScreen(onBack = { back() })

                // the plan is read by whoever is invigilating, not only the office
                screen == Screen.SeatPlan && isStaff ->
                    SeatPlanScreen(onBack = { back() })

                screen == Screen.AdmitCards && current.canEditStudents ->
                    AdmitCardsScreen(onBack = { back() })

                screen == Screen.MonthlySheet && isStaff ->
                    MonthlySheetScreen(onBack = { back() })

                // a parent opens this for their own child; staff for anyone
                screen == Screen.StudentAttendance && mayOpen(openStudent) ->
                    StudentAttendanceScreen(studentId = openStudent, onBack = { back() })

                screen == Screen.LowAttendance && isStaff -> LowAttendanceScreen(
                    onOpenStudent = { openStudent = it; go(Screen.Student) },
                    onBack = { back() },
                )

                // the calendar and the weekend decide every percentage, so only
                // the head may change them
                screen == Screen.HolidayCalendar && current.isAdmin ->
                    HolidaysScreen(onBack = { back() })

                screen == Screen.FeeSetup && current.isAdmin ->
                    FeeSetupScreen(onBack = { back() })

                screen == Screen.Setup && current.isAdmin ->
                    SchoolSetupScreen(onBack = { back() })

                screen == Screen.Classes && current.isAdmin ->
                    ClassesScreen(onBack = { back() })

                screen == Screen.StaffAdmin && current.isAdmin ->
                    StaffScreen(onBack = { back() })

                screen == Screen.Users && current.isAdmin ->
                    UsersScreen(onBack = { back() })

                else -> HomeScreen(
                    access = current,
                    onOpenRegister = { go(Screen.Register) },
                    onOpenScan = { go(Screen.Scan) },
                    onOpenStudents = { go(Screen.Students) },
                    onOpenChildren = { go(Screen.Children) },
                    onOpen = { target ->
                        // "Add a student" in the menu is always a NEW one: without
                        // this it would reopen whoever was edited last.
                        if (target == Screen.StudentEdit) editStudent = ""
                        go(target)
                    },
                    // the dashboard opens a child straight from its card
                    onOpenStudent = { openStudent = it; go(Screen.Student) },
                    onOpenAttendance = { openStudent = it; go(Screen.StudentAttendance) },
                    onSignOut = {
                        repo.signOut()
                        home()
                        scope.launch { refresh() }
                    },
                )
            }
        }
    }
}
