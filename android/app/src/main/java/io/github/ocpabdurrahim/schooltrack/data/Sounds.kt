package io.github.ocpabdurrahim.schooltrack.data

import kotlin.math.exp
import kotlin.math.min

/**
 * What the gate sounds like.
 *
 * The twin of web/src/data/sounds.ts, note for note. A teacher who learns the
 * two sounds on the phone should not have to learn them again on the web.
 *
 * The scanner is used in a doorway with a queue of children pushing past it:
 * nobody is watching the screen, so the sound IS the answer. Rising-and-bright
 * against low-and-flat survives a noisy corridor and a cheap phone speaker far
 * better than two tones at different pitches.
 */

data class Note(
    val freq: Double,   // Hz
    val at: Int,        // ms from the start of the sound
    val ms: Int,
    val gain: Double,   // 0..1, before the decay envelope
)

/** C6 then G6: a rising fifth, which is what a bell pull sounds like. */
val SUCCESS_CHIME = listOf(
    Note(freq = 1047.0, at = 0, ms = 110, gain = 0.22),
    Note(freq = 1568.0, at = 85, ms = 170, gain = 0.22),
)

/** Two low buzzes with a gap, so it cannot be mistaken for the bell even
 *  heard through a pocket. */
val ERROR_BUZZ = listOf(
    Note(freq = 196.0, at = 0, ms = 160, gain = 0.3),
    Note(freq = 165.0, at = 210, ms = 260, gain = 0.3),
)

/** How long a sound lasts altogether, including the gap before its last note. */
fun totalMs(notes: List<Note>): Int = notes.fold(0) { end, n -> maxOf(end, n.at + n.ms) }

/**
 * The loudness of a note part-way through, as a fraction of its gain.
 *
 * A note that simply stops clicks; one that fades sounds like an instrument.
 * The same curve as the web's, so the two really are one sound.
 */
fun envelope(elapsedMs: Double, ms: Int): Double {
    if (elapsedMs < 0 || elapsedMs > ms) return 0.0
    val t = elapsedMs / ms
    val attack = min(1.0, t / 0.06)
    return attack * exp(-4.0 * t)
}
