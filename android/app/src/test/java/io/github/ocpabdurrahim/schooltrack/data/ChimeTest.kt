package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The rendering itself, which the web gets from the browser and the phone has
 * to do by hand. A sound that clips is the one thing nobody can un-hear.
 */
class ChimeTest {

    private fun peak(pcm: ShortArray) = pcm.maxOf { Math.abs(it.toInt()) }

    @Test
    fun rendersASoundAsLongAsItsNotesSayPlusALittleTail() {
        val pcm = render(SUCCESS_CHIME)
        val expected = 44100 * (totalMs(SUCCESS_CHIME) + 40) / 1000
        assertEquals(expected, pcm.size)
    }

    @Test
    fun neitherSoundClips() {
        // Short.MAX_VALUE exactly would be the clamp doing its job; above it
        // is impossible, at it for long stretches would be a square wave of
        // pure distortion.
        assertTrue(peak(render(SUCCESS_CHIME)) <= Short.MAX_VALUE.toInt())
        assertTrue(peak(render(ERROR_BUZZ)) <= Short.MAX_VALUE.toInt())
    }

    @Test
    fun bothSoundsAreActuallyAudible() {
        // a tenth of full scale at least, or it is lost in a corridor
        assertTrue(peak(render(SUCCESS_CHIME)) > Short.MAX_VALUE / 10)
        assertTrue(peak(render(ERROR_BUZZ)) > Short.MAX_VALUE / 10)
    }

    @Test
    fun fadesToSilenceRatherThanStoppingDead() {
        // The last sample is what clicks if the envelope is wrong.
        for (pcm in listOf(render(SUCCESS_CHIME), render(ERROR_BUZZ))) {
            assertEquals(0, pcm.last().toInt())
        }
    }

    @Test
    fun leavesTheGapBetweenTheTwoBuzzesQuiet() {
        val pcm = render(ERROR_BUZZ)
        // 185ms is between the first buzz ending (160) and the second starting (210)
        val at = 44100 * 185 / 1000
        assertEquals(0, pcm[at].toInt())
    }

    @Test
    fun startsFromSilence() {
        for (pcm in listOf(render(SUCCESS_CHIME), render(ERROR_BUZZ))) {
            assertEquals(0, pcm.first().toInt())
        }
    }
}
