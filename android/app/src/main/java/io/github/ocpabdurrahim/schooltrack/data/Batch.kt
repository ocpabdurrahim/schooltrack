package io.github.ocpabdurrahim.schooltrack.data

/**
 * Reading a pasted list — the Kotlin twin of web/src/data/batch.ts.
 *
 * Two jobs a school office does in bulk, and only in bulk: typing in a whole
 * section of students at the start of a year, and copying a column of marks off
 * an answer-script tally. Both exist here one at a time already, and one at a
 * time is right for a correction — it is wrong for forty students.
 *
 * Pure text in, rows out: nothing here writes. The screens show what was read,
 * let it be corrected, and save it through the same saveStudent / saveMarks the
 * single forms use, so the rules, the numbering and the audit stamp are
 * identical on both clients.
 *
 * Forgiving about SHAPE, strict about MEANING. A tab-separated paste out of
 * Excel, a comma-separated list typed by hand and a bare column of names are
 * all read. But a date it cannot read is dropped and said so, and a roll number
 * that is not a number stops its row: a silently wrong register is worse than a
 * rejected paste.
 */

// ---------------------------------------------------------------------------
// students

data class StudentRow(
    /** 1-based line in the pasted text, so a problem can be pointed at. */
    val line: Int,
    val fullName: String = "",
    /** null until prepareStudentRows gives it the next free number. */
    val rollNo: Long? = null,
    val regNo: String = "",
    val groupName: String = "",
    val gender: String = "",
    val dob: String = "",
    val fatherName: String = "",
    val motherName: String = "",
    val bloodGroup: String = "",
    val mobileNo: String = "",
    /** Not empty: this row cannot be saved. */
    val problem: String = "",
    /** Not empty: it will be saved, but something was dropped or guessed. */
    val note: String = "",
)

private enum class Field { ROLL, NAME, FATHER, MOTHER, MOBILE, DOB, GENDER, BLOOD, REG, GROUP }

/** Header spellings, normalised to letters only. */
private val HEADERS: Map<String, Field> = mapOf(
    "roll" to Field.ROLL, "rollno" to Field.ROLL, "rollnumber" to Field.ROLL,
    "name" to Field.NAME, "fullname" to Field.NAME, "student" to Field.NAME,
    "studentname" to Field.NAME, "studentsname" to Field.NAME,
    "father" to Field.FATHER, "fathername" to Field.FATHER, "fathersname" to Field.FATHER,
    "mother" to Field.MOTHER, "mothername" to Field.MOTHER, "mothersname" to Field.MOTHER,
    "mobile" to Field.MOBILE, "mobileno" to Field.MOBILE, "phone" to Field.MOBILE,
    "phoneno" to Field.MOBILE, "contact" to Field.MOBILE, "contactno" to Field.MOBILE,
    "guardianmobile" to Field.MOBILE, "guardiansmobile" to Field.MOBILE,
    "dob" to Field.DOB, "dateofbirth" to Field.DOB, "birth" to Field.DOB,
    "birthdate" to Field.DOB, "birthday" to Field.DOB,
    "gender" to Field.GENDER, "sex" to Field.GENDER,
    "blood" to Field.BLOOD, "bloodgroup" to Field.BLOOD,
    "reg" to Field.REG, "regno" to Field.REG, "registration" to Field.REG,
    "registrationno" to Field.REG, "registrationnumber" to Field.REG,
    "group" to Field.GROUP, "groupname" to Field.GROUP,
)

/** What a list without a header line is taken to be. */
private val ROLL_FIRST = listOf(
    Field.ROLL, Field.NAME, Field.FATHER, Field.MOTHER, Field.MOBILE, Field.DOB,
)

// A list that does not lead with a roll number is taken to have no rolls in it
// at all — anyone who had them would have put them first. So the column after
// the name is the father's, not a roll, and the rolls are given out afterwards.
private val NAME_FIRST = listOf(
    Field.NAME, Field.FATHER, Field.MOTHER, Field.MOBILE, Field.DOB,
)

private fun letters(s: String) = s.lowercase().filter { it in 'a'..'z' }

private data class Split(val cells: List<String>, val loose: Boolean)

/**
 * Cuts a line into cells.
 *
 * A tab beats a comma beats a run of spaces, because that is the order of
 * certainty. A line separated by SINGLE spaces is left whole and marked loose —
 * "12 Ayesha Begum" has one break in it, not two.
 */
private fun splitCells(line: String): Split = when {
    line.contains('\t') -> Split(line.split('\t'), false)
    line.contains(',') -> Split(line.split(','), false)
    Regex("\\s{2,}").containsMatchIn(line.trim()) ->
        Split(line.trim().split(Regex("\\s{2,}")), false)
    else -> Split(listOf(line.trim()), true)
}

/** The columns a header line names, or null if it is not a header line. */
private fun headerOrder(cells: List<String>): List<Field?>? {
    val named = cells.map { HEADERS[letters(it)] }
    if (named.count { it != null } < 2) return null
    // Every filled cell must name a column. A data line never does.
    if (cells.indices.any { cells[it].isNotBlank() && named[it] == null }) return null
    return named
}

private val ISO = Regex("^(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})$")
private val DMY = Regex("^(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{4})$")

/**
 * A date as a school writes it, as the app stores it (YYYY-MM-DD).
 *
 * 05/03/2012 is read as 5 March, not 5 May: this is a Bangladeshi school and
 * day-first is what its own paperwork uses. A date it cannot read comes back
 * empty and the row says so, rather than guessing a month.
 */
fun normalDate(raw: String): String {
    val s = raw.trim()
    if (s.isEmpty()) return ""
    val y: Int
    val m: Int
    val d: Int
    val iso = ISO.find(s)
    val dmy = DMY.find(s)
    when {
        iso != null -> {
            y = iso.groupValues[1].toInt(); m = iso.groupValues[2].toInt()
            d = iso.groupValues[3].toInt()
        }
        dmy != null -> {
            d = dmy.groupValues[1].toInt(); m = dmy.groupValues[2].toInt()
            y = dmy.groupValues[3].toInt()
        }
        else -> return ""
    }
    if (m !in 1..12 || d !in 1..31 || y !in 1900..2200) return ""
    return "%04d-%02d-%02d".format(y, m, d)
}

private fun normalGender(raw: String): String = when (letters(raw)) {
    "m", "male", "boy", "b" -> "M"
    "f", "female", "girl", "g" -> "F"
    else -> ""
}

private fun also(had: String, add: String) = if (had.isEmpty()) add else "$had; $add"

private val DIGITS = Regex("^\\d+$")

private fun assign(row: StudentRow, field: Field?, cell: String): StudentRow {
    val v = cell.trim()
    if (field == null || v.isEmpty()) return row
    return when (field) {
        Field.ROLL ->
            if (DIGITS.matches(v)) {
                row.copy(rollNo = v.toLong())
            } else {
                row.copy(
                    problem = also(
                        row.problem,
                        "\"$v\" is not a roll number. If the columns are in another order, " +
                            "put a header line at the top naming them.",
                    ),
                )
            }
        Field.DOB -> {
            val d = normalDate(v)
            if (d.isNotEmpty()) {
                row.copy(dob = d)
            } else {
                row.copy(
                    note = also(row.note, "the date \"$v\" could not be read, so it was left out"),
                )
            }
        }
        Field.GENDER -> {
            val g = normalGender(v)
            if (g.isNotEmpty()) {
                row.copy(gender = g)
            } else {
                row.copy(note = also(row.note, "\"$v\" is not male or female, so it was left out"))
            }
        }
        Field.NAME -> row.copy(fullName = v)
        Field.FATHER -> row.copy(fatherName = v)
        Field.MOTHER -> row.copy(motherName = v)
        Field.MOBILE -> row.copy(mobileNo = v)
        Field.BLOOD -> row.copy(bloodGroup = v)
        Field.REG -> row.copy(regNo = v)
        Field.GROUP -> row.copy(groupName = v)
    }
}

private val LOOSE_ROLL = Regex("^(\\d+)\\s+(.+)$")

/** Reads a pasted list of students. Nothing is checked against the school yet. */
fun parseStudentRows(text: String): List<StudentRow> {
    val lines = text.split(Regex("\r?\n"))
        .mapIndexed { i, raw -> (i + 1) to raw }
        .filter { it.second.isNotBlank() }
    if (lines.isEmpty()) return emptyList()

    val header = headerOrder(splitCells(lines[0].second).cells)
    val body = if (header != null) lines.drop(1) else lines
    if (body.isEmpty()) return emptyList()

    // Without a header: a line that starts with a number is a roll list, a line
    // that starts with a word is a name list. Decided once from the first line
    // and used for all of them.
    val first = splitCells(body[0].second)
    val order: List<Field?> = header
        ?: if (first.cells.size >= 2 && DIGITS.matches(first.cells[0].trim())) {
            ROLL_FIRST
        } else {
            NAME_FIRST
        }

    return body.map { (no, raw) ->
        var row = StudentRow(line = no)
        val split = splitCells(raw)

        if (split.loose) {
            // One line, single spaces: at most a roll and a name.
            val m = LOOSE_ROLL.find(split.cells[0])
            row = if (m != null) {
                row.copy(
                    rollNo = m.groupValues[1].toLong(),
                    fullName = m.groupValues[2].trim(),
                )
            } else {
                row.copy(fullName = split.cells[0])
            }
        } else {
            split.cells.forEachIndexed { i, cell ->
                row = assign(row, order.getOrNull(i), cell)
            }
            if (split.cells.count { it.isNotBlank() } > order.size) {
                row = row.copy(
                    note = also(
                        row.note,
                        "only the first ${order.size} columns were read — " +
                            "name the rest in a header line",
                    ),
                )
            }
        }

        if (row.fullName.isEmpty() && row.problem.isEmpty()) {
            row = row.copy(problem = "No name on this line.")
        }
        row
    }
}

/**
 * Settles the roll numbers against the section as it stands.
 *
 * A roll typed twice in the same paste is a typo and stops its row. A roll an
 * existing student already has is only flagged: that student may have left, and
 * the office knows which is which. A row with no roll at all is given the next
 * one after the highest in use — not the first gap, because a gap is usually a
 * student who left and whose number is better left alone.
 */
fun prepareStudentRows(rows: List<StudentRow>, takenRolls: List<Long>): List<StudentRow> {
    val taken = takenRolls.toSet()
    val used = mutableSetOf<Long>()
    val out = rows.toMutableList()

    for (i in out.indices) {
        val r = out[i]
        if (r.problem.isNotEmpty() || r.rollNo == null) continue
        if (used.contains(r.rollNo)) {
            out[i] = r.copy(problem = "Roll ${r.rollNo} is on more than one line of this list.")
            continue
        }
        used.add(r.rollNo)
        if (taken.contains(r.rollNo)) {
            out[i] = r.copy(note = also(r.note, "roll ${r.rollNo} is already used in this section"))
        }
    }

    var next = (takenRolls + used).maxOrNull() ?: 0L
    if (next < 0L) next = 0L
    for (i in out.indices) {
        val r = out[i]
        if (r.problem.isNotEmpty() || r.rollNo != null) continue
        do { next += 1 } while (used.contains(next) || taken.contains(next))
        used.add(next)
        out[i] = r.copy(rollNo = next, note = also(r.note, "roll $next given automatically"))
    }
    return out
}

// ---------------------------------------------------------------------------
// marks

data class MarkRow(
    val line: Int,
    /** null in a list of marks with no rolls beside them. */
    val rollNo: Long? = null,
    val marks: Double? = null,
    val absent: Boolean = false,
    val problem: String = "",
)

enum class PasteKind { ROLLS, MARKS_ONLY }

data class MarkPaste(val kind: PasteKind, val rows: List<MarkRow>)

private val ABSENT = listOf("a", "ab", "abs", "absent")

/** Written in a tally to mean "nothing for this one". */
private val BLANK = listOf("-", "--", "x", "nil", "na")

private val NUMBER = Regex("^\\d+(\\.\\d+)?$")

private fun markValue(tok: String): Pair<Double?, Boolean>? {
    val s = tok.trim()
    val low = s.lowercase()
    return when {
        ABSENT.contains(low) -> null to true
        BLANK.contains(low) -> null to false
        NUMBER.matches(s) -> s.toDouble() to false
        else -> null
    }
}

/**
 * Reads a pasted tally of marks.
 *
 * Either shape is accepted: a roll and its mark on each line ("12 78", "12=78",
 * or the roll, the name and the mark as three copied columns), or a bare column
 * of marks in roll order. The bare column is what an answer-script tally
 * actually produces, and it is the one that can go wrong — one line missing and
 * every mark below it belongs to the wrong child — so applyMarkPaste refuses to
 * fill a bare column whose length does not match the section exactly.
 */
fun parseMarkPaste(text: String): MarkPaste {
    val all = text.split(Regex("\r?\n"))
        .mapIndexed { i, raw -> (i + 1) to raw }
        .filter { it.second.isNotBlank() }

    // A heading line off a spreadsheet ("Roll  Name  Marks") carries no digit,
    // and no line of marks is without one. Dropping it beats making the person
    // delete it, and beats reporting it as a line that is not a mark.
    val lines = if (all.size > 1 && !all[0].second.any { it.isDigit() }) all.drop(1) else all

    val rows = lines.map { (no, raw) ->
        val row = MarkRow(line = no)
        val tok = raw.split(Regex("[\t,=|]|\\s+")).map { it.trim() }.filter { it.isNotEmpty() }
        when {
            tok.isEmpty() -> row
            tok.size == 1 -> {
                val v = markValue(tok[0])
                if (v == null) {
                    row.copy(problem = "\"${tok[0]}\" is not a mark.")
                } else {
                    row.copy(marks = v.first, absent = v.second)
                }
            }
            // The first token is the roll and the last is the mark: anything in
            // between is the name that came along with the copied columns.
            !DIGITS.matches(tok[0]) ->
                row.copy(problem = "This line does not start with a roll number (\"${tok[0]}\").")
            else -> {
                val withRoll = row.copy(rollNo = tok[0].toLong())
                val last = tok[tok.size - 1]
                val v = markValue(last)
                if (v == null) {
                    withRoll.copy(problem = "\"$last\" is not a mark.")
                } else {
                    withRoll.copy(marks = v.first, absent = v.second)
                }
            }
        }
    }

    val kind = if (rows.isNotEmpty() && rows.all { it.rollNo == null }) {
        PasteKind.MARKS_ONLY
    } else {
        PasteKind.ROLLS
    }
    val settled = if (kind == PasteKind.ROLLS) {
        rows.map {
            if (it.rollNo == null && it.problem.isEmpty()) {
                it.copy(problem = "No roll number on this line, and the other lines have one.")
            } else {
                it
            }
        }
    } else {
        rows
    }
    return MarkPaste(kind, settled)
}

/** One box of the mark grid: the text in it, and whether absent is ticked. */
data class MarkEntryValue(val marks: String, val absent: Boolean)

data class MarkFill(
    /** Keyed by studentId, shaped like the grid the mark screen already holds. */
    val entries: Map<String, MarkEntryValue> = emptyMap(),
    val filled: Int = 0,
    /** Rolls in the paste that this section does not have. */
    val unknownRolls: List<Long> = emptyList(),
    /** Rolls given more than the subject's full marks. */
    val overRolls: List<Long> = emptyList(),
    /** Not empty: nothing was filled, and this says why. */
    val problem: String = "",
)

/** Just enough of a student to fill a mark box against. */
data class RollEntry(val studentId: String, val rollNo: Long)

/** Marks are stored whole where they are whole: "78", not "78.0". */
private fun markText(v: Double?): String = when {
    v == null -> ""
    v == Math.floor(v) && !v.isInfinite() -> v.toLong().toString()
    else -> v.toString()
}

/**
 * Turns a parsed tally into the grid, for review before anything is saved.
 *
 * Filling is not saving. The screen shows the marks in the boxes, over-marks and
 * unknown rolls named, and the person presses Save as usual.
 */
fun applyMarkPaste(
    paste: MarkPaste,
    students: List<RollEntry>,
    fullMarks: Long?,
): MarkFill {
    if (paste.rows.isEmpty()) return MarkFill(problem = "There is nothing in the box.")
    val usable = paste.rows.filter { it.problem.isEmpty() }

    val entries = mutableMapOf<String, MarkEntryValue>()
    val over = mutableListOf<Long>()
    val unknown = mutableListOf<Long>()

    fun put(studentId: String, rollNo: Long, r: MarkRow) {
        entries[studentId] = MarkEntryValue(markText(r.marks), r.absent)
        if (fullMarks != null && r.marks != null && r.marks > fullMarks.toDouble()) over.add(rollNo)
    }

    if (paste.kind == PasteKind.MARKS_ONLY) {
        if (usable.size != paste.rows.size) {
            return MarkFill(
                problem = "Fix the lines below first: a column of marks with no rolls is " +
                    "matched by position, so one bad line moves every mark under it.",
            )
        }
        if (paste.rows.size != students.size) {
            val marks = "${paste.rows.size} mark" + if (paste.rows.size == 1) "" else "s"
            val kids = "${students.size} student" + if (students.size == 1) "" else "s"
            return MarkFill(
                problem = "That is $marks for $kids. A bare column is read in roll order, so " +
                    "it has to match the section exactly — or put the roll number in front of " +
                    "each mark.",
            )
        }
        students.forEachIndexed { i, s -> put(s.studentId, s.rollNo, paste.rows[i]) }
        return MarkFill(entries = entries, filled = entries.size, overRolls = over)
    }

    val byRoll = mutableMapOf<Long, String>()
    for (s in students) byRoll.putIfAbsent(s.rollNo, s.studentId)

    for (r in usable) {
        val studentId = r.rollNo?.let { byRoll[it] }
        if (studentId == null) {
            if (r.rollNo != null) unknown.add(r.rollNo)
            continue
        }
        put(studentId, r.rollNo, r)
    }
    return MarkFill(
        entries = entries,
        filled = entries.size,
        unknownRolls = unknown,
        overRolls = over,
        problem = if (entries.isEmpty()) "None of those rolls are in this section." else "",
    )
}
