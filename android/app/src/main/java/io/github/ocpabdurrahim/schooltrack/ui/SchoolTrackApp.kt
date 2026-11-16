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
    ExamSetup, MarkEntry, Results, ReportCard,
    Routine, SeatPlan, AdmitCards,
    MonthlySheet, LowAttendance, HolidayCalendar,
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
    var screen by remember { mutableStateOf(Screen.Home) }
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
                    onOpenReport = { openExam = it; screen = Screen.ReportCard },
                    onOpenCard = { screen = Screen.IdCard },
                    isGuardian = current is Access.Guardian,
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

                screen == Screen.MarkEntry && isStaff ->
                    MarkEntryScreen(onBack = { screen = Screen.Home })

                screen == Screen.Results && isStaff -> ResultsScreen(
                    isAdmin = current.isAdmin,
                    onOpenStudent = { openStudent = it; screen = Screen.Student },
                    onBack = { screen = Screen.Home },
                )

                screen == Screen.ReportCard && mayOpen(openStudent) -> ReportCardScreen(
                    examId = openExam,
                    studentId = openStudent,
                    isGuardian = current is Access.Guardian,
                    onBack = { screen = Screen.Student },
                )

                screen == Screen.Certificates && current is Access.Staff &&
                    current.canEditStudents -> CertificatesScreen(
                    email = current.email,
                    onOpen = { openDoc = it; screen = Screen.Certificate },
                    onBack = { screen = Screen.Home },
                )

                screen == Screen.Certificate && current.canEditStudents -> CertificateScreen(
                    serialNo = openDoc,
                    onBack = { screen = Screen.Certificates },
                )

                screen == Screen.IdCard && mayOpen(openStudent) -> IdCardScreen(
                    studentId = openStudent,
                    onBack = { screen = Screen.Student },
                )

                screen == Screen.Expenses && current is Access.Staff &&
                    current.canCollectFees -> ExpensesScreen(
                    email = current.email,
                    isAdmin = current.isAdmin,
                    onBack = { screen = Screen.Home },
                )

                screen == Screen.IncomeExpense && current.canCollectFees ->
                    IncomeExpenseScreen(onBack = { screen = Screen.Home })

                screen == Screen.Payroll && current.isAdmin ->
                    SalaryStructureScreen(onBack = { screen = Screen.Home })

                screen == Screen.PaySalary && current is Access.Staff && current.isAdmin ->
                    PaySalaryScreen(
                        email = current.email,
                        onPaid = { openMonth = it; screen = Screen.SalaryRegister },
                        onBack = { screen = Screen.Home },
                    )

                screen == Screen.SalaryRegister && current.isAdmin -> SalaryRegisterScreen(
                    month = openMonth,
                    onOpenPayslip = { openSlip = it; screen = Screen.Payslip },
                    onBack = { screen = Screen.Home },
                )

                screen == Screen.Payslip && current.isAdmin -> PayslipScreen(
                    id = openSlip,
                    onBack = { screen = Screen.SalaryRegister },
                )

                screen == Screen.ExamSetup && current.isAdmin ->
                    ExamsScreen(onBack = { screen = Screen.Home })

                screen == Screen.Routine && current.isAdmin ->
                    RoutineScreen(onBack = { screen = Screen.Home })

                // the plan is read by whoever is invigilating, not only the office
                screen == Screen.SeatPlan && isStaff ->
                    SeatPlanScreen(onBack = { screen = Screen.Home })

                screen == Screen.AdmitCards && current.canEditStudents ->
                    AdmitCardsScreen(onBack = { screen = Screen.Home })

                screen == Screen.MonthlySheet && isStaff ->
                    MonthlySheetScreen(onBack = { screen = Screen.Home })

                screen == Screen.LowAttendance && isStaff -> LowAttendanceScreen(
                    onOpenStudent = { openStudent = it; screen = Screen.Student },
                    onBack = { screen = Screen.Home },
                )

                // the calendar and the weekend decide every percentage, so only
                // the head may change them
                screen == Screen.HolidayCalendar && current.isAdmin ->
                    HolidaysScreen(onBack = { screen = Screen.Home })

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
                    onOpen = { target ->
                        // "Add a student" in the menu is always a NEW one: without
                        // this it would reopen whoever was edited last.
                        if (target == Screen.StudentEdit) editStudent = ""
                        screen = target
                    },
                    // the dashboard opens a child straight from its card
                    onOpenStudent = { openStudent = it; screen = Screen.Student },
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
