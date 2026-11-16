package io.github.ocpabdurrahim.schooltrack.data

import android.graphics.Bitmap
import android.graphics.Color
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.SetOptions
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import java.util.Locale

/**
 * Certificates and the register of what has been issued — the twin of
 * web/src/data/documents.ts.
 *
 * Every certificate is recorded with a serial number from a counter before it
 * is printed. A testimonial is a document the school will be asked to confirm
 * years later, and "we printed one for her in 2026" is not an answer unless it
 * is written down. Nothing here is edited or deleted: a certificate issued
 * wrongly is cancelled by issuing another, and the register keeps both.
 */

enum class DocumentType(val label: String, val prefix: String) {
    TESTIMONIAL("Testimonial", "TST"),
    TRANSFER("Transfer certificate", "TC"),
    CHARACTER("Character certificate", "CHR"),
}

val CONDUCTS = listOf("Excellent", "Very good", "Good", "Satisfactory")

data class IssuedDocument(
    val serialNo: String,
    val type: DocumentType,
    val studentId: String,
    val studentName: String,
    val classLabel: String,
    val rollNo: Long,
    val regNo: String? = null,
    val fatherName: String? = null,
    val motherName: String? = null,
    val dob: String? = null,
    val issueDate: String,
    val issuedBy: String,
    val dateOfLeaving: String? = null,
    val reason: String? = null,
    val conduct: String? = null,
    val remarks: String? = null,
)

/** What the ID card's QR carries — the same text the gate scanner parses. */
fun cardCode(studentId: String) = "SMS-STU-$studentId"

/**
 * Draws the card's QR. The content comes from [cardCode], so a card can never
 * be produced carrying a code the scanner cannot resolve.
 */
fun qrBitmap(text: String, size: Int = 512): Bitmap {
    val hints = mapOf(
        EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M,
        EncodeHintType.MARGIN to 1,
    )
    val matrix = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size, hints)
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.RGB_565)
    for (x in 0 until size) {
        for (y in 0 until size) {
            bitmap.setPixel(x, y, if (matrix[x, y]) Color.BLACK else Color.WHITE)
        }
    }
    return bitmap
}

class DocumentsRepository(
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
) {
    private fun school() = db.collection("schools").document(SCHOOL_ID)

    /**
     * Issues one certificate: the serial and the record are written in a single
     * transaction, so a serial is never handed out without a document behind
     * it. The document id IS the serial, so a retry overwrites rather than
     * issuing a second certificate.
     */
    suspend fun issue(
        type: DocumentType,
        student: StudentDetail,
        issueDate: String,
        issuedBy: String,
        dateOfLeaving: String? = null,
        reason: String? = null,
        conduct: String? = null,
        remarks: String? = null,
    ): String {
        val counterRef = school().collection("counters").document("documents")

        return db.runTransaction { tx ->
            val snap = tx.get(counterRef)
            val next = if (snap.exists()) (snap.getLong("next") ?: 1L) else 1L
            val serialNo = type.prefix + "-" + String.format(Locale.UK, "%06d", next)

            // the student's details are SNAPSHOTTED: a transfer certificate must
            // keep saying Class 8 even after the roll is promoted
            val body = mapOf(
                "serialNo" to serialNo,
                "type" to type.name,
                "studentId" to student.studentId,
                "studentName" to student.fullName,
                "classLabel" to (student.className + " - " + student.section),
                "rollNo" to student.rollNo,
                "regNo" to student.regNo,
                "fatherName" to student.fatherName,
                "motherName" to student.motherName,
                "dob" to student.dob,
                "issueDate" to issueDate,
                "issuedBy" to issuedBy,
                "dateOfLeaving" to dateOfLeaving,
                "reason" to reason,
                "conduct" to conduct,
                "remarks" to remarks,
            ).filterValues { it != null && it != "" } +
                mapOf(
                    "createdAt" to FieldValue.serverTimestamp(),
                    "updatedAt" to FieldValue.serverTimestamp(),
                )

            tx.set(school().collection("documents").document(serialNo), body)
            tx.set(counterRef, mapOf("next" to next + 1), SetOptions.merge())
            serialNo
        }.await()
    }

    private fun toDoc(d: com.google.firebase.firestore.DocumentSnapshot) = IssuedDocument(
        serialNo = d.getString("serialNo") ?: d.id,
        type = runCatching { DocumentType.valueOf(d.getString("type").orEmpty()) }
            .getOrDefault(DocumentType.TESTIMONIAL),
        studentId = d.getString("studentId").orEmpty(),
        studentName = d.getString("studentName").orEmpty(),
        classLabel = d.getString("classLabel").orEmpty(),
        rollNo = d.getLong("rollNo") ?: 0,
        regNo = d.getString("regNo"),
        fatherName = d.getString("fatherName"),
        motherName = d.getString("motherName"),
        dob = d.getString("dob"),
        issueDate = d.getString("issueDate").orEmpty(),
        issuedBy = d.getString("issuedBy").orEmpty(),
        dateOfLeaving = d.getString("dateOfLeaving"),
        reason = d.getString("reason"),
        conduct = d.getString("conduct"),
        remarks = d.getString("remarks"),
    )

    suspend fun get(serialNo: String): IssuedDocument? {
        val d = school().collection("documents").document(serialNo).get().await()
        return if (d.exists()) toDoc(d) else null
    }

    suspend fun list(max: Long = 50): List<IssuedDocument> =
        school().collection("documents")
            .orderBy("issueDate", Query.Direction.DESCENDING)
            .limit(max)
            .get().await().documents.map(::toDoc)

    suspend fun forStudent(studentId: String): List<IssuedDocument> =
        school().collection("documents")
            .whereEqualTo("studentId", studentId)
            .get().await().documents.map(::toDoc)
            .sortedByDescending { it.issueDate }
}
