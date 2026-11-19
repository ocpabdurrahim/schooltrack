package io.github.ocpabdurrahim.schooltrack.data

/**
 * Reading a photographed mark sheet, and deciding how much of it to believe.
 *
 * A subject teacher fills a paper form -- Roll, CQ, MCQ, Prac, Total, three
 * blocks of rolls to a page -- signs it and hands it in. This file turns what
 * a reader made of that photograph into the same boxes the mark entry grid has
 * always had, and refuses the rest.
 *
 * NOTHING HERE WRITES. The screen shows what was read, the problems are named
 * beside the rows they belong to, a person corrects them, and the marks are
 * saved by the same saveMarks() the typed grid uses.
 *
 * Three ideas carry the weight:
 *
 *   THE TOTAL IS A CHECKSUM, never a mark. The app computes a subject total
 *   from its parts and always has, so the number the teacher wrote in the
 *   Total column is free evidence: when CQ + MCQ does not come to it, one of
 *   the three was misread and the row is held back rather than guessed at.
 *
 *   THE HEADER IS EVIDENCE TOO. A sheet headed "Ten" applied to Class 9 would
 *   hand twenty-one children someone else's marks, and every roll would match,
 *   so nothing downstream would notice.
 *
 *   A BLANK BOX IS NOT A ZERO. Most of a sheet is empty. An empty row is
 *   skipped entirely; it must never arrive as a zero, which is a mark, and a
 *   failing one.
 *
 * The twin of web/src/data/scanmarks.ts.
 */

// ---------------------------------------------------------------------------
// what a reader hands back

data class ScanHeader(
    val exam: String = "",
    val year: String = "",
    val className: String = "",
    val subject: String = "",
)

data class ScanRow(
    val roll: Int?,
    /** Keyed by the column heading as printed -- CQ, MCQ, Prac, Total. */
    val values: Map<String, Int?>,
)

data class ScanRead(val header: ScanHeader, val rows: List<ScanRow>)

/** The column every form carries, which is checked and then thrown away. */
const val TOTAL_COLUMN = "TOTAL"

// ---------------------------------------------------------------------------
// matching what is printed to what the app holds

private val NOT_ALNUM_COL = Regex("[^A-Z0-9]+")

/** Letters and digits only, upper case: "Prac." and "prac" are one column. */
fun normalColumn(raw: String): String =
    raw.trim().uppercase().replace(NOT_ALNUM_COL, "")

/**
 * The component a printed column means.
 *
 * Prefix matching in both directions, because a column heading is abbreviated
 * to fit the paper while the component is not: the form says "Prac" and the
 * subject says "PRACTICAL". It is not fuzzy beyond that -- "CQ" will never
 * match "MCQ", since neither is a prefix of the other.
 */
fun matchComponent(column: String, components: List<Component>): Component? {
    val c = normalColumn(column)
    if (c.isEmpty() || c == TOTAL_COLUMN) return null
    components.firstOrNull { normalColumn(it.name) == c }?.let { return it }
    return components.firstOrNull {
        val n = normalColumn(it.name)
        n.startsWith(c) || c.startsWith(n)
    }
}

private val WORDS = mapOf(
    "ONE" to 1, "TWO" to 2, "THREE" to 3, "FOUR" to 4, "FIVE" to 5, "SIX" to 6,
    "SEVEN" to 7, "EIGHT" to 8, "NINE" to 9, "TEN" to 10, "ELEVEN" to 11, "TWELVE" to 12,
)

/**
 * The class a written name means, or null.
 *
 * A teacher writes "Ten" where the app says "Class 10 - A". The section letter
 * is deliberately ignored: no teacher writes it, and a sheet for the wrong
 * SECTION of the right class is caught by the roll numbers.
 */
fun classNumber(raw: String): Int? {
    Regex("\\d+").find(raw)?.let { return it.value.toIntOrNull() }
    val word = raw.trim().uppercase().replace(Regex("[^A-Z]+"), "")
    return WORDS[word]
}

/**
 * Whether a written subject name is the chosen subject.
 *
 * The order rule already knows that "History" and "HISTORY OF BANGLADESH AND
 * WORLD CIVILIZATION" are one paper, so it does this job for free and stays
 * the only place that knowledge lives.
 */
fun sameSubject(written: String, chosen: String): Boolean {
    val a = normalColumn(written)
    val b = normalColumn(chosen)
    if (a.isEmpty() || b.isEmpty()) return false
    if (a == b || a.startsWith(b) || b.startsWith(a)) return true
    val ra = subjectRank(SubjectKey(written, written))
    val rb = subjectRank(SubjectKey(chosen, chosen))
    return ra != UNRANKED && ra == rb
}

/** Loose on purpose: the exam is struck out by hand and is often misread. */
fun looksLikeExam(written: String, chosen: String): Boolean {
    val a = normalColumn(written)
    val b = normalColumn(chosen)
    if (a.isEmpty() || b.isEmpty()) return false
    return a.startsWith(b) || b.startsWith(a) || a.contains(b) || b.contains(a)
}

// ---------------------------------------------------------------------------
// the verdict

enum class Level { OK, WARN, STOP }

data class Finding(val level: Level, val message: String)

data class ScannedRow(
    /**
     * Where this came from in what was read, so a correction made on screen
     * goes back to the right line. Matching on the roll instead would not do:
     * the rows that most need correcting are the ones whose roll was misread.
     */
    val index: Int,
    val rollNo: Int?,
    val studentId: String?,
    val studentName: String,
    /** What goes in the boxes, by component name. Absent: not entered. */
    val parts: Map<String, String>,
    /** The whole-paper mark, for a subject marked without parts. */
    val marks: String,
    /** The total the teacher wrote. Checked, then thrown away. */
    val written: Int?,
    /** The total the app makes of the parts, which is what will be stored. */
    val computed: Int?,
    /** Not empty: this row is held back and nothing is filled from it. */
    val problem: String,
    /** Not empty: it will be filled, but it is worth a look. */
    val note: String,
)

data class ScanCheck(
    /** Keyed by studentId, shaped like the grid the mark screen already holds. */
    val entries: Map<String, Typed>,
    val rows: List<ScannedRow>,
    val findings: List<Finding>,
    val filled: Int,
    val held: Int,
)

data class ScanStudent(val studentId: String, val rollNo: Int, val fullName: String)

data class Chosen(
    val sectionName: String,
    val className: String,
    val subjectName: String,
    val examName: String,
    val fullMarks: Double,
    val components: List<Component>,
)

/** The sheet's header against what was picked in the app. */
fun headerFindings(header: ScanHeader, chosen: Chosen): List<Finding> {
    val out = mutableListOf<Finding>()

    val onPaper = classNumber(header.className)
    val picked = classNumber(chosen.className)
    when {
        header.className.isBlank() ->
            out.add(Finding(Level.WARN, "No class name could be read off the sheet."))
        onPaper == null || picked == null ->
            out.add(
                Finding(
                    Level.WARN,
                    "The sheet says \"${header.className.trim()}\" and you chose " +
                        "${chosen.sectionName}. Check they are the same class.",
                ),
            )
        onPaper != picked ->
            // The dangerous one. Class 9 and Class 10 both have a roll 3, so
            // every roll on a Class 10 sheet matches in Class 9 and nothing
            // further down would notice.
            out.add(
                Finding(
                    Level.STOP,
                    "This sheet is for class $onPaper, but you chose ${chosen.sectionName}. " +
                        "Every roll number would still match, so the marks would go to the " +
                        "wrong children. Pick the right section, or use the right sheet.",
                ),
            )
    }

    if (header.subject.isBlank()) {
        out.add(Finding(Level.WARN, "No subject could be read off the sheet."))
    } else if (!sameSubject(header.subject, chosen.subjectName)) {
        out.add(
            Finding(
                Level.STOP,
                "This sheet is headed \"${header.subject.trim()}\", but you chose " +
                    chosen.subjectName + ".",
            ),
        )
    }

    // The exam is chosen on the paper by striking out three of four words,
    // which is the one field a reader should not be trusted on. It is
    // reported, never enforced.
    if (header.exam.isNotBlank() && !looksLikeExam(header.exam, chosen.examName)) {
        out.add(
            Finding(
                Level.WARN,
                "The sheet reads \"${header.exam.trim()}\" where you chose " +
                    "${chosen.examName}. The exam is struck out by hand on the form, so " +
                    "this is often misread -- check it yourself before saving.",
            ),
        )
    }

    return out
}

// ---------------------------------------------------------------------------

private fun asText(n: Int?) = n?.toString() ?: ""

private fun compList(comps: List<Component>) =
    comps.joinToString(" + ") { "${it.name} out of ${it.max.toInt()}" }

/**
 * The whole sheet, checked.
 *
 * Rows arrive in whatever order the reader found them and leave in roll order,
 * because that is the order of the paper and the order a person checking the
 * two side by side will want.
 */
fun checkScan(read: ScanRead, students: List<ScanStudent>, chosen: Chosen): ScanCheck {
    val findings = headerFindings(read.header, chosen)
    val stopped = findings.any { it.level == Level.STOP }

    val byRoll = LinkedHashMap<Int, ScanStudent>()
    for (s in students) byRoll.putIfAbsent(s.rollNo, s)

    val seen = mutableSetOf<Int>()
    val rows = mutableListOf<ScannedRow>()

    read.rows.forEachIndexed { index, raw ->
        var row = checkRow(raw, index, byRoll, chosen) ?: return@forEachIndexed
        row.rollNo?.let { roll ->
            if (roll in seen && row.problem.isEmpty()) {
                row = row.copy(problem = "Roll $roll appears twice on what was scanned.")
            }
            seen.add(roll)
        }
        rows.add(row)
    }

    rows.sortBy { it.rollNo ?: Int.MAX_VALUE }

    val entries = LinkedHashMap<String, Typed>()
    if (!stopped) {
        for (r in rows) {
            if (r.problem.isNotEmpty() || r.studentId == null) continue
            entries[r.studentId] = Typed(marks = r.marks, parts = r.parts, absent = false)
        }
    }

    return ScanCheck(
        entries = entries,
        rows = rows,
        findings = findings,
        filled = entries.size,
        held = rows.count { it.problem.isNotEmpty() },
    )
}

/** One line. Null when the line held nothing at all. */
private fun checkRow(
    raw: ScanRow,
    index: Int,
    byRoll: Map<Int, ScanStudent>,
    chosen: Chosen,
): ScannedRow? {
    // The total is pulled out first: it is a column on the paper but never a
    // mark, and leaving it among the others would have it matched to a part.
    var written: Int? = null
    val columns = mutableListOf<Pair<String, Int?>>()
    for ((name, v) in raw.values) {
        if (normalColumn(name) == TOTAL_COLUMN) written = v else columns.add(name to v)
    }

    val anyValue = written != null || columns.any { it.second != null }
    if (!anyValue) return null

    val student = raw.roll?.let { byRoll[it] }
    val parts = LinkedHashMap<String, String>()
    var problem = ""
    var note = ""
    var marks = ""
    var computed: Int? = null

    if (raw.roll == null) {
        problem = "No roll number could be read for this row."
    } else if (student == null) {
        problem = "Roll ${raw.roll} is not in this section."
    }

    val comps = chosen.components

    if (comps.isEmpty()) {
        // A paper marked whole. The Total column IS the mark; there is nothing
        // to check it against, which is why the form has part columns.
        val loose = columns.firstOrNull { it.second != null }?.second
        val mark = written ?: loose
        marks = asText(mark)
        computed = mark
        if (mark != null && mark > chosen.fullMarks) {
            if (problem.isEmpty()) {
                problem = "$mark is more than the ${chosen.fullMarks.toInt()} " +
                    "this paper is out of."
            }
        }
        if (written == null && loose != null) {
            note = "Read from a part column: this paper is marked as one mark, with no parts."
        }
        return ScannedRow(
            index, raw.roll, student?.studentId, student?.fullName ?: "",
            parts, marks, written, computed, problem, note,
        )
    }

    // Parts. A column the subject has no component for is a problem, not a
    // thing to ignore: a Prac written against History means the sheet and the
    // subject disagree, and the teacher should be told.
    var sum = 0
    var got = 0
    for ((name, v) in columns) {
        if (v == null) continue
        val comp = matchComponent(name, comps)
        if (comp == null) {
            if (problem.isEmpty()) {
                problem = "${chosen.subjectName} has no \"$name\" -- it is marked " +
                    compList(comps) + "."
            }
            continue
        }
        if (v > comp.max) {
            if (problem.isEmpty()) {
                problem = "${comp.name} $v is over the ${comp.max.toInt()} it is out of."
            }
            continue
        }
        if (v < 0) {
            if (problem.isEmpty()) problem = "${comp.name} cannot be $v."
            continue
        }
        parts[comp.name] = v.toString()
        sum += v
        got += 1
    }

    computed = if (got == 0) null else sum

    if (got == 0) {
        if (written != null && comps.size == 1) {
            // One part and a total: they are the same number by definition, so
            // a teacher who filled only the Total has still said everything.
            parts[comps[0].name] = written.toString()
            computed = written
            note = "Taken as ${comps[0].name}: this paper has only that one part."
            if (written > comps[0].max) {
                problem = "${comps[0].name} $written is over the " +
                    "${comps[0].max.toInt()} it is out of."
            }
        } else if (written != null && problem.isEmpty()) {
            problem = "Only a total was written. ${chosen.subjectName} is marked " +
                compList(comps) + ", and a total cannot be split back into those."
        }
        return ScannedRow(
            index, raw.roll, student?.studentId, student?.fullName ?: "",
            parts, marks, written, computed, problem, note,
        )
    }

    // The checksum.
    if (written == null) {
        if (note.isEmpty()) {
            note = "No total was written, so there is nothing to check the parts against."
        }
    } else if (written != sum) {
        if (problem.isEmpty()) {
            problem = "The parts come to $sum, but the total written is $written. " +
                "One of the three was misread, or the addition on the paper is wrong."
        }
    }

    if (got < comps.size && problem.isEmpty() && note.isEmpty()) {
        val missing = comps.filter { it.name !in parts }.joinToString(" or ") { it.name }
        note = "Nothing written for $missing; left empty, not zero."
    }

    return ScannedRow(
        index, raw.roll, student?.studentId, student?.fullName ?: "",
        parts, marks, written, computed, problem, note,
    )
}
