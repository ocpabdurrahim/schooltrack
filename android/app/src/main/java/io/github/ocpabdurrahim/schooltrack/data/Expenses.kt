package io.github.ocpabdurrahim.schooltrack.data

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.SetOptions
import java.util.Locale

/**
 * Expenses and the income-versus-expense report — the twin of
 * web/src/data/expenses.ts.
 *
 * Voucher numbers come from a counter in a transaction, as receipt numbers
 * do: in Oracle this was a virtual column deriving EXP-000001 from the id,
 * which Firestore has no equivalent of. An expense is never deleted; one
 * entered wrongly is corrected by another entry.
 */

data class ExpenseHead(
    val expenseHeadId: String,
    val headCode: String,
    val headName: String,
    val active: Boolean = true,
    val sortOrder: Long = 0,
)

data class Expense(
    val voucherNo: String,
    val expenseHeadId: String,
    val headName: String,
    val amount: Double,
    val expenseDate: String,
    val paidTo: String? = null,
    val method: String = "Cash",
    val remarks: String? = null,
    val enteredBy: String = "",
)

data class MonthSummary(
    val month: String,
    val income: Double,
    val expense: Double,          // vouchers from the expense register
    /**
     * Salaries paid in the month -- or NULL, meaning "not visible to whoever
     * is looking", which is not the same as nothing having been paid.
     *
     * /salaryPayments is the head's alone: an accounts user may read fees and
     * vouchers but not what each teacher earns. Rather than quietly widen
     * that, the report says so -- two people seeing different totals for the
     * same month with no explanation is worse than one of them seeing less.
     */
    val salary: Double? = null,
) {
    /**
     * Salaries count as spending when they are visible. When they are not,
     * this is still income minus vouchers -- an honest partial figure,
     * labelled as one by the screen, rather than a total that silently omits
     * the largest cost a school has.
     */
    val net: Double get() = income - expense - (salary ?: 0.0)

    /** What the month actually spent, as far as this user may see. */
    val spent: Double get() = expense + (salary ?: 0.0)
}

fun expenseHeadIdFor(code: String): String =
    code.trim().uppercase().replace(Regex("[^A-Z0-9]+"), "_").trim('_')

/** The first and last day of a month, the last being the real one. */
fun monthRange(month: String): Pair<String, String> {
    val parts = month.split("-")
    val y = parts.getOrNull(0)?.toIntOrNull() ?: 2000
    val m = parts.getOrNull(1)?.toIntOrNull() ?: 1
    val last = java.time.YearMonth.of(y, m.coerceIn(1, 12)).lengthOfMonth()
    return (month + "-01") to (month + "-" + String.format(Locale.UK, "%02d", last))
}

/** The last n months, oldest first, ending with the one containing [today]. */
fun lastMonths(today: String, n: Int): List<String> {
    val y = today.substring(0, 4).toInt()
    val m = today.substring(5, 7).toInt()
    var ym = java.time.YearMonth.of(y, m).minusMonths((n - 1).toLong())
    return (0 until n).map {
        val label = String.format(Locale.UK, "%04d-%02d", ym.year, ym.monthValue)
        ym = ym.plusMonths(1)
        label
    }
}

fun expenseBreakdown(rows: List<Expense>): Pair<Double, List<Pair<String, Double>>> {
    val byHead = linkedMapOf<String, Pair<String, Double>>()
    var total = 0.0
    for (e in rows) {
        total += e.amount
        val cur = byHead[e.expenseHeadId] ?: (e.headName to 0.0)
        byHead[e.expenseHeadId] = cur.first to (cur.second + e.amount)
    }
    return total to byHead.values.sortedByDescending { it.second }
}

class ExpensesRepository(
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
    private val fees: FeesRepository = FeesRepository(),
    private val payroll: PayrollRepository = PayrollRepository(),
) {
    private fun school() = db.collection("schools").document(SCHOOL_ID)
    private fun stamp(d: Map<String, Any?>) = d + ("updatedAt" to FieldValue.serverTimestamp())

    suspend fun listHeads(): List<ExpenseHead> =
        school().collection("expenseHeads").orderBy("sortOrder").get().await().documents.map {
            ExpenseHead(
                expenseHeadId = it.id,
                headCode = it.getString("headCode").orEmpty(),
                headName = it.getString("headName").orEmpty(),
                active = it.getBoolean("active") ?: true,
                sortOrder = it.getLong("sortOrder") ?: 0,
            )
        }

    suspend fun saveHead(h: ExpenseHead) {
        val id = h.expenseHeadId.ifBlank { expenseHeadIdFor(h.headCode) }
        school().collection("expenseHeads").document(id).set(
            stamp(
                mapOf(
                    "headCode" to h.headCode.trim().uppercase(),
                    "headName" to h.headName.trim(),
                    "active" to h.active,
                    "sortOrder" to h.sortOrder,
                ),
            ),
            SetOptions.merge(),
        ).await()
    }

    /**
     * Records one expense. The voucher number and the entry are written in one
     * transaction, and the document id IS the voucher, so a retry cannot
     * produce a second voucher for the same spend.
     */
    suspend fun record(
        head: ExpenseHead,
        amount: Double,
        expenseDate: String,
        paidTo: String?,
        method: String,
        remarks: String?,
        enteredBy: String,
    ): String {
        val counterRef = school().collection("counters").document("vouchers")

        return db.runTransaction { tx ->
            val snap = tx.get(counterRef)
            val next = if (snap.exists()) (snap.getLong("next") ?: 1L) else 1L
            val voucherNo = "EXP-" + String.format(Locale.UK, "%06d", next)

            tx.set(
                school().collection("expenses").document(voucherNo),
                mapOf(
                    "voucherNo" to voucherNo,
                    "expenseHeadId" to head.expenseHeadId,
                    "headName" to head.headName,
                    "amount" to amount,
                    "expenseDate" to expenseDate,
                    "paidTo" to paidTo,
                    "method" to method,
                    "remarks" to remarks,
                    "enteredBy" to enteredBy,
                    "createdAt" to FieldValue.serverTimestamp(),
                    "updatedAt" to FieldValue.serverTimestamp(),
                ).filterValues { it != null },
            )
            tx.set(counterRef, mapOf("next" to next + 1), SetOptions.merge())
            voucherNo
        }.await()
    }

    suspend fun between(from: String, to: String): List<Expense> =
        school().collection("expenses")
            .whereGreaterThanOrEqualTo("expenseDate", from)
            .whereLessThanOrEqualTo("expenseDate", to)
            .orderBy("expenseDate", Query.Direction.DESCENDING)
            .get().await().documents.map {
                Expense(
                    voucherNo = it.getString("voucherNo") ?: it.id,
                    expenseHeadId = it.getString("expenseHeadId").orEmpty(),
                    headName = it.getString("headName").orEmpty(),
                    amount = it.getDouble("amount") ?: 0.0,
                    expenseDate = it.getString("expenseDate").orEmpty(),
                    paidTo = it.getString("paidTo"),
                    method = it.getString("method") ?: "Cash",
                    remarks = it.getString("remarks"),
                    enteredBy = it.getString("enteredBy").orEmpty(),
                )
            }

    /**
     * Income is what was COLLECTED in the month, not what was charged: dues
     * are a hope, and setting them beside real spending would make the school
     * look solvent on money nobody has handed over.
     */
    suspend fun incomeExpense(months: List<String>): List<MonthSummary> = months.map { month ->
        val (from, to) = monthRange(month)
        val income = try {
            fees.paymentsBetween(from, to).sumOf { it.totalAmount }
        } catch (_: Exception) {
            0.0
        }
        val expense = try {
            between(from, to).sumOf { it.amount }
        } catch (_: Exception) {
            0.0
        }
        // null, not 0.0, when the read was refused: see MonthSummary.salary
        val salary = try {
            payroll.salariesPaidBetween(from, to).sumOf { it.net }
        } catch (_: Exception) {
            null
        }
        MonthSummary(month, income, expense, salary)
    }
}
