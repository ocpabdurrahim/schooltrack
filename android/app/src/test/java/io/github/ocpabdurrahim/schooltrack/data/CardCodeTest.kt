package io.github.ocpabdurrahim.schooltrack.data

import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.EncodeHintType
import com.google.zxing.LuminanceSource
import com.google.zxing.common.BitMatrix
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * THE ID CARD MUST SCAN.
 *
 * The card's QR is written from the student number and read back by the gate
 * scanner — two separate pieces of code that nothing else checks agree. This
 * encodes a card exactly as `qrBitmap` does, decodes it, and feeds the result
 * through the scanner's own parser.
 *
 * The web app has the same test in web/src/data/documents.test.ts.
 *
 * `qrBitmap` itself cannot be called here because android.graphics.Bitmap is
 * a stub in plain JVM tests, so this works on the matrix the writer produces,
 * with the same hints.
 */
class CardCodeTest {

    /** A LuminanceSource over a BitMatrix — zxing ships no JVM one outside javase. */
    private class MatrixSource(private val m: BitMatrix) :
        LuminanceSource(m.width, m.height) {
        override fun getRow(y: Int, row: ByteArray?): ByteArray {
            val out = if (row != null && row.size >= width) row else ByteArray(width)
            for (x in 0 until width) out[x] = if (m.get(x, y)) 0 else 255.toByte()
            return out
        }

        override fun getMatrix(): ByteArray {
            val out = ByteArray(width * height)
            for (y in 0 until height) {
                for (x in 0 until width) {
                    out[y * width + x] = if (m.get(x, y)) 0 else 255.toByte()
                }
            }
            return out
        }
    }

    private fun roundTrip(text: String): String {
        val hints = mapOf(
            EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M,
            EncodeHintType.MARGIN to 1,
        )
        val matrix = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, 512, 512, hints)
        val bitmap = BinaryBitmap(HybridBinarizer(MatrixSource(matrix)))
        return QRCodeReader().decode(bitmap).text
    }

    @Test
    fun cardQrDecodesBackToTheCardCode() {
        for (id in listOf("76", "94", "1", "1234", "999999")) {
            val text = cardCode(id)
            assertEquals(text, roundTrip(text))
        }
    }

    @Test
    fun theDecodedCodeIsOneTheGateScannerAccepts() {
        val decoded = roundTrip(cardCode("76"))
        assertEquals("76", parseCardCode(decoded))
    }

    @Test
    fun theScannerAlsoTakesABareNumberTypedByHand() {
        assertEquals("76", parseCardCode("76"))
        assertEquals("76", parseCardCode("  sms-stu-76 "))
        assertNull(parseCardCode("not a card"))
        assertNull(parseCardCode("SMS-STU-"))
    }
}
