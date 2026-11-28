package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The same cases exist in web/src/data/batch.test.ts. */
private const val NEWLINE = "\n"

class BatchTest {

    // -----------------------------------------------------------------------
    // students

    @Test
    fun `reads a tab-separated paste out of a spreadsheet`() {
        val rows = parseStudentRows("1\tAyesha Khatun\tKarim Mia\tFatema\t01711000000")
        assertEquals(1, rows.size)
        assertEquals(1L, rows[0].rollNo)
        assertEquals("Ayesha Khatun", rows[0].fullName)
        assertEquals("Karim Mia", rows[0].fatherName)
        assertEquals("Fatema", rows[0].motherName)
        assertEquals("01711000000", rows[0].mobileNo)
        assertEquals("", rows[0].problem)
    }

    @Test
    fun `reads a comma-separated list typed by hand`() {
        val row = parseStudentRows("3, Rakib Hasan, Jashim Uddin")[0]
        assertEquals(3L, row.rollNo)
        assertEquals("Rakib Hasan", row.fullName)
        assertEquals("Jashim Uddin", row.fatherName)
    }

    @Test
    fun `reads a bare column of names, with no rolls at all`() {
        val rows = parseStudentRows("Ayesha Khatun\nRakib Hasan\n")
        assertEquals(listOf("Ayesha Khatun", "Rakib Hasan"), rows.map { it.fullName })
        assertTrue(rows.all { it.rollNo == null && it.problem.isEmpty() })
    }

    @Test
    fun `reads a roll and a two-word name, not three columns`() {
        // A single space is not evidence of a column break. The name keeps its
        // spaces; only a leading number is taken off the front.
        val row = parseStudentRows("12 Ayesha Begum")[0]
        assertEquals(12L, row.rollNo)
        assertEquals("Ayesha Begum", row.fullName)
        assertEquals("", row.problem)
    }

    @Test
    fun `reads a privilege column and writes it the way the picker spells it`() {
        val rows = parseStudentRows("Name,Privilege\nAyesha,half\nRakib,FREE\nMita,")
        assertEquals(listOf("Half fee", "Donor family", "Regular"), rows.map { it.privilege })
        assertTrue(rows.all { it.problem.isEmpty() })
    }

    @Test
    fun `keeps a privilege it does not know, and warns rather than waiving a fee`() {
        val rows = parseStudentRows("Name,Concession\nAyesha,Orphan fund")
        assertEquals("Orphan fund", rows[0].privilege)
        assertEquals("", rows[0].problem)
        assertTrue(rows[0].note.contains("full rate"))
    }

    @Test
    fun `takes the column order from a header line when there is one`() {
        val rows = parseStudentRows("Name,Father,Mobile,Roll\nAyesha,Karim,01711,7")
        assertEquals(1, rows.size)
        assertEquals("Ayesha", rows[0].fullName)
        assertEquals("Karim", rows[0].fatherName)
        assertEquals("01711", rows[0].mobileNo)
        assertEquals(7L, rows[0].rollNo)
        assertEquals("", rows[0].problem)
    }

    @Test
    fun `does not mistake a line of data for a header line`() {
        val rows = parseStudentRows("1,Ayesha\n2,Rakib")
        assertEquals(listOf("Ayesha", "Rakib"), rows.map { it.fullName })
    }

    @Test
    fun `decides roll-first or name-first from the first line, not line by line`() {
        // A list that does not lead with a number is read as having no rolls in
        // it, so the second column is the father's name and not a roll.
        val names = parseStudentRows("Ayesha,Karim\nRakib,Jashim")
        assertEquals(listOf("Ayesha", "Rakib"), names.map { it.fullName })
        assertEquals(listOf("Karim", "Jashim"), names.map { it.fatherName })
        assertTrue(names.all { it.rollNo == null && it.problem.isEmpty() })
        assertEquals(listOf(1L, 2L), parseStudentRows("1,Ayesha\n2,Rakib").map { it.rollNo })
    }

    @Test
    fun `stops a row whose roll is not a number, and says what to do about it`() {
        val row = parseStudentRows("Roll,Name\nAyesha,Karim")[0]
        assertTrue(row.problem.contains("not a roll number"))
        assertTrue(row.problem.contains("header line"))
    }

    @Test
    fun `stops a row with no name`() {
        assertEquals("No name on this line.", parseStudentRows("5,,Karim")[0].problem)
    }

    @Test
    fun `keeps the line number so a problem can be pointed at`() {
        val rows = parseStudentRows("1,Ayesha\n\n\n2,\n3,Rakib")
        assertEquals(listOf(1, 4, 5), rows.map { it.line })
        assertTrue(rows[1].problem.isNotEmpty())
    }

    @Test
    fun `reads a date day-first and stores it the way the app does`() {
        assertEquals("2012-03-05", parseStudentRows("Roll,Name,DOB\n1,Ayesha,05/03/2012")[0].dob)
    }

    @Test
    fun `leaves out a date it cannot read rather than guessing one`() {
        val row = parseStudentRows("Roll,Name,DOB\n1,Ayesha,March 2012")[0]
        assertEquals("", row.dob)
        assertTrue(row.note.contains("could not be read"))
        assertEquals("", row.problem)   // the student is still worth saving
    }

    @Test
    fun `reads male and female however they are written`() {
        val rows = parseStudentRows("Roll,Name,Sex\n1,Ayesha,female\n2,Rakib,M\n3,Sumi,other")
        assertEquals(listOf("F", "M", ""), rows.map { it.gender })
        assertTrue(rows[2].note.contains("not male or female"))
    }

    @Test
    fun `says so when a paste has more columns than it can place`() {
        val row = parseStudentRows(
            "1\tAyesha\tKarim\tFatema\t01711\t2012-03-05\tB+\tScience",
        )[0]
        assertTrue(row.note.contains("only the first 6 columns"))
        assertEquals("", row.problem)
    }

    @Test
    fun `places every column a header names, however many`() {
        val row = parseStudentRows("Roll,Name,Blood,Group,Reg no\n1,Ayesha,B+,Science,2026-1234")[0]
        assertEquals("B+", row.bloodGroup)
        assertEquals("Science", row.groupName)
        assertEquals("2026-1234", row.regNo)
        assertEquals("", row.note)
    }

    @Test
    fun `ignores a column it has no home for, instead of giving up on the header`() {
        // The school's own APEX export, header and all. Class, Section,
        // Religion and StudentId have nowhere to go in this app; everything
        // else must still land in the right place.
        val rows = parseStudentRows(
            "Roll,Name,Gender,Reg,Group,Class,Section,Religion,Status,StudentId\n" +
                "1,Samia Putul,Female,123456,Science,Class 9,A,Islam,A,1",
        )
        assertEquals(1, rows.size)
        assertEquals(1L, rows[0].rollNo)
        assertEquals("Samia Putul", rows[0].fullName)
        assertEquals("", rows[0].fatherName)
        assertEquals("F", rows[0].gender)
        assertEquals("123456", rows[0].regNo)
        assertEquals("Science", rows[0].groupName)
        assertEquals("", rows[0].problem)
        assertEquals("", rows[0].note)
    }

    @Test
    fun `still refuses a line with a roll number in it as a header`() {
        // Two of these cells ARE column names, so the bare 1 is the only thing
        // keeping the line out of the header. Without that guard the real first
        // student would be swallowed and every name below would shift a column.
        val rows = parseStudentRows("1,Name,Group\n2,Ayesha,Science")
        assertEquals(2, rows.size)
        assertEquals("Name", rows[0].fullName)
        assertEquals("Group", rows[0].fatherName)
        assertEquals("Ayesha", rows[1].fullName)
        assertEquals("Science", rows[1].fatherName)
    }

    @Test
    fun `writes the group the way the picker spells it`() {
        val rows = parseStudentRows(
            "Roll,Name,Group\n1,Ayesha,commerce\n2,Bashir,SCI\n3,Chaity,Vocational",
        )
        assertEquals(
            listOf("Business Studies", "Science", "Vocational"),
            rows.map { it.groupName },
        )
    }

    @Test
    fun `ignores blank lines and trailing whitespace`() {
        assertEquals(emptyList<StudentRow>(), parseStudentRows("\n\n  \n"))
        val row = parseStudentRows("  1 , Ayesha  ")[0]
        assertEquals(1L, row.rollNo)
        assertEquals("Ayesha", row.fullName)
    }

    // -----------------------------------------------------------------------
    // settling the rolls

    @Test
    fun `gives a roll to every row that has none, continuing past the highest in use`() {
        val out = prepareStudentRows(parseStudentRows("Ayesha\nRakib"), listOf(1L, 2L, 7L))
        assertEquals(listOf(8L, 9L), out.map { it.rollNo })
        assertTrue(out[0].note.contains("given automatically"))
    }

    @Test
    fun `starts at 1 in an empty section`() {
        val out = prepareStudentRows(parseStudentRows("Ayesha\nRakib"), emptyList())
        assertEquals(listOf(1L, 2L), out.map { it.rollNo })
    }

    @Test
    fun `leaves a gap alone - a gap is usually a student who left`() {
        val out = prepareStudentRows(parseStudentRows("Ayesha"), listOf(1L, 2L, 4L))
        assertEquals(5L, out[0].rollNo)
    }

    @Test
    fun `stops the second row when a roll is typed twice in one list`() {
        val out = prepareStudentRows(parseStudentRows("5,Ayesha\n5,Rakib"), emptyList())
        assertEquals("", out[0].problem)
        assertTrue(out[1].problem.contains("more than one line"))
    }

    @Test
    fun `only flags a roll an existing student has - that student may have left`() {
        val out = prepareStudentRows(parseStudentRows("5,Ayesha"), listOf(5L))
        assertEquals("", out[0].problem)
        assertTrue(out[0].note.contains("already used"))
    }

    @Test
    fun `does not hand out a roll that the same paste has claimed`() {
        val out = prepareStudentRows(parseStudentRows("Roll,Name\n9,Ayesha\n,Rakib"), listOf(1L))
        assertEquals(listOf(9L, 10L), out.map { it.rollNo })
    }

    @Test
    fun `leaves a row that cannot be saved without a roll number`() {
        assertTrue(prepareStudentRows(parseStudentRows("5,"), emptyList())[0].problem.isNotEmpty())
    }

    @Test
    fun `a date on its own reads what a school writes`() {
        assertEquals("2012-03-05", normalDate("2012-3-5"))
        assertEquals("2012-03-05", normalDate("5-3-2012"))
        assertEquals("2012-03-05", normalDate("5.3.2012"))
        assertEquals("", normalDate(""))
        assertEquals("", normalDate("5/13/2012"))   // no month 13, and not read as May
        assertEquals("", normalDate("05/03/12"))    // a two-digit year is a guess
    }

    // -----------------------------------------------------------------------
    // marks

    private val section = listOf(
        RollEntry("76", 1L), RollEntry("77", 2L), RollEntry("78", 3L),
    )

    @Test
    fun `reads a roll and a mark on each line`() {
        val paste = parseMarkPaste("1 78\n2=65\n3,90")
        assertEquals(PasteKind.ROLLS, paste.kind)
        val fill = applyMarkPaste(paste, section, 100L)
        assertEquals(3, fill.filled)
        assertEquals("78", fill.entries["76"]!!.marks)
        assertEquals("90", fill.entries["78"]!!.marks)
        assertEquals("", fill.problem)
    }

    @Test
    fun `reads the roll, the name and the mark when three columns were copied`() {
        val fill = applyMarkPaste(parseMarkPaste("1\tAyesha Khatun\t78"), section, 100L)
        assertEquals(MarkEntryValue("78", false), fill.entries["76"])
    }

    @Test
    fun `marks a child absent however the tally says so`() {
        val fill = applyMarkPaste(parseMarkPaste("1 A\n2 absent\n3 abs"), section, 100L)
        assertTrue(fill.entries.values.all { it.absent && it.marks.isEmpty() })
    }

    @Test
    fun `clears a mark where the tally has a dash`() {
        val fill = applyMarkPaste(parseMarkPaste("1 -"), section, 100L)
        assertEquals(MarkEntryValue("", false), fill.entries["76"])
    }

    @Test
    fun `fills a bare column of marks in roll order`() {
        val paste = parseMarkPaste("78\n65\n90")
        assertEquals(PasteKind.MARKS_ONLY, paste.kind)
        val fill = applyMarkPaste(paste, section, 100L)
        assertEquals("78", fill.entries["76"]!!.marks)
        assertEquals("65", fill.entries["77"]!!.marks)
        assertEquals("90", fill.entries["78"]!!.marks)
    }

    @Test
    fun `REFUSES a bare column that does not match the section exactly`() {
        // One line short and every mark below it belongs to the wrong child.
        val fill = applyMarkPaste(parseMarkPaste("78\n65"), section, 100L)
        assertEquals(0, fill.filled)
        assertTrue(fill.entries.isEmpty())
        assertTrue(fill.problem.contains("2 marks for 3 students"))
    }

    @Test
    fun `refuses a bare column with a bad line in it rather than shifting the rest`() {
        val fill = applyMarkPaste(parseMarkPaste("78\nninety\n90"), section, 100L)
        assertEquals(0, fill.filled)
        assertTrue(fill.problem.contains("moves every mark under it"))
    }

    @Test
    fun `names a roll this section does not have, and fills the rest`() {
        val fill = applyMarkPaste(parseMarkPaste("1 78\n9 65"), section, 100L)
        assertEquals(1, fill.filled)
        assertEquals(listOf(9L), fill.unknownRolls)
    }

    @Test
    fun `names a mark over the subject full marks, and still fills it in for correction`() {
        val fill = applyMarkPaste(parseMarkPaste("1 178"), section, 100L)
        assertEquals(listOf(1L), fill.overRolls)
        assertEquals("178", fill.entries["76"]!!.marks)
    }

    @Test
    fun `skips the heading line a spreadsheet brings with it`() {
        val paste = parseMarkPaste("Roll\tName\tMarks\n1\tAyesha\t78\n2\tRakib\tA")
        assertEquals(2, paste.rows.size)
        assertTrue(paste.rows.all { it.problem.isEmpty() })
        assertEquals(2, paste.rows[0].line)   // still pointing at the right line
        val fill = applyMarkPaste(paste, section, 100L)
        assertEquals("78", fill.entries["76"]!!.marks)
        assertTrue(fill.entries["77"]!!.absent)
    }

    @Test
    fun `does not mistake a single line for a heading`() {
        assertTrue(parseMarkPaste("Marks").rows[0].problem.contains("not a mark"))
    }

    @Test
    fun `flags a line with no roll when the other lines have one`() {
        val paste = parseMarkPaste("1 78\n65")
        assertEquals(PasteKind.ROLLS, paste.kind)
        assertTrue(paste.rows[1].problem.contains("No roll number"))
    }

    @Test
    fun `flags what is not a mark at all`() {
        assertTrue(parseMarkPaste("1 ninety").rows[0].problem.contains("not a mark"))
        assertTrue(
            parseMarkPaste("Ayesha 78").rows[0].problem.contains("does not start with a roll"),
        )
    }

    @Test
    fun `says so when the box is empty, or holds nothing this section can use`() {
        assertTrue(
            applyMarkPaste(parseMarkPaste(""), section, 100L).problem.contains("nothing in the box"),
        )
        assertTrue(
            applyMarkPaste(parseMarkPaste("9 70"), section, 100L)
                .problem.contains("None of those rolls"),
        )
    }

    @Test
    fun `reads a decimal mark`() {
        val fill = applyMarkPaste(parseMarkPaste("1 77.5"), section, 100L)
        assertEquals("77.5", fill.entries["76"]!!.marks)
    }

    // ------------------------- a spreadsheet with one column per part
    // The SAME cases exist in web/src/data/batch.test.ts.

    private fun grid(vararg rows: List<String>): Grid = rows.toList()

    @Test
    fun `reads the columns of the paper form`() {
        val got = parseMarkParts(
            grid(listOf("Roll", "CQ", "MCQ", "Total"),
                 listOf("3", "51", "18", "69"),
                 listOf("4", "56", "18", "74")),
            listOf("CQ", "MCQ"),
        )
        assertEquals("", got.problem)
        assertEquals(2, got.rows.size)
        assertEquals(3L, got.rows[0].rollNo)
        assertEquals(mapOf("CQ" to 51.0, "MCQ" to 18.0), got.rows[0].parts)
        assertEquals(mapOf("CQ" to 56.0, "MCQ" to 18.0), got.rows[1].parts)
    }

    @Test
    fun `ignores a Total column, which is the teachers checksum and not a part`() {
        val got = parseMarkParts(
            grid(listOf("Roll", "CQ", "MCQ", "Total"), listOf("3", "51", "18", "69")),
            listOf("CQ", "MCQ"),
        )
        assertEquals(listOf("CQ", "MCQ"), got.rows[0].parts.keys.toList())
    }

    @Test
    fun `matches a heading however it was written`() {
        val got = parseMarkParts(
            grid(listOf("roll no.", "C.Q. (70)", "mcq"), listOf("3", "51", "18")),
            listOf("CQ", "MCQ"),
        )
        assertEquals(3L, got.rows[0].rollNo)
        assertEquals(mapOf("CQ" to 51.0, "MCQ" to 18.0), got.rows[0].parts)
    }

    @Test
    fun `finds the heading row even when the sheet has a title above it`() {
        val got = parseMarkParts(
            grid(listOf("Matkhola ML High School"), listOf(""),
                 listOf("Class Ten", "History"),
                 listOf("Roll", "CQ", "MCQ"), listOf("3", "51", "18")),
            listOf("CQ", "MCQ"),
        )
        assertEquals(1, got.rows.size)
        assertEquals(3L, got.rows[0].rollNo)
    }

    @Test
    fun `leaves an empty box empty, because a zero is a mark and a failing one`() {
        val got = parseMarkParts(
            grid(listOf("Roll", "CQ", "MCQ"), listOf("3", "51", "")),
            listOf("CQ", "MCQ"),
        )
        assertEquals(mapOf("CQ" to 51.0), got.rows[0].parts)
    }

    @Test
    fun `drops a row with nothing on it rather than reporting it`() {
        val got = parseMarkParts(
            grid(listOf("Roll", "CQ", "MCQ"), listOf("3", "51", "18"),
                 listOf(""), listOf("", "", "")),
            listOf("CQ", "MCQ"),
        )
        assertEquals(1, got.rows.size)
    }

    @Test
    fun `keeps a row whose roll cannot be read, and says so`() {
        val got = parseMarkParts(
            grid(listOf("Roll", "CQ", "MCQ"), listOf("three", "51", "18")),
            listOf("CQ", "MCQ"),
        )
        assertNull(got.rows[0].rollNo)
        assertTrue(got.rows[0].problem.contains("not a roll number"))
    }

    @Test
    fun `keeps a row whose mark cannot be read, and says which column`() {
        val got = parseMarkParts(
            grid(listOf("Roll", "CQ", "MCQ"), listOf("3", "fifty", "18")),
            listOf("CQ", "MCQ"),
        )
        assertTrue(got.rows[0].problem.contains("CQ"))
        assertEquals(18.0, got.rows[0].parts["MCQ"])
    }

    @Test
    fun `reads an absent mark`() {
        val got = parseMarkParts(
            grid(listOf("Roll", "CQ", "MCQ"), listOf("3", "A", "A")),
            listOf("CQ", "MCQ"),
        )
        assertTrue(got.rows[0].absent)
    }

    @Test
    fun `says plainly when there is no heading row at all`() {
        val got = parseMarkParts(
            grid(listOf("3", "51", "18"), listOf("4", "56", "18")),
            listOf("CQ", "MCQ"),
        )
        assertEquals(0, got.rows.size)
        assertTrue(got.problem.contains("heading row"))
    }

    @Test
    fun `says plainly when the parts it needs are not among the columns`() {
        val got = parseMarkParts(
            grid(listOf("Roll", "Marks"), listOf("3", "69")), listOf("CQ", "MCQ"),
        )
        assertTrue(got.problem.contains("CQ or MCQ"))
    }

    @Test
    fun `copes with a part column the sheet simply left out`() {
        // A subject marked CQ + MCQ + Prac, on a form that only has the first two.
        val got = parseMarkParts(
            grid(listOf("Roll", "CQ", "MCQ"), listOf("3", "51", "18")),
            listOf("CQ", "MCQ", "Prac"),
        )
        assertEquals(mapOf("CQ" to 1, "MCQ" to 2), got.columns)
        assertEquals(mapOf("CQ" to 51.0, "MCQ" to 18.0), got.rows[0].parts)
    }

    @Test
    fun `points at the spreadsheet row a problem is on`() {
        val got = parseMarkParts(
            grid(listOf("Roll", "CQ", "MCQ"), listOf("3", "51", "18"), listOf("x", "1", "2")),
            listOf("CQ", "MCQ"),
        )
        assertEquals(3, got.rows[1].line)
    }

    // ------------- a spreadsheet for a paper marked out of one number
    // The SAME cases exist in web/src/data/batch.test.ts.

    private fun oneMark(grid: Grid) = parseMarkParts(grid, MARK_HEADINGS)

    @Test
    fun `takes whichever word the sheet used for the mark`() {
        for (heading in MARK_HEADINGS) {
            val got = oneMark(grid(listOf("Roll", heading), listOf("3", "78")))
            assertEquals("", got.problem)
            assertEquals(78.0, singleMark(got.rows[0]))
        }
    }

    @Test
    fun `prefers Marks when a sheet carries both Marks and Total`() {
        // They mean the same number twice; the first is the one that was typed.
        val got = oneMark(grid(listOf("Roll", "Marks", "Total"), listOf("3", "78", "78")))
        assertEquals(78.0, singleMark(got.rows[0]))
    }

    @Test
    fun `leaves an unmarked student null rather than zero`() {
        assertEquals(0, oneMark(grid(listOf("Roll", "Marks"), listOf("3", ""))).rows.size)
    }

    @Test
    fun `reads an absent mark on a single-mark paper`() {
        val got = oneMark(grid(listOf("Roll", "Marks"), listOf("3", "A")))
        assertTrue(got.rows[0].absent)
        assertNull(singleMark(got.rows[0]))
    }

    @Test
    fun `says plainly when no column names the mark at all`() {
        val got = oneMark(grid(listOf("Roll", "Name"), listOf("3", "Ayesha")))
        assertTrue(got.problem.contains("heading row"))
    }

    @Test
    fun `is null for a row with nothing in any mark column`() {
        assertNull(singleMark(PartsRow(line = 2, rollNo = 3L)))
    }
}
