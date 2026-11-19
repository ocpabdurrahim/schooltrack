package io.github.ocpabdurrahim.schooltrack.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.util.Base64
import androidx.core.content.FileProvider
import androidx.exifinterface.media.ExifInterface
import java.io.ByteArrayOutputStream
import java.io.File

/**
 * Turning a photographed mark sheet into something small enough to send.
 *
 * The opposite problem to Photos.kt, which shrinks a portrait to fit on an ID
 * card. Here the picture IS the data: shrink it too far and a 2 becomes a 7.
 * So the long edge is kept generous and the quality high, and the only thing
 * actually thrown away is the slack in a modern phone camera, where a sheet of
 * A4 arrives at 4000px and reads no better than at 2200.
 *
 * The twin of web/src/data/sheetphoto.ts.
 */

/** Long edge, in pixels, of the picture that is sent to be read. */
const val SHEET_LONG_EDGE = 2200

/** High: this is handwriting, and JPEG artefacts land on the thin strokes. */
const val SHEET_QUALITY = 92

data class SheetShot(
    val mimeType: String,
    /** Base64 of the JPEG, with no data: prefix — the API wants the bare bytes. */
    val base64: String,
    val bitmap: Bitmap,
    val width: Int,
    val height: Int,
)

/** The size to draw at: never bigger than it came, never longer than the cap. */
fun fitSheet(width: Int, height: Int): Pair<Int, Int> {
    val long = maxOf(width, height)
    if (long == 0) return 0 to 0
    // Never scaled UP: enlarging a small photo invents detail that is not
    // there, and gives the reader more pixels to be confident about.
    val scale = minOf(1.0, SHEET_LONG_EDGE.toDouble() / long)
    return maxOf(1, Math.round(width * scale).toInt()) to
        maxOf(1, Math.round(height * scale).toInt())
}

/**
 * The power-of-two shrink to decode at, so a 12-megapixel photograph never
 * becomes a 12-megapixel bitmap on a cheap handset on its way to being a
 * 2200px one.
 */
fun sheetSampleSize(width: Int, height: Int): Int {
    var sample = 1
    while (maxOf(width, height) / (sample * 2) >= SHEET_LONG_EDGE) sample *= 2
    return sample
}

/**
 * Reads the picked photograph, turns it the right way up and scales it down.
 *
 * A sheet photographed on a phone held upright is stored sideways with an EXIF
 * flag saying so. Sent without this, the reader is handed a page on its side —
 * which it will gamely try to read.
 */
fun uriToSheetShot(context: Context, uri: Uri): SheetShot {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    context.contentResolver.openInputStream(uri).use {
        BitmapFactory.decodeStream(it, null, bounds)
    }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
        throw IllegalStateException("That photograph could not be read.")
    }

    val opts = BitmapFactory.Options().apply {
        inSampleSize = sheetSampleSize(bounds.outWidth, bounds.outHeight)
    }
    val decoded = context.contentResolver.openInputStream(uri).use {
        BitmapFactory.decodeStream(it, null, opts)
    } ?: throw IllegalStateException("That photograph could not be read.")

    val turned = context.contentResolver.openInputStream(uri).use { stream ->
        if (stream == null) decoded else applySheetExif(decoded, ExifInterface(stream))
    }

    val (w, h) = fitSheet(turned.width, turned.height)
    val scaled = if (w == turned.width && h == turned.height) turned
    else Bitmap.createScaledBitmap(turned, w, h, true)

    val out = ByteArrayOutputStream()
    scaled.compress(Bitmap.CompressFormat.JPEG, SHEET_QUALITY, out)
    return SheetShot(
        mimeType = "image/jpeg",
        base64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP),
        bitmap = scaled,
        width = w,
        height = h,
    )
}

/**
 * Somewhere for the camera app to put the photograph it is about to take.
 *
 * It has to be a content:// Uri from our own FileProvider — handing another
 * app a file:// path has been refused since Android 7 — and it has to exist
 * before the camera is launched, because the camera writes into it rather
 * than handing anything back.
 */
fun newSheetPhotoUri(context: Context): Uri {
    val dir = File(context.cacheDir, "sheets").apply { mkdirs() }
    val file = File(dir, "sheet-${System.currentTimeMillis()}.jpg")
    file.createNewFile()
    return FileProvider.getUriForFile(context, "${context.packageName}.photos", file)
}

/**
 * Throws the file away once it has been read.
 *
 * The picture is held in memory from then on, and what is on it is a whole
 * section's marks — it has no business sitting in the cache afterwards, and a
 * term of photographed sheets would quietly fill the phone.
 */
fun discardSheetPhoto(context: Context, uri: Uri) {
    runCatching { context.contentResolver.delete(uri, null, null) }
}

private fun applySheetExif(bitmap: Bitmap, exif: ExifInterface): Bitmap {
    val m = Matrix()
    when (exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
        ExifInterface.ORIENTATION_ROTATE_90 -> m.postRotate(90f)
        ExifInterface.ORIENTATION_ROTATE_180 -> m.postRotate(180f)
        ExifInterface.ORIENTATION_ROTATE_270 -> m.postRotate(270f)
        ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> m.postScale(-1f, 1f)
        ExifInterface.ORIENTATION_FLIP_VERTICAL -> m.postScale(1f, -1f)
        else -> return bitmap
    }
    return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, m, true)
}

/**
 * How big this picture is on the wire, in megabytes.
 *
 * Shown beside the photograph because the upload is the slow part of reading
 * a sheet, and a teacher on a weak line should be able to see that before
 * spending two minutes finding out.
 *
 * Base64 carries three bytes in every four characters.
 */
fun sheetMegabytes(base64: String): Double = base64.length * 3.0 / 4.0 / 1_000_000.0

/** The same, rounded the way it is shown. */
fun sheetSizeLabel(base64: String): String = "%.1f MB".format(sheetMegabytes(base64))
