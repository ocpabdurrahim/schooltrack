package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The same cases exist in web/src/data/fees.test.ts. */
class FeesTest {

    private fun head(id: String, name: String, frequency: Frequency) = FeeHead(
        feeHeadId = id, headCode = id, headName = name,
        frequency = frequency, active = true, sortOrder = 0,
    )

    private val heads = listOf(
        head("TUITION", "Tuition fee", Frequency.MONTHLY),
        head("ADMISSION", "Admission fee", Frequency.ONE_TIME),
        head("EXAM", "Exam fee", Frequency.EXAM),
    )

    private fun rate(
        feeHeadId: String,
        amount: Double,
        className: String = "Class 6",
        sessionYear: String = "2026",
    ) = StructureRow("${feeHeadId}_${className}_$sessionYear", feeHeadId, className, sessionYear, amount)

    private val structure = listOf(
        rate("TUITION", 300.0), rate("ADMISSION", 1000.0), rate("EXAM", 200.0),
    )

    private fun line(
        feeHeadId: String,
        amountPaid: Double,
        discountAmount: Double = 0.0,
        sessionYear: String = "2026",
        headName: String = heads.firstOrNull { it.feeHeadId == feeHeadId }?.headName ?: feeHeadId,
    ) = PaymentLine(
        feeHeadId = feeHeadId,
        headName = headName,
        sessionYear = sessionYear,
        periodLabel = "JAN-2026",
        grossAmount = amountPaid + discountAmount,
        discountAmount = discountAmount,
        amountPaid = amountPaid,
    )

    private fun receipt(receiptNo: String, lines: List<PaymentLine>) = Payment(
        receiptNo = receiptNo, studentId = "76", studentName = "Ayesha",
        classLabel = "Class 6 - A", rollNo = 1, paymentDate = "2026-08-08",
        totalAmount = lines.sumOf { it.amountPaid }, method = "Cash",
        remarks = null, lines = lines, createdBy = "accounts@test.local",
    )

    private fun statement(
        receipts: List<Payment>,
        months: Int = 8,
        privilege: String = "Regular",
    ) = feeStatement(heads, structure, receipts, "Class 6", "2026", months, privilege)

    @Test
    fun `a monthly fee is counted up to the month reached, never to the year end`() {
        // Nobody owes December in August.
        val tuition = statement(emptyList(), 8).lines.first { it.feeHeadId == "TUITION" }
        assertEquals(8, tuition.periods)
        assertEquals(2400.0, tuition.charged, 0.001)
    }

    @Test
    fun `a one-time fee is counted once`() {
        val admission = statement(emptyList()).lines.first { it.feeHeadId == "ADMISSION" }
        assertEquals(1, admission.periods)
        assertEquals(1000.0, admission.charged, 0.001)
    }

    @Test
    fun `an exam fee is never predicted, but its rate is still named`() {
        val exam = statement(emptyList()).lines.first { it.feeHeadId == "EXAM" }
        assertEquals(200.0, exam.rate!!, 0.001)
        assertEquals(0, exam.periods)
        assertEquals(0.0, exam.charged, 0.001)
        assertEquals(0.0, exam.balance, 0.001)
        assertEquals(3400.0, statement(emptyList()).outstanding, 0.001)
    }

    @Test
    fun `an exam fee appears once paid, owing nothing`() {
        val s = statement(listOf(receipt("RCPT-1", listOf(line("EXAM", 200.0)))))
        val exam = s.lines.first { it.feeHeadId == "EXAM" }
        assertEquals(200.0, exam.paid, 0.001)
        assertEquals(0.0, exam.charged, 0.001)
        assertEquals(0.0, exam.balance, 0.001)
    }

    @Test
    fun `payments and discounts come off the head they were paid against`() {
        val s = statement(listOf(receipt("RCPT-1", listOf(line("TUITION", 1500.0, 300.0)))))
        val tuition = s.lines.first { it.feeHeadId == "TUITION" }
        assertEquals(1500.0, tuition.paid, 0.001)
        assertEquals(300.0, tuition.discount, 0.001)
        assertEquals(600.0, tuition.balance, 0.001)
    }

    @Test
    fun `an overpayment never shows a negative balance`() {
        val s = statement(listOf(receipt("RCPT-1", listOf(line("TUITION", 5000.0)))))
        assertEquals(0.0, s.lines.first { it.feeHeadId == "TUITION" }.balance, 0.001)
    }

    @Test
    fun `one head does not settle another`() {
        // Two months of tuition paid in advance do not settle the admission fee.
        val s = statement(listOf(receipt("RCPT-1", listOf(line("TUITION", 5000.0)))))
        assertEquals(1000.0, s.outstanding, 0.001)
        assertTrue(s.charged - s.paid < 0)
    }

    @Test
    fun `lines from another session are ignored`() {
        val s = statement(listOf(receipt("RCPT-1", listOf(line("TUITION", 900.0, sessionYear = "2025")))))
        assertEquals(0.0, s.paid, 0.001)
        assertEquals(2400.0, s.lines.first { it.feeHeadId == "TUITION" }.balance, 0.001)
    }

    @Test
    fun `money paid against a head that left the card is still accounted for`() {
        val s = feeStatement(
            heads, structure,
            listOf(receipt("RCPT-1", listOf(line("LIBRARY", 150.0, headName = "Library fee")))),
            "Class 6", "2026", 8, "Regular",
        )
        val library = s.lines.first { it.feeHeadId == "LIBRARY" }
        assertEquals("Library fee", library.headName)
        assertEquals(150.0, library.paid, 0.001)
        assertEquals(0.0, library.balance, 0.001)
        assertEquals(150.0, s.paid, 0.001)
    }

    @Test
    fun `a head this class is not charged for is left out`() {
        val s = feeStatement(
            heads, listOf(rate("TUITION", 300.0)), emptyList(), "Class 6", "2026", 8, "Regular",
        )
        assertEquals(listOf("TUITION"), s.lines.map { it.feeHeadId })
        assertEquals(2400.0, s.charged, 0.001)
        assertFalse(s.lines.any { it.feeHeadId == "EXAM" })
    }

    @Test
    fun `the totals add up from the lines`() {
        val s = statement(
            listOf(
                receipt(
                    "RCPT-1",
                    listOf(line("TUITION", 1200.0), line("ADMISSION", 1000.0, 100.0)),
                ),
            ),
        )
        assertEquals(3400.0, s.charged, 0.001)
        assertEquals(2200.0, s.paid, 0.001)
        assertEquals(100.0, s.discount, 0.001)
        assertEquals(1200.0, s.outstanding, 0.001)
        // the exam fee is on the card, so it has a frequency and a rate, and
        // still contributes nothing to what is owed
        assertEquals(Frequency.EXAM, s.lines.first { it.feeHeadId == "EXAM" }.frequency)
    }

    @Test
    fun `a half-fee student is charged half the tuition, and the rest in full`() {
        val s = statement(emptyList(), 8, "Half fee")
        val tuition = s.lines.first { it.feeHeadId == "TUITION" }
        assertEquals(150.0, tuition.rate!!, 0.001)       // the card says 300
        assertEquals(1200.0, tuition.charged, 0.001)     // 150 x 8, not 2400
        assertEquals(1200.0, tuition.waived, 0.001)
        val admission = s.lines.first { it.feeHeadId == "ADMISSION" }
        assertEquals(0.0, admission.waived, 0.001)       // only tuition is waived
        assertEquals(1000.0, admission.charged, 0.001)
    }

    @Test
    fun `a donor family and a scholarship are charged no tuition at all`() {
        for (p in listOf("Donor family", "Scholarship")) {
            val s = statement(emptyList(), 8, p)
            val tuition = s.lines.first { it.feeHeadId == "TUITION" }
            assertEquals(0.0, tuition.charged, 0.001)
            assertEquals(2400.0, tuition.waived, 0.001)
            assertEquals(1000.0, s.charged, 0.001)       // the admission fee, in full
            assertEquals(1000.0, s.outstanding, 0.001)
        }
    }

    @Test
    fun `a blank privilege is read as the full rate, never as a free place`() {
        assertEquals(3400.0, statement(emptyList(), 8, "").charged, 0.001)
        assertEquals(
            3400.0,
            feeStatement(heads, structure, emptyList(), "Class 6", "2026", 8, null).charged,
            0.001,
        )
    }

    @Test
    fun `a privileged month is settled by the smaller payment, leaving nothing owing`() {
        // A half-fee student hands over 150 for January: that month is done.
        val s = statement(listOf(receipt("RCPT-1", listOf(line("TUITION", 150.0)))), 1, "Half fee")
        val tuition = s.lines.first { it.feeHeadId == "TUITION" }
        assertEquals(150.0, tuition.charged, 0.001)
        assertEquals(150.0, tuition.paid, 0.001)
        assertEquals(0.0, tuition.balance, 0.001)
    }
}
