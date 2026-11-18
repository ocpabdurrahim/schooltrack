package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The SAME cases as web/src/data/sounds.test.ts. */
class SoundsTest {

    @Test
    fun bothSoundsAreTwoNotesSoNeitherIsASingleBlip() {
        assertEquals(2, SUCCESS_CHIME.size)
        assertEquals(2, ERROR_BUZZ.size)
    }

    @Test
    fun risesForAGoodScanAndFallsForABadOne() {
        assertTrue(SUCCESS_CHIME[1].freq > SUCCESS_CHIME[0].freq)
        assertTrue(ERROR_BUZZ[1].freq < ERROR_BUZZ[0].freq)
    }

    // The whole point: told apart in one hearing, by someone not listening.
    @Test
    fun keepsTheErrorWellBelowTheBell() {
        val lowestBell = SUCCESS_CHIME.minOf { it.freq }
        val highestBuzz = ERROR_BUZZ.maxOf { it.freq }
        assertTrue(lowestBell / highestBuzz > 4)
    }

    @Test
    fun keepsTheBellShortAndLetsTheErrorRingLonger() {
        assertTrue(totalMs(SUCCESS_CHIME) < 300)
        assertTrue(totalMs(ERROR_BUZZ) > totalMs(SUCCESS_CHIME))
    }

    // A gate takes a child every second or so. A sound that outlasts the next
    // scan would still be playing when the next one is due.
    @Test
    fun isOverBeforeTheNextChildCanBeScanned() {
        assertTrue(totalMs(SUCCESS_CHIME) < 1000)
        assertTrue(totalMs(ERROR_BUZZ) < 1000)
    }

    @Test
    fun neverAsksForAGainThatWouldClip() {
        for (n in SUCCESS_CHIME + ERROR_BUZZ) {
            assertTrue(n.gain > 0.0)
            assertTrue(n.gain <= 0.5)
        }
    }

    @Test
    fun measuresToTheEndOfTheLastNoteNotTheSumOfThem() {
        assertEquals(255, totalMs(SUCCESS_CHIME))
        assertEquals(0, totalMs(emptyList()))
    }

    @Test
    fun theEnvelopeIsSilentBeforeTheNoteAndAfterIt() {
        assertEquals(0.0, envelope(-1.0, 100), 0.0001)
        assertEquals(0.0, envelope(101.0, 100), 0.0001)
        assertEquals(0.0, envelope(0.0, 100), 0.0001)
    }

    @Test
    fun theEnvelopeReachesFullLoudnessQuicklyThenFades() {
        val peak = envelope(6.0, 100)
        assertTrue(peak > 0.7)
        assertTrue(envelope(50.0, 100) < peak)
        assertTrue(envelope(99.0, 100) < envelope(50.0, 100))
    }

    @Test
    fun theEnvelopeNeverGoesAboveOne() {
        for (ms in listOf(10, 100, 260)) {
            var t = 0.0
            while (t <= ms) {
                assertTrue(envelope(t, ms) <= 1.0)
                t += ms / 20.0
            }
        }
    }
}
