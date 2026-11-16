package io.github.ocpabdurrahim.schooltrack.data

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.SetOptions

/**
 * Exams, subjects and marks — the Kotlin twin of web/src/data/exams.ts.
 *
 * Marks are stored; grades, GPA and position are NOT. They are computed by
 * Grading.kt every time, so correcting a mark corrects the sheet, the report
 * and the student page together.
 */

data class Exam(
    val examId: String,
    val examName: String,
    val examYear: String,
    val periodLabel: String,   // HALF_YEARLY_EXAM-2026 — the fee module matches on this
    val published: Boolean,
)

data class Subject(
    val subjectId: String,
    val subjectName: String,
    val subjectCode: String? = null,
    val classNames: List<String> = emptyList(),
    val fullMarks: Double = 100.0,
    val isOptional: Boolean = false,
    val sortOrder: Long = 0,
)

data class ResultRow(
    val examId: String,
    val studentId: String,
    val subjectId: String,
    val subjectName: String,
    val marks: Double?,
    val absent: Boolean,
    val classId: String,
    val rollNo: Long,
    val fullMarks: Double,
    val isOptional: Boolean,
)

data class StudentResult(
    val student: StudentDetail,
    val tabulation: Tabulation,
    val position: Int?,        // null while the result is incomplete
)

/** JULY_EXAM-2026 — upper case, underscores, year appended, as in Oracle. */
fun periodLabelFor(examName: String, examYear: String): String =
    examName.trim().uppercase().replace(Regex("[^A-Z0-9]+"), "_").trim('_') + "-" + examYear

fun examIdFor(examName: String, examYear: String): String =
    periodLabelFor(examName, examYear).lowercase().replace('_', '-')

fun subjectIdFor(name: String): String =
    name.trim().uppercase().replace(Regex("[^A-Z0-9]+"), "_").trim('_')

fun resultId(examId: String, studentId: String, subjectId: String) =
    examId + "_" + studentId + "_" + subjectId

fun subjectsForClass(subjects: List<Subject>, className: String) =
    subjects.filter { className in it.classNames }

class ExamsRepository(
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
) {
    private fun school() = db.collection("schools").document(SCHOOL_ID)
    private fun stamp(d: Map<String, Any?>) = d + ("updatedAt" to FieldValue.serverTimestamp())

    // -----------------------------------------------------------------------
    // exams

    suspend fun listExams(): List<Exam> =
        school().collection("exams").orderBy("examYear", Query.Direction.DESCENDING)
            .get().await().documents.map {
                Exam(
                    examId = it.id,
                    examName = it.getString("examName").orEmpty(),
                    examYear = it.getString("examYear").orEmpty(),
                    periodLabel = it.getString("periodLabel").orEmpty(),
                    published = it.getBoolean("published") ?: false,
                )
            }

    suspend fun saveExam(e: Exam): String {
        val examId = e.examId.ifBlank { examIdFor(e.examName, e.examYear) }
        school().collection("exams").document(examId).set(
            stamp(
                mapOf(
                    "examName" to e.examName.trim(),
                    "examYear" to e.examYear.trim(),
                    "periodLabel" to periodLabelFor(e.examName, e.examYear),
                    "published" to e.published,
                ),
            ),
            SetOptions.merge(),
        ).await()
        return examId
    }

    suspend fun publishExam(examId: String, published: Boolean) {
        school().collection("exams").document(examId)
            .set(stamp(mapOf("published" to published)), SetOptions.merge()).await()
    }

    // -----------------------------------------------------------------------
    // subjects

    @Suppress("UNCHECKED_CAST")
    suspend fun listSubjects(): List<Subject> =
        school().collection("subjects").orderBy("sortOrder").get().await().documents.map {
            Subject(
                subjectId = it.id,
                subjectName = it.getString("subjectName").orEmpty(),
                subjectCode = it.getString("subjectCode"),
                classNames = (it.get("classNames") as? List<String>).orEmpty(),
                fullMarks = it.getDouble("fullMarks") ?: 100.0,
                isOptional = it.getBoolean("isOptional") ?: false,
                sortOrder = it.getLong("sortOrder") ?: 0,
            )
        }

    suspend fun saveSubject(s: Subject): String {
        val subjectId = s.subjectId.ifBlank { subjectIdFor(s.subjectName) }
        school().collection("subjects").document(subjectId).set(
            stamp(
                mapOf(
                    "subjectName" to s.subjectName.trim(),
                    "subjectCode" to s.subjectCode?.trim(),
                    "classNames" to s.classNames,
                    "fullMarks" to s.fullMarks,
                    "isOptional" to s.isOptional,
                    "sortOrder" to s.sortOrder,
                ),
            ),
            SetOptions.merge(),
        ).await()
        return subjectId
    }

    // -----------------------------------------------------------------------
    // marks

    private fun toRow(d: com.google.firebase.firestore.DocumentSnapshot) = ResultRow(
        examId = d.getString("examId").orEmpty(),
        studentId = d.getString("studentId").orEmpty(),
        subjectId = d.getString("subjectId").orEmpty(),
        subjectName = d.getString("subjectName").orEmpty(),
        marks = d.getDouble("marks"),
        absent = d.getBoolean("absent") ?: false,
        classId = d.getString("classId").orEmpty(),
        rollNo = d.getLong("rollNo") ?: 0,
        fullMarks = d.getDouble("fullMarks") ?: 100.0,
        isOptional = d.getBoolean("isOptional") ?: false,
    )

    suspend fun marksForExam(examId: String, classId: String? = null): List<ResultRow> {
        var q: Query = school().collection("results").whereEqualTo("examId", examId)
        if (classId != null) q = q.whereEqualTo("classId", classId)
        return q.get().await().documents.map(::toRow)
    }

    suspend fun marksForStudent(studentId: String): List<ResultRow> =
        school().collection("results").whereEqualTo("studentId", studentId)
            .get().await().documents.map(::toRow)

    /**
     * One subject's marks for a whole section in a single batch — one round
     * trip for forty students, and all of it lands or none does.
     *
     * A blank mark is written as null rather than skipped: "not entered" has
     * to be storable, or a mark typed by mistake could never be cleared.
     */
    suspend fun saveMarks(rows: List<ResultRow>) {
        val batch = db.batch()
        for (r in rows) {
            batch.set(
                school().collection("results")
                    .document(resultId(r.examId, r.studentId, r.subjectId)),
                mapOf(
                    "examId" to r.examId,
                    "studentId" to r.studentId,
                    "subjectId" to r.subjectId,
                    "subjectName" to r.subjectName,
                    "marks" to r.marks,
                    "absent" to r.absent,
                    "classId" to r.classId,
                    "rollNo" to r.rollNo,
                    "fullMarks" to r.fullMarks,
                    "isOptional" to r.isOptional,
                    "updatedAt" to FieldValue.serverTimestamp(),
                ),
                SetOptions.merge(),
            )
        }
        batch.commit().await()
    }
}

/**
 * One section's result for one exam, ranked.
 *
 * Position is computed, not stored, and an incomplete result has no position
 * at all — ranking a student whose maths mark has not been entered would put
 * them last for no reason. Equal GPAs share a position and the next skips
 * accordingly (1, 2, 2, 4), as a result sheet has always done.
 */
fun sheetFor(
    students: List<StudentDetail>,
    subjects: List<Subject>,
    marks: List<ResultRow>,
    examId: String,
): List<StudentResult> {
    val byStudent = marks.filter { it.examId == examId }.groupBy { it.studentId }

    val rows = students.map { student ->
        val mine = byStudent[student.studentId].orEmpty()
        val subjectMarks = subjectsForClass(subjects, student.className).map { s ->
            val got = mine.firstOrNull { it.subjectId == s.subjectId }
            SubjectMark(
                subjectId = s.subjectId,
                subjectName = s.subjectName,
                fullMarks = s.fullMarks,
                marks = got?.marks,
                absent = got?.absent ?: false,
                isOptional = s.isOptional,
            )
        }
        StudentResult(student, tabulate(subjectMarks), null)
    }.toMutableList()

    val ranked = rows.filter { !it.tabulation.incomplete && it.tabulation.gpa != null }
        .sortedByDescending { it.tabulation.gpa }

    var position = 0
    var lastGpa: Double? = null
    ranked.forEachIndexed { index, r ->
        if (r.tabulation.gpa != lastGpa) {
            position = index + 1
            lastGpa = r.tabulation.gpa
        }
        val at = rows.indexOfFirst { it.student.studentId == r.student.studentId }
        rows[at] = rows[at].copy(position = position)
    }

    return rows.sortedBy { it.student.rollNo }
}

// ---------------------------------------------------------------------------
// the two sheets
//
// Both are views over the same marks: nothing below is stored, so correcting a
// mark corrects the tabulation, the result sheet and the progress report
// together. The web twin is in web/src/data/exams.ts.

/**
 * The total of every subject sat, INCLUDING the optional one.
 *
 * The optional subject counts towards the total even though it only partly
 * counts towards the GPA — that is how a tabulation sheet has always been
 * read. Null while any mark is missing: a part-total is worse than none.
 */
fun totalMarks(t: Tabulation): Double? {
    if (t.subjects.any { it.mark.marks == null && !it.mark.absent }) return null
    return t.subjects.sumOf { if (it.mark.absent) 0.0 else (it.mark.marks ?: 0.0) }
}

data class SubjectStat(
    val subjectId: String,
    val subjectName: String,
    val highest: Double?,
    val lowest: Double?,
    val average: Double?,
    val passed: Int,
    val failed: Int,
    val absent: Int,
)

/** Per-subject statistics for the foot of the tabulation sheet. */
fun subjectStats(results: List<StudentResult>, subjects: List<Subject>): List<SubjectStat> =
    subjects.map { subject ->
        val marks = mutableListOf<Double>()
        var passed = 0
        var failed = 0
        var absent = 0

        for (r in results) {
            val s = r.tabulation.subjects.firstOrNull { it.mark.subjectId == subject.subjectId }
                ?: continue
            if (s.mark.absent) { absent++; failed++; continue }
            val m = s.mark.marks ?: continue
            marks += m
            if (s.grade.letter == "F") failed++ else passed++
        }

        SubjectStat(
            subjectId = subject.subjectId,
            subjectName = subject.subjectName,
            highest = marks.maxOrNull(),
            lowest = marks.minOrNull(),
            average = if (marks.isEmpty()) null
            else Math.round(marks.average() * 10) / 10.0,
            passed = passed,
            failed = failed,
            absent = absent,
        )
    }

/** How many of each grade, in scale order — the foot of the result sheet. */
fun gradeDistribution(results: List<StudentResult>): List<Pair<String, Int>> {
    val order = listOf("A+", "A", "A-", "B", "C", "D", "F")
    val counts = mutableMapOf<String, Int>()
    for (r in results) {
        if (r.tabulation.incomplete) continue
        counts[r.tabulation.letter] = (counts[r.tabulation.letter] ?: 0) + 1
    }
    return order.filter { counts.containsKey(it) }.map { it to (counts[it] ?: 0) }
}

/**
 * Merit order: best first, then by roll so the order is stable between runs.
 * Students whose marks are not all in have no position and go last — they are
 * not failures, they are simply not finished.
 */
fun meritOrder(results: List<StudentResult>): List<StudentResult> =
    results.sortedWith(
        compareBy<StudentResult> { it.tabulation.incomplete }
            .thenByDescending { it.tabulation.gpa ?: -1.0 }
            .thenBy { it.student.rollNo },
    )
