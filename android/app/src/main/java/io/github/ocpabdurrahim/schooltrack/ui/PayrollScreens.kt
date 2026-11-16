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
import androidx.compose.material3.TextButton
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
import io.github.ocpabdurrahim.schooltrack.data.FeesRepository
import io.github.ocpabdurrahim.schooltrack.data.PayrollRepository
import io.github.ocpabdurrahim.schooltrack.data.SalaryPayment
import io.github.ocpabdurrahim.schooltrack.data.SalaryStructure
import io.github.ocpabdurrahim.schooltrack.data.StaffRow
import io.github.ocpabdurrahim.schooltrack.data.applyIncrement
import io.github.ocpabdurrahim.schooltrack.data.computeSalary
import io.github.ocpabdurrahim.schooltrack.data.dueForIncrement
import io.github.ocpabdurrahim.schooltrack.data.money
import io.github.ocpabdurrahim.schooltrack.data.monthLabel
import io.github.ocpabdurrahim.schooltrack.data.paymentId
import kotlinx.coroutines.launch

private fun num(s: String) = s.trim().toDoubleOrNull() ?: 0.0
private fun txt(d: Double) = if (d == d.toLong().toDouble()) d.toLong().toString() else d.toString()

// ===========================================================================
// what each person is paid

@Composable
fun SalaryStructureScreen(
    onBack: () -> Unit,
    payroll: PayrollRepository = remember { PayrollRepository() },
    admin: AdminRepository = remember { AdminRepository() },
    fees: FeesRepository = remember { FeesRepository() },
) {
    val scope = rememberCoroutineScope()
    val today = remember { fees.todayDate() }
    var staff by remember { mutableStateOf<List<StaffRow>>(emptyList()) }
    var structures by remember { mutableStateOf<List<SalaryStructure>>(emptyList()) }
    var editing by remember { mutableStateOf<SalaryStructure?>(null) }
    var busy by remember { mutableStateOf(true) }
    var note by remember { mutableStateOf("") }
    var problem by remember { mutableStateOf("") }

    suspend fun load() {
        try {
            staff = admin.listStaff().filter { it.staffStatus != "LEFT" }
            structures = payroll.listStructures()
        } catch (_: Exception) {
            problem = "Could not read the payroll. Only an administrator may."
        }
        busy = false
    }

    LaunchedEffect(Unit) { load() }

    fun structureFor(s: StaffRow) =
        structures.firstOrNull { it.staffId == s.staffId }
            ?: SalaryStructure(s.staffId, s.fullName, s.designation)

    fun save(s: SalaryStructure) {
        busy = true; problem = ""; note = ""
        scope.launch {
            try {
                payroll.saveStructure(s)
                editing = null
                load()
                note = s.staffName + "'s salary saved."
            } catch (_: Exception) {
                problem = "That save was refused. Only an administrator may set salaries."
                busy = false
            }
        }
    }

    val due = staff.filter { dueForIncrement(structureFor(it), today) }

    AdminScaffold("Salary structure", "What each member of staff is paid", onBack) {
        if (note.isNotEmpty()) {
            Text(note, color = MaterialTheme.colorScheme.primary,
                 modifier = Modifier.padding(bottom = 8.dp))
        }
        Problem(problem)

        if (due.isNotEmpty()) {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("Annual increment due", style = MaterialTheme.typography.titleMedium)
                    due.forEach { s ->
                        val st = structureFor(s)
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = 8.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(s.fullName, style = MaterialTheme.typography.bodyLarge)
                                Text(
                                    st.lastIncrementDate?.let { "last $it" } ?: "never given",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Text("+" + money(st.incrementAmount),
                                 modifier = Modifier.padding(end = 12.dp))
                            TextButton(onClick = { save(applyIncrement(st, today)) }) {
                                Text("give it")
                            }
                        }
                        HorizontalDivider()
                    }
                    Text(
                        "Due twelve months after the last one, not every January — staff " +
                            "join in different months.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
            }
        }

        Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(Modifier.padding(16.dp)) {
                Text(
                    if (busy) "Working…" else staff.size.toString() + " on the payroll",
                    style = MaterialTheme.typography.titleMedium,
                )
                staff.forEach { s ->
                    val st = structureFor(s)
                    val salary = computeSalary(st)
                    Row(
                        Modifier.fillMaxWidth().clickable { editing = st; problem = "" }
                            .padding(vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(s.fullName, style = MaterialTheme.typography.bodyLarge)
                            Text(
                                s.designation.orEmpty() + "  ·  " +
                                    if (salary.gross > 0) "gross " + money(salary.gross)
                                    else "no salary set",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Text(
                            if (salary.net > 0) money(salary.net) else "—",
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    HorizontalDivider()
                }
                if (!busy && staff.isEmpty()) {
                    Text("No staff yet — add them under Staff first.")
                }
            }
        }

        editing?.let { e ->
            Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text(e.staffName, style = MaterialTheme.typography.titleMedium)
                    Field("Basic", txt(e.basic), numeric = true) { editing = e.copy(basic = num(it)) }
                    Field("House rent", txt(e.houseRent), numeric = true) { editing = e.copy(houseRent = num(it)) }
                    Field("Medical", txt(e.medical), numeric = true) { editing = e.copy(medical = num(it)) }
                    Field("Transport", txt(e.transport), numeric = true) { editing = e.copy(transport = num(it)) }
                    Field("Other allowance", txt(e.otherAllowance), numeric = true) {
                        editing = e.copy(otherAllowance = num(it))
                    }
                    Field("Provident fund (−)", txt(e.providentFund), numeric = true) {
                        editing = e.copy(providentFund = num(it))
                    }
                    Field("Tax (−)", txt(e.tax), numeric = true) { editing = e.copy(tax = num(it)) }
                    Field("Other deduction (−)", txt(e.otherDeduction), numeric = true) {
                        editing = e.copy(otherDeduction = num(it))
                    }
                    Field("Annual increment", txt(e.incrementAmount), numeric = true) {
                        editing = e.copy(incrementAmount = num(it))
                    }
                    Field("Last increment (YYYY-MM-DD)", e.lastIncrementDate.orEmpty()) {
                        editing = e.copy(lastIncrementDate = it.ifBlank { null })
                    }

                    val salary = computeSalary(e)
                    Row(
                        Modifier.fillMaxWidth().padding(top = 14.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Stat3(money(salary.gross), "gross")
                        Stat3(money(salary.totalDeduction), "deductions")
                        Stat3(money(salary.net), "net")
                    }

                    Button(
                        enabled = !busy,
                        onClick = { save(e) },
                        modifier = Modifier.padding(top = 12.dp),
                    ) { Text("Save salary") }
                    TextButton(onClick = { editing = null }) { Text("cancel") }

                    Text(
                        "Allowances are amounts, not percentages of the basic — a percentage " +
                            "would quietly rewrite what someone was paid last year.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun Stat3(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleLarge)
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// ===========================================================================
// paying a month

@Composable
fun PaySalaryScreen(
    email: String,
    onPaid: (String) -> Unit,
    onBack: () -> Unit,
    payroll: PayrollRepository = remember { PayrollRepository() },
    fees: FeesRepository = remember { FeesRepository() },
) {
    val scope = rememberCoroutineScope()
    val today = remember { fees.todayDate() }
    var month by remember { mutableStateOf(today.substring(0, 7)) }
    var paidOn by remember { mutableStateOf(today) }
    var method by remember { mutableStateOf("Bank") }
    var remarks by remember { mutableStateOf("") }

    var structures by remember { mutableStateOf<List<SalaryStructure>>(emptyList()) }
    var paid by remember { mutableStateOf<List<SalaryPayment>>(emptyList()) }
    var picked by remember { mutableStateOf<Map<String, Boolean>>(emptyMap()) }
    var busy by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf("") }

    LaunchedEffect(month) {
        busy = true
        try {
            val all = payroll.listStructures().filter { computeSalary(it).net > 0 }
            val already = payroll.paymentsForMonth(month)
            structures = all
            paid = already
            val done = already.map { it.staffId }.toSet()
            picked = all.associate { it.staffId to (it.staffId !in done) }
            problem = ""
        } catch (_: Exception) {
            problem = "Could not read the payroll. Only an administrator may."
        }
        busy = false
    }

    val chosen = structures.filter { picked[it.staffId] == true }
    val total = chosen.sumOf { computeSalary(it).net }

    AdminScaffold(
        "Pay salary",
        monthLabel(month) + "  ·  " + paid.size + " already paid",
        onBack,
    ) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Field("Month (YYYY-MM)", month) { month = it }
                Field("Paid on (YYYY-MM-DD)", paidOn) { paidOn = it }
                Picker(
                    "Method",
                    listOf("Bank", "Cash", "bKash", "Cheque").map { it to it },
                    method,
                ) { method = it }
                Field("Remarks", remarks) { remarks = it }
                Problem(problem)
            }
        }

        Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(Modifier.padding(16.dp)) {
                if (busy) Text("Working…")
                structures.forEach { s ->
                    val salary = computeSalary(s)
                    val done = paid.firstOrNull { it.staffId == s.staffId }
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Checkbox(
                            checked = picked[s.staffId] == true,
                            onCheckedChange = { picked = picked + (s.staffId to it) },
                        )
                        Column(Modifier.weight(1f)) {
                            Text(s.staffName, style = MaterialTheme.typography.bodyMedium)
                            Text(
                                (s.designation ?: "—") +
                                    (done?.let { "  ·  paid " + it.paidOn } ?: ""),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Text(money(salary.net), fontWeight = FontWeight.Bold)
                    }
                    HorizontalDivider()
                }
                if (!busy && structures.isEmpty()) {
                    Text("Nobody has a salary set yet.")
                }

                Row(
                    Modifier.fillMaxWidth().padding(top = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(chosen.size.toString() + " to pay")
                    Text(
                        money(total),
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                    )
                }

                Button(
                    enabled = !busy && chosen.isNotEmpty(),
                    onClick = {
                        busy = true; problem = ""
                        scope.launch {
                            try {
                                payroll.paySalaries(
                                    month = month,
                                    paidOn = paidOn,
                                    method = method,
                                    paidBy = email,
                                    structures = chosen,
                                    remarks = remarks.ifBlank { null },
                                )
                                onPaid(month)
                            } catch (_: Exception) {
                                problem = "That was refused. Only an administrator may pay salaries."
                                busy = false
                            }
                        }
                    },
                    modifier = Modifier.padding(top = 8.dp),
                ) { Text(if (busy) "Paying…" else "Pay " + money(total)) }

                Text(
                    "One payment per person per month: paying a month already paid corrects " +
                        "that record rather than paying twice. Anyone already paid is left " +
                        "unticked.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }
    }
}

// ===========================================================================
// the register, and one payslip

@Composable
fun SalaryRegisterScreen(
    month: String,
    onOpenPayslip: (String) -> Unit,
    onBack: () -> Unit,
    payroll: PayrollRepository = remember { PayrollRepository() },
) {
    var showing by remember { mutableStateOf(month) }
    var rows by remember { mutableStateOf<List<SalaryPayment>>(emptyList()) }
    var busy by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf("") }

    LaunchedEffect(showing) {
        busy = true
        try {
            rows = payroll.paymentsForMonth(showing).sortedBy { it.staffName }
            problem = ""
        } catch (_: Exception) {
            problem = "Could not read the register. Only an administrator may."
        }
        busy = false
    }

    val gross = rows.sumOf { it.gross }
    val net = rows.sumOf { it.net }

    AdminScaffold("Salary register", monthLabel(showing), onBack) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Field("Month (YYYY-MM)", showing) { showing = it }
                Problem(problem)
            }
        }

        Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(Modifier.padding(16.dp)) {
                Text(
                    if (busy) "Working…" else rows.size.toString() + " paid",
                    style = MaterialTheme.typography.titleMedium,
                )
                Row(
                    Modifier.fillMaxWidth().padding(top = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Stat3(money(gross), "gross")
                    Stat3(money(net), "net paid")
                }

                HorizontalDivider(Modifier.padding(vertical = 10.dp))

                rows.forEach { r ->
                    Row(
                        Modifier.fillMaxWidth()
                            .clickable { onOpenPayslip(paymentId(r.staffId, showing)) }
                            .padding(vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(r.staffName, style = MaterialTheme.typography.bodyLarge)
                            Text(
                                (r.designation ?: "—") + "  ·  " + r.paidOn,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Text(money(r.net), fontWeight = FontWeight.Bold)
                    }
                    HorizontalDivider()
                }
                if (!busy && rows.isEmpty()) Text("Nothing has been paid for this month.")
            }
        }
    }
}

@Composable
fun PayslipScreen(
    id: String,
    onBack: () -> Unit,
    payroll: PayrollRepository = remember { PayrollRepository() },
    admin: AdminRepository = remember { AdminRepository() },
) {
    var p by remember { mutableStateOf<SalaryPayment?>(null) }
    var schoolName by remember { mutableStateOf("") }
    var problem by remember { mutableStateOf("") }

    LaunchedEffect(id) {
        schoolName = admin.getSettings()?.instituteName.orEmpty()
        p = try {
            payroll.getPayment(id) ?: run { problem = "No payslip for that month."; null }
        } catch (_: Exception) {
            problem = "Could not read that payslip."
            null
        }
    }

    AdminScaffold("Payslip", p?.staffName.orEmpty(), onBack) {
        Problem(problem)
        p?.let { s ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    if (schoolName.isNotEmpty()) {
                        Text(schoolName, style = MaterialTheme.typography.titleLarge)
                    }
                    Text(
                        "PAYSLIP — " + monthLabel(s.month).uppercase(),
                        style = MaterialTheme.typography.labelLarge,
                    )
                    HorizontalDivider(Modifier.padding(vertical = 10.dp))

                    Line("Name", s.staffName)
                    Line("Designation", s.designation ?: "—")
                    Line("Paid on", s.paidOn + " · " + s.method)

                    HorizontalDivider(Modifier.padding(vertical = 10.dp))
                    Text("Earnings", style = MaterialTheme.typography.labelMedium)
                    Line("Basic", money(s.basic))
                    if (s.houseRent > 0) Line("House rent", money(s.houseRent))
                    if (s.medical > 0) Line("Medical", money(s.medical))
                    if (s.transport > 0) Line("Transport", money(s.transport))
                    if (s.otherAllowance > 0) Line("Other", money(s.otherAllowance))
                    Line("Gross", money(s.gross), bold = true)

                    HorizontalDivider(Modifier.padding(vertical = 10.dp))
                    Text("Deductions", style = MaterialTheme.typography.labelMedium)
                    if (s.providentFund > 0) Line("Provident fund", money(s.providentFund))
                    if (s.tax > 0) Line("Tax", money(s.tax))
                    if (s.otherDeduction > 0) Line("Other", money(s.otherDeduction))
                    Line("Total", money(s.totalDeduction), bold = true)

                    HorizontalDivider(Modifier.padding(vertical = 10.dp))
                    Line("Net pay", money(s.net), bold = true)

                    Text(
                        "Every figure here was copied onto the payment when it was made, so a " +
                            "later rise cannot rewrite this slip. Printing is on the web app.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 14.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun Line(k: String, v: String, bold: Boolean = false) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            k,
            style = MaterialTheme.typography.bodyMedium,
            color = if (bold) MaterialTheme.colorScheme.onSurface
            else MaterialTheme.colorScheme.onSurfaceVariant,
            fontWeight = if (bold) FontWeight.Bold else null,
        )
        Text(
            v,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = if (bold) FontWeight.Bold else null,
        )
    }
}
