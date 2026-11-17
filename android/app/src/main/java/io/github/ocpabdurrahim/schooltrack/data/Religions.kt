package io.github.ocpabdurrahim.schooltrack.data

/**
 * A student's religion, because it decides which religion paper they sit.
 *
 * The three the APEX app allows, in its own order and spelling — its
 * students_info table carries `CHECK (religion IN ('Islam','Hindu','Other'))`
 * and the column is NOT NULL, so every record mirrored from there arrives with
 * one of these.
 *
 * "Other" is a real answer, not a missing one: a student recorded as Other
 * sits NEITHER religion paper, which is exactly what enroll_student_subjects
 * does in Oracle.
 *
 * The twin of web/src/data/religions.ts.
 */
val RELIGIONS = listOf("Islam", "Hindu", "Other")

/** Spellings that turn up in the office's own lists, as letters only. */
private val ALIASES = mapOf(
    "islam" to "Islam",
    "islami" to "Islam",
    "islamic" to "Islam",
    "muslim" to "Islam",
    "musilm" to "Islam",
    "mussalman" to "Islam",
    "hindu" to "Hindu",
    "hinduism" to "Hindu",
    "hindhu" to "Hindu",
    "sanatan" to "Hindu",
    "hindureligion" to "Hindu",
    "other" to "Other",
    "others" to "Other",
    "christian" to "Other",
    "christianity" to "Other",
    "buddhist" to "Other",
    "buddhism" to "Other",
    "buddha" to "Other",
)

/**
 * The proper name for a religion however somebody wrote it: "muslim",
 * "ISLAM" and "Islami" all land on Islam, and Christian and Buddhist land on
 * Other, which is the only place the school's own table has for them.
 *
 * Anything it does not recognise comes back trimmed but otherwise untouched —
 * the record belongs to the school, and a word we have not thought of is
 * likelier to be theirs than to be a mistake.
 */
fun normalReligion(raw: String?): String {
    val v = raw.orEmpty().trim()
    if (v.isEmpty()) return ""
    return ALIASES[v.lowercase().filter { it in 'a'..'z' }] ?: v
}

/**
 * What the religion picker offers: the three, and after them whatever is
 * already on this record when it is something else.
 *
 * Without that last part, opening an older record in the form and saving it
 * would quietly wipe a religion the picker had no option for.
 */
fun religionOptions(stored: String?): List<String> {
    val v = normalReligion(stored)
    return if (v.isEmpty() || v in RELIGIONS) RELIGIONS else RELIGIONS + v
}
