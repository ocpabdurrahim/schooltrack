package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The SAME cases exist in web/src/data/subjectorder.test.ts.
 *
 * The fixture below is the live school's twenty-one subjects, with the names,
 * ids and codes they are actually stored under, in the jumbled order their
 * stored sortOrder gave them. If this file passes, the order on screen is the
 * order that was asked for.
 */
class SubjectOrderTest {

    private fun s(
        subjectId: String,
        subjectName: String,
        subjectCode: String?,
        sortOrder: Long,
    ) = Subject(
        subjectId = subjectId,
        subjectName = subjectName,
        subjectCode = subjectCode,
        sortOrder = sortOrder,
    )

    /** As stored: six subjects share sortOrder 0, which is how Civics came third. */
    private val live: List<Subject> = listOf(
        s("BANGLA_1ST_PAPER", "BANGLA 1ST PAPER", "101", 0),
        s("BANGLA_2ND_PAPER", "BANGLA 2ND PAPER", "102", 0),
        s("CIVICS_AND_CITIZENSHIP", "CIVICS AND CITIZENSHIP", "140", 0),
        s("ENGLISH_1ST_PAPER", "ENGLISH 1ST PAPER", null, 0),
        s("ICT", "ICT", "154", 0),
        s("MATHEMATICS", "MATHEMATICS", null, 0),
        s("ENGLISH_2ND_PAPER", "ENGLISH 2ND PAPER", "108", 1),
        s("HINDU_AND_MORALITY_EDUCATION", "HINDU AND MORALITY EDUCATION", null, 2),
        s("ISLAM_AND_MORALITY_EDUCATION", "ISLAM AND MORALITY EDUCATION", "111", 2),
        s("BANGLADESH_AND_GLOBAL_STUDIES", "BANGLADESH AND GLOBAL STUDIES", "150", 3),
        s("SCIENCE", "SCIENCE", "127", 3),
        s("CHEMISTRY", "CHEMISTRY", "137", 4),
        s("PHYSICS", "PHYSICS", "136", 4),
        s("BIOLOGY", "BIOLOGY", "138", 5),
        s("HISTORY", "HISTORY OF BANGLADESH AND WORLD CIVILIZATION", "153", 5),
        s("GEOGRAPHY", "GEOGRAPHY", "110", 6),
        s("ACCOUNTING", "ACCOUNTING", "146", 7),
        s("FINANCE_AND_BANKING", "FINANCE AND BANKING", "152", 7),
        s("BUSINESS_ENTREPRENEURSHIP", "BUSINESS ENTREPRENEURSHIP", "143", 8),
        s("HIGHER_MATHS", "HIGHER MATHS", "126", 8),
        s("AGRICULTURE", "AGRICULTURE", "134", 9),
    )

    private fun ids(rows: List<Subject>) = sortSubjects(rows).map { it.subjectId }

    private fun named(name: String, id: String = name, code: String? = null) =
        SubjectKey(subjectId = id, subjectName = name, subjectCode = code)

    // ----------------------------------------------------------- the key

    @Test
    fun `reads an id and a name as the same key`() {
        assertEquals("BANGLA 1ST PAPER", normaliseSubjectKey("BANGLA_1ST_PAPER"))
        assertEquals("BANGLA 1ST PAPER", normaliseSubjectKey("  Bangla  1st   Paper "))
        assertEquals(
            "ISLAM MORALITY EDUCATION",
            normaliseSubjectKey("Islam & Morality Education"),
        )
    }

    // ---------------------------------------------------------- the rank

    @Test
    fun `places a paper by its name`() {
        assertTrue(subjectRank(named("Physics", "X")) < subjectRank(named("Chemistry", "Y")))
    }

    @Test
    fun `places a paper by its id when the name has been edited`() {
        val renamed = named("Geo (new syllabus)", "GEOGRAPHY")
        assertEquals(subjectRank(named("GEOGRAPHY", "G")), subjectRank(renamed))
    }

    @Test
    fun `places a paper by its code when neither name nor id is recognised`() {
        val odd = named("Paper 7", "PAPER_7", "136")
        assertEquals(subjectRank(named("Physics", "P")), subjectRank(odd))
    }

    @Test
    fun `accepts the spellings the same paper is written in`() {
        val physics = subjectRank(named("Physics", "P"))
        assertTrue(subjectRank(named("History", "H")) > physics)
        assertEquals(
            subjectRank(named("History", "H2")),
            subjectRank(named("History of Bangladesh and World Civilization", "H")),
        )
        assertEquals(
            subjectRank(named("BANGLA 1ST PAPER", "B2")),
            subjectRank(named("Bengali First Paper", "B")),
        )
    }

    @Test
    fun `leaves a subject it has never heard of unranked`() {
        assertEquals(UNRANKED, subjectRank(named("Music", "MUSIC")))
    }

    @Test
    fun `keeps the papers of one slot together and apart from the next`() {
        // A slot's own papers share its thousand: this is what lines the group
        // columns of a tabulation sheet up across streams.
        fun slotOf(name: String) = subjectRank(named(name)) / 1000
        assertEquals(slotOf("Physics"), slotOf("History"))
        assertEquals(slotOf("Physics"), slotOf("Accounting"))
        assertEquals(slotOf("Chemistry"), slotOf("Geography"))
        assertEquals(slotOf("Chemistry"), slotOf("Finance and Banking"))
        assertEquals(slotOf("Biology"), slotOf("Civics and Citizenship"))
        assertEquals(slotOf("Biology"), slotOf("Business Entrepreneurship"))
        assertNotEquals(slotOf("Physics"), slotOf("Chemistry"))
    }

    // ---------------------------------------------------------- the order

    @Test
    fun `puts the live school in the order asked for`() {
        assertEquals(
            listOf(
                "BANGLA_1ST_PAPER",
                "BANGLA_2ND_PAPER",
                "ENGLISH_1ST_PAPER",
                "ENGLISH_2ND_PAPER",
                "MATHEMATICS",
                "ISLAM_AND_MORALITY_EDUCATION",
                "HINDU_AND_MORALITY_EDUCATION",
                "ICT",
                "SCIENCE",
                "BANGLADESH_AND_GLOBAL_STUDIES",
                "PHYSICS",
                "HISTORY",
                "ACCOUNTING",
                "CHEMISTRY",
                "GEOGRAPHY",
                "FINANCE_AND_BANKING",
                "BIOLOGY",
                "CIVICS_AND_CITIZENSHIP",
                "BUSINESS_ENTREPRENEURSHIP",
                "HIGHER_MATHS",
                "AGRICULTURE",
            ),
            ids(live),
        )
    }

    @Test
    fun `ignores the stored sortOrder entirely for a subject it knows`() {
        // The whole point: the live data said Civics came third and Chemistry
        // before Physics. Reversing every stored value changes nothing.
        val upended = live.map { it.copy(sortOrder = 100 - it.sortOrder) }
        assertEquals(ids(live), ids(upended))
    }

    @Test
    fun `is unchanged by the order it is handed`() {
        assertEquals(ids(live), ids(live.reversed()))
    }

    @Test
    fun `does not lose or duplicate a subject`() {
        assertEquals(live.size, ids(live).size)
        assertEquals(live.size, ids(live).toSet().size)
    }

    @Test
    fun `leaves the list it was given alone`() {
        val before = live.map { it.subjectId }
        sortSubjects(live)
        assertEquals(before, live.map { it.subjectId })
    }

    @Test
    fun `sorts an unknown subject last, by its stored order`() {
        val extra = live +
            s("MUSIC", "Music", null, 5) +
            s("HOME_SCIENCE", "Home Science", null, 2)
        val out = ids(extra)
        assertEquals(listOf("HOME_SCIENCE", "MUSIC"), out.takeLast(2))
        assertEquals(out.size - 3, out.indexOf("AGRICULTURE"))
    }

    @Test
    fun `separates two papers of one slot by their stored order`() {
        // Both are the religion slot's, both unnamed in the other's keys: the
        // school's own sortOrder decides, not chance.
        val two = listOf(
            s("RELIGION_B", "Religion", null, 9),
            s("RELIGION_A", "Religion", null, 1),
        )
        assertEquals(listOf("RELIGION_A", "RELIGION_B"), ids(two))
    }

    @Test
    fun `works on a class that sits only some of the papers`() {
        // Class 6: no group papers at all, so the order is just the common ones.
        val keep = setOf(
            "BANGLA_1ST_PAPER", "ICT", "SCIENCE",
            "ISLAM_AND_MORALITY_EDUCATION", "MATHEMATICS",
        )
        assertEquals(
            listOf(
                "BANGLA_1ST_PAPER",
                "MATHEMATICS",
                "ISLAM_AND_MORALITY_EDUCATION",
                "ICT",
                "SCIENCE",
            ),
            ids(live.filter { it.subjectId in keep }),
        )
    }

    @Test
    fun `gives a Science and a Humanities student matching slots`() {
        // What the tabulation sheet's group columns depend on: the nth group
        // paper of one stream is the nth of the other.
        fun group(keep: List<String>) = ids(live.filter { it.subjectId in keep })
        assertEquals(
            listOf("BANGLADESH_AND_GLOBAL_STUDIES", "PHYSICS", "CHEMISTRY", "BIOLOGY"),
            group(listOf("BANGLADESH_AND_GLOBAL_STUDIES", "PHYSICS", "CHEMISTRY", "BIOLOGY")),
        )
        assertEquals(
            listOf("SCIENCE", "HISTORY", "GEOGRAPHY", "CIVICS_AND_CITIZENSHIP"),
            group(listOf("SCIENCE", "HISTORY", "GEOGRAPHY", "CIVICS_AND_CITIZENSHIP")),
        )
        assertEquals(
            listOf(
                "SCIENCE", "ACCOUNTING", "FINANCE_AND_BANKING", "BUSINESS_ENTREPRENEURSHIP",
            ),
            group(
                listOf(
                    "SCIENCE", "ACCOUNTING", "FINANCE_AND_BANKING", "BUSINESS_ENTREPRENEURSHIP",
                ),
            ),
        )
    }
}
