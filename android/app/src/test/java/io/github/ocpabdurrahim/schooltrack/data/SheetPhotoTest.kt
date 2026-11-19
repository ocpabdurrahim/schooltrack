package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The SAME cases exist in web/src/data/sheetphoto.test.ts. */
class SheetPhotoTest {

    @Test
    fun `caps the long edge, whichever edge that is`() {
        assertEquals(SHEET_LONG_EDGE to 1650, fitSheet(4000, 3000))
        assertEquals(1650 to SHEET_LONG_EDGE, fitSheet(3000, 4000))
    }

    @Test
    fun `never scales a small photograph UP`() {
        // Enlarging invents detail that is not there and gives the reader more
        // pixels to be confident about.
        assertEquals(1200 to 900, fitSheet(1200, 900))
    }

    @Test
    fun `leaves a photograph already at the cap alone`() {
        assertEquals(SHEET_LONG_EDGE to 1400, fitSheet(SHEET_LONG_EDGE, 1400))
    }

    @Test
    fun `keeps the shape of the page, so a form is not squashed`() {
        val (w, h) = fitSheet(4080, 3060)
        assertEquals(4080.0 / 3060.0, w.toDouble() / h.toDouble(), 0.01)
    }

    @Test
    fun `never returns a zero edge, which would be an unreadable picture`() {
        assertEquals(SHEET_LONG_EDGE to 1, fitSheet(10_000, 3))
    }

    @Test
    fun `copes with an empty picture rather than dividing by zero`() {
        assertEquals(0 to 0, fitSheet(0, 0))
    }

    // ------------------------------------------- decoding at a sensible size

    @Test
    fun `decodes a huge photograph down in powers of two`() {
        // A 12-megapixel picture must not become a 12-megapixel bitmap on a
        // cheap handset on its way to being a 2200px one.
        assertTrue(sheetSampleSize(4000, 3000) >= 1)
        assertEquals(1, sheetSampleSize(2200, 1650))
        assertEquals(1, sheetSampleSize(100, 100))
    }

    @Test
    fun `never samples so far that the sheet drops below the cap`() {
        for ((w, h) in listOf(4000 to 3000, 8000 to 6000, 3000 to 4000, 12_000 to 9000)) {
            val sampled = maxOf(w, h) / sheetSampleSize(w, h)
            assertTrue("$w x $h fell to $sampled", sampled >= SHEET_LONG_EDGE)
        }
    }

    // ----------------------------------------------- how big it is on the wire

    @Test
    fun `reads megabytes off the base64, three bytes in every four characters`() {
        assertEquals(3.0, sheetMegabytes("A".repeat(4_000_000)), 0.00001)
        assertEquals(0.0, sheetMegabytes(""), 0.0)
    }

    @Test
    fun `labels it the way it is shown beside the photograph`() {
        assertEquals("1.4 MB", sheetSizeLabel("A".repeat(1_866_666)))
    }

    @Test
    fun `a sheet at the cap is a real upload, not a rounding error`() {
        // The point of showing it: on a weak line this is the slow part, and
        // it is worth a teacher seeing the number before spending two minutes.
        assertTrue(sheetMegabytes("A".repeat(2_000_000)) > 1.0)
    }
}
