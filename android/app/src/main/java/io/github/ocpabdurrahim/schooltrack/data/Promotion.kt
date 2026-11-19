package io.github.ocpabdurrahim.schooltrack.data

/**
 * Moving a class up at the end of the year.
 *
 * When the final exam of a class is published, the merit list decides the
 * roll numbers of the SAME children in the next class: first in merit becomes
 * roll 1, second becomes roll 2, and so on. Class Ten has no next class --
 * its Test is the last exam the school sets -- so those students are archived
 * instead.
 *
 * NOTHING HERE WRITES ANYTHING. It works out a plan: who goes up, to what
 * roll, who stays, who is archived. Promotion rewrites every child's class
 * and roll number, and that is not a thing to do as a side effect of pressing
 * Publish.
 *
 * What makes it safe to do at all: a result row stores the classId and rollNo
 * the student had WHEN THE MARKS WERE ENTERED, so moving them cannot rewrite
 * their history.
 *
 * The twin of web/src/data/promotion.ts.
 */

/** A student as the promotion screen needs them, with their final result. */
data class Candidate(
    val studentId: String,
    val fullName: String,
    val rollNo: Int,
    /** null when a compulsory subject has no mark yet: they cannot be ranked. */
    val gpa: Double? = null,
    /** Marks obtained across the counted subjects, the tie-break below GPA. */
    val total: Double? = null,
    /** Compulsory subjects failed. Non-empty means the exam was failed. */
    val failed: List<String> = emptyList(),
    val incomplete: Boolean = false,
)

enum class Standing { PASSED, FAILED, INCOMPLETE }

/**
 * How a candidate stands, in one word.
 *
 * Incomplete is kept apart from failed on purpose. "Nobody has entered the
 * Chemistry mark yet" and "this child failed Chemistry" look the same on a
 * sheet with a blank in it, and they are not the same at all.
 */
fun standing(c: Candidate): Standing = when {
    c.incomplete || c.gpa == null -> Standing.INCOMPLETE
    c.failed.isNotEmpty() -> Standing.FAILED
    else -> Standing.PASSED
}

/**
 * The merit order: best first.
 *
 * GPA decides it, the total marks break a tie, and the roll number breaks
 * that. The last one is not arbitrary -- without it two children with
 * identical results would swap places every time the list was built, and the
 * roll numbers on offer would change between looking and pressing.
 */
fun meritOrder(candidates: List<Candidate>): List<Candidate> =
    candidates.sortedWith(
        compareBy<Candidate> { standing(it).ordinal }
            .thenByDescending { it.gpa ?: -1.0 }
            .thenByDescending { it.total ?: -1.0 }
            .thenBy { it.rollNo },
    )

enum class What { UP, STAYS, ARCHIVED }

/** What happens to one student when the class moves up. */
data class Move(
    val studentId: String,
    val fullName: String,
    val fromRoll: Int,
    val standing: Standing,
    /** Where they are going: the next class, or null when archived. */
    val toClassId: String?,
    /** Their new roll, or null when they stay put or are archived. */
    val toRoll: Int?,
    val what: What,
)

data class Plan(
    val moves: List<Move> = emptyList(),
    /** Said plainly when the plan cannot be carried out at all. */
    val problem: String = "",
    /** Worth seeing before pressing the button, but not a reason to stop. */
    val warnings: List<String> = emptyList(),
)

/**
 * Who goes where, and with what roll number.
 *
 * Only the students actually going up are numbered, in merit order, from 1.
 * A student held back keeps the class and roll they have: they are sitting
 * the same year again, in the same seat.
 */
fun promotionPlan(
    fromClassId: String,
    toClassId: String?,
    candidates: List<Candidate>,
    alreadyThere: Int = 0,
    takeAnyway: Set<String> = emptySet(),
): Plan {
    if (fromClassId.isBlank()) {
        return Plan(problem = "No class was chosen to move up.")
    }
    if (candidates.isEmpty()) {
        return Plan(problem = "That class has no students on the roll.")
    }

    val archiving = toClassId == null
    if (!archiving && alreadyThere > 0) {
        return Plan(
            problem = "The next class already has $alreadyThere student(s) on its " +
                "roll, so new roll numbers would collide with theirs. Move or " +
                "archive them first.",
        )
    }

    val ranked = meritOrder(candidates)
    val going = ranked.filter {
        standing(it) == Standing.PASSED || it.studentId in takeAnyway
    }.toSet()

    val warnings = mutableListOf<String>()
    val held = ranked.size - going.size
    if (held > 0) {
        warnings.add(
            "$held student(s) are staying down: they keep their class and roll " +
                "number and will sit the year again.",
        )
    }
    val unranked = going.count { standing(it) != Standing.PASSED }
    if (unranked > 0) {
        warnings.add(
            "$unranked student(s) are going up without a passing result, so they " +
                "are placed at the bottom of the merit list.",
        )
    }

    var next = 0
    val moves = ranked.map { c ->
        when {
            c !in going -> Move(
                c.studentId, c.fullName, c.rollNo, standing(c),
                toClassId = fromClassId, toRoll = null, what = What.STAYS,
            )
            archiving -> Move(
                c.studentId, c.fullName, c.rollNo, standing(c),
                toClassId = null, toRoll = null, what = What.ARCHIVED,
            )
            else -> {
                next += 1
                Move(
                    c.studentId, c.fullName, c.rollNo, standing(c),
                    toClassId = toClassId, toRoll = next, what = What.UP,
                )
            }
        }
    }

    return Plan(moves = moves, warnings = warnings)
}

/**
 * The class above this one, by the NUMBER in its name.
 *
 * Read from the number rather than from the order the classes happen to be
 * stored in: "Class 10" sorts before "Class 6" as text, and a school that
 * adds a class later should not have its promotions quietly rewired.
 *
 * Null when there is nothing above -- which is the signal to archive.
 */
fun classNumberOf(className: String): Int? {
    val words = mapOf("six" to 6, "seven" to 7, "eight" to 8, "nine" to 9, "ten" to 10)
    val text = className.lowercase()
    for ((word, n) in words) {
        if (Regex("\\b$word\\b").containsMatchIn(text)) return n
    }
    return Regex("\\d+").find(text)?.value?.toIntOrNull()
}

data class ClassAbove(val classId: String, val className: String, val section: String = "")

fun nextClassAbove(here: ClassAbove, classes: List<ClassAbove>): ClassAbove? {
    val n = classNumberOf(here.className) ?: return null
    return classes
        .filter { classNumberOf(it.className) == n + 1 }
        // Same section where there is one, so 9-A goes to 10-A not 10-B.
        .sortedByDescending { it.section == here.section }
        .firstOrNull()
}
