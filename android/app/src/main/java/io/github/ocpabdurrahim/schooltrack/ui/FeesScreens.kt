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
import io.github.ocpabdurrahim.schooltrack.data.AdminRepository
import io.github.ocpabdurrahim.schooltrack.data.AttendanceRepository
import io.github.ocpabdurrahim.schooltrack.data.ClassRow
import io.github.ocpabdurrahim.schooltrack.data.Dues
import io.github.ocpabdurrahim.schooltrack.data.FeeHead
import io.github.ocpabdurrahim.schooltrack.data.FeesRepository
import io.github.ocpabdurrahim.schooltrack.data.Frequency
import io.github.ocpabdurrahim.schooltrack.data.Payment
import io.github.ocpabdurrahim.schooltrack.data.PeopleRepository
import io.github.ocpabdurrahim.schooltrack.data.SchoolClass
import io.github.ocpabdurrahim.schooltrack.data.StructureRow
import io.github.ocpabdurrahim.schooltrack.data.breakdown
import io.github.ocpabdurrahim.schooltrack.data.money
import io.github.ocpabdurrahim.schooltrack.data.structureId
import kotlinx.coroutines.launch

private val FREQUENCY = listOf(
    Frequency.MONTHLY to "Every month",
    Frequency.ONE_TIME to "Once a session",
    Frequency.EXAM to "Per exam",
)

private fun frequencyText(f: Frequency) = FREQUENCY.first { it.first == f }.second

// ===========================================================================
// what each class is charged

@Composable
fun FeeSetupScreen(
    onBack: () -> Unit,
    fees: FeesRepository = remember { FeesRepository() },
    admin: AdminRepository = remember { AdminRepository() },
) {
    val scope = rememberCoroutineScope()
    var heads by remember { mutableStateOf<List<FeeHead>>(emptyList()) }
    var structure by remember { mutableStateOf<List<StructureRow>>(emptyList()) }
    var classNames by remember { mutableStateOf<List<String>>(emptyList()) }

    var form by remember {
        mutableStateOf(FeeHead("", "", "", Frequency.MONTHLY, true, 0))
    }
    var className by remember { mutableStateOf("") }
    var year by remember { mutableStateOf(fees.currentYear()) }
    var amounts by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var busy by remember { mutableStateOf(true) }
    var note by remember { mutableStateOf("") }
    var problem by remember { mutableStateOf("") }

    suspend fun load() {
        try {
            heads = fees.listFeeHeads()
            structure = fees.listStructure()
            val classes: List<ClassRow> = admin.listAllClasses().filter { it.active }
            classNames = classes.map { it.className }.distinct()
            if (className.isEmpty()) className = classNames.firstOrNull().orEmpty()
        } catch (_: Exception) {
            problem = "Could not read the fee setup."
        }
        busy = false
    }

    LaunchedEffect(Unit) { load() }

    // the rate card for the chosen class and session, as editable text
    LaunchedEffect(heads, structure, className, year) {
        amounts = heads.associate { h ->
            val row = structure.firstOrNull { it.id == structureId(h.feeHeadId, className, year) }
            h.feeHeadId to (row?.amount?.let { money(it).replace(",", "") } ?: "")
        }
    }

    AdminScaffold("Fee setup", "What each class is charged, and how often", onBack) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text("Fee heads", style = MaterialTheme.typography.titleMedium)
                heads.forEach { h ->
                    Row(
                        Modifier.fillMaxWidth().clickable { form = h; problem = "" }
                            .padding(vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(h.headName, style = MaterialTheme.typography.bodyLarge)
                            Text(
                                h.headCode + "  ·  " + frequencyText(h.frequency) +
                                    if (!h.active) "  ·  off" else "",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Text("edit", color = MaterialTheme.colorScheme.primary)
                    }
                    HorizontalDivider()
                }

                Field("Code", form.headCode) { form = form.copy(headCode = it) }
                Field("Name", form.headName) { form = form.copy(headName = it) }
                Picker("Charged", FREQUENCY.map { it.first.name to it.second }, form.frequency.name) {
                    form = form.copy(frequency = Frequency.valueOf(it))
                }
                Field("Order", form.sortOrder.toString(), numeric = true) {
                    form = form.copy(sortOrder = it.toLongOrNull() ?: 0L)
                }
                Row(
                    Modifier.fillMaxWidth().padding(top = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(checked = form.active, onCheckedChange = { form = form.copy(active = it) })
                    Text("In use")
                }

                Button(
                    enabled = !busy,
                    onClick = {
                        if (form.headCode.isBlank() || form.headName.isBlank()) {
                            problem = "A fee head needs a short code and a name."
                            return@Button
                        }
                        busy = true; problem = ""
                        scope.launch {
                            try {
                                fees.saveFeeHead(form)
                                form = FeeHead("", "", "", Frequency.MONTHLY, true, 0)
                                load()
                            } catch (_: Exception) { problem = REFUSED; busy = false }
                        }
                    },
                    modifier = Modifier.padding(top = 12.dp),
                ) { Text(if (form.feeHeadId.isEmpty()) "Add fee head" else "Save fee head") }
                Problem(problem)
            }
        }

        Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(Modifier.padding(16.dp)) {
                Text("Rates", style = MaterialTheme.typography.titleMedium)
                Picker("Class", classNames.map { it to it }, className) { className = it }
                Field("Session", year) { year = it }
                Text(
                    "A rate is per class, not per section: Class 6 A and Class 6 B are " +
                        "charged the same. Leave a box empty and that head is not charged " +
                        "to this class.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )

                heads.filter { it.active }.forEach { h ->
                    Field(
                        h.headName + " · " + frequencyText(h.frequency),
                        amounts[h.feeHeadId].orEmpty(),
                        numeric = true,
                    ) { amounts = amounts + (h.feeHeadId to it) }
                }

                Button(
                    enabled = !busy && className.isNotEmpty(),
                    onClick = {
                        busy = true; problem = ""; note = ""
                        scope.launch {
                            try {
                                var saved = 0
                                for (h in heads) {
                                    val raw = amounts[h.feeHeadId].orEmpty().trim()
                                    val amount = raw.toDoubleOrNull() ?: continue
                                    if (amount < 0) continue
                                    fees.saveStructure(h.feeHeadId, className, year, amount)
                                    saved++
                                }
                                load()
                                note = "$saved rate(s) saved for $className, $year."
                            } catch (_: Exception) { problem = REFUSED; busy = false }
                        }
                    },
                    modifier = Modifier.padding(top = 12.dp),
                ) { Text("Save rates") }

                if (note.isNotEmpty()) {
                    Text(note, color = MaterialTheme.colorScheme.primary,
                         modifier = Modifier.padding(top = 8.dp))
                }
            }
        }
    }
}

// ===========================================================================
// one receipt

@Composable
fun ReceiptScreen(
    receiptNo: String,
    onBack: () -> Unit,
    fees: FeesRepository = remember { FeesRepository() },
    admin: AdminRepository = remember { AdminRepository() },
) {
    var p by remember { mutableStateOf<Payment?>(null) }
    var schoolName by remember { mutableStateOf("") }
    var problem by remember { mutableStateOf("") }

    LaunchedEffect(receiptNo) {
        schoolName = admin.getSettings()?.instituteName.orEmpty()
        try {
            p = fees.getPayment(receiptNo) ?: run { problem = "No receipt $receiptNo."; null }
        } catch (_: Exception) {
            problem = "Could not read that receipt."
        }
    }

    AdminScaffold("Receipt", receiptNo, onBack) {
        Problem(problem)
        p?.let { r ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    if (schoolName.isNotEmpty()) {
                        Text(schoolName, style = MaterialTheme.typography.titleLarge)
                    }
                    Text("MONEY RECEIPT", style = MaterialTheme.typography.labelLarge)

                    HorizontalDivider(Modifier.padding(vertical = 10.dp))
                    KeyValue("Receipt no.", r.receiptNo)
                    KeyValue("Date", r.paymentDate)
                    KeyValue("Student", r.studentName)
                    KeyValue("Class", r.classLabel + " · Roll " + r.rollNo)
                    HorizontalDivider(Modifier.padding(vertical = 10.dp))

                    r.lines.forEach { l ->
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = 6.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(l.headName, style = MaterialTheme.typography.bodyMedium)
                                Text(
                                    l.periodLabel +
                                        if (l.discountAmount > 0) "  ·  less " + money(l.discountAmount) else "",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Text(money(l.amountPaid), style = MaterialTheme.typography.bodyMedium)
                        }
                        HorizontalDivider()
                    }

                    Row(
                        Modifier.fillMaxWidth().padding(top = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text("Total", fontWeight = FontWeight.Bold)
                        Text(money(r.totalAmount), fontWeight = FontWeight.Bold)
                    }

                    KeyValue("Paid by", r.method)
                    if (!r.remarks.isNullOrBlank()) KeyValue("Remarks", r.remarks!!)
                    KeyValue("Received by", r.createdBy)

                    Text(
                        "A receipt cannot be edited or deleted. If this one is wrong, collect " +
                            "a correcting entry instead — the ledger keeps both.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun KeyValue(k: String, v: String) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(k, style = MaterialTheme.typography.bodyMedium,
             color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(v, style = MaterialTheme.typography.bodyMedium)
    }
}

// ===========================================================================
// what came in

@Composable
fun ReceiptsScreen(
    onOpen: (String) -> Unit,
    onBack: () -> Unit,
    fees: FeesRepository = remember { FeesRepository() },
) {
    var from by remember { mutableStateOf(fees.todayDate()) }
    var to by remember { mutableStateOf(fees.todayDate()) }
    var rows by remember { mutableStateOf<List<Payment>>(emptyList()) }
    var busy by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf("") }

    LaunchedEffect(from, to) {
        busy = true
        try {
            rows = fees.paymentsBetween(from, to)
            problem = ""
        } catch (_: Exception) {
            problem = "Could not read the receipts. Only the head and accounts may."
        }
        busy = false
    }

    val (total, byHead, byMethod) = breakdown(rows)

    AdminScaffold(
        "Receipts",
        if (from == to) "Collection on $from" else "Collection from $from to $to",
        onBack,
    ) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Field("From (YYYY-MM-DD)", from) { from = it }
                Field("To (YYYY-MM-DD)", to) { to = it }
                Problem(problem)
            }
        }

        Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(Modifier.padding(16.dp)) {
                Text(
                    if (busy) "Working…" else rows.size.toString() + " receipt(s)",
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(
                    money(total),
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                )
                byMethod.forEach { (m, amount) ->
                    Row(
                        Modifier.fillMaxWidth().padding(top = 6.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(m, style = MaterialTheme.typography.bodyMedium)
                        Text(money(amount), style = MaterialTheme.typography.bodyMedium)
                    }
                }
                if (byHead.isNotEmpty()) {
                    HorizontalDivider(Modifier.padding(vertical = 10.dp))
                    Text("By fee head", style = MaterialTheme.typography.labelMedium)
                    byHead.forEach { (name, amount) ->
                        Row(
                            Modifier.fillMaxWidth().padding(top = 6.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(name, style = MaterialTheme.typography.bodyMedium)
                            Text(money(amount), style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
        }

        Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(Modifier.padding(16.dp)) {
                if (!busy && rows.isEmpty()) Text("Nothing was collected in this period.")
                rows.forEach { p ->
                    Row(
                        Modifier.fillMaxWidth().clickable { onOpen(p.receiptNo) }
                            .padding(vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(p.receiptNo, style = MaterialTheme.typography.bodyLarge)
                            Text(
                                p.studentName + "  ·  " + p.classLabel + "  ·  " + p.method,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Text(money(p.totalAmount), fontWeight = FontWeight.Bold)
                    }
                    HorizontalDivider()
                }
            }
        }
    }
}

// ===========================================================================
// what is still owed

@Composable
fun DuesScreen(
    onBack: () -> Unit,
    fees: FeesRepository = remember { FeesRepository() },
    people: PeopleRepository = remember { PeopleRepository() },
    attendance: AttendanceRepository = remember { AttendanceRepository() },
) {
    var classes by remember { mutableStateOf<List<SchoolClass>>(emptyList()) }
    var classId by remember { mutableStateOf("") }
    var year by remember { mutableStateOf(fees.currentYear()) }
    var rows by remember { mutableStateOf<List<Dues>>(emptyList()) }
    var onlyOwing by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        classes = try { attendance.listClasses() } catch (_: Exception) { emptyList() }
        classId = classes.firstOrNull()?.classId.orEmpty()
    }

    LaunchedEffect(classId, year) {
        if (classId.isEmpty()) return@LaunchedEffect
        busy = true
        try {
            rows = fees.duesFor(people.findStudents(classId, ""), year)
            problem = ""
        } catch (_: Exception) {
            problem = "Could not work out the dues. Only the head and accounts may see them."
        }
        busy = false
    }

    val shown = (if (onlyOwing) rows.filter { it.due > 0 } else rows)
        .sortedWith(compareByDescending<Dues> { it.due }.thenBy { it.student.rollNo })
    val owed = rows.sumOf { it.due }
    val collected = rows.sumOf { it.paid }

    AdminScaffold("Dues", "What is still owed for the session", onBack) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Picker(
                    "Section",
                    classes.map { it.classId to it.displayName },
                    classId,
                ) { classId = it }
                Field("Session", year) { year = it }
                Row(
                    Modifier.fillMaxWidth().padding(top = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(checked = onlyOwing, onCheckedChange = { onlyOwing = it })
                    Text("Only those who owe")
                }
                Problem(problem)
            }
        }

        Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(Modifier.padding(16.dp)) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column {
                        Text(money(owed), style = MaterialTheme.typography.headlineSmall)
                        Text(
                            "outstanding",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(money(collected), style = MaterialTheme.typography.headlineSmall)
                        Text(
                            "collected",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }

        Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(Modifier.padding(16.dp)) {
                if (busy) Text("Working…")
                if (!busy && shown.isEmpty()) {
                    Text(
                        if (onlyOwing) "Nobody in this section owes anything."
                        else "No students here.",
                    )
                }
                shown.forEach { r ->
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                r.student.rollNo.toString() + "  " + r.student.fullName,
                                style = MaterialTheme.typography.bodyLarge,
                            )
                            Text(
                                "paid " + money(r.paid) + " of " + money(r.expected) +
                                    if (r.discount > 0) "  ·  " + money(r.discount) + " allowed" else "",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Text(
                            if (r.due > 0) money(r.due) else "clear",
                            fontWeight = FontWeight.Bold,
                            color = if (r.due > 0) MaterialTheme.colorScheme.error
                            else MaterialTheme.colorScheme.primary,
                        )
                    }
                    HorizontalDivider()
                }

                Text(
                    "Monthly fees are counted up to this month only, so nobody is shown owing " +
                        "for months that have not happened. Exam fees are not predicted.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 10.dp),
                )
            }
        }
    }
}
