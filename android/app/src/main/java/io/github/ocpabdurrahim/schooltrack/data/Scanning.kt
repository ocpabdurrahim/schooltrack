package io.github.ocpabdurrahim.schooltrack.data

import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Source
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Gate scanning.
 *
 * OFFLINE: there is no hand-written queue here on purpose. The Firestore
 * Android SDK already persists writes to disk, retries them when the network
 * returns and survives the app being killed — a second queue on top of that
 * would duplicate the machinery and risk writing a mark twice. What it does
 * NOT give you is visibility, so `pending` below counts the marks that have
 * not yet been acknowledged by the server, and the scanner shows it.
 *
 * The document id is date_studentId, so a write that is retried — or the same
 * card scanned again after a reconnect — overwrites rather than duplicates.
 */
sealed interface ScanOutcome {
    data class Marked(val student: Student, val status: Status, val queued: Boolean) : ScanOutcome
    data class Already(val student: Student) : ScanOutcome
    data class Refused(val message: String) : ScanOutcome
}

class ScanRepository(
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
    private val attendance: AttendanceRepository = AttendanceRepository(),
) {
    private fun school() = db.collection("schools").document(SCHOOL_ID)

    private val outstanding = AtomicInteger(0)
    private val _pending = MutableStateFlow(0)

    /** Marks written but not yet acknowledged by the server. */
    val pending: StateFlow<Int> = _pending

    /** 'SMS-STU-76' from a printed card, or a bare '76' typed by hand. */
    fun parseCode(raw: String): String? = parseCardCode(raw)

    /**
     * Pulls every active student into Firestore's local cache, so cards can be
     * resolved at the gate with no signal. Without this, only students whose
     * records happen to have been read already would scan offline.
     */
    suspend fun warmRoster(): Int =
        school().collection("students").whereEqualTo("status", "A").get().await().size()

    private suspend fun findStudent(studentId: String): Student? {
        val ref = school().collection("students").document(studentId)
        // Server first so a newly admitted student is found; cache when there
        // is no signal, which is the whole point at the gate.
        val doc = try {
            ref.get(Source.SERVER).await()
        } catch (_: Exception) {
            try { ref.get(Source.CACHE).await() } catch (_: Exception) { null }
        } ?: return null

        if (!doc.exists() || doc.getString("status") != "A") return null
        return Student(
            studentId = studentId,
            fullName = doc.getString("fullName").orEmpty(),
            rollNo = doc.getLong("rollNo") ?: 0,
            classId = doc.getString("classId").orEmpty(),
            className = doc.getString("className").orEmpty(),
            section = doc.getString("section").orEmpty(),
        )
    }

    /**
     * classId null = gate mode: any active student is accepted and recorded
     * against their OWN class. Same refusals and wording as the web app and
     * the APEX function before it.
     */
    suspend fun scan(
        raw: String,
        classId: String?,
        date: String,
        email: String,
        lateAfter: String? = null,
    ): ScanOutcome {
        val studentId = parseCode(raw)
            ?: return ScanOutcome.Refused("That is not a student card.")

        val student = findStudent(studentId)
            ?: return ScanOutcome.Refused("No active student has card number $studentId.")

        if (classId != null && student.classId != classId) {
            return ScanOutcome.Refused(
                student.fullName + " is in " + student.className + " - " + student.section +
                    ", not this section.",
            )
        }

        val existing = try {
            school().collection("attendanceMarks")
                .document(date + "_" + studentId).get(Source.DEFAULT).await()
        } catch (_: Exception) {
            null
        }
        val before = existing?.getString("status")
        if (before == "P" || before == "L") return ScanOutcome.Already(student)

        val status = if (lateAfter != null && date == attendance.todayInDhaka() &&
            nowHHMM() > lateAfter
        ) Status.L else Status.P

        // Fire the write and DO NOT wait for the server: at a gate the next
        // student is already holding up their card, and offline the Task would
        // never complete. The SDK has already applied the write locally and
        // persisted it for retry; `pending` tells the operator how many are
        // still in flight so nobody closes the app on a queue.
        val task = attendance.markTask(student, date, status, "SCAN", email)
        _pending.value = outstanding.incrementAndGet()
        task.addOnCompleteListener { _pending.value = outstanding.decrementAndGet() }

        // not acknowledged yet = it is sitting in the offline queue
        return ScanOutcome.Marked(student, status, queued = !task.isComplete)
    }

    private fun nowHHMM(): String =
        java.text.SimpleDateFormat("HH:mm", java.util.Locale.UK).apply {
            timeZone = java.util.TimeZone.getTimeZone("Asia/Dhaka")
        }.format(java.util.Date())
}

/**
 * 'SMS-STU-76' from a printed card, or a bare '76' typed by hand.
 *
 * Top-level on purpose: this is the other half of what [cardCode] writes onto
 * the ID card, and the pair of them is worth a unit test. Inside the
 * repository it could not be tested without Firestore.
 */
fun parseCardCode(raw: String): String? {
    val code = raw.trim().uppercase()
    Regex("""^SMS-STU-(\d+)$""").find(code)?.let { return it.groupValues[1] }
    return if (Regex("""^\d+$""").matches(code)) code else null
}
