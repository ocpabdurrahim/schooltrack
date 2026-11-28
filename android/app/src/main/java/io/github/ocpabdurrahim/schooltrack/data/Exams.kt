package io.github.ocpabdurrahim.schooltrack.data

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.SetOptions
import kotlin.math.roundToInt

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
    /**
     * Where this exam sits in the school's year: 1 for the first, 2 for the
     * next. Exams carry no date, and the name does not order them — "Annual"
     * sorts before "Half yearly" alphabetically but comes after it in the year.
     * Default 0, which falls back to the old behaviour rather than inventing an
     * order for exams entered before this field existed.
     */
    val sortOrder: Long = 0,
    /**
     * The last exam of the year for the classes that sit it: Annual for most,
     * Test for Class Ten. Publishing it is what makes moving the class up
     * possible — the merit list of this exam decides next year's roll numbers.
     *
     * A tick rather than a guess from the name or the sort order. "Annual Exam
     * 2027" typed slightly differently, or an exam added after the last one,
     * would otherwise silently change which exam promotes the school.
     */
    val isFinal: Boolean = false,
)

data class Subject(
    override val subjectId: String,
    override val subjectName: String,
    override val subjectCode: String? = null,
    val classNames: List<String> = emptyList(),
    val fullMarks: Double = 100.0,
    val isOptional: Boolean = false,
    val sortOrder: Long = 0,
    /**
     * How the paper is marked. Empty means one mark out of fullMarks, which is
     * what every subject looked like before components existed and what a
     * school that does not split its papers still wants.
     */
    val components: List<Component> = emptyList(),
    /**
     * Papers sharing a group are graded as ONE subject: Bangla first and
     * second paper make a single grade out of 200. Null for a lone paper.
     */
    val combineGroup: String? = null,
    /**
     * Which streams sit this paper — Science, Humanities, Business Studies, as
     * Oracle's `subject_group` records it. Empty means the whole class sits it.
     */
    val groupNames: List<String> = emptyList(),
    /**
     * Which religions sit this paper. Empty for all but the two religion
     * papers, which Oracle splits in enroll_student_subjects rather than in a
     * table: Islam & Moral Education for Islam, Hindu Religion for Hindu, and
     * neither for a student recorded as Other.
     */
    val religions: List<String> = emptyList(),
) : NamedSubject

data class ResultRow(
    val examId: String,
    val studentId: String,
    val subjectId: String,
    val subjectName: String,
    /**
     * The subject total. When the paper is marked in parts this is their sum,
     * worked out by the caller with subjectTotal() so one rule decides it
     * everywhere, and stored as well as the parts so every screen that already
     * reads `marks` keeps working untouched.
     */
    val marks: Double?,
    val absent: Boolean,
    override val classId: String,
    override val rollNo: Long,
    val fullMarks: Double,
    val isOptional: Boolean,
    /** What was entered per component. Null on a paper marked whole. */
    val parts: Map<String, Double?>? = null,
    /**
     * When this mark was last saved, epoch ms. Read only — the server sets it
     * on every save, and the quick-entry list reads it to put the rows just
     * keyed in at the top, where a mistyped mark is still worth catching.
     */
    val updatedAt: Long? = null,
) : Entered

data class StudentResult(
    val student: StudentDetail,
    val tabulation: Tabulation,
    val position: Int?,        // null while the result is incomplete
    /**
     * What decided that position, kept rather than recomputed: the sheet, the
     * merit list and the browser all order the same students, and working the
     * answer out three times is three chances to work it out differently.
     *
     * No default: a key left behind is a section ordered by nothing at all,
     * and it would look like a working list rather than an error.
     */
    val merit: MeritKey,
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

/**
 * The subject, plus whatever was entered for it, as the grading engine wants
 * it. Every screen goes through here, so a subject's components and its
 * combine group reach the tabulation the same way on the sheet, the report
 * card and the student's own screen.
 */
fun subjectMarkFor(s: Subject, got: ResultRow?): SubjectMark = SubjectMark(
    subjectId = s.subjectId,
    subjectName = s.subjectName,
    fullMarks = s.fullMarks,
    marks = got?.marks,
    absent = got?.absent ?: false,
    isOptional = s.isOptional,
    components = s.components,
    parts = got?.parts.orEmpty(),
    combineGroup = s.combineGroup,
    groupNames = s.groupNames,
    religions = s.religions,
)

fun subjectsForClass(subjects: List<Subject>, className: String) =
    subjects.filter { className in it.classNames }

/**
 * Everything about a student that decides which papers they sit.
 *
 * A record rather than three arguments because the group and the religion are
 * both plain strings: passing them the wrong way round would compile, run, and
 * quietly give a whole class the wrong subjects.
 */
data class Sitter(
    val className: String,
    val groupName: String? = null,
    val religion: String? = null,
    /**
     * Which optional (4th) paper this student actually takes. Null means
     * nobody has recorded it — see excludedBy.
     */
    val optionalSubjectId: String? = null,
)

/** A student, as the subject rule wants them. */
fun StudentDetail.asSitter() = Sitter(className, groupName, religion, optionalSubjectId)

/**
 * Does this student sit this paper?
 *
 * Two things narrow a class's subject list. Classes 9 and 10 stream into
 * GROUPS, and the groups sit different papers: Physics for Science,
 * Accounting for Business Studies. And the two RELIGION papers go to the
 * students of that religion — Oracle does this in enroll_student_subjects
 * rather than in a table, which is why it is written out here.
 *
 * A subject naming neither is sat by the whole class — Bangla, English,
 * Mathematics — which is how every subject behaved before either was recorded
 * here, so nothing already set up changes meaning.
 *
 * A student with NOTHING recorded sits everything the class sits. That looks
 * wrong until you consider the alternative: dropping those papers from their
 * result would quietly produce a GPA out of seven subjects instead of ten, and
 * nobody would see it. Expecting every paper leaves the result openly
 * incomplete instead, which is what gets the missing record filled in. (Oracle
 * cannot reach this case — religion is NOT NULL there — so nothing is being
 * contradicted.) A student recorded as "Other" is a different matter: that is
 * an answer, and it sits neither religion paper.
 *
 * THE OPTIONAL PAPER IS THE STUDENT'S, NOT THE STREAM'S. A 4th subject is
 * chosen one student at a time: of two Science students, one takes Higher
 * Maths and the other Agriculture. Nothing about their class, group or
 * religion separates them, so without `optionalSubjectId` recorded the only
 * thing keeping a student off the wrong optional paper is the accident of the
 * two papers belonging to different streams — and the day one of them is
 * offered to both streams, every Science student sprouts a second 4th
 * subject. That is exactly what happened on 2026-11-28.
 *
 * A student whose optional is NOT recorded still sits every optional their
 * stream offers, for the same reason a student with no religion recorded sits
 * both religion papers: an openly incomplete result gets the record filled in,
 * while a quietly shortened one does not.
 */
fun sitsSubject(s: Subject, who: Sitter): Boolean = excludedBy(s, who) == null

/** What shut a student out of a paper. */
enum class Excluded { CLASS, GROUP, RELIGION, OPTIONAL }

/**
 * WHICH part of the rule shut this student out, or null if nothing did.
 *
 * sitsSubject is this function with the answer thrown away. Keeping the two
 * together means a screen can say "Bashir Uddin is Hindu, which does not sit
 * Islam & Moral Education" — naming the thing that actually decided it —
 * without a second copy of the rule drifting out of step with the first.
 */
fun excludedBy(s: Subject, who: Sitter): Excluded? {
    if (who.className !in s.classNames) return Excluded.CLASS

    val myGroup = normalGroup(who.groupName)
    if (s.groupNames.isNotEmpty() && myGroup.isNotEmpty() && myGroup !in s.groupNames) {
        return Excluded.GROUP
    }

    val myReligion = normalReligion(who.religion)
    if (s.religions.isNotEmpty() && myReligion.isNotEmpty() && myReligion !in s.religions) {
        return Excluded.RELIGION
    }

    // Last, because it is the narrowest: the paper is offered to this
    // student's stream, but it is somebody else's 4th subject.
    if (s.isOptional && !who.optionalSubjectId.isNullOrBlank() &&
        s.subjectId != who.optionalSubjectId
    ) {
        return Excluded.OPTIONAL
    }

    return null
}

/** The papers one student sits — the list every grade and GPA is built from. */
fun subjectsForStudent(subjects: List<Subject>, who: Sitter) =
    subjects.filter { sitsSubject(it, who) }

class ExamsRepository(
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
) {
    private fun school() = db.collection("schools").document(SCHOOL_ID)
    private fun stamp(d: Map<String, Any?>) = d + ("updatedAt" to FieldValue.serverTimestamp())

    // -----------------------------------------------------------------------
    // exams

    // NOT ordered by sortOrder in the query: Firestore drops documents that lack
    // the field, so every exam saved before this field existed would vanish from
    // the list. Sorted here instead, newest first, which is what the pickers want.
    suspend fun listExams(): List<Exam> =
        school().collection("exams").orderBy("examYear", Query.Direction.DESCENDING)
            .get().await().documents.map {
                Exam(
                    examId = it.id,
                    examName = it.getString("examName").orEmpty(),
                    examYear = it.getString("examYear").orEmpty(),
                    periodLabel = it.getString("periodLabel").orEmpty(),
                    published = it.getBoolean("published") ?: false,
                    sortOrder = it.getLong("sortOrder") ?: 0,
                    isFinal = it.getBoolean("isFinal") ?: false,
                )
            }
            .sortedWith(
                compareByDescending<Exam> { it.examYear }
                    .thenByDescending { it.sortOrder }
                    .thenByDescending { it.examId },
            )

    suspend fun saveExam(e: Exam): String {
        val examId = e.examId.ifBlank { examIdFor(e.examName, e.examYear) }
        school().collection("exams").document(examId).set(
            stamp(
                mapOf(
                    "examName" to e.examName.trim(),
                    "examYear" to e.examYear.trim(),
                    "periodLabel" to periodLabelFor(e.examName, e.examYear),
                    "published" to e.published,
                    "sortOrder" to e.sortOrder,
                    "isFinal" to e.isFinal,
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
    /**
     * Every subject the school has, in the school's own order.
     *
     * NOT ordered by sortOrder in the query, for two reasons. Firestore drops
     * documents that lack the field it is ordering by, so one subject saved
     * without a sortOrder would vanish from every screen rather than appear
     * in the wrong place. And the order is sortSubjects()'s to decide -- see
     * SubjectOrder.kt, which is where the order shown anywhere in the app
     * comes from, because every screen reads its subjects through this one
     * function.
     */
    suspend fun listSubjects(): List<Subject> = sortSubjects(
        school().collection("subjects").get().await().documents.map {
            Subject(
                subjectId = it.id,
                subjectName = it.getString("subjectName").orEmpty(),
                subjectCode = it.getString("subjectCode"),
                classNames = (it.get("classNames") as? List<String>).orEmpty(),
                fullMarks = it.getDouble("fullMarks") ?: 100.0,
                isOptional = it.getBoolean("isOptional") ?: false,
                sortOrder = it.getLong("sortOrder") ?: 0,
                components = readComponents(it.get("components")),
                combineGroup = it.getString("combineGroup"),
                groupNames = (it.get("groupNames") as? List<String>).orEmpty(),
                religions = (it.get("religions") as? List<String>).orEmpty(),
            )
        },
    )

    /** The components as Firestore hands them back: a list of plain maps. */
    @Suppress("UNCHECKED_CAST")
    private fun readComponents(raw: Any?): List<Component> =
        (raw as? List<Map<String, Any?>>).orEmpty().mapNotNull { m ->
            val name = (m["name"] as? String)?.trim().orEmpty()
            if (name.isEmpty()) {
                null
            } else {
                Component(
                    name = name,
                    max = (m["max"] as? Number)?.toDouble() ?: 0.0,
                    pass = (m["pass"] as? Number)?.toDouble() ?: 0.0,
                )
            }
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
                    "components" to s.components.map {
                        mapOf("name" to it.name, "max" to it.max, "pass" to it.pass)
                    },
                    "combineGroup" to s.combineGroup,
                    "groupNames" to s.groupNames,
                    "religions" to s.religions,
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
        parts = readParts(d.get("parts")),
        // Null for a mark saved before this field existed, which is why the
        // entered list orders those by roll rather than pretending a time.
        updatedAt = d.getTimestamp("updatedAt")?.toDate()?.time,
    )

    @Suppress("UNCHECKED_CAST")
    private fun readParts(raw: Any?): Map<String, Double?>? =
        (raw as? Map<String, Any?>)?.mapValues { (_, v) -> (v as? Number)?.toDouble() }

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
                    "parts" to r.parts,
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
        val sits = subjectsForStudent(subjects, student.asSitter())
        val subjectMarks = sits.map { s ->
            subjectMarkFor(s, mine.firstOrNull { it.subjectId == s.subjectId })
        }
        val tabulation = tabulate(subjectMarks)
        // The first paper of the school's order -- Bangla 1st Paper here,
        // found by its place in that order rather than by its name, so a
        // school that spells it Bengali, or renames it, still breaks its ties
        // on the same paper.
        val first = sits.minByOrNull { subjectRank(it) }
        StudentResult(
            student = student,
            tabulation = tabulation,
            position = null,
            merit = MeritKey(
                incomplete = tabulation.incomplete,
                gpa = tabulation.gpa,
                failed = tabulation.failed.size,
                total = totalMarks(tabulation),
                firstPaper = first?.let { f ->
                    mine.firstOrNull { it.subjectId == f.subjectId }?.marks
                },
                rollNo = student.rollNo,
            ),
        )
    }.toMutableList()

    val positions = meritPositions(rows.map { it.merit })
    positions.forEachIndexed { i, p -> rows[i] = rows[i].copy(position = p) }

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
 * read. Withheld only while a COMPULSORY mark is missing, which is the same
 * test the GPA uses: see marksTotal().
 */
fun totalMarks(t: Tabulation): Double? = marksTotal(t.subjects.map { it.mark }).first

/**
 * One line per exam: earliest YEAR first, then by exam id. The twin of
 * resultLines() in web/src/data/exams.ts, with the same test cases.
 *
 * Within a year the school's own order decides (sortOrder on the exam: 1 for
 * the first exam of the year, 2 for the next). Exams carry no date, and the
 * name does not order them — "Annual" sorts before "Half yearly" alphabetically
 * but comes after it in the year. Where the order was never set both are 0 and
 * the fallback is the exam id; the screen only calls the chart "progress" once
 * every exam on it has a real order.
 *
 * The marks total and the percentage are withheld while any mark is missing. A
 * part-entered exam shown as a percentage reads as a bad result rather than an
 * unfinished one, and a parent cannot tell the difference.
 */
data class ResultLine(
    val examId: String,
    val examName: String,
    val examYear: String,
    val published: Boolean,
    val gpa: Double?,
    val letter: String,
    val incomplete: Boolean,
    val failed: List<String>,
    val obtained: Double?,
    val outOf: Double,
    val percent: Double?,
    val sortOrder: Long,
    /** The class and roll THIS exam was sat under, from its own marks. */
    val sat: Sitting? = null,
)

/** One exam a student has sat, with the class they sat it in. */
data class SatExam(val exam: Exam, val tabulation: Tabulation, val sat: Sitting? = null)

fun resultLines(results: List<SatExam>): List<ResultLine> =
    results
        .sortedWith(compareBy({ it.exam.examYear }, { it.exam.sortOrder }, { it.exam.examId }))
        .map { (exam, tabulation, sat) ->
            val (obtained, outOf) = marksTotal(tabulation.subjects.map { it.mark })
            ResultLine(
                examId = exam.examId,
                examName = exam.examName,
                examYear = exam.examYear,
                published = exam.published,
                sortOrder = exam.sortOrder,
                gpa = tabulation.gpa,
                letter = tabulation.letter,
                incomplete = tabulation.incomplete,
                failed = tabulation.failed,
                obtained = obtained,
                outOf = outOf,
                percent = if (obtained == null || outOf == 0.0) {
                    null
                } else {
                    (obtained / outOf * 1000).roundToInt() / 10.0
                },
                sat = sat,
            )
        }

/**
 * The columns a tabulation sheet has for one class.
 *
 * NOT simply the class's subjects: papers that are graded together are ONE
 * column, out of their combined total, because that is the subject the
 * tabulation grades. Taking the raw subject list instead leaves every
 * combined paper looking for a row the tabulation does not contain — the
 * whole sheet comes out blank, which is exactly what happened to a school
 * whose four subjects were two Bangla papers and two English ones.
 */
fun sheetColumns(subjects: List<Subject>, className: String): List<SubjectMark> =
    combineUnits(subjectsForClass(subjects, className).map { subjectMarkFor(it, null) })

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
fun subjectStats(results: List<StudentResult>, subjects: List<SubjectMark>): List<SubjectStat> =
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
    results.sortedWith { a, b -> compareMerit(a.merit, b.merit) }
