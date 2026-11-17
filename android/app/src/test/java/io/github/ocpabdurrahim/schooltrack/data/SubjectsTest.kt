package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The SAME cases exist in web/src/data/subjects.test.ts.
 *
 * Classes 9 and 10 stream into groups and the groups sit different papers, and
 * the two religion papers go to the students of that religion. Getting either
 * wrong does not look like a bug: it looks like a whole set of students having
 * an unfinished result, for ever, because a paper they never sat has no mark.
 */
class SubjectsTest {

    private val bangla = Subject(
        subjectId = "BAN1",
        subjectName = "Bengali First Paper",
        classNames = listOf("Class 9"),
    )
    private val physics = bangla.copy(
        subjectId = "PHY", subjectName = "Physics",
        groupNames = listOf("Science"), sortOrder = 2,
    )
    private val history = bangla.copy(
        subjectId = "HIST", subjectName = "History",
        groupNames = listOf("Humanities"), sortOrder = 3,
    )
    private val islam = bangla.copy(
        subjectId = "ISL", subjectName = "Islam & Moral Education",
        religions = listOf("Islam"), sortOrder = 4,
    )
    private val hindu = bangla.copy(
        subjectId = "HIN", subjectName = "Hindu Religion",
        religions = listOf("Hindu"), sortOrder = 5,
    )
    private val all = listOf(bangla, physics, history, islam, hindu)

    @Test
    fun givesAPaperThatNamesNeitherToTheWholeClass() {
        assertTrue(sitsSubject(bangla, Sitter("Class 9", groupName = "Science")))
        assertTrue(sitsSubject(bangla, Sitter("Class 9", religion = "Hindu")))
        assertTrue(sitsSubject(bangla, Sitter("Class 9")))
    }

    @Test
    fun givesAGroupPaperOnlyToThatGroup() {
        assertTrue(sitsSubject(physics, Sitter("Class 9", groupName = "Science")))
        assertFalse(sitsSubject(physics, Sitter("Class 9", groupName = "Humanities")))
        assertTrue(sitsSubject(history, Sitter("Class 9", groupName = "Humanities")))
        assertFalse(sitsSubject(history, Sitter("Class 9", groupName = "Science")))
    }

    @Test
    fun givesAReligionPaperOnlyToThatReligion() {
        assertTrue(sitsSubject(islam, Sitter("Class 9", religion = "Islam")))
        assertFalse(sitsSubject(islam, Sitter("Class 9", religion = "Hindu")))
        assertTrue(sitsSubject(hindu, Sitter("Class 9", religion = "Hindu")))
        assertFalse(sitsSubject(hindu, Sitter("Class 9", religion = "Islam")))
    }

    @Test
    fun givesNeitherReligionPaperToAStudentRecordedAsOther() {
        // "Other" is an answer, not a blank — the same as Oracle, where a
        // student whose religion is neither Islam nor Hindu is enrolled in
        // neither paper.
        assertFalse(sitsSubject(islam, Sitter("Class 9", religion = "Other")))
        assertFalse(sitsSubject(hindu, Sitter("Class 9", religion = "Other")))
        assertTrue(sitsSubject(bangla, Sitter("Class 9", religion = "Other")))
    }

    @Test
    fun appliesTheGroupAndTheReligionTogether() {
        val sciMuslim = Sitter("Class 9", "Science", "Islam")
        assertTrue(sitsSubject(physics, sciMuslim))
        assertTrue(sitsSubject(islam, sciMuslim))
        assertFalse(sitsSubject(history, sciMuslim))
        assertFalse(sitsSubject(hindu, sciMuslim))
    }

    @Test
    fun understandsBothHoweverTheOfficeWroteThem() {
        assertTrue(sitsSubject(physics, Sitter("Class 9", groupName = "sci")))
        assertTrue(sitsSubject(history, Sitter("Class 9", groupName = "ARTS")))
        assertTrue(sitsSubject(islam, Sitter("Class 9", religion = "muslim")))
        assertTrue(sitsSubject(hindu, Sitter("Class 9", religion = "Hinduism")))
    }

    @Test
    fun givesEveryPaperToAStudentWithNothingRecorded() {
        // Deliberate: see the note on sitsSubject. A short GPA nobody can see
        // is worse than a result that openly says it is not finished.
        assertTrue(sitsSubject(physics, Sitter("Class 9")))
        assertTrue(sitsSubject(islam, Sitter("Class 9")))
        assertTrue(sitsSubject(hindu, Sitter("Class 9", religion = null)))
    }

    @Test
    fun neverGivesAPaperTheClassDoesNotSit() {
        assertFalse(sitsSubject(physics, Sitter("Class 7", groupName = "Science")))
        assertFalse(sitsSubject(bangla, Sitter("Class 7")))
    }

    @Test
    fun namesThePartOfTheRuleThatActuallyDecidedIt() {
        val humHindu = Sitter("Class 9", "Humanities", "Hindu")
        assertEquals(Excluded.GROUP, excludedBy(physics, humHindu))
        assertEquals(Excluded.RELIGION, excludedBy(islam, humHindu))
        assertNull(excludedBy(bangla, humHindu))
        assertEquals(Excluded.CLASS, excludedBy(history, humHindu.copy(className = "Class 7")))
    }

    @Test
    fun isTheOneAnswerSitsSubjectIsBuiltOn() {
        val who = Sitter("Class 9", "Science", "Other")
        for (s in all) assertEquals(excludedBy(s, who) == null, sitsSubject(s, who))
    }

    @Test
    fun isTheClassListNarrowedToThisStudentsOwnPapers() {
        assertEquals(
            listOf("BAN1", "PHY", "ISL"),
            subjectsForStudent(all, Sitter("Class 9", "Science", "Islam")).map { it.subjectId },
        )
        assertEquals(
            listOf("BAN1", "HIST", "HIN"),
            subjectsForStudent(all, Sitter("Class 9", "Humanities", "Hindu")).map { it.subjectId },
        )
        assertEquals(
            listOf("BAN1"),
            subjectsForStudent(all, Sitter("Class 9", "Business Studies", "Other"))
                .map { it.subjectId },
        )
    }

    // ----------------------------------------------------------------------
    // what it is all for

    private fun student(
        id: String,
        name: String,
        roll: Long,
        group: String,
        religion: String,
    ) = StudentDetail(
        studentId = id,
        fullName = name,
        rollNo = roll,
        regNo = null,
        classId = "C9A",
        className = "Class 9",
        section = "A",
        groupName = group,
        religion = religion,
        gender = null,
        dob = null,
        fatherName = null,
        motherName = null,
        bloodGroup = null,
        mobileNo = null,
        status = "A",
    )

    private fun mark(studentId: String, subjectId: String, marks: Double) = ResultRow(
        examId = "ex1",
        studentId = studentId,
        subjectId = subjectId,
        subjectName = subjectId,
        marks = marks,
        absent = false,
        classId = "C9A",
        rollNo = 1,
        fullMarks = 100.0,
        isOptional = false,
    )

    private val hum = student("s1", "Hasina", 1, "Humanities", "Islam")
    private val sci = student("s2", "Shakil", 2, "Science", "Hindu")

    private fun hasinasMarks() = listOf(
        mark("s1", "BAN1", 70.0), mark("s1", "HIST", 80.0), mark("s1", "ISL", 75.0),
    )

    @Test
    fun finishesAStudentWhoseOwnPapersAreAllMarked() {
        val rows = sheetFor(listOf(hum), all, hasinasMarks(), "ex1")
        assertFalse(rows[0].tabulation.incomplete)
        assertEquals(
            listOf("BAN1", "HIST", "ISL"),
            rows[0].tabulation.subjects.map { it.mark.subjectId },
        )
    }

    @Test
    fun doesNotHoldAResultOpenForAPaperTheStudentNeverSat() {
        // Physics is a Science paper and Hindu Religion is not Hasina's:
        // neither mark is ever coming, and neither should hold her result open.
        val ids = sheetFor(listOf(hum), all, hasinasMarks(), "ex1")[0]
            .tabulation.subjects.map { it.mark.subjectId }
        assertFalse("PHY" in ids)
        assertFalse("HIN" in ids)
    }

    @Test
    fun stillHoldsItOpenForAPaperTheStudentDoesSit() {
        val rows = sheetFor(listOf(sci), all, listOf(mark("s2", "BAN1", 70.0)), "ex1")
        assertTrue(rows[0].tabulation.incomplete)
        assertNull(rows[0].tabulation.gpa)
    }

    // ----------------------------------------------------------------------
    // the columns of the sheet itself
    //
    // A real school's whole subject list was two Bangla papers and two English
    // ones, every one of them graded in a pair. The sheet took its columns
    // from the subject list and its values from the tabulation, which holds
    // the merged units — so nothing ever matched and the entire sheet came out
    // blank with the marks sitting safely in the database.

    private val ban1 = bangla.copy(
        subjectId = "BANGLA_1ST_PAPER", subjectName = "BANGLA 1ST PAPER", combineGroup = "BAN",
    )
    private val ban2 = bangla.copy(
        subjectId = "BANGLA_2ND_PAPER", subjectName = "BANGLA 2ND PAPER", combineGroup = "BAN",
        sortOrder = 2,
    )
    private val eng1 = bangla.copy(
        subjectId = "ENGLISH_1ST_PAPER", subjectName = "ENGLISH 1ST PAPER", combineGroup = "ENG",
        sortOrder = 3,
    )
    private val eng2 = bangla.copy(
        subjectId = "ENGLISH_2ND_PAPER", subjectName = "ENGLISH 2ND PAPER", combineGroup = "ENG",
        sortOrder = 4,
    )
    private val theirs = listOf(ban1, ban2, eng1, eng2)
    private val pupil = student("s9", "Nusrat", 1, "", "")

    @Test
    fun isOneColumnPerGradedUnitNotOnePerPaper() {
        val cols = sheetColumns(theirs, "Class 9")
        assertEquals(listOf("UNIT_BAN", "UNIT_ENG"), cols.map { it.subjectId })
        assertEquals(listOf("BANGLA", "ENGLISH"), cols.map { it.subjectName })
        assertEquals(listOf(200.0, 200.0), cols.map { it.fullMarks })
    }

    @Test
    fun matchesWhatTheTabulationHoldsSoTheMarksAppear() {
        val rows = sheetFor(
            listOf(pupil), theirs,
            listOf(
                mark("s9", "BANGLA_1ST_PAPER", 50.0),
                mark("s9", "BANGLA_2ND_PAPER", 50.0),
            ),
            "ex1",
        )
        val cols = sheetColumns(theirs, "Class 9")
        val banglaCell = rows[0].tabulation.subjects
            .firstOrNull { it.mark.subjectId == cols[0].subjectId }
        assertEquals(100.0, banglaCell!!.mark.marks!!, 0.001)   // the pair, out of 200
    }

    @Test
    fun leavesAPaperThatStandsAloneAsItsOwnColumn() {
        val maths = bangla.copy(subjectId = "MATH", subjectName = "Mathematics", sortOrder = 5)
        assertEquals(
            listOf("UNIT_BAN", "UNIT_ENG", "MATH"),
            sheetColumns(theirs + maths, "Class 9").map { it.subjectId },
        )
    }

    @Test
    fun countsThePerSubjectStatisticsAgainstThoseSameColumns() {
        val rows = sheetFor(
            listOf(pupil), theirs,
            listOf(
                mark("s9", "BANGLA_1ST_PAPER", 50.0),
                mark("s9", "BANGLA_2ND_PAPER", 50.0),
            ),
            "ex1",
        )
        val stats = subjectStats(rows, sheetColumns(theirs, "Class 9"))
        assertEquals("BANGLA", stats[0].subjectName)
        assertEquals(100.0, stats[0].highest!!, 0.001)
    }

    @Test
    fun ranksStudentsOnTheirOwnPapersWhateverTheySat() {
        val rows = sheetFor(
            listOf(hum, sci),
            all,
            hasinasMarks() + listOf(
                mark("s2", "BAN1", 90.0), mark("s2", "PHY", 90.0), mark("s2", "HIN", 90.0),
            ),
            "ex1",
        )
        assertEquals(1, rows.first { it.student.studentId == "s2" }.position)
        assertEquals(2, rows.first { it.student.studentId == "s1" }.position)
    }
}
