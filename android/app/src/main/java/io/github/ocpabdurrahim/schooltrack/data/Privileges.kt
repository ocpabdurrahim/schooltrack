package io.github.ocpabdurrahim.schooltrack.data

import kotlin.math.floor

/**
 * A student's fee privilege: what the school has agreed they pay, standing.
 *
 * Four arrangements, the office's own words:
 *
 *   Regular       no waiver, the card rate
 *   Scholarship   no tuition fee
 *   Donor family  no tuition fee
 *   Half fee      50% off tuition
 *
 * Scholarship and Donor family cost the same money on purpose. They are kept
 * apart because the REASON differs, and a school that cannot say how many of
 * its free places are scholarships cannot answer for them.
 *
 * A PRIVILEGE IS NOT A DISCOUNT, and this is the distinction the whole file
 * rests on. A discount is typed by the collector on one receipt and belongs to
 * that receipt. A privilege changes the rate the student is charged, every
 * period, until the office changes it. Conflating them would subtract a
 * waiver twice -- once as a lower charge and again as an allowance recorded on
 * the receipt -- which is how a half-fee student ends up owing nothing at all.
 *
 * ONLY TUITION IS WAIVED. Session, admission, exam, registration, lab and fine
 * are charged in full to everybody: a free place is free of tuition, not of
 * the exam the board charges for.
 *
 * The twin of web/src/data/privileges.ts, and the two must agree to the taka.
 */

/** The four, in the order the pickers show them. */
val PRIVILEGES = listOf("Regular", "Scholarship", "Donor family", "Half fee")

/**
 * The head a privilege touches.
 *
 * The app builds a head's id from its code, and the school's monthly
 * tuition head is TUITION -- checked against the live rate card, which
 * also carries ADMISSION, EXAM, FINE, LABFEE, REGISTRATION and SESSION.
 */
const val TUITION_HEAD = "TUITION"

/** Percent of the tuition rate each arrangement waives. */
private val WAIVER = mapOf(
    "Regular" to 0,
    "Scholarship" to 100,
    "Donor family" to 100,
    "Half fee" to 50,
)

/** How each one reads to whoever is collecting the money. */
private val EXPLAIN = mapOf(
    "Regular" to "no waiver — the full rate",
    "Scholarship" to "no tuition fee",
    "Donor family" to "no tuition fee",
    "Half fee" to "50% off tuition",
)

/** Spellings that turn up in the office's own lists, as letters only. */
private val ALIASES = mapOf(
    "" to "Regular",
    "regular" to "Regular",
    "normal" to "Regular",
    "none" to "Regular",
    "nil" to "Regular",
    "full" to "Regular",
    "fullfee" to "Regular",
    "nowaiver" to "Regular",
    "scholarship" to "Scholarship",
    "scholar" to "Scholarship",
    "stipend" to "Scholarship",
    "britti" to "Scholarship",
    "donor" to "Donor family",
    "donorfamily" to "Donor family",
    "donors" to "Donor family",
    "free" to "Donor family",
    "freestudent" to "Donor family",
    "notuition" to "Donor family",
    "notuitionfee" to "Donor family",
    "half" to "Half fee",
    "halffee" to "Half fee",
    "halffree" to "Half fee",
    "fiftypercent" to "Half fee",
    "50" to "Half fee",
)

/**
 * The proper name for an arrangement however somebody wrote it.
 *
 * BLANK MEANS REGULAR, unlike religion, where blank means nobody has said.
 * Every student already on the roll was added before this field existed
 * and is charged the full rate today; reading their blank as anything else
 * would silently waive fees nobody agreed to waive.
 */
fun normalPrivilege(raw: String?): String {
    val v = (raw ?: "").trim()
    val key = v.lowercase().filter { it.isLetterOrDigit() }
    return ALIASES[key] ?: v
}

/**
 * What the picker offers: the four, and after them whatever is already on
 * this record when it is something else.
 */
fun privilegeOptions(stored: String?): List<String> {
    val v = normalPrivilege(stored)
    return if (v.isNotEmpty() && v !in PRIVILEGES) PRIVILEGES + v else PRIVILEGES
}

/** Percent of tuition waived, 0 for anything unrecognised. */
fun tuitionWaiverPercent(privilege: String?): Int = WAIVER[normalPrivilege(privilege)] ?: 0

/** The sentence beside the picker, and on the collect screen. */
fun explainPrivilege(privilege: String?): String =
    EXPLAIN[normalPrivilege(privilege)] ?: "no waiver — the full rate"

/**
 * The taka waived on one period of one head.
 *
 * Rounded to the whole taka, and the odd taka goes to the WAIVER rather
 * than to the bill: half of 175 is 88 off, 87 to pay. `floor(x + 0.5)`
 * rather than `round`, so this rounds the way JavaScript's Math.round
 * does and the twin cannot disagree with the web app by a taka.
 */
fun waiverOn(feeHeadId: String, rate: Double?, privilege: String?): Double {
    if (feeHeadId != TUITION_HEAD) return 0.0
    if (rate == null || !rate.isFinite() || rate <= 0.0) return 0.0
    val pct = tuitionWaiverPercent(privilege)
    if (pct <= 0) return 0.0
    if (pct >= 100) return rate
    return floor(rate * pct / 100.0 + 0.5)
}

/** What this student is actually charged for one period of one head. */
fun netRate(feeHeadId: String, rate: Double?, privilege: String?): Double {
    if (rate == null || !rate.isFinite()) return 0.0
    return (rate - waiverOn(feeHeadId, rate, privilege)).coerceAtLeast(0.0)
}
