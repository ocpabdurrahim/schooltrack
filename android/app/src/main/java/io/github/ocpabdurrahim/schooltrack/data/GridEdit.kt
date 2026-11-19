package io.github.ocpabdurrahim.schooltrack.data

/**
 * The rules behind a typeable grid — the part that is not Compose.
 *
 * A form that is a grid is the one shape an office already knows, because it
 * is the shape of the register and of the spreadsheet the list arrived in.
 * The behaviour people expect from it is not "a table of inputs" but the few
 * things a spreadsheet does: paste a block and it lands where the cursor is,
 * run out of rows and more appear, blank rows at the bottom count for nothing.
 *
 * All of it is here rather than in the screen so it can be tested without a
 * device, and so the two clients share one answer about what pasting a block
 * means.
 *
 * This file has a twin: web/src/data/gridedit.ts.
 */

typealias Cells = List<List<String>>

/** A grid of empty cells, which is what an empty form is. */
fun blankGrid(rows: Int, cols: Int): Cells = List(rows) { List(cols) { "" } }

/** One cell changed, without disturbing the rest. */
fun setCell(grid: Cells, row: Int, col: Int, value: String): Cells {
    if (row < 0 || col < 0 || row >= grid.size) return grid
    return grid.mapIndexed { i, r ->
        if (i == row) r.mapIndexed { j, c -> if (j == col) value else c } else r
    }
}

/**
 * What a clipboard holds, as rows and columns.
 *
 * Tabs between cells and newlines between rows is what every spreadsheet puts
 * on the clipboard, so that is what is read. A single cell copied from
 * anywhere else is simply one row of one column, which is the ordinary typing
 * case and must not be mangled.
 */
fun clipboardCells(text: String): Cells {
    val body = text.replace("\r\n", "\n").trimEnd('\n')
    if (body.isEmpty()) return emptyList()
    return body.split("\n").map { it.split("\t") }
}

/**
 * A pasted block, landing at the cursor.
 *
 * Grows the grid downwards to fit, because a list of forty pasted into a form
 * showing eight rows should not lose thirty-two of them. Does NOT grow
 * sideways: the columns are the form's, and a sheet with a stray extra column
 * should not quietly invent a field nobody can see.
 */
fun pasteInto(grid: Cells, atRow: Int, atCol: Int, text: String): Cells {
    val block = clipboardCells(text)
    if (block.isEmpty()) return grid

    val cols = grid.firstOrNull()?.size ?: block[0].size
    val needed = atRow + block.size
    val out = grid.map { it.toMutableList() }.toMutableList()
    while (out.size < needed) out.add(MutableList(cols) { "" })

    block.forEachIndexed { i, line ->
        line.forEachIndexed { j, value ->
            val col = atCol + j
            if (col < cols) out[atRow + i][col] = value
        }
    }
    return out.map { it.toList() }
}

/** A heading, reduced to its letters, so "Roll No" and "rollno" are one column. */
private fun letters(s: String) = s.trim().lowercase().filter { it in 'a'..'z' }

/**
 * Rows from a file or a clipboard, lined up under a form's columns.
 *
 * A heading row is honoured where it names a column the form has, so a sheet
 * whose columns are in another order still lands in the right boxes. Without
 * one the columns are taken in the form's own order.
 *
 * TWO headings have to match before the first row is believed to be headings
 * at all. One is not enough: a list that happens to start with a student
 * called Group, or a stray cell reading "Sex", would otherwise have a real
 * child's row eaten as a title.
 *
 * `key` is the vocabulary. By default a heading is only its letters, so
 * "Roll No" and "rollno" are one column. A caller with a richer table of
 * spellings — the students form hands in the list parser's own — passes it,
 * and then the grid and whatever reads the grid afterwards cannot disagree
 * about what a heading meant.
 */
fun underColumns(
    lines: Cells,
    headings: List<String>,
    key: (String) -> String = ::letters,
): Cells {
    if (lines.isEmpty()) return emptyList()
    val head = lines[0].map(key)
    val known = headings.map(key)
    val named = head.count { it.isNotEmpty() && known.contains(it) } >= 2

    val body = if (named) lines.drop(1) else lines
    return body.map { line ->
        val row = MutableList(headings.size) { "" }
        line.forEachIndexed { j, value ->
            val col = if (named) known.indexOf(head.getOrElse(j) { "" }) else j
            if (col >= 0 && col < row.size) row[col] = value
        }
        row.toList()
    }
}

/** True when nothing has been typed in this row. */
fun rowIsBlank(row: List<String>): Boolean = row.all { it.isBlank() }

/**
 * The rows that are actually filled in.
 *
 * Blank rows in the middle are KEPT: somebody who left a gap while typing
 * meant to come back to it, and closing the gap under them would move every
 * row they were looking at. Only the empty tail is dropped.
 */
fun filledRows(grid: Cells): Cells {
    var end = grid.size
    while (end > 0 && rowIsBlank(grid[end - 1])) end -= 1
    return grid.take(end)
}

/**
 * Enough spare rows to keep typing into, and no more.
 *
 * A form that runs out of rows at the bottom stops the person mid-list; one
 * with two hundred spare is a wall of empty boxes. So it keeps a few free
 * below whatever has been filled in.
 */
fun withSpareRows(grid: Cells, spare: Int = 3, least: Int = 8): Cells {
    val cols = grid.firstOrNull()?.size ?: 0
    val filled = filledRows(grid).size
    val want = maxOf(least, filled + spare)
    if (grid.size >= want) return grid
    val out = grid.toMutableList()
    while (out.size < want) out.add(List(cols) { "" })
    return out.toList()
}

/** One row taken out, by the row's own position. */
fun removeRow(grid: Cells, row: Int): Cells {
    if (row < 0 || row >= grid.size) return grid
    return grid.filterIndexed { i, _ -> i != row }
}

/**
 * The grid as the text the existing list parser already reads.
 *
 * The grid is a nicer way to type; it is not a second way to interpret what
 * was typed. Everything about names, dates, duplicate rolls and the rest
 * stays in parseStudentRows, which is tested and shared with the paste box
 * this replaced.
 */
fun gridToList(headings: List<String>, grid: Cells): String {
    val rows = filledRows(grid)
    if (rows.isEmpty()) return ""
    return (listOf(headings.joinToString("\t")) + rows.map { it.joinToString("\t") })
        .joinToString("\n")
}
