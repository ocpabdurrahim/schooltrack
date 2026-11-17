package io.github.ocpabdurrahim.schooltrack.data

/**
 * What a teacher types, turned into the numbers that get stored.
 *
 * This file has a twin: web/src/data/markentry.ts. Both mark entry screens on
 * both apps go through it, so a mark typed on a phone and the same mark typed
 * in a browser are stored identically — including the total, which is never
 * typed and never trusted from the caller.
 */

/** One student's boxes for one subject, exactly as they are on screen. */
data class Typed(
    val marks: String = "",                          // the single box, for a whole paper
    val parts: Map<String, String> = emptyMap(),     // a box per component
    val absent: Boolean = false,
)

/**
 * A typed box as a number, or null for "not entered".
 *
 * Blank is null rather than 0 — the whole grading engine rests on that
 * difference — and so is anything that is not a number, because a box holding
 * "ab" must not quietly become a mark.
 */
fun numOrNull(raw: String): Double? {
    val v = raw.trim()
    if (v.isEmpty()) return null
    val n = v.toDoubleOrNull() ?: return null
    return if (n.isFinite()) n else null
}

/**
 * The parts and the subject total behind one student's boxes.
 *
 * The total comes from subjectTotal(), the same function the marksheet and the
 * report card use, so the number written to the database can never disagree
 * with the grade printed from it. A paper marked as one mark has no parts at
 * all — null, not an empty map, so nothing is stored that says nothing.
 */
fun partsAndTotal(subject: Subject, typed: Typed): Pair<Map<String, Double?>?, Double?> {
    if (subject.components.isEmpty()) return null to numOrNull(typed.marks)

    val parts = LinkedHashMap<String, Double?>()
    for (c in subject.components) parts[c.name] = numOrNull(typed.parts[c.name].orEmpty())

    val total = subjectTotal(
        SubjectMark(
            subjectId = subject.subjectId,
            subjectName = subject.subjectName,
            fullMarks = subject.fullMarks,
            marks = null,
            components = subject.components,
            parts = parts,
        ),
    )
    return parts to total
}

/** Parts as they come back from the database, as text for the boxes. */
fun typedFrom(marks: Double?, parts: Map<String, Double?>?, absent: Boolean): Typed = Typed(
    marks = marks?.let { plain(it) }.orEmpty(),
    parts = parts.orEmpty().mapValues { (_, v) -> v?.let { plain(it) }.orEmpty() },
    absent = absent,
)

/** 77.0 is shown as "77", 77.5 stays "77.5" — a mark is rarely a decimal. */
private fun plain(v: Double): String =
    if (v == v.toLong().toDouble()) v.toLong().toString() else v.toString()

/** A part typed above its own maximum — the one mistake worth refusing to save. */
fun overMax(subject: Subject, typed: Typed): Boolean {
    if (subject.components.isNotEmpty()) {
        return subject.components.any {
            (numOrNull(typed.parts[it.name].orEmpty()) ?: 0.0) > it.max
        }
    }
    return (numOrNull(typed.marks) ?: 0.0) > subject.fullMarks
}
