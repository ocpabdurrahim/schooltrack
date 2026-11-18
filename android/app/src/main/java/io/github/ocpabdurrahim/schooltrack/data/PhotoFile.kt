package io.github.ocpabdurrahim.schooltrack.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.util.Base64
import androidx.exifinterface.media.ExifInterface
import java.io.ByteArrayOutputStream

/**
 * Turning the picture somebody picked out of the gallery into something a
 * card can carry.
 *
 * The Android half of Photos.kt -- bitmaps and EXIF, so it sits apart from
 * the rules it follows, which are plain arithmetic and tested.
 */

/**
 * A picked image as a JPEG data URL inside the size cap.
 *
 * Decoded in two passes: the first only reads the header for the real size,
 * so a 12-megapixel photo is never fully decoded into memory just to be
 * thrown away -- that is how a phone with a decent camera runs a school app
 * out of heap.
 *
 * Quality is stepped down rather than the picture being shrunk further: a
 * slightly softer 480px photo prints better on a 23mm box than a sharp 200px
 * one blown up to fill it.
 */
fun uriToCardPhoto(context: Context, uri: Uri): String {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    context.contentResolver.openInputStream(uri).use {
        BitmapFactory.decodeStream(it, null, bounds)
    }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
        throw IllegalArgumentException("That image could not be read.")
    }

    val target = fitWithin(bounds.outWidth, bounds.outHeight)
    val opts = BitmapFactory.Options().apply {
        // a power-of-two pre-shrink while decoding, then the exact scale below
        inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight, target.width, target.height)
    }
    val decoded = context.contentResolver.openInputStream(uri).use {
        BitmapFactory.decodeStream(it, null, opts)
    } ?: throw IllegalArgumentException("That image could not be read.")

    val upright = applyExif(context, uri, decoded)
    val scaled = Bitmap.createScaledBitmap(upright, target.width, target.height, true)

    for (quality in PHOTO_QUALITY_STEPS) {
        val out = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.JPEG, quality, out)
        val url = "data:image/jpeg;base64," +
            Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
        if (!photoTooBig(url)) return url
    }
    throw IllegalArgumentException("That photo is too detailed to store. Try a smaller crop.")
}

internal fun sampleSize(w: Int, h: Int, targetW: Int, targetH: Int): Int {
    var sample = 1
    while (w / (sample * 2) >= targetW && h / (sample * 2) >= targetH) sample *= 2
    return sample
}

/**
 * A photo taken on a phone held upright is usually stored on its side with a
 * flag saying so. Without this every portrait arrives lying down.
 */
private fun applyExif(context: Context, uri: Uri, bitmap: Bitmap): Bitmap {
    val orientation = try {
        context.contentResolver.openInputStream(uri).use { stream ->
            stream?.let {
                ExifInterface(it).getAttributeInt(
                    ExifInterface.TAG_ORIENTATION,
                    ExifInterface.ORIENTATION_NORMAL,
                )
            } ?: ExifInterface.ORIENTATION_NORMAL
        }
    } catch (_: Exception) {
        ExifInterface.ORIENTATION_NORMAL
    }

    val m = Matrix()
    when (orientation) {
        ExifInterface.ORIENTATION_ROTATE_90 -> m.postRotate(90f)
        ExifInterface.ORIENTATION_ROTATE_180 -> m.postRotate(180f)
        ExifInterface.ORIENTATION_ROTATE_270 -> m.postRotate(270f)
        ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> m.postScale(-1f, 1f)
        ExifInterface.ORIENTATION_FLIP_VERTICAL -> m.postScale(1f, -1f)
        else -> return bitmap
    }
    return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, m, true)
}

/** A stored data URL back into something Compose can draw. */
fun decodePhoto(dataUrl: String): Bitmap? = runCatching {
    val comma = dataUrl.indexOf(',')
    if (comma < 0) return null
    val bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT)
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
}.getOrNull()
