package io.github.ocpabdurrahim.schooltrack.data

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.SetOptions
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Fees: what is charged, what was collected, what is still owed. The Kotlin
 * twin of the web app's data/fees.ts — the two must agree, because a parent
 * will be told the same figure by either.
 *
 * Three things the rules enforce and this file must respect:
 *
 *   1. A RECEIPT NUMBER COMES FROM A COUNTER, IN A TRANSACTION. Never from a
 *      document count: two phones collecting at the same moment would read the
 *      same count and issue the same receipt number.
 *   2. A RECEIPT IS NEVER EDITED OR DELETED. A mistake is corrected by another
 *      entry, the way a paper ledger does it.
 *   3. EVERY LINE IS A SNAPSHOT of the rate when it was collected.
 */

enum class Frequency { MONTHLY, ONE_TIME, EXAM }

data class FeeHead(
    val feeHeadId: String,
    val headCode: String,
    val headName: String,
    val frequency: Frequency,
    val active: Boolean,
    val sortOrder: Long,
)

data class StructureRow(
    val id: String,
    val feeHeadId: String,
    val className: String,
    val sessionYear: String,
    val amount: Double,
)

data class PaymentLine(
    val feeHeadId: String,
    val headName: String,
    val sessionYear: String,
    val periodLabel: String,
    val grossAmount: Double,
    val discountAmount: Double,
    val amountPaid: Double,
)

data class Payment(
    val receiptNo: String,
    val studentId: String,
    val studentName: String,
    val classLabel: String,
    val rollNo: Long,
    val paymentDate: String,
    val totalAmount: Double,
    val method: String,
    val remarks: String?,
    val lines: List<PaymentLine>,
    val createdBy: String,
)

data class Collectable(
    val head: FeeHead,
    val periodLabel: String,
    /**
     * What THIS student is charged for this period: the card rate, less
     * whatever their privilege waives. The receipt line snapshots this.
     */
    val grossAmount: Double,
    /**
     * Taken off the card rate by the student's privilege, for the screen to
     * show. It is NOT a discount: it never reaches a receipt as one, because
     * a waiver counted twice is a waiver that leaves nothing owing.
     */
    val waived: Double,
    val paid: Double,        // money already taken
    val discount: Double,    // discount already allowed
) {
    /**
     * A DISCOUNT SETTLES ITS SHARE: 500 billed, 100 allowed and 400 taken
     * leaves nothing owing. Counting the discount as unpaid left every
     * discounted month showing a residue for ever.
     */
    val outstanding: Double get() = (grossAmount - paid - discount).coerceAtLeast(0.0)
    val settled: Boolean get() = outstanding <= 0.0
}

// ---------------------------------------------------------------------------
// one student's fees, head by head -- what a parent is shown

data class FeeLine(
    val feeHeadId: String,
    val headName: String,
    val frequency: Frequency?,   // null = the head is gone from the rate card
    /** Per period for THIS student: the class rate less any privilege waiver.
     *  null = no rate is set for the class. */
    val rate: Double?,
    val periods: Int,
    val charged: Double,
    /** Taken off the class rate across those periods by the privilege. */
    val waived: Double,
    val paid: Double,
    val discount: Double,
    val balance: Double,
)

data class FeeStatement(
    val sessionYear: String,
    val lines: List<FeeLine>,
) {
    val charged: Double get() = lines.sumOf { it.charged }

    /** What the privilege took off the bill this session, over every line. */
    val waived: Double get() = lines.sumOf { it.waived }
    val paid: Double get() = lines.sumOf { it.paid }
    val discount: Double get() = lines.sumOf { it.discount }
    val outstanding: Double get() = lines.sumOf { it.balance }
}

/**
 * What this student owes and has paid, head by head — the twin of
 * feeStatement() in web/src/data/fees.ts, with the same test cases.
 *
 * Three rules carried from the dues screen, because a parent and the office
 * must never be shown different arithmetic:
 *
 *   1. A MONTHLY fee is counted up to the month the school has reached, never
 *      to the end of the year. Nobody owes December in August.
 *   2. A ONE-TIME fee is counted once.
 *   3. AN EXAM FEE IS NEVER PREDICTED. Its rate is shown, because a parent is
 *      entitled to know it, but nothing is charged until the exam happens.
 *
 * A head that has payments but no rate for this class still gets a line, so
 * every taka a parent has handed over is accounted for somewhere; its balance
 * is 0, because money paid against nothing owed is not a debt.
 *
 * Outstanding is the sum of the line balances, not charged minus paid: paying
 * two months of tuition in advance does not settle an unpaid admission fee.
 */
fun feeStatement(
    heads: List<FeeHead>,
    structure: List<StructureRow>,
    receipts: List<Payment>,
    className: String,
    sessionYear: String,
    monthsCounted: Int,
    /** The student's standing arrangement. Required, not defaulted: a caller
     *  that forgets it would bill a free place the full rate. */
    privilege: String?,
): FeeStatement {
    data class Money(var headName: String, var paid: Double, var discount: Double)

    val paidByHead = linkedMapOf<String, Money>()
    for (p in receipts) {
        for (l in p.lines) {
            if (l.sessionYear != sessionYear) continue
            val at = paidByHead.getOrPut(l.feeHeadId) { Money(l.headName, 0.0, 0.0) }
            at.paid += l.amountPaid
            at.discount += l.discountAmount
        }
    }

    val lines = mutableListOf<FeeLine>()

    for (head in heads.filter { it.active }) {
        val row = structure.firstOrNull {
            it.feeHeadId == head.feeHeadId &&
                it.className == className &&
                it.sessionYear == sessionYear
        }
        val money = paidByHead.remove(head.feeHeadId)
        if (row?.amount == null && money == null) continue

        val cardRate = row?.amount
        val rate = if (cardRate == null) null else netRate(head.feeHeadId, cardRate, privilege)
        val periods = when {
            rate == null -> 0
            head.frequency == Frequency.MONTHLY -> monthsCounted
            head.frequency == Frequency.ONE_TIME -> 1
            else -> 0                                  // EXAM: never predicted
        }
        val charged = (rate ?: 0.0) * periods
        val waived = if (cardRate == null) 0.0 else (cardRate - (rate ?: 0.0)) * periods
        val paid = money?.paid ?: 0.0
        val discount = money?.discount ?: 0.0

        lines += FeeLine(
            feeHeadId = head.feeHeadId,
            headName = head.headName,
            frequency = head.frequency,
            rate = rate,
            periods = periods,
            charged = charged,
            waived = waived,
            paid = paid,
            discount = discount,
            balance = (charged - paid - discount).coerceAtLeast(0.0),
        )
    }

    // whatever was paid against a head that is no longer on the card
    for ((feeHeadId, money) in paidByHead) {
        lines += FeeLine(
            feeHeadId = feeHeadId,
            headName = money.headName.ifBlank { feeHeadId },
            frequency = null,
            rate = null,
            periods = 0,
            charged = 0.0,
            waived = 0.0,
            paid = money.paid,
            discount = money.discount,
            balance = 0.0,
        )
    }

    return FeeStatement(sessionYear, lines)
}

data class Dues(
    val student: StudentDetail,
    val expected: Double,
    val paid: Double,
    val discount: Double,
    val due: Double,
)

val MONTHS = listOf(
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
)

fun monthPeriod(monthIndex: Int, year: String) = MONTHS[monthIndex] + "-" + year
fun sessionPeriod(year: String) = "SESSION-$year"

/** Money for display: no decimals when it is a whole number, which it nearly
 *  always is here — "600" reads better than "600.00" on a receipt. */
fun money(n: Double): String =
    if (n == n.toLong().toDouble()) String.format(Locale.UK, "%,d", n.toLong())
    else String.format(Locale.UK, "%,.2f", n)

class FeesRepository(
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
) {
    private fun school() = db.collection("schools").document(SCHOOL_ID)
    private fun stamp(d: Map<String, Any?>) =
        d.filterValues { it != null } + ("updatedAt" to FieldValue.serverTimestamp())

    private fun today(): String =
        SimpleDateFormat("yyyy-MM-dd", Locale.UK).apply {
            timeZone = TimeZone.getTimeZone("Asia/Dhaka")
        }.format(Date())

    fun currentYear(): String = today().substring(0, 4)
    fun currentMonthIndex(): Int = today().substring(5, 7).toInt() - 1
    fun todayDate(): String = today()

    // -----------------------------------------------------------------------
    // what is charged

    suspend fun listFeeHeads(): List<FeeHead> =
        school().collection("feeHeads").orderBy("sortOrder").get().await().documents.map {
            FeeHead(
                feeHeadId = it.id,
                headCode = it.getString("headCode").orEmpty(),
                headName = it.getString("headName").orEmpty(),
                frequency = runCatching {
                    Frequency.valueOf(it.getString("frequency").orEmpty())
                }.getOrDefault(Frequency.MONTHLY),
                active = it.getBoolean("active") ?: true,
                sortOrder = it.getLong("sortOrder") ?: 0,
            )
        }

    suspend fun saveFeeHead(h: FeeHead) {
        val id = h.feeHeadId.ifBlank { feeHeadIdFor(h.headCode) }
        school().collection("feeHeads").document(id).set(
            stamp(
                mapOf(
                    "headCode" to h.headCode.trim().uppercase(),
                    "headName" to h.headName.trim(),
                    "frequency" to h.frequency.name,
                    "active" to h.active,
                    "sortOrder" to h.sortOrder,
                ),
            ),
            SetOptions.merge(),
        ).await()
    }

    suspend fun listStructure(): List<StructureRow> =
        school().collection("feeStructure").get().await().documents.map {
            StructureRow(
                id = it.id,
                feeHeadId = it.getString("feeHeadId").orEmpty(),
                className = it.getString("className").orEmpty(),
                sessionYear = it.getString("sessionYear").orEmpty(),
                amount = it.getDouble("amount") ?: 0.0,
            )
        }

    suspend fun saveStructure(feeHeadId: String, className: String, year: String, amount: Double) {
        school().collection("feeStructure").document(structureId(feeHeadId, className, year)).set(
            stamp(
                mapOf(
                    "feeHeadId" to feeHeadId,
                    "className" to className,
                    "sessionYear" to year,
                    "amount" to amount,
                ),
            ),
            SetOptions.merge(),
        ).await()
    }

    // -----------------------------------------------------------------------
    // collecting

    /**
     * What has already been settled for one student, per head+period — money
     * taken and discount allowed kept apart, because only one is income.
     */
    suspend fun settledByPeriod(studentId: String): Map<String, Pair<Double, Double>> {
        val docs = school().collection("payments")
            .whereEqualTo("studentId", studentId)
            .get().await().documents

        val sums = mutableMapOf<String, Pair<Double, Double>>()
        for (d in docs) {
            for (line in readLines(d.get("lines"))) {
                val key = line.feeHeadId + "|" + line.periodLabel
                val cur = sums[key] ?: (0.0 to 0.0)
                sums[key] = (cur.first + line.amountPaid) to (cur.second + line.discountAmount)
            }
        }
        return sums
    }

    /**
     * What this student could be asked to pay this session, minus what has
     * already been collected.
     *
     * MONTHLY heads only up to the current month — billing a parent in March
     * for December is how a dues list loses its credibility. EXAM heads are
     * never predicted: nothing here knows how many exams there will be, so
     * they are added as a named line at collection time.
     */
    suspend fun collectablesFor(student: StudentDetail, sessionYear: String): List<Collectable> {
        val heads = listFeeHeads().filter { it.active }
        val structure = listStructure()
        val settled = settledByPeriod(student.studentId)

        val lastMonth = if (sessionYear == currentYear()) currentMonthIndex() else 11
        val out = mutableListOf<Collectable>()

        /**
         * One period of one head, charged at this student's own rate.
         *
         * A period their privilege wipes out entirely is NOT offered: there
         * is nothing to take, and a row of noughts only invites somebody to
         * type into it. It does still appear when money was taken against it
         * before the privilege was granted, so nothing already paid vanishes.
         */
        fun add(head: FeeHead, period: String, cardRate: Double) {
            val waived = waiverOn(head.feeHeadId, cardRate, student.privilege)
            val charge = (cardRate - waived).coerceAtLeast(0.0)
            val (paid, discount) = settled[head.feeHeadId + "|" + period] ?: (0.0 to 0.0)
            if (charge <= 0.0 && paid == 0.0 && discount == 0.0) return
            out += Collectable(head, period, charge, waived, paid, discount)
        }

        for (head in heads) {
            val rate = structure.firstOrNull {
                it.feeHeadId == head.feeHeadId &&
                    it.className == student.className &&
                    it.sessionYear == sessionYear
            } ?: continue
            if (rate.amount <= 0.0) continue

            when (head.frequency) {
                Frequency.MONTHLY ->
                    for (m in 0..lastMonth) add(head, monthPeriod(m, sessionYear), rate.amount)
                Frequency.ONE_TIME ->
                    add(head, sessionPeriod(sessionYear), rate.amount)
                Frequency.EXAM -> Unit
            }
        }
        return out
    }

    /**
     * Takes the money. The receipt number and the receipt are written in ONE
     * transaction: if the counter cannot move, no receipt exists, and no two
     * receipts can carry the same number. The document id IS the receipt
     * number, so a retry cannot produce a second copy.
     */
    suspend fun collectPayment(
        student: StudentDetail,
        lines: List<PaymentLine>,
        method: String,
        paymentDate: String,
        remarks: String?,
        createdBy: String,
    ): String {
        require(lines.isNotEmpty()) { "nothing to collect" }
        val total = lines.sumOf { it.amountPaid }
        val counterRef = school().collection("counters").document("receipts")

        return db.runTransaction { tx ->
            val snap = tx.get(counterRef)
            val next = if (snap.exists()) (snap.getLong("next") ?: 1L) else 1L
            val receiptNo = "RCPT-" + String.format(Locale.UK, "%06d", next)

            tx.set(
                school().collection("payments").document(receiptNo),
                mapOf(
                    "receiptNo" to receiptNo,
                    "studentId" to student.studentId,
                    "studentName" to student.fullName,
                    "classLabel" to (student.className + " - " + student.section),
                    "rollNo" to student.rollNo,
                    "paymentDate" to paymentDate,
                    "totalAmount" to total,
                    "method" to method,
                    "remarks" to remarks?.trim().orEmpty().ifBlank { null },
                    "lines" to lines.map {
                        mapOf(
                            "feeHeadId" to it.feeHeadId,
                            "headName" to it.headName,
                            "sessionYear" to it.sessionYear,
                            "periodLabel" to it.periodLabel,
                            "grossAmount" to it.grossAmount,
                            "discountAmount" to it.discountAmount,
                            "amountPaid" to it.amountPaid,
                        )
                    },
                    // denormalised so dues can be answered with one query
                    "sessionYears" to lines.map { it.sessionYear }.distinct(),
                    "createdBy" to createdBy,
                    "createdAt" to FieldValue.serverTimestamp(),
                ),
            )
            tx.set(counterRef, mapOf("next" to next + 1), SetOptions.merge())
            receiptNo
        }.await()
    }

    // -----------------------------------------------------------------------
    // reading back

    @Suppress("UNCHECKED_CAST")
    private fun readLines(raw: Any?): List<PaymentLine> =
        (raw as? List<Map<String, Any?>>).orEmpty().map { m ->
            PaymentLine(
                feeHeadId = m["feeHeadId"] as? String ?: "",
                headName = m["headName"] as? String ?: "",
                sessionYear = m["sessionYear"] as? String ?: "",
                periodLabel = m["periodLabel"] as? String ?: "",
                grossAmount = (m["grossAmount"] as? Number)?.toDouble() ?: 0.0,
                discountAmount = (m["discountAmount"] as? Number)?.toDouble() ?: 0.0,
                amountPaid = (m["amountPaid"] as? Number)?.toDouble() ?: 0.0,
            )
        }

    private fun toPayment(d: com.google.firebase.firestore.DocumentSnapshot) = Payment(
        receiptNo = d.getString("receiptNo") ?: d.id,
        studentId = d.getString("studentId").orEmpty(),
        studentName = d.getString("studentName").orEmpty(),
        classLabel = d.getString("classLabel").orEmpty(),
        rollNo = d.getLong("rollNo") ?: 0,
        paymentDate = d.getString("paymentDate").orEmpty(),
        totalAmount = d.getDouble("totalAmount") ?: 0.0,
        method = d.getString("method").orEmpty(),
        remarks = d.getString("remarks"),
        lines = readLines(d.get("lines")),
        createdBy = d.getString("createdBy").orEmpty(),
    )

    suspend fun getPayment(receiptNo: String): Payment? {
        val d = school().collection("payments").document(receiptNo).get().await()
        return if (d.exists()) toPayment(d) else null
    }

    suspend fun paymentsBetween(from: String, to: String): List<Payment> =
        school().collection("payments")
            .whereGreaterThanOrEqualTo("paymentDate", from)
            .whereLessThanOrEqualTo("paymentDate", to)
            .orderBy("paymentDate", Query.Direction.DESCENDING)
            .get().await().documents.map(::toPayment)

    /** The months of the session counted so far: all twelve for a past year. */
    fun monthsCountedFor(sessionYear: String): Int =
        (if (sessionYear == currentYear()) currentMonthIndex() else 11) + 1

    /** The rate card and the receipts a fees report is built from. Returns null
     *  when the role may read none of it — a teacher — so the screen can say so
     *  rather than showing a report full of zeroes. */
    suspend fun feeReport(
        student: StudentDetail,
        sessionYear: String,
    ): Pair<FeeStatement, List<Payment>>? = try {
        val heads = listFeeHeads()
        val structure = listStructure()
        val receipts = paymentsForStudent(student.studentId)
        feeStatement(
            heads, structure, receipts, student.className, sessionYear,
            monthsCountedFor(sessionYear), student.privilege,
        ) to receipts
    } catch (_: Exception) {
        null
    }

    suspend fun paymentsForStudent(studentId: String): List<Payment> =
        school().collection("payments")
            .whereEqualTo("studentId", studentId)
            .get().await().documents.map(::toPayment)
            .sortedByDescending { it.paymentDate }

    /**
     * Dues for a whole section in three queries, not three per student: the
     * rate card and the session's receipts are fetched once and matched up in
     * memory. Same expectation rule as [collectablesFor], so the two screens
     * can never disagree about what a parent owes.
     */
    suspend fun duesFor(students: List<StudentDetail>, sessionYear: String): List<Dues> {
        val heads = listFeeHeads().filter { it.active }
        val structure = listStructure()
        val payments = school().collection("payments")
            .whereArrayContains("sessionYears", sessionYear)
            .get().await().documents.map(::toPayment)

        val perStudent = mutableMapOf<String, Pair<Double, Double>>()
        for (p in payments) {
            for (l in p.lines) {
                if (l.sessionYear != sessionYear) continue
                val cur = perStudent[p.studentId] ?: (0.0 to 0.0)
                perStudent[p.studentId] = (cur.first + l.amountPaid) to (cur.second + l.discountAmount)
            }
        }

        val months = (if (sessionYear == currentYear()) currentMonthIndex() else 11) + 1

        return students.map { student ->
            var expected = 0.0
            for (head in heads) {
                val row = structure.firstOrNull {
                    it.feeHeadId == head.feeHeadId &&
                        it.className == student.className &&
                        it.sessionYear == sessionYear
                } ?: continue
                // The student's OWN rate: a privilege is a standing change to
                // what they are charged, not an allowance on a receipt.
                val rate = netRate(head.feeHeadId, row.amount, student.privilege)
                when (head.frequency) {
                    Frequency.MONTHLY -> expected += rate * months
                    Frequency.ONE_TIME -> expected += rate
                    Frequency.EXAM -> Unit
                }
            }
            // A discount is not a debt: it reduces what is owed, exactly as on
            // the collect screen, so the two can never disagree.
            val (paid, discount) = perStudent[student.studentId] ?: (0.0 to 0.0)
            Dues(student, expected, paid, discount, (expected - paid - discount).coerceAtLeast(0.0))
        }
    }
}

/** The id is the head code — TUITION, EXAM — so a receipt line stays readable
 *  years later without another lookup. */
fun feeHeadIdFor(code: String): String =
    code.trim().uppercase().replace(Regex("[^A-Z0-9]+"), "_").trim('_')

fun structureId(feeHeadId: String, className: String, sessionYear: String): String =
    (feeHeadId + "_" + className + "_" + sessionYear).replace(Regex("\\s+"), "-")

/** One period's takings, broken down by fee head and by method. */
fun breakdown(payments: List<Payment>): Triple<Double, List<Pair<String, Double>>, List<Pair<String, Double>>> {
    val byHead = linkedMapOf<String, Pair<String, Double>>()
    val byMethod = linkedMapOf<String, Double>()
    var total = 0.0

    for (p in payments) {
        total += p.totalAmount
        byMethod[p.method] = (byMethod[p.method] ?: 0.0) + p.totalAmount
        for (l in p.lines) {
            val cur = byHead[l.feeHeadId] ?: (l.headName to 0.0)
            byHead[l.feeHeadId] = cur.first to (cur.second + l.amountPaid)
        }
    }

    return Triple(
        total,
        byHead.values.sortedByDescending { it.second },
        byMethod.entries.map { it.key to it.value },
    )
}
