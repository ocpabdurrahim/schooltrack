package io.github.ocpabdurrahim.schooltrack.data

/**
 * Emptying the school from inside the app, to start a new one.
 *
 * There is a script for this too (tools/reset-school.mjs), and it stays: it
 * runs with the service account, from one computer, and can reach collections
 * the rules will never open. This is the same operation for somebody holding
 * a phone.
 *
 * TWO THINGS MAKE IT DIFFERENT FROM THE SCRIPT, and both are in the rules.
 *
 * The first is that deleting is otherwise impossible here. Every
 * `allow write: ... && stamped()` refuses a delete, because a delete carries
 * no request.resource to stamp, and payments says outright that a receipt is
 * never deleted.
 *
 * The second is how far they are opened: NOT permanently. An ADMIN arms the
 * reset, which writes settings/reset, and the rules allow deletes only while
 * that document says armed and is less than fifteen minutes old. Outside that
 * window the database is exactly as locked as it was before this feature
 * existed.
 *
 * THE LIST BELOW IS WRITTEN OUT BY HAND, and that is the one thing to
 * remember when adding a collection. A client cannot ask Firestore what
 * collections exist — listCollections() is the Admin SDK only — so a
 * collection that is not named here is simply not cleared, and the school
 * would start again with last year's records still in it. The script has no
 * such blind spot: it clears whatever it finds. Add new collections to both.
 *
 * This file has a twin: web/src/data/reset.ts.
 */

/** Every collection this app stores under a school. */
val ALL_COLLECTIONS = listOf(
    "attendance",
    "attendanceMarks",
    "classes",
    "counters",
    "discounts",
    "documents",
    "exams",
    "expenseHeads",
    "expenses",
    "feeHeads",
    "feeStructure",
    "guardians",
    "holidays",
    "integrations",
    "members",
    "payments",
    "results",
    "salaryPayments",
    "salaryStructure",
    "settings",
    "staff",
    "studentPhotos",
    "students",
    "subjects",
)

/**
 * Kept by every mode: who the school is, who may get in, and the keys.
 *
 * `members` holds the only grant of access there is — signing in gives
 * nothing by itself — so a reset that cleared it would lock the school out of
 * its own app with no way back except a service account. `settings` carries
 * the school's name, which the confirmation is typed against, and the armed
 * flag this very reset runs on. `integrations` is the Gemini key.
 */
val ALWAYS_KEPT = listOf("members", "settings", "integrations")

/**
 * Also kept by RECORDS: the school's shape rather than its history.
 *
 * The "it is July and last year is over" reset. The classes, the subjects,
 * what things cost and who teaches stay; the children, their marks, their
 * attendance and their money go.
 */
val SETUP_COLLECTIONS = listOf(
    "classes",
    "subjects",
    "feeHeads",
    "feeStructure",
    "expenseHeads",
    "holidays",
    "staff",
    "salaryStructure",
)

enum class ResetMode { ALL, RECORDS }

data class ResetPlan(val mode: ResetMode, val clear: List<String>, val keep: List<String>)

/** Which collections a mode clears, and which it leaves alone. */
fun planFor(mode: ResetMode): ResetPlan {
    val kept = if (mode == ResetMode.RECORDS) ALWAYS_KEPT + SETUP_COLLECTIONS else ALWAYS_KEPT
    val names = ALL_COLLECTIONS.sorted()
    return ResetPlan(
        mode = mode,
        clear = names.filterNot { it in kept },
        keep = names.filter { it in kept },
    )
}

/**
 * The confirmation. The school's own name, typed, exactly.
 *
 * Not "yes" and not "y": the point is to be a sentence you cannot produce by
 * leaning on the keyboard, and one that names WHICH school is about to be
 * emptied. Case and surrounding space are forgiven because they are typing
 * slips, not doubts about intent.
 */
fun confirms(typed: String, schoolName: String): Boolean {
    fun tidy(s: String) = s.trim().replace(Regex("\\s+"), " ").lowercase()
    return tidy(schoolName).isNotEmpty() && tidy(typed) == tidy(schoolName)
}

/** How long the rules let deletes through once a reset is armed. */
const val ARMED_FOR_MINUTES = 15

/** A collection that was meant to be cleared and still has documents in it. */
data class Leftover(val name: String, val count: Int)

/**
 * What is STILL THERE after a reset says it finished.
 *
 * Counted from the database again, not worked out from what the deleting
 * loop thought it did. A batch that was refused — the armed window ran out,
 * the connection dropped, a rule said no — leaves documents behind, and
 * every one of them is a record the new school starts with and nobody is
 * expecting. Reporting success from a loop that finished without throwing is
 * reporting the absence of an exception, which is not the same thing.
 */
fun stillThere(counts: Map<String, Int>, cleared: List<String>): List<Leftover> =
    cleared
        .filter { (counts[it] ?: 0) > 0 }
        .map { Leftover(it, counts.getValue(it)) }
        .sortedWith(compareByDescending<Leftover> { it.count }.thenBy { it.name })

/** "students (78) and results (36)" — for telling somebody what to look at. */
fun leftoverList(left: List<Leftover>): String {
    val parts = left.map { "${it.name} (${it.count})" }
    return if (parts.size <= 1) parts.joinToString("")
    else parts.dropLast(1).joinToString(", ") + " and " + parts.last()
}
