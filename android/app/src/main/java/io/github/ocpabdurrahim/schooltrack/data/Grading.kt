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

data class SubjectMark(
    val subjectId: String,
    val subjectName: String,
    val fullMarks: Double = 100.0,
    val marks: Double? = null,       // null = not entered yet
    val absent: Boolean = false,
    val isOptional: Boolean = false, // the "4th subject"
)

data class GradedSubject(val mark: SubjectMark, val grade: Grade)

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
 */
fun tabulate(marks: List<SubjectMark>): Tabulation {
    val subjects = marks.map { GradedSubject(it, gradeFor(it.marks, it.fullMarks, it.absent)) }
    val compulsory = subjects.filter { !it.mark.isOptional }
    val optional = subjects.filter { it.mark.isOptional }

    val incomplete = compulsory.any { it.mark.marks == null && !it.mark.absent }
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
