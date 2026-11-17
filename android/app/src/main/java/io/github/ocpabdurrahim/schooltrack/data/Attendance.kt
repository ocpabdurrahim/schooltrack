package io.github.ocpabdurrahim.schooltrack.data

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

enum class Status { P, A, L, E }

val Status.label: String
    get() = when (this) {
        Status.P -> "Present"
        Status.A -> "Absent"
        Status.L -> "Late"
        Status.E -> "Leave"
    }

/**
 * One section.
 *
 * `className` and `section` are the two halves of the display name, kept
 * apart because the pickers that choose a class and then a section need them
 * apart — and because a subject is set up against the CLASS, not the section.
 * Both default to empty so a section saved before they existed still reads.
 */
data class SchoolClass(
    val classId: String,
    val displayName: String,
    val className: String = "",
    val section: String = "",
)

data class Student(
    val studentId: String,
    val fullName: String,
    val rollNo: Long,
    val classId: String,
    val className: String,
    val section: String,
)

/** A student plus today's mark. No mark document means Absent. */
data class RegisterRow(val student: Student, val status: Status, val via: String?)

class AttendanceRepository(
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
) {
    private fun school() = db.collection("schools").document(SCHOOL_ID)
    private fun marks() = school().collection("attendanceMarks")

    /** The date in Dhaka, whatever the device's own clock is set to. */
    fun todayInDhaka(): String =
        SimpleDateFormat("yyyy-MM-dd", Locale.UK).apply {
            timeZone = TimeZone.getTimeZone("Asia/Dhaka")
        }.format(Date())

    suspend fun listClasses(): List<SchoolClass> =
        school().collection("classes").orderBy("sortOrder").get().await().documents.map {
            SchoolClass(
                classId = it.id,
                displayName = it.getString("displayName") ?: it.id,
                className = it.getString("className").orEmpty(),
                section = it.getString("section").orEmpty(),
            )
        }

    /**
     * The register for one section on one day.
     *
     * A student with no mark document is Absent — the same choice as the web
     * app: it keeps a half-finished register honest without writing a document
     * per student per day.
     */
    suspend fun loadRegister(classId: String, date: String): List<RegisterRow> {
        val students = school().collection("students")
            .whereEqualTo("status", "A")
            .whereEqualTo("classId", classId)
            .orderBy("rollNo")
            .get().await().documents.map {
                Student(
                    studentId = it.id,
                    fullName = it.getString("fullName").orEmpty(),
                    rollNo = it.getLong("rollNo") ?: 0,
                    classId = it.getString("classId").orEmpty(),
                    className = it.getString("className").orEmpty(),
                    section = it.getString("section").orEmpty(),
                )
            }

        val marked = marks()
            .whereEqualTo("date", date)
            .whereEqualTo("classId", classId)
            .get().await().documents.associateBy(
                { it.getString("studentId").orEmpty() },
                { it },
            )

        return students.map { s ->
            val m = marked[s.studentId]
            RegisterRow(
                student = s,
                status = m?.getString("status")?.let { runCatching { Status.valueOf(it) }.getOrNull() }
                    ?: Status.A,
                via = m?.getString("markedVia"),
            )
        }
    }

    /** Records that the day was opened, so "not taken yet" stays distinguishable. */
    suspend fun openSession(date: String, email: String) {
        school().collection("attendance").document(date).set(
            mapOf(
                "date" to date,
                "openedBy" to email,
                "openedAt" to FieldValue.serverTimestamp(),
                "updatedAt" to FieldValue.serverTimestamp(),
            ),
            com.google.firebase.firestore.SetOptions.merge(),
        ).await()
    }

    /**
     * One mark. Class, section and roll are written as a SNAPSHOT of this
     * moment — reading them off the student later would re-label the whole
     * register the day a promotion runs. The rules refuse a write that omits
     * them, so a mistake here fails loudly rather than quietly.
     *
     * The document id is date_studentId, which makes a repeated write — a
     * retry, or a queued scan replayed after signal returns — overwrite rather
     * than duplicate.
     */
    suspend fun mark(student: Student, date: String, status: Status, via: String, email: String) {
        markTask(student, date, status, via, email).await()
    }

    /**
     * The same write, NOT awaited.
     *
     * A Firestore write Task completes only when the SERVER acknowledges it.
     * Offline it simply never completes — while the write itself has already
     * been applied to the local cache and persisted for retry. At a gate the
     * next student is already holding up their card, so the scanner fires this
     * and watches the Task only to know when it has landed.
     */
    fun markTask(
        student: Student,
        date: String,
        status: Status,
        via: String,
        email: String,
    ): com.google.android.gms.tasks.Task<Void> =
        marks().document(date + "_" + student.studentId).set(
            mapOf(
                "studentId" to student.studentId,
                "classId" to student.classId,
                "className" to student.className,
                "section" to student.section,
                "rollNo" to student.rollNo,
                "date" to date,
                "status" to status.name,
                "markedVia" to via,
                "markedBy" to email,
                "markedAt" to FieldValue.serverTimestamp(),
            ),
        )
}
