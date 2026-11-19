package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/** The SAME cases exist in web/src/data/gridedit.test.ts. */
private val FORM = listOf("roll", "name", "father", "mobile")

class GridEditTest {

    // -----------------------------------------------------------------------
    // an empty form

    @Test
    fun `is a grid of empty cells`() {
        assertEquals(listOf(listOf("", "", ""), listOf("", "", "")), blankGrid(2, 3))
    }

    @Test
    fun `knows a row nobody has typed in`() {
        assertTrue(rowIsBlank(listOf("", "  ", "")))
        assertFalse(rowIsBlank(listOf("", "Ayesha", "")))
    }

    // -----------------------------------------------------------------------
    // changing one cell

    @Test
    fun `leaves every other cell alone`() {
        val before = blankGrid(2, 2)
        val after = setCell(before, 0, 1, "Ayesha")
        assertEquals(listOf(listOf("", "Ayesha"), listOf("", "")), after)
        // and does not write through to the grid it was given
        assertEquals(listOf(listOf("", ""), listOf("", "")), before)
    }

    @Test
    fun `ignores a cell that is not there`() {
        val g = blankGrid(1, 1)
        assertSame(g, setCell(g, 5, 0, "x"))
    }

    // -----------------------------------------------------------------------
    // what the clipboard holds

    @Test
    fun `reads tabs as columns and newlines as rows`() {
        assertEquals(
            listOf(listOf("1", "Ayesha"), listOf("2", "Bashir")),
            clipboardCells("1\tAyesha\n2\tBashir"),
        )
    }

    @Test
    fun `reads a single typed value as one cell, not as a mangled row`() {
        assertEquals(listOf(listOf("Ayesha")), clipboardCells("Ayesha"))
    }

    @Test
    fun `ignores the trailing newline every spreadsheet adds`() {
        assertEquals(listOf(listOf("1", "Ayesha")), clipboardCells("1\tAyesha\n"))
        assertEquals(emptyList<List<String>>(), clipboardCells(""))
    }

    @Test
    fun `copes with Windows line endings`() {
        assertEquals(
            listOf(listOf("1", "A"), listOf("2", "B")),
            clipboardCells("1\tA\r\n2\tB"),
        )
    }

    // -----------------------------------------------------------------------
    // pasting a block

    @Test
    fun `lands where the cursor is`() {
        val got = pasteInto(blankGrid(3, 3), 1, 1, "x\ty\nz\tw")
        assertEquals(
            listOf(
                listOf("", "", ""),
                listOf("", "x", "y"),
                listOf("", "z", "w"),
            ),
            got,
        )
    }

    @Test
    fun `grows downwards so a long list is not cut off`() {
        // Forty names pasted into a form showing eight rows must not lose
        // thirty-two of them.
        val got = pasteInto(
            blankGrid(2, 1), 0, 0,
            (0 until 40).joinToString("\n") { "n$it" },
        )
        assertEquals(40, got.size)
        assertEquals(listOf("n39"), got[39])
    }

    @Test
    fun `does NOT grow sideways, so a stray column invents no field`() {
        val got = pasteInto(blankGrid(1, 2), 0, 0, "a\tb\tc")
        assertEquals(listOf("a", "b"), got[0])
    }

    @Test
    fun `drops what would fall off the right-hand edge`() {
        val got = pasteInto(blankGrid(1, 3), 0, 2, "a\tb\tc")
        assertEquals(listOf("", "", "a"), got[0])
    }

    @Test
    fun `leaves the grid alone when the clipboard is empty`() {
        val g = blankGrid(2, 2)
        assertSame(g, pasteInto(g, 0, 0, ""))
    }

    // -----------------------------------------------------------------------
    // rows lined up under a form

    @Test
    fun `takes the columns in the form order when there is no heading row`() {
        assertEquals(
            listOf(listOf("1", "Ayesha", "Karim", "")),
            underColumns(listOf(listOf("1", "Ayesha", "Karim")), FORM),
        )
    }

    @Test
    fun `honours a heading row whose columns are in another order`() {
        assertEquals(
            listOf(listOf("1", "Ayesha", "", "")),
            underColumns(listOf(listOf("Name", "Roll"), listOf("Ayesha", "1")), FORM),
        )
    }

    @Test
    fun `matches a heading whatever its spacing and case`() {
        assertEquals(
            listOf(listOf("1", "Ayesha", "", "")),
            underColumns(listOf(listOf("  NAME ", "Roll"), listOf("Ayesha", "1")), FORM),
        )
    }

    @Test
    fun `can be given a vocabulary, so Father's Name is the father column`() {
        // The students form hands in the list parser's own heading table.
        // Without that, a sheet headed "Father's Name" would not be recognised
        // as a heading row at all and the headings would import as a student.
        val key = { s: String ->
            val k = s.trim().lowercase().filter { it in 'a'..'z' }
            mapOf("fathersname" to "father", "fathername" to "father")[k] ?: k
        }
        assertEquals(
            listOf(listOf("7", "", "Karim", "")),
            underColumns(listOf(listOf("Father's Name", "Roll"), listOf("Karim", "7")), FORM, key),
        )
    }

    @Test
    fun `does NOT eat a student row that happens to match one heading`() {
        // A child actually called Roll is unlikely; a one-cell list under a
        // stray word is not. One match is a coincidence, two is a heading row.
        assertEquals(
            listOf(listOf("Roll", "Ayesha", "", ""), listOf("2", "Bashir", "", "")),
            underColumns(listOf(listOf("Roll", "Ayesha"), listOf("2", "Bashir")), FORM),
        )
    }

    @Test
    fun `ignores a column the form has not got`() {
        assertEquals(
            listOf(listOf("1", "Ayesha", "", "")),
            underColumns(
                listOf(listOf("Roll", "Nickname", "Name"), listOf("1", "Ayu", "Ayesha")),
                FORM,
            ),
        )
    }

    @Test
    fun `drops what falls off the right-hand edge of the form`() {
        assertEquals(
            listOf(listOf("1", "A", "B", "C")),
            underColumns(listOf(listOf("1", "A", "B", "C", "D", "E")), FORM),
        )
    }

    @Test
    fun `gives nothing for nothing`() {
        assertEquals(emptyList<List<String>>(), underColumns(emptyList(), FORM))
    }

    // -----------------------------------------------------------------------
    // which rows count

    @Test
    fun `drops the empty tail`() {
        assertEquals(
            listOf(listOf("a")),
            filledRows(listOf(listOf("a"), listOf(""), listOf(""))),
        )
    }

    @Test
    fun `KEEPS a gap in the middle, so nothing shifts under the typist`() {
        // Somebody who left a row blank meant to come back to it. Closing the
        // gap would move every row they were looking at.
        assertEquals(
            listOf(listOf("a"), listOf(""), listOf("b")),
            filledRows(listOf(listOf("a"), listOf(""), listOf("b"), listOf(""))),
        )
    }

    @Test
    fun `is empty when nothing has been typed`() {
        assertEquals(emptyList<List<String>>(), filledRows(blankGrid(5, 2)))
    }

    // -----------------------------------------------------------------------
    // spare rows to keep typing into

    @Test
    fun `keeps a few free below what is filled in`() {
        val grid = listOf(listOf("a"), listOf("b"), listOf(""), listOf(""))
        assertEquals(5, withSpareRows(grid, 3, 2).size)
    }

    @Test
    fun `never shrinks a grid somebody is working in`() {
        val grid = blankGrid(12, 1)
        assertSame(grid, withSpareRows(grid, 3, 8))
    }

    @Test
    fun `starts with a usable number of rows, not one`() {
        assertEquals(8, withSpareRows(blankGrid(1, 1), 3, 8).size)
    }

    // -----------------------------------------------------------------------
    // taking a row out

    @Test
    fun `removes the one asked for`() {
        assertEquals(
            listOf(listOf("a"), listOf("c")),
            removeRow(listOf(listOf("a"), listOf("b"), listOf("c")), 1),
        )
    }

    @Test
    fun `ignores a row that is not there`() {
        val g = listOf(listOf("a"))
        assertSame(g, removeRow(g, 7))
    }

    // -----------------------------------------------------------------------
    // handing the grid to the list reader

    @Test
    fun `writes a heading line and tab-separated rows`() {
        assertEquals(
            "roll\tname\n1\tAyesha\n2\tBashir",
            gridToList(listOf("roll", "name"), listOf(listOf("1", "Ayesha"), listOf("2", "Bashir"))),
        )
    }

    @Test
    fun `leaves out the empty tail`() {
        assertEquals(
            "roll\tname\n1\tAyesha",
            gridToList(listOf("roll", "name"), listOf(listOf("1", "Ayesha"), listOf("", ""))),
        )
    }

    @Test
    fun `gives nothing at all for an untouched form`() {
        assertEquals("", gridToList(listOf("roll", "name"), blankGrid(8, 2)))
    }
}
