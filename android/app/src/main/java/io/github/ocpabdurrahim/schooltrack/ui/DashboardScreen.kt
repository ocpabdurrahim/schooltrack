package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.github.ocpabdurrahim.schooltrack.data.Access
import io.github.ocpabdurrahim.schooltrack.data.AdminRepository
import io.github.ocpabdurrahim.schooltrack.data.AttendanceSummary
import io.github.ocpabdurrahim.schooltrack.data.DashboardRepository
import io.github.ocpabdurrahim.schooltrack.data.DayKind
import io.github.ocpabdurrahim.schooltrack.data.MoneySnapshot
import io.github.ocpabdurrahim.schooltrack.data.PeopleRepository
import io.github.ocpabdurrahim.schooltrack.data.SchoolStats
import io.github.ocpabdurrahim.schooltrack.data.StudentDetail
import io.github.ocpabdurrahim.schooltrack.data.TrendDay
import io.github.ocpabdurrahim.schooltrack.data.canCollectFees
import io.github.ocpabdurrahim.schooltrack.data.canEditStudents
import io.github.ocpabdurrahim.schooltrack.data.isAdmin
import io.github.ocpabdurrahim.schooltrack.data.longDate
import io.github.ocpabdurrahim.schooltrack.data.longMonth
import io.github.ocpabdurrahim.schooltrack.data.money
import io.github.ocpabdurrahim.schooltrack.data.percentOf
import io.github.ocpabdurrahim.schooltrack.data.trendSummary
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * The dashboard — the Compose twin of web/src/pages/Home.tsx.
 *
 * Every panel is independent and renders only from figures that actually came
 * back. A teacher cannot read the staff collection or a payment, so those
 * panels are ABSENT for them — not empty, and not an error. A zero on a
 * dashboard is a claim ("nothing was collected today"), and making that claim
 * because the read was refused is worse than showing nothing at all.
 */
@Composable
fun HomeScreen(
    access: Access,
    onOpenRegister: () -> Unit,
    onOpenScan: () -> Unit,
    onOpenStudents: () -> Unit,
    onOpenChildren: () -> Unit,
    onOpen: (Screen) -> Unit,
    onOpenStudent: (String) -> Unit,
    onSignOut: () -> Unit,
    people: PeopleRepository = remember { PeopleRepository() },
    admin: AdminRepository = remember { AdminRepository() },
    dash: DashboardRepository = remember { DashboardRepository() },
) {
    var schoolName by remember { mutableStateOf("") }
    var session by remember { mutableStateOf("") }
    var today by remember { mutableStateOf("") }
    var stats by remember { mutableStateOf<SchoolStats?>(null) }
    var trend by remember { mutableStateOf<List<TrendDay>?>(null) }
    var cash by remember { mutableStateOf<MoneySnapshot?>(null) }
    var children by remember { mutableStateOf<List<Pair<StudentDetail, AttendanceSummary>>?>(null) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(access) {
        loading = true
        today = dash.today()
        // The name comes from settings/school, which an administrator edits in
        // the app. Nothing is hardcoded: this app is not tied to one school.
        admin.getSettings()?.let {
            schoolName = it.instituteName
            session = it.sessionLabel.orEmpty()
        }

        if (access is Access.Staff) {
            stats = try { people.schoolStats() } catch (_: Exception) { null }
            trend = try { dash.attendanceTrend() } catch (_: Exception) { null }
            cash = try { dash.moneySnapshot() } catch (_: Exception) { null }
        }
        if (access is Access.Guardian) {
            children = access.studentIds.mapNotNull { id ->
                try {
                    people.getStudent(id)?.let { it to people.attendanceFor(id, people.startOfMonth()) }
                } catch (_: Exception) {
                    null
                }
            }
        }
        loading = false
    }

    val money = access.canCollectFees
    val records = access.canEditStudents
    val admins = access.isAdmin
    val staff = access is Access.Staff

    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Hero(
            school = schoolName,
            session = session,
            today = today,
            access = access,
            onSignOut = onSignOut,
        )

        if (access is Access.None) {
            SectionCard("NO ACCESS RECORD") {
                Text(
                    "Your sign-in worked, but nobody has been given access to this " +
                        "school under ${access.email}. An administrator has to add you " +
                        "first — signing in by itself grants nothing.",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }

        if (staff) {
            AttendanceToday(
                stats = stats,
                loading = loading && stats == null,
                onOpenRegister = onOpenRegister,
                onOpenScan = onOpenScan,
            )

            SchoolFigures(
                stats = stats,
                cash = cash,
                onOpenStudents = onOpenStudents,
                onOpenStaff = if (admins) { { onOpen(Screen.StaffAdmin) } } else null,
                onOpenClasses = if (admins) { { onOpen(Screen.Classes) } } else null,
                onOpenReceipts = if (money) { { onOpen(Screen.Receipts) } } else null,
            )

            trend?.let { TrendCard(it, today) }
            cash?.let { MoneyCard(it, onOpen) }

            SectionCard("GO STRAIGHT TO") {
                ButtonGrid(
                    buildList {
                        add("Mark attendance" to onOpenRegister)
                        add("Scan ID cards" to onOpenScan)
                        add("Monthly sheet" to { onOpen(Screen.MonthlySheet) })
                        if (money) add("Collect fee" to { onOpen(Screen.Collect) })
                        if (money) add("Dues" to { onOpen(Screen.Dues) })
                        add("Enter marks" to { onOpen(Screen.MarkEntry) })
                        add("Results" to { onOpen(Screen.Results) })
                        if (records) add("Certificates" to { onOpen(Screen.Certificates) })
                        if (admins) add("Pay salary" to { onOpen(Screen.PaySalary) })
                        if (admins) add("Setup" to { onOpen(Screen.Setup) })
                    },
                    filled = true,
                )
            }
        }

        if (access is Access.Guardian) {
            children?.forEach { (student, month) ->
                SectionCard(
                    title = student.fullName.uppercase(),
                    action = {
                        TextButton(onClick = { onOpenStudent(student.studentId) }) { Text("Details") }
                    },
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Ring(month.percent?.roundToInt())
                        Spacer(Modifier.width(18.dp))
                        Column(Modifier.weight(1f)) {
                            Legend("Present", month.present.toString(), Green)
                            Legend(
                                "Absent",
                                max(0, month.marked - month.present).toString(),
                                Bad,
                            )
                            Text(
                                "${student.className} - ${student.section} · Roll ${student.rollNo}",
                                style = MaterialTheme.typography.bodySmall,
                                color = Muted,
                                modifier = Modifier.padding(top = 6.dp),
                            )
                            Text(
                                if (month.marked == 0) {
                                    "No days marked this month yet."
                                } else {
                                    "${month.marked} day${if (month.marked == 1) "" else "s"} " +
                                        "marked this month."
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = Muted,
                            )
                        }
                    }
                }
            }
            if (children?.isEmpty() == true) {
                SectionCard("MY CHILDREN") {
                    Text(
                        "No student records are linked to this account yet.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Muted,
                    )
                }
            }
            SectionCard("GO STRAIGHT TO") {
                ButtonGrid(listOf("My children" to onOpenChildren), filled = true)
            }
        }

        if (staff) EverythingElse(access, onOpenStudents, onOpen)

        Spacer(Modifier.height(16.dp))
    }
}

/* -------------------------------------------------------------------------
   the band at the top
   ------------------------------------------------------------------------- */

@Composable
private fun Hero(
    school: String,
    session: String,
    today: String,
    access: Access,
    onSignOut: () -> Unit,
) {
    Box(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(Brush.linearGradient(listOf(GreenDarkest, Green, GreenBright)))
            .padding(20.dp),
    ) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier
                        .size(48.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(Color.White.copy(alpha = 0.16f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        initialsOf(school.ifEmpty { "School" }),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                    )
                }
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        school.ifEmpty { "SchoolTrack" },
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                    )
                    Text(
                        listOf(session, today.takeIf { it.isNotEmpty() }?.let { longDate(it) })
                            .filter { !it.isNullOrEmpty() }
                            .joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.85f),
                    )
                }
            }

            Row(
                Modifier.fillMaxWidth().padding(top = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val label = when (access) {
                    is Access.Staff -> access.role
                    is Access.Guardian -> "Guardian · " + access.studentIds.size +
                        if (access.studentIds.size == 1) " student" else " students"
                    else -> "No access"
                }
                Box(
                    Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(Color.White.copy(alpha = 0.18f))
                        .padding(horizontal = 12.dp, vertical = 5.dp),
                ) {
                    Text(
                        label,
                        style = MaterialTheme.typography.labelMedium,
                        color = Color.White,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                Spacer(Modifier.weight(1f))
                val who = when (access) {
                    is Access.Staff -> access.name
                    is Access.Guardian -> access.name
                    is Access.None -> access.email
                    else -> ""
                }
                Text(
                    who,
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.85f),
                )
                TextButton(onClick = onSignOut) {
                    Text("Sign out", color = Color.White, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

/** "Matkhola ML High School" → "MM". Two letters fit the square; three crowd it. */
internal fun initialsOf(name: String): String {
    val words = name.trim().split(Regex("\\s+")).filter { it.any(Char::isLetterOrDigit) }
    return when {
        words.isEmpty() -> "S"
        words.size == 1 -> words[0].take(2).uppercase()
        else -> (words.first().first().toString() + words.last().first()).uppercase()
    }
}

/* -------------------------------------------------------------------------
   today's attendance
   ------------------------------------------------------------------------- */

@Composable
private fun AttendanceToday(
    stats: SchoolStats?,
    loading: Boolean,
    onOpenRegister: () -> Unit,
    onOpenScan: () -> Unit,
) {
    if (loading) {
        SectionCard("ATTENDANCE TODAY") {
            Text("Loading…", style = MaterialTheme.typography.bodyMedium, color = Muted)
        }
        return
    }
    if (stats == null) return

    val marked = stats.markedToday ?: 0
    val present = stats.presentToday ?: 0
    val absent = max(0, marked - present)
    // Unmarked is the rest of the roll — known only when the student count came
    // back, and never counted as absent.
    val unmarked = stats.students?.let { max(0, it - marked) }

    SectionCard(
        title = "ATTENDANCE TODAY",
        action = { TextButton(onClick = onOpenRegister) { Text("Register") } },
    ) {
        if (!stats.takenToday && marked == 0) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(AmberSoft)
                    .padding(14.dp),
            ) {
                Text(
                    "Not taken yet today.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Amber,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            ButtonGrid(
                listOf("Scan ID cards" to onOpenScan, "Mark the register" to onOpenRegister),
                filled = true,
            )
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Ring(percentOf(present, marked))
                Spacer(Modifier.width(18.dp))
                Column(Modifier.weight(1f)) {
                    Legend("Present", present.toString(), Green)
                    Legend("Absent", absent.toString(), Bad)
                    if (unmarked != null) Legend("Not marked", unmarked.toString(), Line)
                    if (unmarked != null && unmarked > 0) {
                        Text(
                            "$unmarked still to mark.",
                            style = MaterialTheme.typography.bodySmall,
                            color = Muted,
                            modifier = Modifier.padding(top = 6.dp),
                        )
                    }
                }
            }
        }
    }
}

/** A donut. Nothing marked draws no figure at all, rather than a zero. */
@Composable
private fun Ring(percent: Int?, diameter: Dp = 112.dp) {
    val poor = percent != null && percent < 75
    val arc = if (poor) Bad else Green

    Box(Modifier.size(diameter), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val width = 13.dp.toPx()
            val inset = width / 2
            val box = Size(size.width - width, size.height - width)
            drawArc(
                color = Line,
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = Offset(inset, inset),
                size = box,
                style = Stroke(width),
            )
            if (percent != null && percent > 0) {
                drawArc(
                    color = arc,
                    startAngle = -90f,
                    sweepAngle = 360f * percent / 100f,
                    useCenter = false,
                    topLeft = Offset(inset, inset),
                    size = box,
                    style = Stroke(width, cap = StrokeCap.Round),
                )
            }
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                if (percent == null) "—" else "$percent%",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = arc,
            )
            Text("PRESENT", style = MaterialTheme.typography.labelSmall, color = Muted)
        }
    }
}

@Composable
private fun Legend(label: String, value: String, dot: Color) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(9.dp).clip(RoundedCornerShape(3.dp)).background(dot))
        Spacer(Modifier.width(9.dp))
        Text(label, style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.weight(1f))
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
    }
}

/* -------------------------------------------------------------------------
   the figures
   ------------------------------------------------------------------------- */

@Composable
private fun SchoolFigures(
    stats: SchoolStats?,
    cash: MoneySnapshot?,
    onOpenStudents: () -> Unit,
    onOpenStaff: (() -> Unit)?,
    onOpenClasses: (() -> Unit)?,
    onOpenReceipts: (() -> Unit)?,
) {
    // A refused count is left out of the row completely; it is not a zero.
    val figures = buildList {
        stats?.students?.let { add(Figure("STUDENTS", it.toString(), "on the roll", onOpenStudents)) }
        stats?.staff?.let { add(Figure("STAFF", it.toString(), "teaching and office", onOpenStaff)) }
        stats?.classes?.let { add(Figure("SECTIONS", it.toString(), "classes and sections", onOpenClasses)) }
        cash?.let {
            add(
                Figure(
                    "TODAY'S FEES",
                    money(it.collectedToday),
                    "${it.receipts} receipt${if (it.receipts == 1) "" else "s"} this month",
                    onOpenReceipts,
                ),
            )
        }
    }
    if (figures.isEmpty()) return

    SectionCard("THE SCHOOL") {
        figures.chunked(2).forEach { row ->
            Row(
                Modifier.fillMaxWidth().padding(bottom = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                row.forEach { FigureCard(it, Modifier.weight(1f)) }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

private data class Figure(
    val label: String,
    val value: String,
    val foot: String,
    val onClick: (() -> Unit)?,
)

@Composable
private fun FigureCard(figure: Figure, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(12.dp)
    val go = figure.onClick
    Column(
        modifier
            .clip(shape)
            .background(Color.White)
            .border(BorderStroke(1.dp, Line), shape)
            .let { if (go != null) it.clickable(onClick = go) else it }
            .padding(14.dp),
    ) {
        Text(figure.label, style = MaterialTheme.typography.labelSmall, color = Muted)
        Text(
            figure.value,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = 6.dp),
        )
        Text(figure.foot, style = MaterialTheme.typography.bodySmall, color = Muted)
    }
}

/* -------------------------------------------------------------------------
   the last seven days
   ------------------------------------------------------------------------- */

@Composable
private fun TrendCard(days: List<TrendDay>, today: String) {
    val summary = trendSummary(days)

    SectionCard("LAST SEVEN DAYS") {
        Row(
            Modifier.fillMaxWidth().height(120.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            days.forEach { d ->
                Column(
                    Modifier.weight(1f).fillMaxHeight(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Bottom,
                ) {
                    if (d.kind == DayKind.WORKING && d.percent != null) {
                        Text(
                            "${d.percent}%",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = InkSoft,
                        )
                    }
                    // A weekend or a holiday draws a stub, not a bar: a blank
                    // Tuesday should explain itself without opening the calendar.
                    val height: Dp = when {
                        d.kind != DayKind.WORKING -> 8.dp
                        d.marked == 0 -> 8.dp
                        else -> max(5, ((d.percent ?: 0) * 0.82).roundToInt()).dp
                    }
                    val colour = when {
                        d.kind == DayKind.HOLIDAY -> Color(0xFFF7DDB4)
                        d.kind == DayKind.WEEKEND -> Line
                        d.marked == 0 -> LineSoft
                        d.date == today -> GreenDeep
                        else -> Green
                    }
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .height(height)
                            .clip(RoundedCornerShape(topStart = 6.dp, topEnd = 6.dp))
                            .background(colour),
                    )
                    Text(
                        shortWeekday(d.date),
                        style = MaterialTheme.typography.labelSmall,
                        color = InkSoft,
                        modifier = Modifier.padding(top = 5.dp),
                    )
                    Text(
                        d.date.takeLast(2),
                        style = MaterialTheme.typography.labelSmall,
                        color = Muted,
                    )
                }
            }
        }

        Text(
            if (summary.average == null) {
                "Nothing has been marked in the last seven days."
            } else {
                "${summary.average}% present across ${summary.taken} of " +
                    "${summary.working} working day${if (summary.working == 1) "" else "s"}" +
                    if (summary.missed.isEmpty()) {
                        ""
                    } else {
                        " · nothing marked on " + summary.missed.joinToString(", ") { it.takeLast(2) }
                    }
            },
            style = MaterialTheme.typography.bodySmall,
            color = Muted,
            modifier = Modifier.padding(top = 12.dp),
        )
    }
}

private fun shortWeekday(date: String): String =
    java.time.LocalDate.parse(date)
        .dayOfWeek
        .getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale.UK)

/* -------------------------------------------------------------------------
   money
   ------------------------------------------------------------------------- */

@Composable
private fun MoneyCard(cash: MoneySnapshot, onOpen: (Screen) -> Unit) {
    val scale = max(cash.collectedMonth, cash.spentMonth ?: 0.0)

    SectionCard(
        title = longMonth(cash.month).uppercase(),
        action = { TextButton(onClick = { onOpen(Screen.IncomeExpense) }) { Text("Full report") } },
    ) {
        MoneyLine("Collected", cash.collectedMonth, scale, Green)
        cash.spentMonth?.let { MoneyLine("Spent", it, scale, Amber) }
        cash.net?.let {
            Row(
                Modifier.fillMaxWidth().padding(top = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("Net", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                    Text(
                        "collected, not charged — dues are not income",
                        style = MaterialTheme.typography.bodySmall,
                        color = Muted,
                    )
                }
                Text(
                    money(it),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = if (it >= 0) Green else Bad,
                )
            }
        }

        if (cash.latest.isNotEmpty()) {
            Text(
                "LATEST RECEIPTS",
                style = MaterialTheme.typography.labelSmall,
                color = Muted,
                modifier = Modifier.padding(top = 18.dp, bottom = 4.dp),
            )
            cash.latest.forEach { p ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable { onOpen(Screen.Receipts) }
                        .padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            p.studentName,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            "${p.classLabel} · Roll ${p.rollNo} · ${p.paymentDate}",
                            style = MaterialTheme.typography.bodySmall,
                            color = Muted,
                        )
                    }
                    Text(
                        money(p.totalAmount),
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}

@Composable
private fun MoneyLine(label: String, amount: Double, scale: Double, colour: Color) {
    Row(
        Modifier.fillMaxWidth().padding(top = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(6.dp))
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(LineSoft),
            ) {
                val fraction = if (scale <= 0.0) 0f else (amount / scale).toFloat().coerceIn(0f, 1f)
                Box(
                    Modifier
                        .fillMaxWidth(fraction)
                        .height(8.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(colour),
                )
            }
        }
        Spacer(Modifier.width(14.dp))
        Text(
            money(amount),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = colour,
        )
    }
}

/* -------------------------------------------------------------------------
   the rest of the app
   ------------------------------------------------------------------------- */

@Composable
private fun EverythingElse(
    access: Access,
    onOpenStudents: () -> Unit,
    onOpen: (Screen) -> Unit,
) {
    val money = access.canCollectFees
    val records = access.canEditStudents
    val admins = access.isAdmin

    SectionCard("PEOPLE AND ATTENDANCE") {
        ButtonGrid(
            buildList {
                add("Students" to onOpenStudents)
                add("Monthly sheet" to { onOpen(Screen.MonthlySheet) })
                add("Low attendance" to { onOpen(Screen.LowAttendance) })
                if (admins) add("Holidays" to { onOpen(Screen.HolidayCalendar) })
            },
        )
    }

    SectionCard("EXAMS") {
        ButtonGrid(
            buildList {
                add("Mark entry" to { onOpen(Screen.MarkEntry) })
                add("Result sheet" to { onOpen(Screen.Results) })
                add("Seat plan" to { onOpen(Screen.SeatPlan) })
                if (records) add("Admit cards" to { onOpen(Screen.AdmitCards) })
                if (admins) add("Exam routine" to { onOpen(Screen.Routine) })
                if (admins) add("Exams and subjects" to { onOpen(Screen.ExamSetup) })
            },
        )
    }

    if (records) {
        SectionCard("DOCUMENTS") {
            ButtonGrid(listOf("Certificates" to { onOpen(Screen.Certificates) }))
        }
    }

    if (money) {
        SectionCard("FEES AND MONEY") {
            ButtonGrid(
                buildList {
                    add("Collect fee" to { onOpen(Screen.Collect) })
                    add("Receipts" to { onOpen(Screen.Receipts) })
                    add("Dues" to { onOpen(Screen.Dues) })
                    add("Expenses" to { onOpen(Screen.Expenses) })
                    add("Income and expense" to { onOpen(Screen.IncomeExpense) })
                    if (admins) add("Fee setup" to { onOpen(Screen.FeeSetup) })
                },
            )
        }
    }

    if (admins) {
        SectionCard("PAYROLL") {
            ButtonGrid(
                listOf(
                    "Pay salary" to { onOpen(Screen.PaySalary) },
                    "Salary register" to { onOpen(Screen.SalaryRegister) },
                    "Salary structure" to { onOpen(Screen.Payroll) },
                ),
            )
        }

        SectionCard("SETTING UP THE SCHOOL") {
            ButtonGrid(
                listOf(
                    "Classes and sections" to { onOpen(Screen.Classes) },
                    "Staff" to { onOpen(Screen.StaffAdmin) },
                    "Who can sign in" to { onOpen(Screen.Users) },
                    "School setup" to { onOpen(Screen.Setup) },
                ),
            )
        }
    }
}

/* -------------------------------------------------------------------------
   small pieces
   ------------------------------------------------------------------------- */

@Composable
private fun SectionCard(
    title: String,
    action: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Line),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    title,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = Muted,
                )
                Spacer(Modifier.weight(1f))
                action?.invoke()
            }
            Spacer(Modifier.height(10.dp))
            content()
        }
    }
}

/** Two to a row: a handset in the office is held one-handed over a queue. */
@Composable
private fun ButtonGrid(items: List<Pair<String, () -> Unit>>, filled: Boolean = false) {
    items.chunked(2).forEach { row ->
        Row(
            Modifier.fillMaxWidth().padding(top = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            row.forEach { (label, go) ->
                if (filled) {
                    FilledTonalButton(onClick = go, modifier = Modifier.weight(1f)) {
                        Text(label, style = MaterialTheme.typography.labelLarge)
                    }
                } else {
                    OutlinedButton(onClick = go, modifier = Modifier.weight(1f)) {
                        Text(label, style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
            if (row.size == 1) Spacer(Modifier.weight(1f))
        }
    }
}
