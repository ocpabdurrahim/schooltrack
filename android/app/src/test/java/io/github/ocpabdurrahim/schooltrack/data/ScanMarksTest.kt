package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The SAME cases exist in web/src/data/scanmarks.test.ts.
 *
 * The sheet below is the real one: the photographed Half Yearly History form
 * for class Ten, read row by row, including roll 23 where the teacher wrote
 * over both the CQ and the total and the two no longer agree.
 */
class ScanMarksTest {

    private val cqMcq = listOf(
        Component("CQ", 70.0, 23.0),
        Component("MCQ", 30.0, 10.0),
    )
    private val withPrac = listOf(
        Component("CQ", 50.0, 17.0),
        Component("MCQ", 25.0, 8.0),
        Component("PRACTICAL", 25.0, 8.0),
    )

    private val history = Chosen(
        sectionName = "Class 10 - A",
        className = "Class 10",
        subjectName = "HISTORY OF BANGLADESH AND WORLD CIVILIZATION",
        examName = "HALF YEARLY EXAM 2026",
        fullMarks = 100.0,
        components = cqMcq,
    )

    private val header = ScanHeader("Half Yearly", "2026", "Ten", "History")

    /** Roll, CQ, MCQ, the total as written. Prac is blank on every row. */
    private val sheet = listOf(
        intArrayOf(3, 51, 18, 69),
        intArrayOf(4, 56, 18, 74),
        intArrayOf(5, 40, 15, 55),
        intArrayOf(12, 34, 12, 46),
        intArrayOf(13, 34, 15, 49),
        intArrayOf(14, 32, 15, 47),
        intArrayOf(18, 46, 14, 60),
        intArrayOf(23, 28, 15, 53),   // written over: 28 + 15 is 43, not 53
        intArrayOf(27, 28, 10, 38),
        intArrayOf(30, 27, 13, 40),
        intArrayOf(35, 23, 12, 35),
        intArrayOf(36, 23, 9, 32),
        intArrayOf(37, 27, 12, 39),
        intArrayOf(42, 26, 11, 37),
        intArrayOf(43, 20, 13, 33),
        intArrayOf(47, 13, 12, 25),
        intArrayOf(54, 23, 11, 34),
        intArrayOf(57, 25, 6, 31),
        intArrayOf(59, 2, 11, 13),
        intArrayOf(61, 2, 11, 13),
        intArrayOf(65, 42, 15, 57),
    )

    private fun read() = ScanRead(
        header,
        sheet.map { (r) ->
            ScanRow(r[0], linkedMapOf("CQ" to r[1], "MCQ" to r[2], "Prac" to null, "Total" to r[3]))
        },
    )

    private operator fun IntArray.component1() = this

    /** Rolls 1 to 99, so every roll on the sheet is a real student. */
    private val klass = (1..99).map { ScanStudent("s$it", it, "Student $it") }

    private fun row(c: ScanCheck, roll: Int) = c.rows.first { it.rollNo == roll }

    // ------------------------------------------------------------- matching

    @Test
    fun `matches a column to the part it abbreviates`() {
        assertEquals("PRACTICAL", matchComponent("Prac", withPrac)?.name)
        assertEquals("CQ", matchComponent("CQ", cqMcq)?.name)
        assertEquals("MCQ", matchComponent("mcq", cqMcq)?.name)
    }

    @Test
    fun `never mistakes CQ for MCQ`() {
        // Neither is a prefix of the other, which is what keeps them apart.
        assertNull(matchComponent("CQ", listOf(Component("MCQ", 30.0, 10.0))))
        assertNull(matchComponent("MCQ", listOf(Component("CQ", 70.0, 23.0))))
    }

    @Test
    fun `is not a part at all for the total column`() {
        assertNull(matchComponent("Total", cqMcq))
    }

    @Test
    fun `gives null for a part this subject has not got`() {
        assertNull(matchComponent("Prac", cqMcq))
    }

    @Test
    fun `reads the class a teacher writes`() {
        assertEquals(10, classNumber("Ten"))
        assertEquals(10, classNumber("ten"))
        assertEquals(10, classNumber("Class 10 - A"))
        assertEquals(10, classNumber("10"))
        assertEquals(9, classNumber("Nine"))
        assertNull(classNumber(""))
        assertNull(classNumber("Dakhil"))
    }

    @Test
    fun `knows the short name a teacher writes is the long one on file`() {
        assertTrue(sameSubject("History", "HISTORY OF BANGLADESH AND WORLD CIVILIZATION"))
        assertTrue(sameSubject("Agriculture", "AGRICULTURE"))
        assertTrue(sameSubject("ICT", "ICT"))
    }

    @Test
    fun `tells two different subjects apart`() {
        assertTrue(!sameSubject("History", "GEOGRAPHY"))
        assertTrue(!sameSubject("Physics", "CHEMISTRY"))
    }

    // -------------------------------------------------------------- header

    @Test
    fun `STOPS a sheet whose class is not the section chosen`() {
        // A Class 10 sheet applied to Class 9 would match on every roll and
        // hand 21 children someone else's marks.
        val f = headerFindings(
            header,
            history.copy(sectionName = "Class 9 - A", className = "Class 9"),
        )
        assertTrue(f.any { it.level == Level.STOP })
        assertTrue(f.first { it.level == Level.STOP }.message.contains("wrong children"))
    }

    @Test
    fun `is happy when the sheet and the section agree`() {
        assertEquals(0, headerFindings(header, history).count { it.level != Level.OK })
    }

    @Test
    fun `STOPS a sheet headed with another subject`() {
        val f = headerFindings(header.copy(subject = "Geography"), history)
        assertTrue(f.any { it.level == Level.STOP })
    }

    @Test
    fun `only warns when the class could not be read`() {
        val f = headerFindings(header.copy(className = ""), history)
        assertTrue(f.none { it.level == Level.STOP })
        assertTrue(f.any { it.level == Level.WARN })
    }

    @Test
    fun `only warns about the exam, which is struck out by hand`() {
        val f = headerFindings(header.copy(exam = "Annual"), history)
        assertTrue(f.none { it.level == Level.STOP })
        assertTrue(f.any { it.message.contains("misread") })
    }

    // ------------------------------------------------------- the real sheet

    @Test
    fun `fills every row but the one that does not add up`() {
        val c = checkScan(read(), klass, history)
        assertEquals(21, c.rows.size)
        assertEquals(20, c.filled)
        assertEquals(1, c.held)
    }

    @Test
    fun `holds roll 23 back and says why`() {
        val c = checkScan(read(), klass, history)
        val r = row(c, 23)
        assertTrue(r.problem.contains("come to 43"))
        assertTrue(r.problem.contains("53"))
        assertNull(c.entries["s23"])
    }

    @Test
    fun `puts the parts in the boxes, and no total`() {
        val c = checkScan(read(), klass, history)
        val r = row(c, 3)
        assertEquals(mapOf("CQ" to "51", "MCQ" to "18"), r.parts)
        assertEquals(69, r.computed)
        assertEquals(69, r.written)
        assertEquals(
            Typed(marks = "", parts = mapOf("CQ" to "51", "MCQ" to "18"), absent = false),
            c.entries["s3"],
        )
    }

    @Test
    fun `says nothing about the empty Prac column, because History has no Prac`() {
        val r = row(checkScan(read(), klass, history), 3)
        assertEquals("", r.problem)
        assertEquals("", r.note)
    }

    @Test
    fun `skips the empty rows entirely rather than entering zeros`() {
        val c = checkScan(read(), klass, history)
        assertEquals(20, c.entries.size)
        assertNull(c.entries["s1"])
    }

    @Test
    fun `reads the rows back in roll order whatever order they came in`() {
        val shuffled = ScanRead(header, read().rows.reversed())
        assertEquals(
            sheet.map { (r) -> r[0] },
            checkScan(shuffled, klass, history).rows.map { it.rollNo },
        )
    }

    @Test
    fun `names the student against each row, so the paper can be checked by eye`() {
        assertEquals("Student 65", row(checkScan(read(), klass, history), 65).studentName)
    }

    // ---------------------------------------------- rows not to be trusted

    private fun one(
        values: Map<String, Int?>,
        roll: Int? = 7,
        c: Chosen = history,
    ) = checkScan(ScanRead(header, listOf(ScanRow(roll, values))), klass, c).rows[0]

    @Test
    fun `holds a roll this section has not got`() {
        val r = one(mapOf("CQ" to 50, "MCQ" to 20, "Total" to 70), 400)
        assertTrue(r.problem.contains("not in this section"))
    }

    @Test
    fun `holds a row whose roll could not be read`() {
        val r = one(mapOf("CQ" to 50, "MCQ" to 20, "Total" to 70), null)
        assertTrue(r.problem.contains("No roll number"))
    }

    @Test
    fun `holds a part written over its own maximum`() {
        val r = one(mapOf("CQ" to 80, "MCQ" to 20, "Total" to 100))
        assertTrue(r.problem.contains("over the 70"))
    }

    @Test
    fun `holds a part the subject does not have`() {
        // A Prac mark against History: the sheet and the subject disagree, and
        // dropping it quietly would store a total that is missing a part.
        val r = one(mapOf("CQ" to 40, "MCQ" to 15, "Prac" to 20, "Total" to 75))
        assertTrue(r.problem.contains("no \"Prac\""))
    }

    @Test
    fun `holds a total that cannot be split into parts`() {
        val r = one(mapOf("Total" to 55))
        assertTrue(r.problem.contains("cannot be split"))
    }

    @Test
    fun `holds the same roll written twice`() {
        val twice = checkScan(
            ScanRead(
                header,
                listOf(
                    ScanRow(9, mapOf("CQ" to 40, "MCQ" to 15, "Total" to 55)),
                    ScanRow(9, mapOf("CQ" to 41, "MCQ" to 15, "Total" to 56)),
                ),
            ),
            klass, history,
        )
        assertTrue(twice.rows[1].problem.contains("twice"))
        assertEquals(1, twice.filled)
    }

    @Test
    fun `fills nothing at all when the header STOPS the sheet`() {
        val wrong = checkScan(
            read(), klass,
            history.copy(className = "Class 9", sectionName = "Class 9 - A"),
        )
        assertEquals(0, wrong.filled)
        assertEquals(0, wrong.entries.size)
        // The rows are still shown: the person needs to see what was on the paper.
        assertEquals(21, wrong.rows.size)
    }

    // -------------------------------------------- subjects marked other ways

    @Test
    fun `takes the total as the mark when the paper has no parts`() {
        val whole = history.copy(subjectName = "GEOGRAPHY", components = emptyList())
        val c = checkScan(
            ScanRead(
                header.copy(subject = "Geography"),
                listOf(ScanRow(7, mapOf("CQ" to null, "MCQ" to null, "Total" to 64))),
            ),
            klass, whole,
        )
        assertEquals("64", c.rows[0].marks)
        assertEquals(emptyMap<String, String>(), c.rows[0].parts)
        assertEquals(Typed(marks = "64", parts = emptyMap(), absent = false), c.entries["s7"])
    }

    @Test
    fun `refuses a whole-paper mark over the full marks`() {
        val whole = history.copy(subjectName = "GEOGRAPHY", components = emptyList())
        val c = checkScan(
            ScanRead(header.copy(subject = "Geography"), listOf(ScanRow(7, mapOf("Total" to 140)))),
            klass, whole,
        )
        assertTrue(c.rows[0].problem.contains("more than the 100"))
    }

    @Test
    fun `takes a lone total as the one part when the paper has only one`() {
        val written = history.copy(
            subjectName = "ENGLISH 1ST PAPER",
            components = listOf(Component("WRITTEN", 100.0, 33.0)),
        )
        val c = checkScan(
            ScanRead(
                header.copy(subject = "English 1st Paper"),
                listOf(ScanRow(7, mapOf("Total" to 72))),
            ),
            klass, written,
        )
        assertEquals(mapOf("WRITTEN" to "72"), c.rows[0].parts)
        assertTrue(c.rows[0].note.contains("only that one part"))
        assertEquals(1, c.filled)
    }

    @Test
    fun `checks all three parts of a practical subject against the total`() {
        val agri = history.copy(subjectName = "AGRICULTURE", components = withPrac)
        val ok = checkScan(
            ScanRead(
                header.copy(subject = "Agriculture"),
                listOf(ScanRow(47, mapOf("CQ" to 15, "MCQ" to 10, "Prac" to 25, "Total" to 50))),
            ),
            klass, agri,
        )
        assertEquals("", ok.rows[0].problem)
        assertEquals(mapOf("CQ" to "15", "MCQ" to "10", "PRACTICAL" to "25"), ok.rows[0].parts)

        val bad = checkScan(
            ScanRead(
                header.copy(subject = "Agriculture"),
                listOf(ScanRow(56, mapOf("CQ" to 8, "MCQ" to 11, "Prac" to 25, "Total" to 49))),
            ),
            klass, agri,
        )
        assertTrue(bad.rows[0].problem.contains("come to 44"))
    }

    @Test
    fun `notes a part left blank rather than calling it zero`() {
        val agri = history.copy(subjectName = "AGRICULTURE", components = withPrac)
        val c = checkScan(
            ScanRead(
                header.copy(subject = "Agriculture"),
                listOf(ScanRow(7, mapOf("CQ" to 15, "MCQ" to 10, "Prac" to null, "Total" to 25))),
            ),
            klass, agri,
        )
        assertEquals("", c.rows[0].problem)
        assertTrue(c.rows[0].note.contains("PRACTICAL"))
        assertNull(c.rows[0].parts["PRACTICAL"])
        assertEquals(1, c.filled)
    }

    @Test
    fun `notes a row with parts but no total written`() {
        val c = checkScan(
            ScanRead(header, listOf(ScanRow(7, mapOf("CQ" to 40, "MCQ" to 15, "Total" to null)))),
            klass, history,
        )
        assertEquals("", c.rows[0].problem)
        assertTrue(c.rows[0].note.contains("nothing to check"))
        assertEquals(1, c.filled)
    }
}
