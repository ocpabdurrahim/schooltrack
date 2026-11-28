package io.github.ocpabdurrahim.schooltrack.data

import com.google.firebase.firestore.AggregateSource
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query

data class StudentDetail(
    val studentId: String,
    val fullName: String,
    val rollNo: Long,
    val regNo: String?,
    val classId: String,
    val className: String,
    val section: String,
    val groupName: String?,
    /**
     * Islam, Hindu or Other, as the school's own table has it. It decides
     * which religion paper the student sits, so it is a marks field, not a
     * detail.
     */
    val religion: String?,
    val gender: String?,
    val dob: String?,
    val fatherName: String?,
    val motherName: String?,
    val bloodGroup: String?,
    val mobileNo: String?,
    val status: String,
    /**
     * The standing fee arrangement: Regular, Scholarship, Donor family or
     * Half fee. It changes the tuition this student is charged every month,
     * so it is a money field, not a detail. Missing means Regular -- see
     * Privileges.kt. Last, with a default, so the older positional
     * constructions in the tests still read.
     */
    val privilege: String? = null,
)

data class DayMark(val date: String, val status: Status, val markedVia: String?)

data class AttendanceSummary(
    val marked: Int,
    val present: Int,
    val percent: Double?,
    val recent: List<DayMark>,
)

data class SchoolStats(
    val students: Int?,
    val staff: Int?,
    val classes: Int?,
    val markedToday: Int?,
    val presentToday: Int?,
    val takenToday: Boolean,
)

class PeopleRepository(
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
    private val attendance: AttendanceRepository = AttendanceRepository(),
) {
    private fun school() = db.collection("schools").document(SCHOOL_ID)

    private fun detail(id: String, d: Map<String, Any?>) = StudentDetail(
        studentId = id,
        fullName = d["fullName"] as? String ?: "",
        rollNo = (d["rollNo"] as? Number)?.toLong() ?: 0,
        regNo = d["regNo"] as? String,
        classId = d["classId"] as? String ?: "",
        className = d["className"] as? String ?: "",
        section = d["section"] as? String ?: "",
        groupName = d["groupName"] as? String,
        religion = d["religion"] as? String,
        gender = d["gender"] as? String,
        dob = d["dob"] as? String,
        fatherName = d["fatherName"] as? String,
        motherName = d["motherName"] as? String,
        bloodGroup = d["bloodGroup"] as? String,
        mobileNo = d["mobileNo"] as? String,
        status = d["status"] as? String ?: "A",
        privilege = d["privilege"] as? String,
    )

    suspend fun getStudent(studentId: String): StudentDetail? {
        val doc = school().collection("students").document(studentId).get().await()
        return if (doc.exists()) detail(studentId, doc.data.orEmpty()) else null
    }

    /**
     * Firestore has no "contains" search, so the name filter is applied here
     * rather than in the query. Fine at this size — a school of a few hundred —
     * and it keeps the query simple and index-free. If the roll ever grows into
     * the thousands, this is the thing to replace, not the data model.
     */
    suspend fun findStudents(
        classId: String?,
        text: String,
        includeLeft: Boolean = false,
    ): List<StudentDetail> {
        val base = school().collection("students")
        val query: Query = if (classId != null) {
            base.whereEqualTo("classId", classId).orderBy("rollNo")
        } else {
            base.orderBy("className").orderBy("rollNo")
        }

        val needle = text.trim().lowercase()
        return query.get().await().documents
            .map { detail(it.id, it.data.orEmpty()) }
            .filter { includeLeft || it.status == "A" }
            .filter {
                needle.isEmpty() ||
                    it.fullName.lowercase().contains(needle) ||
                    it.rollNo.toString() == needle ||
                    it.studentId == needle ||
                    (it.regNo ?: "").lowercase().contains(needle)
            }
    }

    /**
     * The percentage divides by DAYS MARKED, not by the calendar's working
     * days — the same choice as the web app and v_attendance_monthly before
     * it. A section that started marking late would otherwise make every
     * student look like a truant.
     */
    suspend fun attendanceFor(studentId: String, from: String): AttendanceSummary {
        val docs = school().collection("attendanceMarks")
            .whereEqualTo("studentId", studentId)
            .whereGreaterThanOrEqualTo("date", from)
            .orderBy("date", Query.Direction.DESCENDING)
            .limit(400)
            .get().await().documents

        val days = docs.map {
            DayMark(
                date = it.getString("date").orEmpty(),
                status = runCatching { Status.valueOf(it.getString("status").orEmpty()) }
                    .getOrDefault(Status.A),
                markedVia = it.getString("markedVia"),
            )
        }
        val present = days.count { it.status == Status.P || it.status == Status.L }

        return AttendanceSummary(
            marked = days.size,
            present = present,
            percent = if (days.isEmpty()) null
            else Math.round(present * 1000.0 / days.size) / 10.0,
            recent = days.take(12),
        )
    }

    fun startOfYear() = attendance.todayInDhaka().substring(0, 4) + "-01-01"
    fun startOfMonth() = attendance.todayInDhaka().substring(0, 7) + "-01"

    /**
     * EVERY COUNT IS INDEPENDENT AND MAY COME BACK NULL. A teacher is not
     * allowed to read the staff collection, and that refusal must not blank the
     * whole dashboard — nor be reported as "you have no access", which is what
     * the web app did until it was fixed.
     */
    private suspend fun count(q: Query): Int? = try {
        q.count().get(AggregateSource.SERVER).await().count.toInt()
    } catch (_: Exception) {
        null
    }

    suspend fun schoolStats(): SchoolStats {
        val today = attendance.todayInDhaka()
        val marks = school().collection("attendanceMarks")

        val session = try {
            school().collection("attendance").document(today).get().await().exists()
        } catch (_: Exception) {
            false
        }

        return SchoolStats(
            students = count(school().collection("students").whereEqualTo("status", "A")),
            staff = count(
                school().collection("staff")
                    .whereIn("staffStatus", listOf("ACTIVE", "ON_LEAVE")),
            ),
            classes = count(school().collection("classes")),
            markedToday = count(marks.whereEqualTo("date", today)),
            presentToday = count(
                marks.whereEqualTo("date", today).whereIn("status", listOf("P", "L")),
            ),
            takenToday = session,
        )
    }
}
