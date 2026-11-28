package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import io.github.ocpabdurrahim.schooltrack.data.FeeStatement
import io.github.ocpabdurrahim.schooltrack.data.FeesRepository
import io.github.ocpabdurrahim.schooltrack.data.Frequency
import io.github.ocpabdurrahim.schooltrack.data.Payment
import io.github.ocpabdurrahim.schooltrack.data.PeopleRepository
import io.github.ocpabdurrahim.schooltrack.data.StudentDetail
import io.github.ocpabdurrahim.schooltrack.data.explainPrivilege
import io.github.ocpabdurrahim.schooltrack.data.normalPrivilege
import io.github.ocpabdurrahim.schooltrack.data.money

/**
 * What a child owes and has paid — the Compose twin of the web's StudentFees
 * page, and the fees report a parent opens.
 *
 * The arithmetic is the office's, from the same function the dues screen uses:
 * a monthly fee counted only up to the month the school has reached, a
 * one-time fee once, an exam fee never predicted. A parent and the office
 * reading different numbers would be worse than no report at all.
 *
 * Receipts are listed in full rather than linked: the receipt screen belongs to
 * the people who take money, so everything a receipt says is shown here.
 */
@Composable
fun StudentFeesScreen(
    studentId: String,
    onBack: () -> Unit,
    people: PeopleRepository = remember { PeopleRepository() },
    fees: FeesRepository = remember { FeesRepository() },
) {
    var student by remember { mutableStateOf<StudentDetail?>(null) }
    var session by remember { mutableStateOf(fees.currentYear()) }
    var statement by remember { mutableStateOf<FeeStatement?>(null) }
    var receipts by remember { mutableStateOf<List<Payment>>(emptyList()) }
    var refused by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf("") }

    LaunchedEffect(studentId) {
        student = try {
            people.getStudent(studentId)
        } catch (_: Exception) {
            problem = "Those records could not be read."
            null
        }
    }

    LaunchedEffect(student, session) {
        val s = student ?: return@LaunchedEffect
        busy = true
        val report = fees.feeReport(s, session)
        if (report == null) {
            refused = true
        } else {
            refused = false
            statement = report.first
            receipts = report.second.filter { r -> r.lines.any { it.sessionYear == session } }
        }
        busy = false
    }

    AdminScaffold(
        title = "Fees report",
        subtitle = student?.let { "${it.fullName} · ${it.className} - ${it.section} · Roll ${it.rollNo}" },
        onBack = onBack,
    ) {
        Problem(problem)

        val thisYear = fees.currentYear()
        val years = listOf((thisYear.toInt() - 1).toString(), thisYear)
        Picker("Session", years.map { it to it }, session) { session = it }

        if (refused) {
            FeeCard {
                Text(
                    "Your account may not read the fee records. The head teacher and the " +
                        "accounts user can; a teacher cannot.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Muted,
                )
            }
            return@AdminScaffold
        }

        if (busy && statement == null) {
            Text("Loading…", Modifier.padding(top = 12.dp), color = Muted)
            return@AdminScaffold
        }

        val report = statement ?: return@AdminScaffold

        FeeCard {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Figure(money(report.charged), "charged so far", Ink, Modifier.weight(1f))
                Figure(money(report.paid), "paid", Green, Modifier.weight(1f))
                Figure(
                    money(report.outstanding),
                    "outstanding",
                    if (report.outstanding > 0) Bad else Green,
                    Modifier.weight(1f),
                )
            }
            if (report.waived > 0) {
                val privilege = normalPrivilege(student?.privilege)
                Text(
                    privilege + " — " + explainPrivilege(privilege) + ". " +
                        money(report.waived) + " off this session's bill. The rates below " +
                        "are the ones this student is charged.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Green,
                    modifier = Modifier.padding(top = 10.dp),
                )
            }
            if (report.discount > 0) {
                Text(
                    "Discount allowed: ${money(report.discount)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = Muted,
                    modifier = Modifier.padding(top = 10.dp),
                )
            }
        }

        FeeCard {
            if (report.lines.isEmpty()) {
                Text(
                    "Nothing has been charged for this session yet.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Muted,
                )
            }
            report.lines.forEach { l ->
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            l.headName,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            buildString {
                                append(if (l.rate == null) "no rate set" else money(l.rate!!))
                                when {
                                    l.frequency == Frequency.MONTHLY && l.periods > 0 ->
                                        append(" × ${l.periods} month" + if (l.periods == 1) "" else "s")
                                    l.frequency == Frequency.EXAM -> append(" per exam")
                                    else -> Unit
                                }
                                if (l.waived > 0) append("  ·  ${money(l.waived)} waived")
                                append("  ·  paid ${money(l.paid)}")
                                if (l.discount > 0) append(" + ${money(l.discount)} disc.")
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = Muted,
                        )
                    }
                    Spacer(Modifier.width(10.dp))
                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            money(l.charged),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Text(
                            when {
                                l.balance > 0 -> "owing ${money(l.balance)}"
                                // A free place is not "not charged yet": the
                                // school has decided, and the line should say so
                                l.waived > 0 && l.charged == 0.0 && l.paid == 0.0 ->
                                    "waived in full"
                                // "settled" would be a strange thing to say
                                // about a fee nobody has been charged yet
                                l.charged == 0.0 && l.paid == 0.0 -> "not charged yet"
                                else -> "settled"
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = when {
                                l.balance > 0 -> Bad
                                l.waived > 0 && l.charged == 0.0 && l.paid == 0.0 -> Green
                                l.charged == 0.0 && l.paid == 0.0 -> Muted
                                else -> Green
                            },
                        )
                    }
                }
                HorizontalDivider(color = LineSoft)
            }
        }

        FeeCard {
            Text(
                "RECEIPTS",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = Muted,
            )
            if (receipts.isEmpty()) {
                Text(
                    "No fees have been paid for this session yet.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Muted,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
            receipts.forEach { r ->
                Row(
                    Modifier.fillMaxWidth().padding(top = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            r.receiptNo,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            "${r.paymentDate} · ${r.method}",
                            style = MaterialTheme.typography.bodySmall,
                            color = Muted,
                        )
                    }
                    Text(
                        money(r.totalAmount),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Bold,
                    )
                }
                r.lines.filter { it.sessionYear == session }.forEach { l ->
                    Row(
                        Modifier.fillMaxWidth().padding(start = 12.dp, top = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            "${l.headName} · ${l.periodLabel}",
                            style = MaterialTheme.typography.bodySmall,
                            color = Muted,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            money(l.amountPaid) +
                                if (l.discountAmount > 0) " (disc. ${money(l.discountAmount)})" else "",
                            style = MaterialTheme.typography.bodySmall,
                            color = Muted,
                        )
                    }
                }
            }
        }

        Text(
            "Monthly fees are counted up to this month only, so nothing is shown as owing for " +
                "months that have not happened. An exam fee is charged when the exam happens " +
                "rather than predicted. A balance is worked out fee by fee: paying one fee in " +
                "advance does not settle another. If any of this disagrees with the school's own " +
                "ledger, the office's figure is the one to go by.",
            style = MaterialTheme.typography.bodySmall,
            color = Muted,
            modifier = Modifier.padding(top = 14.dp),
        )
    }
}

@Composable
private fun FeeCard(content: @Composable ColumnScope.() -> Unit) {
    Card(
        Modifier.fillMaxWidth().padding(top = 10.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Line),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Column(Modifier.padding(14.dp), content = content)
    }
}

@Composable
private fun Figure(value: String, label: String, colour: Color, modifier: Modifier = Modifier) {
    Column(
        modifier
            .clip(RoundedCornerShape(10.dp))
            .border(BorderStroke(1.dp, Line), RoundedCornerShape(10.dp))
            .background(Color.White)
            .padding(vertical = 10.dp, horizontal = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = colour)
        Text(label, style = MaterialTheme.typography.labelSmall, color = Muted, textAlign = TextAlign.Center)
    }
}
