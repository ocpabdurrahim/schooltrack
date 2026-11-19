package io.github.ocpabdurrahim.schooltrack.ui

import io.github.ocpabdurrahim.schooltrack.data.Access
import io.github.ocpabdurrahim.schooltrack.data.canCollectFees
import io.github.ocpabdurrahim.schooltrack.data.canEditStudents
import io.github.ocpabdurrahim.schooltrack.data.isAdmin

/**
 * What the menu contains — the Kotlin twin of web/src/nav.ts, with the same
 * groups, the same labels and the same role filtering, checked by the same
 * test cases on both sides.
 *
 * On the web these six groups are a menubar; here they are a drawer, because a
 * dropdown menubar on a handset is a web page pretending to be an app. The
 * drawer belongs to the dashboard, which is the only top-level screen: every
 * other screen is opened from it and comes back to it, and Material's own
 * guidance is that such a screen shows Back rather than the menu.
 *
 * A group with nothing in it for this person is not rendered at all. That is
 * how a teacher ends up with three sections rather than six, two of them empty.
 */

enum class Need { STAFF, ADMIN, MONEY, RECORDS }

data class MenuItem(
    val label: String,
    val screen: Screen,
    val needs: Need,
    /** A line under the label, where the label alone is not enough. */
    val hint: String? = null,
)

data class MenuGroup(val label: String, val items: List<MenuItem>)

private val ALL = listOf(
    MenuGroup(
        "Students",
        listOf(
            MenuItem("All students", Screen.Students, Need.STAFF, "search by name, roll or class"),
            MenuItem("Add a student", Screen.StudentEdit, Need.RECORDS),
            MenuItem(
                "Add many students", Screen.StudentsBatch, Need.RECORDS,
                "paste a whole section in one go",
            ),
            MenuItem(
                "Update from a list", Screen.StudentsUpdate, Need.RECORDS,
                "fill in groups or religion for a whole section",
            ),
            // ID cards are per student on the phone: opened from the student,
            // because a printed sheet is a thing you do at a desk.
            MenuItem("Certificates", Screen.Certificates, Need.RECORDS, "testimonial, transfer, character"),
        ),
    ),
    MenuGroup(
        "Attendance",
        listOf(
            MenuItem("Today's register", Screen.Register, Need.STAFF),
            MenuItem("Scan ID cards", Screen.Scan, Need.STAFF, "at the gate"),
            MenuItem("Monthly sheet", Screen.MonthlySheet, Need.STAFF),
            MenuItem("Low attendance", Screen.LowAttendance, Need.STAFF),
            MenuItem("Holidays", Screen.HolidayCalendar, Need.ADMIN, "the calendar every percentage counts from"),
        ),
    ),
    MenuGroup(
        "Exams",
        listOf(
            MenuItem("Enter marks", Screen.MarkEntry, Need.STAFF,
                "one subject, whole section"),
            MenuItem("Quick entry", Screen.QuickMarks, Need.STAFF,
                "roll after roll, or one whole marksheet"),
            MenuItem("Scan a mark sheet", Screen.ScanMarks, Need.STAFF,
                "photograph the filled-in paper form"),
            MenuItem("Results", Screen.Results, Need.STAFF, "result sheet and tabulation"),
            MenuItem("Seat plan", Screen.SeatPlan, Need.STAFF),
            MenuItem("Admit cards", Screen.AdmitCards, Need.RECORDS),
            MenuItem("Exam routine", Screen.Routine, Need.ADMIN),
            MenuItem("Exams and subjects", Screen.ExamSetup, Need.ADMIN),
        ),
    ),
    MenuGroup(
        "Fees",
        listOf(
            MenuItem("Collect a fee", Screen.Collect, Need.MONEY),
            MenuItem("Receipts", Screen.Receipts, Need.MONEY, "a day's collection"),
            MenuItem("Dues", Screen.Dues, Need.MONEY),
            MenuItem("Fee setup", Screen.FeeSetup, Need.ADMIN, "heads and what each class pays"),
        ),
    ),
    MenuGroup(
        "Finance",
        listOf(
            MenuItem("Expenses", Screen.Expenses, Need.MONEY),
            MenuItem("Income and expense", Screen.IncomeExpense, Need.MONEY, "month by month"),
            MenuItem("Pay salary", Screen.PaySalary, Need.ADMIN),
            MenuItem("Salary register", Screen.SalaryRegister, Need.ADMIN),
            MenuItem("Salary structure", Screen.Payroll, Need.ADMIN, "scale, increments, deductions"),
        ),
    ),
    MenuGroup(
        "Setup",
        listOf(
            MenuItem("Classes and sections", Screen.Classes, Need.ADMIN),
            MenuItem("Staff", Screen.StaffAdmin, Need.ADMIN),
            MenuItem("Who can sign in", Screen.Users, Need.ADMIN, "staff roles and guardians"),
            MenuItem("School setup", Screen.Setup, Need.ADMIN, "name, session, weekend"),
        ),
    ),
)

/** The same rules the screen gates use — written once, read by both. */
fun allows(access: Access, needs: Need): Boolean = when (needs) {
    Need.STAFF -> access is Access.Staff
    Need.ADMIN -> access.isAdmin
    // a teacher cannot read a payment at all, so the screen would only refuse
    Need.MONEY -> access.canCollectFees
    // student records are the office's work as much as the head's
    Need.RECORDS -> access.canEditStudents
}

fun menuFor(access: Access): List<MenuGroup> =
    ALL.map { group -> group.copy(items = group.items.filter { allows(access, it.needs) }) }
        .filter { it.items.isNotEmpty() }
