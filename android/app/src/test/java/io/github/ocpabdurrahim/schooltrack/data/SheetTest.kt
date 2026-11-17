package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The same cases exist in web/src/data/sheet.test.ts, and both read THE SAME
 * students.xlsx — rebuilt by tools/make-xlsx-fixture.py, which says what is
 * awkward about it on purpose.
 */
class SheetTest {

    private fun fixture(): ByteArray =
        javaClass.classLoader!!.getResourceAsStream("students.xlsx")!!.use { it.readBytes() }

    private fun grid(): Grid = readXlsx(fixture())

    // -----------------------------------------------------------------------
    // CSV

    @Test
    fun `keeps a comma that is inside quotes`() {
        // The naive split is what makes "Mia, Karim" into two students.
        assertEquals(listOf(listOf("1", "Mia, Karim", "01711")), parseCsv("1,\"Mia, Karim\",01711"))
    }

    @Test
    fun `reads a doubled quote as one quote, and a newline inside quotes`() {
        assertEquals(
            listOf(listOf("1", "She said \"hi\"", "2")),
            parseCsv("1,\"She said \"\"hi\"\"\",2"),
        )
        assertEquals(listOf(listOf("1", "two\nlines", "3")), parseCsv("1,\"two\nlines\",3"))
    }

    @Test
    fun `reads tab and semicolon files, which Excel also writes`() {
        assertEquals(listOf(listOf("1", "Ayesha", "Karim")), parseCsv("1\tAyesha\tKarim"))
        assertEquals(listOf(listOf("1", "Ayesha", "Karim")), parseCsv("1;Ayesha;Karim"))
    }

    @Test
    fun `drops the byte-order mark Excel puts at the front`() {
        assertEquals("Roll", parseCsv("﻿Roll,Name")[0][0])
    }

    @Test
    fun `handles CRLF line endings and a ragged last line`() {
        assertEquals(
            listOf(listOf("a", "b"), listOf("c"), listOf("")),
            parseCsv("a,b\r\nc\r\n"),
        )
    }

    // -----------------------------------------------------------------------
    // a grid as text

    @Test
    fun `joins with tabs, which is what a paste out of Excel looks like`() {
        assertEquals(
            "1\tAyesha\n2\tRakib",
            gridToText(listOf(listOf("1", "Ayesha"), listOf("2", "Rakib"))),
        )
    }

    @Test
    fun `flattens a tab or newline inside a cell, so one cell stays one cell`() {
        assertEquals("a b\tc d", gridToText(listOf(listOf("a\tb", "c\nd"))))
    }

    @Test
    fun `drops the empty cells and rows an export leaves at the edges`() {
        assertEquals(
            "1\tAyesha",
            gridToText(listOf(listOf("1", "Ayesha", "", ""), listOf("", ""), listOf())),
        )
    }

    // -----------------------------------------------------------------------
    // dates

    @Test
    fun `reads the serial the way Excel means it`() {
        assertEquals("2005-01-01", excelDate(38353.0))
        assertEquals("2010-01-01", excelDate(40179.0))
        assertEquals("2023-03-15", excelDate(45000.0))
    }

    @Test
    fun `refuses the days around Excel's imaginary 29 February 1900`() {
        // Day 60 does not exist. No school date is anywhere near it, so it is
        // left as the number it is rather than quietly shifted by one.
        assertEquals("", excelDate(60.0))
        assertEquals("", excelDate(0.0))
        assertEquals("", excelDate(Double.NaN))
    }

    // -----------------------------------------------------------------------
    // the .xlsx

    @Test
    fun `reads the first sheet of the workbook, not the second`() {
        assertFalse(grid().toString().contains("DO NOT READ"))
    }

    @Test
    fun `reads shared strings, inline strings and formula text alike`() {
        val g = grid()
        assertEquals(listOf("Roll", "Name", "Father", "Mobile", "DOB"), g[0])
        assertEquals("Ayesha Khatun", g[1][1])     // shared
        assertEquals("Jashim Uddin", g[2][2])      // inline
        assertEquals("01711000000", g[1][3])       // a formula's cached text, not a number
    }

    @Test
    fun `turns a formatted date into a date, not into 38353`() {
        val g = grid()
        assertEquals("2005-01-01", g[1][4])        // built-in format 14
        assertEquals("2010-01-01", g[2][4])        // a custom dd/mm/yyyy
    }

    @Test
    fun `leaves a plain number alone, however much it looks like a date`() {
        assertEquals("12345", grid()[3][4])
    }

    @Test
    fun `keeps a row lined up when a cell is missing`() {
        // Row 3 has no B cell: the father's name must stay in column C.
        val g = grid()
        assertEquals("", g[2][1])
        assertEquals("Jashim Uddin", g[2][2])
    }

    @Test
    fun `keeps an empty row in place, so later rows do not move up`() {
        val g = grid()
        assertEquals(emptyList<String>(), g[4])    // sheet row 5 is empty
        assertEquals("Sumi & Co <3", g[5][1])      // and row 6 is still row 6
    }

    @Test
    fun `reads an entry that was stored rather than deflated`() {
        // sharedStrings.xml is STORED in the fixture; without it every shared
        // string would come back empty.
        assertEquals("Ayesha Khatun", grid()[1][1])
    }

    @Test
    fun `says plainly what is not a spreadsheet`() {
        val problem = runCatching { readXlsx("Roll,Name\n1,Ayesha".toByteArray()) }.exceptionOrNull()
        assertTrue(problem?.message.orEmpty().contains("not even a zip"))
    }

    @Test
    fun `picks the reader by content as well as by name`() {
        // A file manager can hand over a name with no extension at all.
        assertTrue(readSheetFile("export", fixture()).startsWith("Roll\tName"))
        assertEquals("1\tAyesha", readSheetFile("list.csv", "1,Ayesha".toByteArray()))
        val old = runCatching { readSheetFile("roll.xls", fixture()) }.exceptionOrNull()
        assertTrue(old?.message.orEmpty().contains("old .xls format"))
    }

    // -----------------------------------------------------------------------
    // and through the batch reader

    @Test
    fun `a spreadsheet becomes the same rows a paste would`() {
        val rows = prepareStudentRows(parseStudentRows(gridToText(grid())), emptyList())

        // The heading row is recognised, so the columns are named and not guessed.
        assertEquals(
            listOf("Ayesha Khatun", "", "Rakib Hasan", "Sumi & Co <3"),
            rows.map { it.fullName },
        )
        assertEquals(1L, rows[0].rollNo)
        assertEquals("Karim Mia", rows[0].fatherName)
        assertEquals("01711000000", rows[0].mobileNo)
        assertEquals("2005-01-01", rows[0].dob)
        assertEquals("", rows[0].problem)
        // sheet row 3 has no name, and says so rather than being dropped
        assertTrue(rows[1].problem.contains("No name"))
        // the last row has only a name, so it is given the next roll
        assertEquals(4L, rows[3].rollNo)
        assertEquals("", rows[3].problem)
    }
}
