package io.github.ocpabdurrahim.schooltrack.data

/**
 * Short names for the columns of a tabulation sheet.
 *
 * A sheet is read sideways across a page: "BANGLADESH AND GLOBAL STUDIES"
 * cannot be a column heading, and truncating it to ten letters gives
 * "BANGLADESH", which is also what Bangla truncates to.
 *
 * The board's own subject codes would do this job, but a school fills those in
 * slowly and three of this one's subjects have none, so the name is the source
 * and the code is not needed.
 *
 * The twin of web/src/data/shortnames.ts.
 */

/** The ones a Bangladeshi secondary school writes a particular way. */
private val KNOWN: List<Pair<Regex, String>> = listOf(
    Regex("""\bISLAM""") to "ISL",
    Regex("""\bHINDU""") to "HIN",
    Regex("""\bCHRIST""") to "CHR",
    Regex("""\bBUDDH""") to "BUD",
    Regex("""\bHIGHER\s+MATH""") to "H.MATH",
    Regex("""\bINFORMATION\s+AND\s+COMMUNICATION|^ICT\b""") to "ICT",
)

/** First words that have a settled abbreviation of their own. */
private val FIRST = mapOf(
    "BANGLA" to "BAN",
    "BENGALI" to "BAN",
    "ENGLISH" to "ENG",
    "MATHEMATICS" to "MATH",
    "MATHS" to "MATH",
    "MATH" to "MATH",
    "PHYSICS" to "PHY",
    "CHEMISTRY" to "CHEM",
    "BIOLOGY" to "BIO",
    "GEOGRAPHY" to "GEO",
    "SCIENCE" to "SCI",
    "HISTORY" to "HIST",
    "ACCOUNTING" to "ACC",
    "AGRICULTURE" to "AGRI",
    "AGRICULTURAL" to "AGRI",
    "CIVICS" to "CIV",
    "ECONOMICS" to "ECON",
    "CAREER" to "CAREER",
)

/**
 * Words that carry no meaning in an abbreviation.
 *
 * Deliberately only the joining words. "Studies" looked like noise until
 * BANGLADESH AND GLOBAL STUDIES came out as BG, which is not what the board
 * calls it — the S belongs to BGS. "Education" goes the same way: dropping it
 * turns PHYSICAL EDUCATION into PHYS instead of PE.
 */
private val SKIP = setOf("AND", "OF", "THE", "FOR", "&")

/**
 * One subject's short name.
 *
 * In order: the handful a school writes a particular way, then a settled
 * abbreviation for the first word, then the initials of the words that carry
 * meaning — which is where BANGLADESH AND GLOBAL STUDIES becomes BGS and
 * FINANCE AND BANKING becomes FB.
 */
fun shortName(subjectName: String?): String {
    val name = subjectName.orEmpty().uppercase()
        .map { if (it.isLetterOrDigit() || it == '&' || it == '.' || it == ' ') it else ' ' }
        .joinToString("").trim()
    if (name.isEmpty()) return "?"

    for ((pattern, short) in KNOWN) if (pattern.containsMatchIn(name)) return short

    val words = name.split(Regex("""\s+""")).filter { it.isNotEmpty() }
    FIRST[words[0]]?.let { return it }

    val meaty = words.filter { it !in SKIP }
    if (meaty.size >= 2) return meaty.map { it[0] }.joinToString("").take(5)

    val one = meaty.firstOrNull() ?: words[0]
    return if (one.length <= 4) one else one.take(4)
}

/**
 * Short names for a whole sheet, each one different from the others.
 *
 * Two columns headed the same are worse than two long headings: the marks
 * under them cannot be told apart. A clash takes more of the subject's name
 * until it is its own, and only then falls back to a number.
 */
fun shortNames(subjectNames: List<String>): List<String> {
    val used = mutableSetOf<String>()
    return subjectNames.map { name ->
        val wanted = shortName(name)
        if (used.add(wanted)) {
            wanted
        } else {
            val letters = name.uppercase().filter { it.isLetterOrDigit() }
            var chosen: String? = null
            for (n in wanted.length + 1..letters.length) {
                val longer = letters.take(n)
                if (longer !in used) { chosen = longer; break }
            }
            if (chosen == null) {
                var n = 2
                while ("$wanted$n" in used) n += 1
                chosen = "$wanted$n"
            }
            used.add(chosen)
            chosen
        }
    }
}
