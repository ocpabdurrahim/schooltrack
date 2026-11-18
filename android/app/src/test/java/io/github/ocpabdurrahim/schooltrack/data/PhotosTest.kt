package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The SAME cases as web/src/data/photos.test.ts. */
class PhotosTest {

    @Test
    fun shrinksABigPortraitPhotoToTheHeightOfTheBox() {
        // 3000 x 4000 is what a phone camera gives: 4:3 upright.
        assertEquals(PhotoSize(450, 600), fitWithin(3000, 4000))
    }

    @Test
    fun shrinksABigLandscapePhotoToTheWidthOfTheBox() {
        assertEquals(PhotoSize(480, 360), fitWithin(4000, 3000))
    }

    @Test
    fun keepsASquareSquare() {
        assertEquals(PhotoSize(480, 480), fitWithin(2000, 2000))
    }

    // A 200px passport scan blown up to 480 prints soft, and the softness is
    // the first thing anyone notices on a laminated card.
    @Test
    fun neverEnlargesAPhotoAlreadySmallerThanTheBox() {
        assertEquals(PhotoSize(200, 250), fitWithin(200, 250))
    }

    @Test
    fun neverReturnsAZeroSideForAVeryLongThinImage() {
        assertTrue(fitWithin(5000, 3).height >= 1)
    }

    @Test
    fun givesNothingBackForABrokenImage() {
        assertEquals(PhotoSize(0, 0), fitWithin(0, 100))
        assertEquals(PhotoSize(0, 0), fitWithin(-5, 100))
    }

    @Test
    fun readsThreeBytesOutOfEveryFourCharacters() {
        assertEquals(3, dataUrlBytes("data:image/jpeg;base64,AAAA"))
        assertEquals(6, dataUrlBytes("data:image/jpeg;base64,AAAAAAAA"))
    }

    @Test
    fun allowsForPadding() {
        assertEquals(2, dataUrlBytes("data:image/jpeg;base64,AAA="))
        assertEquals(1, dataUrlBytes("data:image/jpeg;base64,AA=="))
    }

    @Test
    fun isZeroForSomethingThatIsNotADataUrl() {
        assertEquals(0, dataUrlBytes(""))
        assertEquals(0, dataUrlBytes("https://example.test/photo.jpg"))
    }

    private fun ofBytes(n: Int) =
        "data:image/jpeg;base64," + "A".repeat(Math.ceil(n * 4.0 / 3.0).toInt())

    @Test
    fun passesAPhotoInsideTheCapAndRefusesOneOverIt() {
        assertFalse(photoTooBig(ofBytes(119_000)))
        assertTrue(photoTooBig(ofBytes(121_000)))
    }
}
