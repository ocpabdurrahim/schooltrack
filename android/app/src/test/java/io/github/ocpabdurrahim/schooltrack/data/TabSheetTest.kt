package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The SAME cases exist in web/src/data/tabsheet.test.ts and
 * web/src/data/shortnames.test.ts. The subjects below are this school's
 * Class 9: four everybody sits, two religion papers, four group papers per
 * stream and one 4th subject per stream.
 */
class TabSheetTest {

    private fun subject(
        id: String,
        order: Long,
        groups: List<String> = emptyList(),
        religions: List<String> = emptyList(),
        optional: Boolean = false,
    ) = Subject(
        subjectId = id, subjectName = id, classNames = listOf("Class 9"),
        fullMarks = 100.0, isOptional = optional, sortOrder = order,
        groupNames = groups, religions = religions,
    )

    private val all = listOf(
        subject("BANGLA", 1),
        subject("ENGLISH", 2),
        subject("MATHEMATICS", 3),
        subject("ICT", 4),
        subject("ISLAM", 5, religions = listOf("Islam")),
        subject("HINDU", 6, religions = listOf("Hindu")),
        subject("PHYSICS", 7, groups = listOf("Science")),
        subject("CHEMISTRY", 8, groups = listOf("Science")),
        subject("BIOLOGY", 9, groups = listOf("Science")),
        subject("BGS", 10, groups = listOf("Science")),
        subject("HISTORY", 11, groups = listOf("Humanities")),
        subject("GEOGRAPHY", 12, groups = listOf("Humanities")),
        subject("HIGHER_MATHS", 13, groups = listOf("Science"), optional = true),
        subject("AGRICULTURE", 14, groups = listOf("Humanities"), optional = true),
    )

    private fun tabulationFor(group: String, religion: String) = tabulate(
        all.filter {
            (it.groupNames.isEmpty() || group in it.groupNames) &&
                (it.religions.isEmpty() || religion in it.religions)
        }.map { s ->
            subjectMarkFor(
                s,
                ResultRow(
                    examId = "e", studentId = "s", subjectId = s.subjectId,
                    subjectName = s.subjectName, marks = 70.0, absent = false,
                    classId = "c", rollNo = 1, fullMarks = 100.0, isOptional = s.isOptional,
                ),
            )
        },
    )

    @Test
    fun sortsAScienceStudentsUnitsIntoTheSheetsSlots() {
        val s = slot(tabulationFor("Science", "Islam"))
        assertEquals(
            listOf("BANGLA", "ENGLISH", "MATHEMATICS", "ICT"),
            s.common.map { it.mark.subjectId },
        )
        assertEquals("ISLAM", s.religion!!.mark.subjectId)
        assertEquals(
            listOf("PHYSICS", "CHEMISTRY", "BIOLOGY", "BGS"),
            s.group.map { it.mark.subjectId },
        )
        assertEquals("HIGHER_MATHS", s.optional!!.mark.subjectId)
    }

    @Test
    fun putsAHumanitiesStudentsOwnSubjectsInTheSameSlots() {
        val s = slot(tabulationFor("Humanities", "Hindu"))
        assertEquals(
            listOf("BANGLA", "ENGLISH", "MATHEMATICS", "ICT"),
            s.common.map { it.mark.subjectId },
        )
        assertEquals("HINDU", s.religion!!.mark.subjectId)
        assertEquals(listOf("HISTORY", "GEOGRAPHY"), s.group.map { it.mark.subjectId })
        assertEquals("AGRICULTURE", s.optional!!.mark.subjectId)
    }

    @Test
    fun countsThe4thSubjectAsThe4thSubjectNotAsAGroupPaper() {
        // Higher Maths is a Science paper AND optional. It belongs in one slot.
        val s = slot(tabulationFor("Science", "Islam"))
        assertFalse(s.group.any { it.mark.subjectId == "HIGHER_MATHS" })
    }

    @Test
    fun leavesTheSlotsEmptyForAClassThatIsNotStreamed() {
        val plain = tabulate(listOf(subjectMarkFor(subject("BANGLA", 1), null)))
        val s = slot(plain)
        assertTrue(s.group.isEmpty())
        assertNull(s.religion)
        assertNull(s.optional)
    }

    @Test
    fun isAsWideAsTheWidestStudentNeedsAndNoWider() {
        val got = layout(
            listOf(tabulationFor("Science", "Islam"), tabulationFor("Humanities", "Hindu")),
        )
        assertEquals(
            listOf("BANGLA", "ENGLISH", "MATHEMATICS", "ICT"),
            got.common.map { it.first },
        )
        assertEquals(4, got.groupSlots)   // Science needs four; Humanities uses two
        assertTrue(got.religion)
        assertTrue(got.optional)
    }

    @Test
    fun givesASectionOfOneStreamExactlyThatStreamsWidth() {
        assertEquals(2, layout(listOf(tabulationFor("Humanities", "Islam"))).groupSlots)
    }

    @Test
    fun hasNoGroupOrReligionColumnsWhenNothingIsStreamed() {
        val plain = tabulate(
            listOf(
                subjectMarkFor(subject("BANGLA", 1), null),
                subjectMarkFor(subject("ENGLISH", 2), null),
            ),
        )
        val got = layout(listOf(plain))
        assertEquals(2, got.common.size)
        assertEquals(0, got.groupSlots)
        assertFalse(got.religion)
        assertFalse(got.optional)
    }

    // ----------------------------------------------------------------- names

    @Test
    fun abbreviatesTheSubjectsASchoolWritesAParticularWay() {
        assertEquals("ISL", shortName("ISLAM AND MORALITY EDUCATION"))
        assertEquals("HIN", shortName("HINDU AND MORALITY EDUCATION"))
        assertEquals("H.MATH", shortName("HIGHER MATHS"))
        assertEquals("ICT", shortName("ICT"))
    }

    @Test
    fun usesTheSettledAbbreviationOfTheFirstWord() {
        assertEquals("BAN", shortName("BANGLA"))
        assertEquals("ENG", shortName("ENGLISH"))
        assertEquals("MATH", shortName("MATHEMATICS"))
        assertEquals("PHY", shortName("PHYSICS"))
        assertEquals("CHEM", shortName("CHEMISTRY"))
        assertEquals("BIO", shortName("BIOLOGY"))
        assertEquals("GEO", shortName("GEOGRAPHY"))
        assertEquals("SCI", shortName("SCIENCE"))
        assertEquals("ACC", shortName("ACCOUNTING"))
        assertEquals("AGRI", shortName("AGRICULTURE"))
        assertEquals("CIV", shortName("CIVICS AND CITIZENSHIP"))
        assertEquals("HIST", shortName("HISTORY OF BANGLADESH AND WORLD CIVILIZATION"))
    }

    @Test
    fun takesTheInitialsOfTheWordsThatCarryMeaning() {
        assertEquals("BGS", shortName("BANGLADESH AND GLOBAL STUDIES"))
        assertEquals("FB", shortName("FINANCE AND BANKING"))
        assertEquals("BE", shortName("BUSINESS ENTREPRENEURSHIP"))
        assertEquals("PE", shortName("PHYSICAL EDUCATION"))
    }

    @Test
    fun copesWithASubjectNobodyThoughtOf() {
        assertEquals("POTT", shortName("Pottery"))
        assertEquals("?", shortName(""))
    }

    @Test
    fun keepsEveryHeadingDifferentHoweverAlikeTheNames() {
        assertEquals(
            listOf("BAN", "ENG", "PHY"),
            shortNames(listOf("BANGLA", "ENGLISH", "PHYSICS")),
        )
        val clash = shortNames(listOf("PHYSICS", "PHYSICAL EDUCATION"))
        assertEquals("PHY", clash[0])
        assertEquals(2, clash.toSet().size)
        assertEquals(3, shortNames(listOf("SCIENCE", "SCIENCE", "SCIENCE")).toSet().size)
    }
}
