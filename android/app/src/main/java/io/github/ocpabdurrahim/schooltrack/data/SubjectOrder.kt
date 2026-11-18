package io.github.ocpabdurrahim.schooltrack.data

/**
 * One order for subjects, used everywhere.
 *
 * Every screen that shows subjects — the subject list, mark entry, the result
 * sheet, the tabulation sheet, a mark sheet, the routine, a report card —
 * reads them through listSubjects(), so the order is decided here once rather
 * than per screen.
 *
 * It is NOT the stored sortOrder. That field is kept, and still separates
 * subjects this file has never heard of, but it cannot be trusted to carry
 * the school's order: the live school had six subjects sharing sortOrder 0,
 * which left Civics third in every list and English 2nd paper after
 * Mathematics.
 *
 * The order is the national mark sheet's, and it is a list of SLOTS. A slot
 * holds the parallel papers that different streams sit in the same position:
 * Physics for Science, History for Humanities, Accounting for Business
 * Studies. Every student sits exactly one paper from each slot that applies
 * to them, so a flat order over the slots puts each student's papers in
 * matching positions — which is what the tabulation sheet's group columns are
 * built from. Get this wrong and Grp 1 holds one student's Civics beside
 * another's Bangladesh and Global Studies.
 *
 * The twin of web/src/data/subjectorder.ts.
 */

/** What a subject must offer to be placed. Narrower than Subject on purpose. */
interface NamedSubject {
    val subjectId: String
    val subjectName: String
    val subjectCode: String?
}

/** A plain [NamedSubject], for callers holding nothing but the three fields. */
data class SubjectKey(
    override val subjectId: String,
    override val subjectName: String,
    override val subjectCode: String? = null,
) : NamedSubject

/** One position in the order, and the parallel papers that fill it. */
data class SubjectSlot(val label: String, val papers: List<List<String>>)

/**
 * The slots, in order, and the papers in each.
 *
 * A paper is listed by the keys it may be recognised by: its name as the
 * school writes it, the spellings it is also known by, and last the subject
 * code where this school has one. Matching on several keys means renaming a
 * subject — or typing "Bengali" for "Bangla" — does not silently drop it to
 * the bottom of every list.
 *
 * The order WITHIN a slot only shows where several of its papers appear at
 * once, as in the subject list itself; it follows the stream order Science,
 * Humanities, Business Studies.
 */
val SUBJECT_SLOTS: List<SubjectSlot> = listOf(
    SubjectSlot(
        "Bangla 1st Paper",
        listOf(
            listOf(
                "BANGLA", "BANGLA 1ST PAPER", "BANGLA FIRST PAPER",
                "BENGALI 1ST PAPER", "BENGALI FIRST PAPER", "101",
            ),
        ),
    ),
    SubjectSlot(
        "Bangla 2nd Paper",
        listOf(
            listOf(
                "BANGLA 2ND PAPER", "BANGLA SECOND PAPER",
                "BENGALI 2ND PAPER", "BENGALI SECOND PAPER", "102",
            ),
        ),
    ),
    SubjectSlot(
        "English 1st Paper",
        listOf(listOf("ENGLISH", "ENGLISH 1ST PAPER", "ENGLISH FIRST PAPER")),
    ),
    SubjectSlot(
        "English 2nd Paper",
        listOf(listOf("ENGLISH 2ND PAPER", "ENGLISH SECOND PAPER", "108")),
    ),
    SubjectSlot(
        "Mathematics",
        listOf(listOf("MATHEMATICS", "GENERAL MATHEMATICS", "MATHS", "MATH")),
    ),
    // One slot, because a student sits one of them: the sheet has a single
    // religion column and it is filled by whichever paper is theirs.
    SubjectSlot(
        "Religion",
        listOf(
            listOf(
                "ISLAM AND MORALITY EDUCATION", "ISLAM AND MORAL EDUCATION",
                "ISLAM RELIGION AND MORAL EDUCATION", "ISLAM", "ISL", "111",
            ),
            listOf(
                "HINDU AND MORALITY EDUCATION", "HINDU AND MORAL EDUCATION",
                "HINDU RELIGION AND MORAL EDUCATION", "HINDU RELIGION", "HINDU", "HIN",
            ),
            listOf("RELIGION"),
        ),
    ),
    SubjectSlot(
        "ICT",
        listOf(listOf("ICT", "INFORMATION AND COMMUNICATION TECHNOLOGY", "154")),
    ),
    SubjectSlot(
        "Science / BGDS",
        listOf(
            listOf("SCIENCE", "127"),
            listOf("BANGLADESH AND GLOBAL STUDIES", "BGDS", "BGS", "150"),
        ),
    ),
    SubjectSlot(
        "Physics / History / Accounting",
        listOf(
            listOf("PHYSICS", "136"),
            listOf(
                "HISTORY", "HISTORY OF BANGLADESH AND WORLD CIVILIZATION",
                "HISTORY OF BANGLADESH AND WORLD CIVILISATION", "HIST", "153",
            ),
            listOf("ACCOUNTING", "146"),
        ),
    ),
    SubjectSlot(
        "Chemistry / Geography / Finance and Banking",
        listOf(
            listOf("CHEMISTRY", "137"),
            listOf("GEOGRAPHY", "GEOGRAPHY AND ENVIRONMENT", "110"),
            listOf("FINANCE AND BANKING", "152"),
        ),
    ),
    // Civics and Citizenship was not named in the order given, but it is the
    // Humanities paper of this slot: it is their fourth group paper, as
    // Biology is Science's and Business Entrepreneurship is Business
    // Studies'. Anywhere else it would sit in a group column beside the
    // others' third paper.
    SubjectSlot(
        "Biology / Civics and Citizenship / Business Entrepreneurship",
        listOf(
            listOf("BIOLOGY", "138"),
            listOf("CIVICS AND CITIZENSHIP", "CIVICS", "140"),
            listOf("BUSINESS ENTREPRENEURSHIP", "143"),
        ),
    ),
    SubjectSlot(
        "Higher Maths / Agriculture",
        listOf(
            listOf("HIGHER MATHS", "HIGHER MATHEMATICS", "126"),
            listOf("AGRICULTURE", "AGRICULTURE STUDIES", "134"),
        ),
    ),
)

/**
 * The rank of a subject this file does not know.
 *
 * Unknown is not an error: a school may add a paper tomorrow. It sorts after
 * every named subject, where it is visible rather than buried in the middle,
 * and the subjects around it keep their order.
 */
const val UNRANKED = 1_000_000

private val NOT_ALNUM = Regex("[^A-Z0-9]+")

/** Upper case, and every run of anything else becomes one space. */
fun normaliseSubjectKey(raw: String): String =
    raw.trim().uppercase().replace(NOT_ALNUM, " ").trim()

private val RANKS: Map<String, Int> = buildMap {
    SUBJECT_SLOTS.forEachIndexed { slotIndex, slot ->
        slot.papers.forEachIndexed { within, keys ->
            // Room inside a slot, so a slot's own papers stay together
            // whatever else is added later.
            val rank = slotIndex * 1000 + within
            for (key in keys) putIfAbsent(normaliseSubjectKey(key), rank)
        }
    }
}

/**
 * Where this subject belongs, or [UNRANKED].
 *
 * The name is asked first because it is what the school wrote, then the id —
 * which is only the name with its spaces replaced, but survives the name
 * being edited — and the code last, so a paper renamed beyond recognition is
 * still placed by the number the school files it under.
 */
fun subjectRank(s: NamedSubject): Int {
    for (t in listOf(s.subjectName, s.subjectId, s.subjectCode.orEmpty())) {
        if (t.isBlank()) continue
        RANKS[normaliseSubjectKey(t)]?.let { return it }
    }
    return UNRANKED
}

/**
 * The subjects in the school's order.
 *
 * Fully determined: equal ranks fall back to the stored sortOrder, then the
 * name, then the id, so two readings of the same list can never differ and a
 * sheet printed today has the columns of the one printed yesterday.
 */
fun sortSubjects(subjects: List<Subject>): List<Subject> =
    subjects.sortedWith(
        compareBy({ subjectRank(it) }, { it.sortOrder }, { it.subjectName }, { it.subjectId }),
    )
