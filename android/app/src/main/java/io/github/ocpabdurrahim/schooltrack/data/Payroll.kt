package io.github.ocpabdurrahim.schooltrack.data

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import kotlin.math.max

/**
 * Payroll — the Kotlin twin of web/src/data/payroll.ts, with the same test
 * cases. Two apps must not disagree about what someone is owed.
 *
 *   1. ONE PAYMENT PER PERSON PER MONTH. The document id is staffId_YYYY-MM,
 *      so paying a month twice corrects the record instead of paying twice.
 *   2. A PAYSLIP IS A SNAPSHOT: every figure is copied onto the payment, so a
 *      later rise cannot rewrite an old payslip.
 *
 * Only an ADMIN may read any of this.
 */

data class SalaryStructure(
    val staffId: String,
    val staffName: String,
    val designation: String? = null,
    val basic: Double = 0.0,
    val houseRent: Double = 0.0,
    val medical: Double = 0.0,
    val transport: Double = 0.0,
    val otherAllowance: Double = 0.0,
    val providentFund: Double = 0.0,
    val tax: Double = 0.0,
    val otherDeduction: Double = 0.0,
    /** the annual increment, in taka, added to the basic once a year */
    val incrementAmount: Double = 0.0,
    val lastIncrementDate: String? = null,   // YYYY-MM-DD
)

data class Salary(val gross: Double, val totalDeduction: Double, val net: Double)

/** Gross, deductions and net. Allowances are amounts, not percentages: a
 *  percentage silently recalculates old payslips when the basic changes. */
fun computeSalary(s: SalaryStructure): Salary {
    val gross = s.basic + s.houseRent + s.medical + s.transport + s.otherAllowance
    val deductions = s.providentFund + s.tax + s.otherDeduction
    return Salary(gross, deductions, max(0.0, gross - deductions))
}

fun monthsBetween(from: String, to: String): Int {
    val f = from.split("-").map { it.toIntOrNull() ?: 0 }
    val t = to.split("-").map { it.toIntOrNull() ?: 0 }
    if (f.size < 3 || t.size < 3) return 0
    var months = (t[0] - f[0]) * 12 + (t[1] - f[1])
    if (t[2] < f[2]) months -= 1          // not a full month yet
    return months
}

/**
 * Twelve months after the last one, not "in January": staff join in different
 * months, and an increment that lands on everyone in January quietly gives
 * someone who joined in November a thirteen-month first year.
 */
fun dueForIncrement(s: SalaryStructure, today: String): Boolean {
    if (s.incrementAmount <= 0.0) return false
    val last = s.lastIncrementDate ?: return true
    return monthsBetween(last, today) >= 12
}

fun applyIncrement(s: SalaryStructure, today: String): SalaryStructure =
    s.copy(basic = s.basic + s.incrementAmount, lastIncrementDate = today)

fun paymentId(staffId: String, month: String) = staffId + "_" + month

fun monthLabel(month: String): String {
    val parts = month.split("-")
    val names = listOf(
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    )
    val m = parts.getOrNull(1)?.toIntOrNull() ?: 1
    return names[(m - 1).coerceIn(0, 11)] + " " + parts.firstOrNull().orEmpty()
}

data class SalaryPayment(
    val staffId: String,
    val staffName: String,
    val designation: String?,
    val month: String,
    val basic: Double,
    val houseRent: Double,
    val medical: Double,
    val transport: Double,
    val otherAllowance: Double,
    val providentFund: Double,
    val tax: Double,
    val otherDeduction: Double,
    val gross: Double,
    val totalDeduction: Double,
    val net: Double,
    val paidOn: String,
    val method: String,
    val paidBy: String,
    val remarks: String?,
)

class PayrollRepository(
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
) {
    private fun school() = db.collection("schools").document(SCHOOL_ID)
    private fun stamp(d: Map<String, Any?>) = d + ("updatedAt" to FieldValue.serverTimestamp())

    suspend fun listStructures(): List<SalaryStructure> =
        school().collection("salaryStructure").get().await().documents.map {
            SalaryStructure(
                staffId = it.id,
                staffName = it.getString("staffName").orEmpty(),
                designation = it.getString("designation"),
                basic = it.getDouble("basic") ?: 0.0,
                houseRent = it.getDouble("houseRent") ?: 0.0,
                medical = it.getDouble("medical") ?: 0.0,
                transport = it.getDouble("transport") ?: 0.0,
                otherAllowance = it.getDouble("otherAllowance") ?: 0.0,
                providentFund = it.getDouble("providentFund") ?: 0.0,
                tax = it.getDouble("tax") ?: 0.0,
                otherDeduction = it.getDouble("otherDeduction") ?: 0.0,
                incrementAmount = it.getDouble("incrementAmount") ?: 0.0,
                lastIncrementDate = it.getString("lastIncrementDate"),
            )
        }

    suspend fun saveStructure(s: SalaryStructure) {
        school().collection("salaryStructure").document(s.staffId).set(
            stamp(
                mapOf(
                    "staffName" to s.staffName,
                    "designation" to s.designation,
                    "basic" to s.basic,
                    "houseRent" to s.houseRent,
                    "medical" to s.medical,
                    "transport" to s.transport,
                    "otherAllowance" to s.otherAllowance,
                    "providentFund" to s.providentFund,
                    "tax" to s.tax,
                    "otherDeduction" to s.otherDeduction,
                    "incrementAmount" to s.incrementAmount,
                    "lastIncrementDate" to s.lastIncrementDate,
                ),
            ),
            SetOptions.merge(),
        ).await()
    }

    private fun toPayment(d: com.google.firebase.firestore.DocumentSnapshot) = SalaryPayment(
        staffId = d.getString("staffId").orEmpty(),
        staffName = d.getString("staffName").orEmpty(),
        designation = d.getString("designation"),
        month = d.getString("month").orEmpty(),
        basic = d.getDouble("basic") ?: 0.0,
        houseRent = d.getDouble("houseRent") ?: 0.0,
        medical = d.getDouble("medical") ?: 0.0,
        transport = d.getDouble("transport") ?: 0.0,
        otherAllowance = d.getDouble("otherAllowance") ?: 0.0,
        providentFund = d.getDouble("providentFund") ?: 0.0,
        tax = d.getDouble("tax") ?: 0.0,
        otherDeduction = d.getDouble("otherDeduction") ?: 0.0,
        gross = d.getDouble("gross") ?: 0.0,
        totalDeduction = d.getDouble("totalDeduction") ?: 0.0,
        net = d.getDouble("net") ?: 0.0,
        paidOn = d.getString("paidOn").orEmpty(),
        method = d.getString("method").orEmpty(),
        paidBy = d.getString("paidBy").orEmpty(),
        remarks = d.getString("remarks"),
    )

    suspend fun paymentsForMonth(month: String): List<SalaryPayment> =
        school().collection("salaryPayments").whereEqualTo("month", month)
            .get().await().documents.map(::toPayment)

    suspend fun getPayment(id: String): SalaryPayment? {
        val d = school().collection("salaryPayments").document(id).get().await()
        return if (d.exists()) toPayment(d) else null
    }

    /**
     * Pays a month in one batch. The id is staffId_month, so a second run for
     * the same month corrects rather than pays again — and the screen shows
     * who is already paid, so that second run has to be deliberate.
     */
    suspend fun paySalaries(
        month: String,
        paidOn: String,
        method: String,
        paidBy: String,
        structures: List<SalaryStructure>,
        remarks: String? = null,
    ) {
        val batch = db.batch()
        for (s in structures) {
            val salary = computeSalary(s)
            batch.set(
                school().collection("salaryPayments").document(paymentId(s.staffId, month)),
                mapOf(
                    "staffId" to s.staffId,
                    "staffName" to s.staffName,
                    "designation" to s.designation,
                    "month" to month,
                    "basic" to s.basic,
                    "houseRent" to s.houseRent,
                    "medical" to s.medical,
                    "transport" to s.transport,
                    "otherAllowance" to s.otherAllowance,
                    "providentFund" to s.providentFund,
                    "tax" to s.tax,
                    "otherDeduction" to s.otherDeduction,
                    "gross" to salary.gross,
                    "totalDeduction" to salary.totalDeduction,
                    "net" to salary.net,
                    "paidOn" to paidOn,
                    "method" to method,
                    "paidBy" to paidBy,
                    "remarks" to remarks,
                    "updatedAt" to FieldValue.serverTimestamp(),
                ),
            )
        }
        batch.commit().await()
    }
}
