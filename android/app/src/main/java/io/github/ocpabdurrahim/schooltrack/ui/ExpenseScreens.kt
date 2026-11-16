package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.github.ocpabdurrahim.schooltrack.data.Expense
import io.github.ocpabdurrahim.schooltrack.data.ExpenseHead
import io.github.ocpabdurrahim.schooltrack.data.ExpensesRepository
import io.github.ocpabdurrahim.schooltrack.data.FeesRepository
import io.github.ocpabdurrahim.schooltrack.data.MonthSummary
import io.github.ocpabdurrahim.schooltrack.data.expenseBreakdown
import io.github.ocpabdurrahim.schooltrack.data.lastMonths
import io.github.ocpabdurrahim.schooltrack.data.money
import io.github.ocpabdurrahim.schooltrack.data.monthLabel
import kotlinx.coroutines.launch

@Composable
fun ExpensesScreen(
    email: String,
    isAdmin: Boolean,
    onBack: () -> Unit,
    repo: ExpensesRepository = remember { ExpensesRepository() },
    fees: FeesRepository = remember { FeesRepository() },
) {
    val scope = rememberCoroutineScope()
    val today = remember { fees.todayDate() }

    var heads by remember { mutableStateOf<List<ExpenseHead>>(emptyList()) }
    var headId by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }
    var expenseDate by remember { mutableStateOf(today) }
    var paidTo by remember { mutableStateOf("") }
    var method by remember { mutableStateOf("Cash") }
    var remarks by remember { mutableStateOf("") }

    var headCode by remember { mutableStateOf("") }
    var headName by remember { mutableStateOf("") }

    var from by remember { mutableStateOf(today.substring(0, 7) + "-01") }
    var to by remember { mutableStateOf(today) }
    var rows by remember { mutableStateOf<List<Expense>>(emptyList()) }
    var busy by remember { mutableStateOf(true) }
    var note by remember { mutableStateOf("") }
    var problem by remember { mutableStateOf("") }

    suspend fun loadHeads() {
        heads = try {
            repo.listHeads()
        } catch (_: Exception) {
            problem = "Could not read the expense heads. Only the head and accounts may."
            emptyList()
        }
        if (headId.isBlank()) headId = heads.firstOrNull { it.active }?.expenseHeadId.orEmpty()
        busy = false
    }

    LaunchedEffect(Unit) { loadHeads() }

    LaunchedEffect(from, to, note) {
        rows = try { repo.between(from, to) } catch (_: Exception) { emptyList() }
    }

    val head = heads.firstOrNull { it.expenseHeadId == headId }
    val (total, byHead) = expenseBreakdown(rows)

    AdminScaffold("Expenses", "What the school spends, and on what", onBack) {
        if (note.isNotEmpty()) {
            Text(note, color = MaterialTheme.colorScheme.primary,
                 modifier = Modifier.padding(bottom = 8.dp))
        }
        Problem(problem)

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text("Record a payment", style = MaterialTheme.typography.titleMedium)
                Picker(
                    "Head",
                    heads.filter { it.active }.map { it.expenseHeadId to it.headName },
                    headId,
                ) { headId = it }
                Field("Amount", amount, numeric = true) { amount = it }
                Field("Date (YYYY-MM-DD)", expenseDate) { expenseDate = it }
                Field("Paid to", paidTo) { paidTo = it }
                Picker(
                    "Method",
                    listOf("Cash", "bKash", "Bank", "Cheque").map { it to it },
                    method,
                ) { method = it }
                Field("Remarks", remarks) { remarks = it }

                Button(
                    enabled = !busy && heads.isNotEmpty(),
                    onClick = {
                        val h = head ?: run { problem = "Pick an expense head."; return@Button }
                        val value = amount.trim().toDoubleOrNull() ?: 0.0
                        if (value <= 0) { problem = "Enter an amount."; return@Button }
                        busy = true; problem = ""; note = ""
                        scope.launch {
                            try {
                                val voucher = repo.record(
                                    head = h,
                                    amount = value,
                                    expenseDate = expenseDate,
                                    paidTo = paidTo.ifBlank { null },
                                    method = method,
                                    remarks = remarks.ifBlank { null },
                                    enteredBy = email,
                                )
                                amount = ""; paidTo = ""; remarks = ""
                                note = "Recorded as $voucher."
                            } catch (_: Exception) {
                                problem = "That was refused. Only the head or the accounts " +
                                    "user may record an expense."
                            }
                            busy = false
                        }
                    },
                    modifier = Modifier.padding(top = 12.dp),
                ) { Text("Record expense") }

                Text(
                    "The voucher number is given as the entry is written, in one " +
                        "transaction. An expense is never deleted: one entered wrongly is " +
                        "corrected by another entry.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }

        Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(Modifier.padding(16.dp)) {
                Field("From (YYYY-MM-DD)", from) { from = it }
                Field("To (YYYY-MM-DD)", to) { to = it }

                Row(
                    Modifier.fillMaxWidth().padding(top = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column {
                        Text(money(total), style = MaterialTheme.typography.headlineSmall)
                        Text(
                            "spent",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(rows.size.toString(), style = MaterialTheme.typography.headlineSmall)
                        Text(
                            "vouchers",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                if (byHead.isNotEmpty()) {
                    HorizontalDivider(Modifier.padding(vertical = 10.dp))
                    byHead.forEach { (name, amt) ->
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(name, style = MaterialTheme.typography.bodyMedium)
                            Text(money(amt), style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
        }

        Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(Modifier.padding(16.dp)) {
                Text("Vouchers", style = MaterialTheme.typography.titleMedium)
                if (rows.isEmpty()) Text("Nothing was spent in this period.")
                rows.forEach { e ->
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(e.voucherNo, style = MaterialTheme.typography.bodyLarge)
                            Text(
                                e.headName + (e.paidTo?.let { "  ·  " + it } ?: "") +
                                    "  ·  " + e.expenseDate,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Text(money(e.amount), fontWeight = FontWeight.Bold)
                    }
                    HorizontalDivider()
                }
            }
        }

        if (isAdmin) {
            Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text("Expense heads", style = MaterialTheme.typography.titleMedium)
                    heads.forEach { h ->
                        Row(
                            Modifier.fillMaxWidth()
                                .clickable { headCode = h.headCode; headName = h.headName }
                                .padding(vertical = 8.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(h.headName, style = MaterialTheme.typography.bodyMedium)
                            Text(
                                h.headCode + if (!h.active) "  ·  off" else "",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        HorizontalDivider()
                    }

                    Field("Code", headCode) { headCode = it }
                    Field("Name", headName) { headName = it }
                    Button(
                        enabled = !busy,
                        onClick = {
                            if (headCode.isBlank() || headName.isBlank()) {
                                problem = "An expense head needs a code and a name."
                                return@Button
                            }
                            busy = true; problem = ""
                            scope.launch {
                                try {
                                    repo.saveHead(
                                        ExpenseHead(
                                            expenseHeadId = "",
                                            headCode = headCode,
                                            headName = headName,
                                            active = true,
                                            sortOrder = (heads.lastOrNull()?.sortOrder ?: 0L) + 1,
                                        ),
                                    )
                                    headCode = ""; headName = ""
                                    loadHeads()
                                } catch (_: Exception) {
                                    problem = "Only an administrator may change the expense heads."
                                    busy = false
                                }
                            }
                        },
                        modifier = Modifier.padding(top = 12.dp),
                    ) { Text("Save head") }
                }
            }
        }
    }
}

// ===========================================================================
// income against expense

@Composable
fun IncomeExpenseScreen(
    onBack: () -> Unit,
    repo: ExpensesRepository = remember { ExpensesRepository() },
    fees: FeesRepository = remember { FeesRepository() },
) {
    var count by remember { mutableStateOf(6) }
    var rows by remember { mutableStateOf<List<MonthSummary>>(emptyList()) }
    var busy by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf("") }

    LaunchedEffect(count) {
        busy = true
        rows = try {
            repo.incomeExpense(lastMonths(fees.todayDate(), count))
        } catch (_: Exception) {
            problem = "Could not build the report. Only the head and accounts may."
            emptyList()
        }
        busy = false
    }

    val income = rows.sumOf { it.income }
    val expense = rows.sumOf { it.expense }
    val net = income - expense
    val peak = maxOf(1.0, rows.maxOfOrNull { maxOf(it.income, it.expense) } ?: 1.0)

    AdminScaffold("Income and expense", "Fees collected against money spent", onBack) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Picker(
                    "Months",
                    listOf("3" to "3", "6" to "6", "12" to "12"),
                    count.toString(),
                ) { count = it.toIntOrNull() ?: 6 }

                Row(
                    Modifier.fillMaxWidth().padding(top = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column {
                        Text(
                            money(income),
                            style = MaterialTheme.typography.titleLarge,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        Text(
                            "collected",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            money(expense),
                            style = MaterialTheme.typography.titleLarge,
                            color = MaterialTheme.colorScheme.error,
                        )
                        Text(
                            "spent",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(money(net), style = MaterialTheme.typography.titleLarge)
                        Text(
                            if (net < 0) "short" else "left",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Problem(problem)
            }
        }

        Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(Modifier.padding(16.dp)) {
                if (busy) Text("Working…")
                rows.forEach { r ->
                    Text(
                        monthLabel(r.month),
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(top = 10.dp),
                    )
                    Text(
                        money(r.income) + " − " + money(r.expense) + " = " + money(r.net),
                        style = MaterialTheme.typography.bodySmall,
                        color = if (r.net < 0) MaterialTheme.colorScheme.error
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    // two bars on the same scale, so the months compare
                    Bar(r.income / peak, MaterialTheme.colorScheme.primary)
                    Bar(r.expense / peak, MaterialTheme.colorScheme.error)
                }

                Text(
                    "Income is what was actually collected in the month, not what was " +
                        "billed — unpaid dues are not income. Salaries appear here only once " +
                        "they are recorded as an expense.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 14.dp),
                )
            }
        }
    }
}

@Composable
private fun Bar(fraction: Double, colour: androidx.compose.ui.graphics.Color) {
    Box(
        Modifier.fillMaxWidth().height(6.dp).padding(top = 2.dp)
            .clip(RoundedCornerShape(3.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Box(
            Modifier.fillMaxWidth(fraction.coerceIn(0.0, 1.0).toFloat())
                .height(6.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(colour),
        )
    }
}
