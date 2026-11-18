package io.github.ocpabdurrahim.schooltrack.data

/**
 * The groups a secondary school streams classes 9 and 10 into — the same three
 * the APEX app seeds into its `groups` table (SCI / HUM / BUS), in that order.
 *
 * Classes 6 to 8 have no group at all, which is why every picker built from
 * this list keeps a blank option at the top. A blank group is a real answer
 * here, not a missing one.
 *
 * The twin of web/src/data/groups.ts.
 */
val GROUPS = listOf("Science", "Humanities", "Business Studies")

/** Spellings that turn up in the office's own lists, as letters only. */
private val ALIASES = mapOf(
    "science" to "Science",
    "sci" to "Science",
    "sciencegroup" to "Science",
    "humanities" to "Humanities",
    "humanity" to "Humanities",
    "hum" to "Humanities",
    "arts" to "Humanities",
    "art" to "Humanities",
    "humanitiesgroup" to "Humanities",
    "artsgroup" to "Humanities",
    "businessstudies" to "Business Studies",
    "business" to "Business Studies",
    "businessstudiesgroup" to "Business Studies",
    "businessgroup" to "Business Studies",
    "bus" to "Business Studies",
    "commerce" to "Business Studies",
    "commercegroup" to "Business Studies",
)

/**
 * The proper name for a group however somebody wrote it: "sci", "COMMERCE" and
 * "Business group" all land on one of the three above.
 *
 * Anything it does not recognise comes back trimmed but otherwise untouched.
 * That is deliberate — the record belongs to the school, and a group name we
 * have not thought of is likelier to be theirs than to be a mistake.
 */
fun normalGroup(raw: String?): String {
    val v = raw.orEmpty().trim()
    if (v.isEmpty()) return ""
    return ALIASES[v.lowercase().filter { it in 'a'..'z' }] ?: v
}

/**
 * What the group picker offers: the three groups, and after them whatever is
 * already on this record when it is something else.
 *
 * Without that last part, opening an older record in the form and saving it
 * would quietly wipe a group the picker had no option for — the same trap the
 * section picker avoids by keeping retired sections in its list.
 */
fun groupOptions(stored: String?): List<String> {
    val v = normalGroup(stored)
    return if (v.isEmpty() || v in GROUPS) GROUPS else GROUPS + v
}

/**
 * The stream in three letters, for a column on a sheet that has no room for
 * "Business Studies".
 *
 * A tabulation sheet needs it because a slot column headed PHY/CIV holds
 * Physics on one row and Civics on the next, and the mark alone does not say
 * which — the stream does.
 */
fun shortGroup(stored: String?): String {
    val v = normalGroup(stored)
    return when {
        v.isEmpty() -> ""
        v == "Business Studies" -> "Bus"
        else -> v.take(3)
    }
}
