package io.github.ocpabdurrahim.schooltrack.data

import java.util.Locale
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Grades, GPA and the fail rules — the Bangladeshi school scale.
 *
 * This file has a twin: web/src/data/grading.ts. They must agree exactly,
 * because a student will be shown a GPA by whichever app is to hand, and the
 * same test cases are written against both. Change one, change the other.
 *
 * Nothing here is stored. Grades and GPA are COMPUTED from the marks every
 * time, so correcting a mark corrects everything that follows from it.
 */

data class Grade(val letter: String, val point: Double)

private data class Band(val from: Int, val letter: String, val point: Double)

private val SCALE = listOf(
    Band(80, "A+", 5.0),
    Band(70, "A", 4.0),
    Band(60, "A-", 3.5),
    Band(50, "B", 3.0),
    Band(40, "C", 2.0),
    Band(33, "D", 1.0),
    Band(0, "F", 0.0),
)

const val PASS_MARK_PERCENT = 33
const val MAX_GPA = 5.0

/** A subject's grade from its marks. Absent is F, not "no grade". */
fun gradeFor(marks: Double?, fullMarks: Double = 100.0, absent: Boolean = false): Grade {
    if (absent) return Grade("F", 0.0)
    if (marks == null || marks.isNaN()) return Grade("-", 0.0)
    val percent = if (fullMarks > 0) marks / fullMarks * 100 else 0.0
    val band = SCALE.firstOrNull { percent >= it.from } ?: SCALE.last()
    return Grade(band.letter, band.point)
}

// ---------------------------------------------------------------------------
// components
//
// A paper is marked in parts — CQ, MCQ, PRACTICAL — and each part carries its
// OWN pass mark, not just a share of the subject's. 60 in CQ and 8 in MCQ is
// 68 out of 100 and still a fail, because the MCQ pass is 10. That rule is the
// whole reason components exist here rather than being added up in the UI and
// forgotten.

data class Component(val name: String, val max: Double, val pass: Double)

data class SubjectMark(
    val subjectId: String,
    val subjectName: String,
    val fullMarks: Double = 100.0,
    val marks: Double? = null,       // null = not entered yet
    val absent: Boolean = false,
    val isOptional: Boolean = false, // the "4th subject"
    val components: List<Component> = emptyList(),
    val parts: Map<String, Double?> = emptyMap(),
    val combineGroup: String? = null,
    /**
     * Which streams and religions sit this paper, carried through from the
     * subject so that a GRADED UNIT can still be told apart on a sheet. By the
     * time Bangla first and second paper are one unit there is no subject left
     * to look the answer up in.
     */
    val groupNames: List<String> = emptyList(),
    val religions: List<String> = emptyList(),
)

/** True once at least one component of this subject has a mark on it. */
private fun SubjectMark.partlyEntered(): Boolean =
    components.isNotEmpty() && components.any { parts[it.name] != null }

/**
 * The subject's total.
 *
 * From the parts when the paper is marked in parts, and from [SubjectMark.marks]
 * when it is not — which is also what keeps results entered before components
 * existed reading correctly. One part still blank makes the total null: a
 * missing mark is not a zero, so the sheet says "not entered" rather than
 * failing a student whose practical has not been marked yet.
 */
fun subjectTotal(m: SubjectMark): Double? {
    if (!m.partlyEntered()) return m.marks
    var total = 0.0
    for (c in m.components) {
        val v = m.parts[c.name] ?: return null
        if (v.isNaN()) return null
        total += v
    }
    return total
}

/**
 * What has been entered so far, when the subject is not finished.
 *
 * A subject with a missing part has no total — that is the rule the grading
 * rests on. But "no total" and "nothing entered" are different things, and a
 * sheet that prints the same dash for both tells a teacher who has just keyed
 * in English First Paper that their work went nowhere. English First and
 * Second are ONE subject out of 200: until the second paper is in, the
 * subject has no mark, and this is how the sheet can still show that half of
 * it has arrived.
 *
 * Null when the subject is finished (there is a real total to print) or when
 * nothing has been entered at all.
 */
fun enteredSoFar(m: SubjectMark): Double? {
    if (m.components.isEmpty() || subjectTotal(m) != null) return null
    var any = false
    var total = 0.0
    for (c in m.components) {
        val v = m.parts[c.name] ?: continue
        if (v.isNaN()) continue
        any = true
        total += v
    }
    return if (any) total else null
}

/** The components that fall below their own pass mark, by name. */
fun failedComponents(m: SubjectMark): List<String> {
    if (!m.partlyEntered()) return emptyList()
    return m.components
        .filter { c ->
            val v = m.parts[c.name]
            v != null && !v.isNaN() && v < c.pass
        }
        .map { it.name }
}

data class SubjectGrade(
    val letter: String,
    val point: Double,
    val total: Double? = null,
    val failedParts: List<String> = emptyList(),
)

/**
 * One subject's grade, with the component rule applied.
 *
 * Order matters: absent first, then "nothing entered yet", then the component
 * pass marks, and only then the percentage. A paper that fails a component is
 * F however high the total, which is the rule the APEX tabulation uses and the
 * one a printed marksheet has to agree with.
 */
fun gradeForSubject(m: SubjectMark): SubjectGrade {
    if (m.absent) return SubjectGrade("F", 0.0)
    val total = subjectTotal(m) ?: return SubjectGrade("-", 0.0)
    val failedParts = failedComponents(m)
    if (failedParts.isNotEmpty()) return SubjectGrade("F", 0.0, total, failedParts)
    val g = gradeFor(total, m.fullMarks)
    return SubjectGrade(g.letter, g.point, total)
}

// ---------------------------------------------------------------------------
// combined papers
//
// Bangla first and second paper are ONE grade out of 200, and so are the two
// English papers. Grading them separately gives a different GPA for the same
// marks — two 3.5s where the school's own sheet shows a single 4.0 — so the
// papers are merged into a unit before anything is graded.

/** "Bengali First Paper" + "Bengali Second Paper" -> "Bengali". */
fun unitName(names: List<String>, fallback: String): String {
    if (names.isEmpty()) return fallback
    var prefix = names[0]
    for (n in names.drop(1)) {
        var i = 0
        while (i < prefix.length && i < n.length && prefix[i] == n[i]) i++
        prefix = prefix.substring(0, i)
    }
    val trimmed = prefix.trimEnd { it !in 'A'..'Z' && it !in 'a'..'z' }.trim()
    return if (trimmed.length >= 3) trimmed else fallback
}

/**
 * Papers sharing a combine group become one unit, in the place of the first
 * of them — so Bangla stays where Bangla was on the sheet rather than being
 * pushed to the bottom.
 *
 * Each component keeps its paper's name in front of it ("Bengali First Paper
 * MCQ"), because "MCQ" alone would collide between the two papers and a
 * student told they failed "MCQ" would not know which one.
 */
fun combineUnits(marks: List<SubjectMark>): List<SubjectMark> {
    val groups = LinkedHashMap<String, MutableList<SubjectMark>>()
    for (m in marks) {
        val g = m.combineGroup?.trim().orEmpty()
        if (g.isEmpty()) continue
        groups.getOrPut(g) { mutableListOf() }.add(m)
    }

    val done = mutableSetOf<String>()
    val out = mutableListOf<SubjectMark>()
    for (m in marks) {
        val g = m.combineGroup?.trim().orEmpty()
        if (g.isEmpty() || (groups[g]?.size ?: 0) < 2) {
            out.add(m)
            continue
        }
        if (!done.add(g)) continue
        out.add(mergeUnit(g, groups[g] ?: emptyList()))
    }
    return out
}

private fun mergeUnit(group: String, papers: List<SubjectMark>): SubjectMark {
    val components = mutableListOf<Component>()
    val parts = LinkedHashMap<String, Double?>()
    for (p in papers) {
        for (c in p.components) {
            val key = p.subjectName + " " + c.name
            components.add(c.copy(name = key))
            parts[key] = p.parts[c.name]
        }
    }

    val totals = papers.map { subjectTotal(it) }
    val merged = if (totals.any { it == null }) null else totals.sumOf { it ?: 0.0 }

    return SubjectMark(
        subjectId = "UNIT_$group",
        subjectName = unitName(papers.map { it.subjectName }, group),
        // Papers graded together are the same subject, so they stand or fall
        // on the same stream: the first paper's answer is the unit's.
        groupNames = papers.firstOrNull()?.groupNames.orEmpty(),
        religions = papers.firstOrNull()?.religions.orEmpty(),
        fullMarks = papers.sumOf { it.fullMarks },
        marks = merged,
        absent = papers.any { it.absent },
        isOptional = papers.any { it.isOptional },
        components = components,
        parts = parts,
        combineGroup = group,
    )
}

// ---------------------------------------------------------------------------
// the tabulation

data class GradedSubject(val mark: SubjectMark, val grade: SubjectGrade)

data class Tabulation(
    val gpa: Double?,            // null while any compulsory mark is missing
    val letter: String,
    val failed: List<String>,    // names of the compulsory subjects failed
    val incomplete: Boolean,
    val subjects: List<GradedSubject>,
)

/**
 * One student's result for one exam.
 *
 *   1. ONE F IN A COMPULSORY SUBJECT FAILS THE EXAM — GPA 0.00, grade F,
 *      however good the rest are.
 *   2. THE OPTIONAL (4th) SUBJECT ONLY EVER HELPS: points above 2.00 are
 *      added, it is never in the divisor, and failing it fails nothing.
 *   3. A MISSING MARK IS NOT A ZERO — the GPA stays null and the sheet says
 *      so, rather than publishing a figure that will change later.
 *   4. A FAILED COMPONENT FAILS THE SUBJECT, whatever the total comes to.
 */
fun tabulate(marks: List<SubjectMark>): Tabulation {
    val subjects = combineUnits(marks).map { GradedSubject(it, gradeForSubject(it)) }
    val compulsory = subjects.filter { !it.mark.isOptional }
    val optional = subjects.filter { it.mark.isOptional }

    val incomplete = compulsory.any { it.grade.total == null && !it.mark.absent }
    val failed = compulsory.filter { it.grade.letter == "F" }.map { it.mark.subjectName }

    if (incomplete) return Tabulation(null, "-", failed, true, subjects)
    if (compulsory.isEmpty()) return Tabulation(null, "-", failed, true, subjects)
    if (failed.isNotEmpty()) return Tabulation(0.0, "F", failed, false, subjects)

    val total = compulsory.sumOf { it.grade.point }
    val bonus = optional.sumOf { max(0.0, it.grade.point - 2.0) }
    val gpa = min(MAX_GPA, (total + bonus) / compulsory.size)
    val rounded = (gpa * 100).roundToInt() / 100.0

    return Tabulation(rounded, letterForGpa(rounded), emptyList(), false, subjects)
}

/**
 * What a result adds up to, and what it is out of.
 *
 * ONE rule for every sheet, because the alternative was shipped and found: the
 * GPA treats a result as finished once every COMPULSORY subject is marked —
 * a student takes one 4th subject, not every optional one the class offers —
 * while the total demanded all of them and printed a dash. A sheet showed
 * "GPA 4.33" beside "Total —", which reads as a bug in the arithmetic.
 *
 * So the total is withheld on exactly the same test as the GPA, and an
 * optional subject with no mark is left out of BOTH sides: counting its full
 * marks against a student who never sat it would read as a zero.
 */
fun marksTotal(subjects: List<SubjectMark>): Pair<Double?, Double> {
    val counted = subjects.filter { !it.isOptional || it.marks != null || it.absent }
    val missing = counted.any { !it.isOptional && it.marks == null && !it.absent }
    val obtained = if (missing) {
        null
    } else {
        counted.sumOf { if (it.absent) 0.0 else it.marks ?: 0.0 }
    }
    return obtained to counted.sumOf { it.fullMarks }
}

/** The overall letter, from the GPA rather than from any one subject. */
fun letterForGpa(gpa: Double): String = when {
    gpa >= 5.0 -> "A+"
    gpa >= 4.0 -> "A"
    gpa >= 3.5 -> "A-"
    gpa >= 3.0 -> "B"
    gpa >= 2.0 -> "C"
    gpa >= 1.0 -> "D"
    else -> "F"
}

fun gpaText(gpa: Double?): String =
    if (gpa == null) "—" else String.format(Locale.UK, "%.2f", gpa)
