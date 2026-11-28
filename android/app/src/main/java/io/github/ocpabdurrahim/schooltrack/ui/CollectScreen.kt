package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.github.ocpabdurrahim.schooltrack.data.AttendanceRepository
import io.github.ocpabdurrahim.schooltrack.data.Collectable
import io.github.ocpabdurrahim.schooltrack.data.FeeHead
import io.github.ocpabdurrahim.schooltrack.data.FeesRepository
import io.github.ocpabdurrahim.schooltrack.data.PaymentLine
import io.github.ocpabdurrahim.schooltrack.data.PeopleRepository
import io.github.ocpabdurrahim.schooltrack.data.SchoolClass
import io.github.ocpabdurrahim.schooltrack.data.StudentDetail
import io.github.ocpabdurrahim.schooltrack.data.money
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private data class Picked(val on: Boolean, val discount: String, val amount: String)

/**
 * Collect a fee and issue the receipt. The twin of the web app's Collect page,
 * and it must agree with it to the taka: the same expectation rule, the same
 * treatment of a discount, the same receipt numbering.
 */
@Composable
fun CollectScreen(
    email: String,
    onCollected: (String) -> Unit,
    onBack: () -> Unit,
    fees: FeesRepository = remember { FeesRepository() },
    people: PeopleRepository = remember { PeopleRepository() },
    attendance: AttendanceRepository = remember { AttendanceRepository() },
) {
    val scope = rememberCoroutineScope()

    var year by remember { mutableStateOf(fees.currentYear()) }
    /** This session and the one before it: arrears are collected, next year's fees are not. */
    val years = remember {
        listOf((fees.currentYear().toInt() - 1).toString(), fees.currentYear())
    }

    var classes by remember { mutableStateOf<List<SchoolClass>>(emptyList()) }
    var className by remember { mutableStateOf("") }
    var classId by remember { mutableStateOf("") }
    var roster by remember { mutableStateOf<List<StudentDetail>>(emptyList()) }

    var search by remember { mutableStateOf("") }
    var found by remember { mutableStateOf<List<StudentDetail>>(emptyList()) }
    var student by remember { mutableStateOf<StudentDetail?>(null) }

    var rows by remember { mutableStateOf<List<Collectable>>(emptyList()) }
    var picked by remember { mutableStateOf<Map<String, Picked>>(emptyMap()) }
    var heads by remember { mutableStateOf<List<FeeHead>>(emptyList()) }

    var extraHead by remember { mutableStateOf("") }
    var extraPeriod by remember { mutableStateOf("") }
    var extraAmount by remember { mutableStateOf("") }

    var method by remember { mutableStateOf("Cash") }
    var date by remember { mutableStateOf(fees.todayDate()) }
    var remarks by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        heads = try { fees.listFeeHeads().filter { it.active } } catch (_: Exception) { emptyList() }
    }

    val classNames = classes.map { it.className }.distinct()
    val sections = classes.filter { it.className == className }

    LaunchedEffect(Unit) {
        try {
            classes = attendance.listClasses()
            className = classes.firstOrNull()?.className.orEmpty()
        } catch (_: Exception) {
            problem = "Could not read the class list."
        }
    }

    // Keep the section inside the chosen class. Deliberately NOT keyed on
    // classId: this sets it, and watching what it sets would have it argue
    // with the operator's own choice.
    LaunchedEffect(className, classes) {
        if (sections.isNotEmpty() && sections.none { it.classId == classId }) {
            classId = sections.first().classId
        }
    }

    /** The chosen section's roll, in roll order, for the Student list. */
    LaunchedEffect(classId) {
        roster = if (classId.isEmpty()) {
            emptyList()
        } else {
            try { people.findStudents(classId, "") } catch (_: Exception) { emptyList() }
        }
    }

    LaunchedEffect(search) {
        if (search.trim().length < 2) { found = emptyList(); return@LaunchedEffect }
        delay(250)
        found = try { people.findStudents(null, search).take(8) } catch (_: Exception) { emptyList() }
    }

    fun key(c: Collectable) = c.head.feeHeadId + "|" + c.periodLabel

    /**
     * What the chosen student owes for the chosen session.
     *
     * Keyed on the year as well as the student, so changing Year after someone
     * is picked reloads their obligations instead of leaving one session's list
     * on screen under another session's heading.
     */
    LaunchedEffect(student, year) {
        val s = student
        if (s == null) {
            rows = emptyList()
            picked = emptyMap()
            return@LaunchedEffect
        }
        busy = true
        problem = ""
        try {
            val cs = fees.collectablesFor(s, year)
            rows = cs
            // nothing is ticked by default: the collector decides what is paid
            picked = cs.associate {
                key(it) to Picked(false, "0", money(it.outstanding).replace(",", ""))
            }
        } catch (_: Exception) {
            problem = "Could not work out what this student owes."
        }
        busy = false
    }

    /** Chosen from the search results: move the pickers to where they are. */
    fun choose(s: StudentDetail) {
        student = s
        search = ""
        found = emptyList()
        problem = ""
        className = s.className
        classId = s.classId
    }

    val lines = buildList {
        for (c in rows) {
            val p = picked[key(c)] ?: continue
            if (!p.on) continue
            add(
                PaymentLine(
                    feeHeadId = c.head.feeHeadId,
                    headName = c.head.headName,
                    sessionYear = year,
                    periodLabel = c.periodLabel,
                    grossAmount = c.grossAmount,
                    discountAmount = p.discount.toDoubleOrNull() ?: 0.0,
                    amountPaid = p.amount.toDoubleOrNull() ?: 0.0,
                ),
            )
        }
        val head = heads.firstOrNull { it.feeHeadId == extraHead }
        val amount = extraAmount.toDoubleOrNull() ?: 0.0
        if (head != null && extraPeriod.isNotBlank() && amount > 0) {
            add(
                PaymentLine(
                    feeHeadId = head.feeHeadId,
                    headName = head.headName,
                    sessionYear = year,
                    periodLabel = extraPeriod.trim().uppercase(),
                    grossAmount = amount,
                    discountAmount = 0.0,
                    amountPaid = amount,
                ),
            )
        }
    }

    val total = lines.sumOf { it.amountPaid }

    AdminScaffold(
        "Collect fee",
        student?.let { it.fullName + " · " + it.className + " " + it.section + " · Roll " + it.rollNo }
            ?: "Find the student first",
        onBack,
    ) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Picker("Year", years.map { it to it }, year) { year = it }
                Picker("Class", classNames.map { it to it }, className) {
                    className = it
                    student = null
                }
                Picker(
                    "Section",
                    sections.map { c -> c.classId to c.section.ifBlank { c.displayName } },
                    classId,
                ) {
                    classId = it
                    student = null
                }
                Picker(
                    "Student",
                    listOf(
                        "" to if (roster.isEmpty()) {
                            "\u2014 nobody on this roll \u2014"
                        } else {
                            "\u2014 choose one of " + roster.size + " \u2014"
                        },
                    ) + roster.map { s -> s.studentId to (s.rollNo.toString() + "  \u00b7  " + s.fullName) },
                    student?.studentId ?: "",
                ) { id -> student = roster.firstOrNull { it.studentId == id } }

                if (year != fees.currentYear()) {
                    Text(
                        year + " is a past session. The rates read are the ones set for the " +
                            "student's CURRENT class, because the roll keeps no class " +
                            "history \u2014 check the amount before collecting arrears.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }

                Field("Or search the whole school", search) { search = it }
                found.forEach { s ->
                    Row(
                        Modifier.fillMaxWidth().clickable { choose(s) }.padding(vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            s.fullName + "  ·  " + s.className + " " + s.section + "  ·  roll " + s.rollNo,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Text("choose", color = MaterialTheme.colorScheme.primary)
                    }
                    HorizontalDivider()
                }
                Problem(problem)
            }
        }

        if (student != null) {
            Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text("Due this session ($year)", style = MaterialTheme.typography.titleMedium)
                    if (busy) Text("Working…", modifier = Modifier.padding(top = 8.dp))
                    if (!busy && rows.isEmpty()) {
                        Text(
                            "No rates are set for " + student!!.className + " in " + year +
                                ". Set them under Fee setup.",
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                    }

                    rows.forEach { c ->
                        val k = key(c)
                        val p = picked[k] ?: Picked(false, "0", "0")
                        Row(
                            Modifier.fillMaxWidth().padding(top = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Checkbox(
                                checked = p.on,
                                enabled = !c.settled,
                                onCheckedChange = { picked = picked + (k to p.copy(on = it)) },
                            )
                            Column(Modifier.weight(1f)) {
                                Text(c.head.headName, style = MaterialTheme.typography.bodyMedium)
                                Text(
                                    c.periodLabel + "  ·  " + money(c.grossAmount) +
                                        if (c.settled) "  ·  paid" else "",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                        if (p.on) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Field("Discount", p.discount, numeric = true,
                                      modifier = Modifier.weight(1f)) {
                                    picked = picked + (k to p.copy(discount = it))
                                }
                                Field("Amount", p.amount, numeric = true,
                                      modifier = Modifier.weight(1f)) {
                                    picked = picked + (k to p.copy(amount = it))
                                }
                            }
                        }
                        HorizontalDivider()
                    }

                    Text(
                        (
                            if (year == fees.currentYear()) {
                                "Monthly heads are listed up to this month only. "
                            } else {
                                "Every month of " + year + " is listed, because that session " +
                                    "is over. "
                            }
                            ) + "An exam fee is not predicted — add it below, naming the exam.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 10.dp),
                    )
                }
            }

            Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text("Another line", style = MaterialTheme.typography.titleMedium)
                    Picker(
                        "Fee head",
                        listOf("" to "—") + heads.map { it.feeHeadId to it.headName },
                        extraHead,
                    ) { extraHead = it }
                    Field("Period", extraPeriod) { extraPeriod = it }
                    Field("Amount", extraAmount, numeric = true) { extraAmount = it }
                }
            }

            Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text("Receipt", style = MaterialTheme.typography.titleMedium)
                    Picker(
                        "Method",
                        listOf("Cash", "bKash", "Nagad", "Bank").map { it to it },
                        method,
                    ) { method = it }
                    Field("Date", date) { date = it }
                    Field("Remarks", remarks) { remarks = it }

                    Row(
                        Modifier.fillMaxWidth().padding(top = 14.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            lines.size.toString() + " line" + if (lines.size == 1) "" else "s",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Text(
                            money(total),
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold,
                        )
                    }

                    Button(
                        enabled = !busy && lines.isNotEmpty(),
                        onClick = {
                            busy = true; problem = ""
                            scope.launch {
                                try {
                                    onCollected(
                                        fees.collectPayment(
                                            student = student!!,
                                            lines = lines,
                                            method = method,
                                            paymentDate = date,
                                            remarks = remarks,
                                            createdBy = email,
                                        ),
                                    )
                                } catch (_: Exception) {
                                    problem = "That payment was refused. Only the head or the " +
                                        "accounts user may collect fees."
                                    busy = false
                                }
                            }
                        },
                        modifier = Modifier.padding(top = 12.dp),
                    ) { Text(if (busy) "Collecting…" else "Collect " + money(total)) }

                    Text(
                        "The receipt number is handed out as the receipt is written, in one " +
                            "transaction, so two people collecting at once can never be given " +
                            "the same number. A receipt can never be edited or deleted.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                    Problem(problem)
                }
            }
        }
    }
}
