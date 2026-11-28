package io.github.ocpabdurrahim.schooltrack.data

import com.google.firebase.Timestamp
import com.google.firebase.firestore.AggregateSource
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions

/**
 * Everything that WRITES people and reference data, mirroring the web app's
 * data/admin.ts.
 *
 * Every write must carry updatedAt == request.time, which is what the rules'
 * `stamped()` checks. Hence [stamp] below: forget it and the rules reject the
 * write, which is the point — a client that forgets fails loudly rather than
 * writing a record nobody can date.
 *
 * Nothing here deletes. A student leaves (status I), a member loses access
 * (active false), a section is retired (active false).
 */

data class SchoolSettings(
    val instituteName: String = "My School",
    val sessionLabel: String? = null,
    val address: String? = null,
    val eiin: String? = null,
    val headTeacher: String? = null,
    val weekendDays: List<String> = listOf("FRI", "SAT"),
)

data class ClassRow(
    val classId: String,
    val className: String,
    val section: String,
    val displayName: String,
    val sortOrder: Long,
    val active: Boolean,
)

data class StaffRow(
    val staffId: String,
    val fullName: String,
    val designation: String? = null,
    val mobileNo: String? = null,
    val staffStatus: String = "ACTIVE",
    val joinDate: String? = null,
)

data class MemberRow(
    val email: String,
    val name: String,
    val role: String,
    val active: Boolean,
)

data class GuardianRow(
    val email: String,
    val name: String,
    val studentIds: List<String>,
    val active: Boolean,
)

val ROLES = listOf("ADMIN", "TEACHER", "ACCOUNTS", "OFFICE")

val STAFF_STATUS = listOf("ACTIVE", "ON_LEAVE", "LEFT")

class AdminRepository(
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
) {
    private fun school() = db.collection("schools").document(SCHOOL_ID)

    /** The rules require updatedAt == request.time on every write. */
    private fun stamp(data: Map<String, Any?>) =
        data.filterValues { it != null && it != "" } + ("updatedAt" to FieldValue.serverTimestamp())

    // -----------------------------------------------------------------------
    // settings

    suspend fun getSettings(): SchoolSettings? {
        val d = try {
            school().collection("settings").document("school").get().await()
        } catch (_: Exception) {
            return null   // a guardian may not read settings; the caller copes
        }
        if (!d.exists()) return null

        @Suppress("UNCHECKED_CAST")
        return SchoolSettings(
            instituteName = d.getString("instituteName") ?: "My School",
            sessionLabel = d.getString("sessionLabel"),
            address = d.getString("address"),
            eiin = d.getString("eiin"),
            headTeacher = d.getString("headTeacher"),
            weekendDays = (d.get("weekendDays") as? List<String>) ?: listOf("FRI", "SAT"),
        )
    }

    suspend fun saveSettings(s: SchoolSettings) {
        school().collection("settings").document("school").set(
            stamp(
                mapOf(
                    "instituteName" to s.instituteName.trim(),
                    "sessionLabel" to s.sessionLabel,
                    "address" to s.address,
                    "eiin" to s.eiin,
                    "headTeacher" to s.headTeacher,
                    "weekendDays" to s.weekendDays,
                ),
            ),
            SetOptions.merge(),
        ).await()
    }

    // -----------------------------------------------------------------------
    // ids
    //
    // In a transaction, because the rules let a counter move only forwards and
    // only by one: two people adding a student at the same moment must not
    // land on the same number.

    private suspend fun nextNumber(counter: String): String {
        val ref = school().collection("counters").document(counter)
        return db.runTransaction { tx ->
            val snap = tx.get(ref)
            val next = if (snap.exists()) (snap.getLong("next") ?: 1L) else 1L
            tx.set(ref, mapOf("next" to next + 1), SetOptions.merge())
            next.toString()
        }.await()
    }

    // -----------------------------------------------------------------------
    // classes

    /**
     * Carries out a promotion plan.
     *
     * One batch: forty children change class and roll number together, or none
     * of them do. A promotion half-written would be far worse than one not
     * written at all — a class where some rolls are next year's and some are
     * last year's is not something a teacher could unpick.
     *
     * Only the students actually moving are touched. Somebody staying down is
     * left exactly as they are rather than written back unchanged, so their
     * record keeps the date it last really changed.
     */
    suspend fun carryOutPromotion(
        moves: List<Move>,
        classes: List<ClassRow>,
    ): Pair<Int, Int> {
        val batch = db.batch()
        var promoted = 0
        var archived = 0

        for (m in moves) {
            val ref = school().collection("students").document(m.studentId)
            when {
                m.what == What.ARCHIVED -> {
                    // 'I' is the status every listing already filters on, so an
                    // archived student drops out of registers, mark entry and
                    // fee collection without anything else having to know
                    // about leaving.
                    batch.set(ref, stamp(mapOf("status" to "I")), SetOptions.merge())
                    archived += 1
                }
                m.what == What.UP && m.toClassId != null && m.toRoll != null -> {
                    val into = classes.firstOrNull { it.classId == m.toClassId } ?: continue
                    batch.set(
                        ref,
                        stamp(
                            mapOf(
                                "classId" to into.classId,
                                "className" to into.className,
                                "section" to into.section,
                                "rollNo" to m.toRoll.toLong(),
                            ),
                        ),
                        SetOptions.merge(),
                    )
                    promoted += 1
                }
            }
        }

        batch.commit().await()
        return promoted to archived
    }

    suspend fun listAllClasses(): List<ClassRow> =
        school().collection("classes").orderBy("sortOrder").get().await().documents.map {
            ClassRow(
                classId = it.id,
                className = it.getString("className").orEmpty(),
                section = it.getString("section").orEmpty(),
                displayName = it.getString("displayName") ?: it.id,
                sortOrder = it.getLong("sortOrder") ?: 0,
                active = it.getBoolean("active") ?: true,
            )
        }

    suspend fun saveClass(c: ClassRow) {
        val displayName = c.displayName.ifBlank { c.className + " - " + c.section }
        school().collection("classes").document(c.classId).set(
            stamp(
                mapOf(
                    "className" to c.className.trim(),
                    "section" to c.section.trim(),
                    "displayName" to displayName,
                    "sortOrder" to c.sortOrder,
                    "active" to c.active,
                ),
            ),
            SetOptions.merge(),
        ).await()
    }

    /**
     * What still points at a class, so the screen can say why it will not go.
     *
     * Counted rather than fetched: a section of eighty would otherwise be read
     * in full to answer a yes-or-no question. Students include those who have
     * LEFT — their record still carries the classId and their results still
     * have to be readable years later.
     */
    suspend fun classUse(classId: String): ClassUse {
        suspend fun of(name: String): Int =
            school().collection(name).whereEqualTo("classId", classId)
                .count().get(AggregateSource.SERVER).await().count.toInt()

        // The routine lives on the EXAM document as an array, so it is read
        // rather than counted. There is one per exam and a school has a
        // handful.
        val routine = school().collection("exams").get().await().documents.sumOf { d ->
            @Suppress("UNCHECKED_CAST")
            val entries = (d.get("routine") as? List<Map<String, Any?>>).orEmpty()
            entries.count { it["classId"] == classId }
        }

        return ClassUse(
            students = of("students"),
            results = of("results"),
            attendance = of("attendanceMarks"),
            routine = routine,
        )
    }

    /**
     * Removes a class outright.
     *
     * The caller establishes that nothing points at it — canRemoveClass() —
     * and the rules permit the delete to an ADMIN. Nothing cascades on
     * purpose: a delete that took records with it is how a mis-click empties
     * a school.
     */
    suspend fun removeClass(classId: String) {
        school().collection("classes").document(classId).delete().await()
    }

    // -----------------------------------------------------------------------
    // emptying the school — see Reset.kt for what is cleared and why

    /** How many documents each collection holds, counted rather than fetched. */
    suspend fun countCollections(names: List<String>): Map<String, Int> =
        names.associateWith { n ->
            try {
                school().collection(n).count().get(AggregateSource.SERVER).await().count.toInt()
            } catch (_: Exception) {
                // A collection this account may not read counts as unknown
                // rather than failing the whole screen. An ADMIN reads all.
                0
            }
        }

    /**
     * Opens the fifteen-minute window in which the rules allow deletes.
     *
     * Arming is a deliberate, recorded write — that is the point of it.
     * Outside the window nothing here can be deleted that could not be
     * deleted before the reset feature existed.
     */
    suspend fun armReset(by: String) {
        school().collection("settings").document("reset").set(
            mapOf(
                "armed" to true,
                "armedAt" to FieldValue.serverTimestamp(),
                "armedBy" to by,
                "updatedAt" to FieldValue.serverTimestamp(),
            ),
        ).await()
    }

    /** Shuts the window again, which the reset does as soon as it is finished. */
    suspend fun disarmReset() {
        school().collection("settings").document("reset").set(
            mapOf(
                "armed" to false,
                "armedAt" to FieldValue.serverTimestamp(),
                "updatedAt" to FieldValue.serverTimestamp(),
            ),
        ).await()
    }

    /**
     * Firestore values as JSON, tagged so the types JSON cannot hold survive.
     *
     * THE SAME SHAPE tools/reset-values.mjs writes and the web downloads, so a
     * backup taken on the phone can be put back with
     * `node reset-school.mjs --restore=<file>`. A timestamp written straight
     * to JSON comes back as an ordinary map, and a restore would look perfect
     * while every "last changed" was quietly wrong.
     */
    private fun toJson(value: Any?): Any? = when (value) {
        is Timestamp -> mapOf(
            "__type" to "timestamp",
            "iso" to java.time.Instant.ofEpochSecond(value.seconds, value.nanoseconds.toLong())
                .toString(),
            "nanos" to value.nanoseconds,
        )
        is List<*> -> value.map { toJson(it) }
        is Map<*, *> -> value.entries.associate { (k, v) -> k.toString() to toJson(v) }
        else -> value
    }

    /**
     * The whole school as JSON, before anything is deleted.
     *
     * EVERY collection, not only the ones going: a backup that restores a
     * school to a state it was never in is not a backup.
     */
    suspend fun backupEverything(names: List<String>, projectId: String): Map<String, Any?> {
        val collections = names.associateWith { name ->
            school().collection(name).get().await().documents.map { d ->
                mapOf("id" to d.id, "data" to toJson(d.data ?: emptyMap<String, Any?>()))
            }
        }
        return mapOf(
            "school" to SCHOOL_ID,
            "projectId" to projectId,
            "takenAt" to java.time.Instant.now().toString(),
            "collections" to collections,
        )
    }

    /**
     * Deletes every document in the named collections, in batches.
     *
     * Nothing cascades and nothing is clever: it reads what is there and
     * removes it. `onProgress` is called per collection so a reset of four
     * hundred documents does not look like a frozen screen.
     */
    suspend fun clearCollections(names: List<String>, onProgress: (String, Int) -> Unit) {
        for (name in names) {
            var removed = 0
            while (true) {
                val snap = school().collection(name).limit(400).get().await()
                if (snap.isEmpty) break
                val batch = db.batch()
                snap.documents.forEach { batch.delete(it.reference) }
                batch.commit().await()
                removed += snap.size()
            }
            onProgress(name, removed)
        }
    }

    // -----------------------------------------------------------------------
    // students

    /**
     * className and section are written onto the student as well as classId:
     * deliberate duplication, because every list and the ID card show the class
     * beside the name.
     */
    suspend fun saveStudent(s: StudentDetail, classes: List<ClassRow>): String {
        val cls = classes.firstOrNull { it.classId == s.classId }
        val studentId = s.studentId.ifBlank { nextNumber("students") }

        school().collection("students").document(studentId).set(
            stamp(
                mapOf(
                    "fullName" to s.fullName.trim(),
                    "rollNo" to s.rollNo,
                    "regNo" to s.regNo,
                    "classId" to s.classId,
                    "className" to (cls?.className ?: s.className),
                    "section" to (cls?.section ?: s.section),
                    "groupName" to s.groupName,
                    "religion" to s.religion,
                    "privilege" to normalPrivilege(s.privilege),
                    "gender" to s.gender,
                    "dob" to s.dob,
                    "fatherName" to s.fatherName,
                    "motherName" to s.motherName,
                    "bloodGroup" to s.bloodGroup,
                    "mobileNo" to s.mobileNo,
                    "status" to s.status.ifBlank { "A" },
                ),
            ),
            SetOptions.merge(),
        ).await()

        return studentId
    }

    // -----------------------------------------------------------------------
    // staff

    suspend fun listStaff(): List<StaffRow> =
        school().collection("staff").orderBy("fullName").get().await().documents.map {
            StaffRow(
                staffId = it.id,
                fullName = it.getString("fullName").orEmpty(),
                designation = it.getString("designation"),
                mobileNo = it.getString("mobileNo"),
                staffStatus = it.getString("staffStatus") ?: "ACTIVE",
                joinDate = it.getString("joinDate"),
            )
        }

    suspend fun saveStaff(s: StaffRow): String {
        val staffId = s.staffId.ifBlank { nextNumber("staff") }
        school().collection("staff").document(staffId).set(
            stamp(
                mapOf(
                    "fullName" to s.fullName.trim(),
                    "designation" to s.designation,
                    "mobileNo" to s.mobileNo,
                    "staffStatus" to s.staffStatus,
                    "joinDate" to s.joinDate,
                ),
            ),
            SetOptions.merge(),
        ).await()
        return staffId
    }

    // -----------------------------------------------------------------------
    // who may sign in

    suspend fun listMembers(): List<MemberRow> =
        school().collection("members").orderBy("name").get().await().documents.map {
            MemberRow(
                email = it.id,
                name = it.getString("name") ?: it.id,
                role = it.getString("role").orEmpty(),
                active = it.getBoolean("active") ?: false,
            )
        }

    suspend fun saveMember(m: MemberRow) {
        val email = m.email.trim().lowercase()
        school().collection("members").document(email).set(
            stamp(
                mapOf(
                    "email" to email,
                    "name" to m.name.trim(),
                    "role" to m.role,
                    "active" to m.active,
                    "deleted" to false,
                ),
            ),
            SetOptions.merge(),
        ).await()
    }

    suspend fun listGuardians(): List<GuardianRow> =
        school().collection("guardians").orderBy("name").get().await().documents.map {
            @Suppress("UNCHECKED_CAST")
            GuardianRow(
                email = it.id,
                name = it.getString("name") ?: it.id,
                studentIds = (it.get("studentIds") as? List<String>).orEmpty(),
                active = it.getBoolean("active") ?: false,
            )
        }

    suspend fun saveGuardian(g: GuardianRow) {
        val email = g.email.trim().lowercase()
        school().collection("guardians").document(email).set(
            stamp(
                mapOf(
                    "email" to email,
                    "name" to g.name.trim(),
                    "studentIds" to g.studentIds,
                    "active" to g.active,
                ),
            ),
            SetOptions.merge(),
        ).await()
    }
}

/** class ids are readable rather than numeric: class-6-a, class-10-science. */
fun classIdFor(className: String, section: String): String =
    (className + "-" + section).lowercase().trim()
        .replace(Regex("[^a-z0-9]+"), "-")
        .trim('-')
