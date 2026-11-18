package io.github.ocpabdurrahim.schooltrack.data

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore

/**
 * Student photographs.
 *
 * The twin of web/src/data/photos.ts, down to the box and the cap. They live
 * in their own collection, `studentPhotos/<studentId>`, as a compressed JPEG
 * data URL rather than in the student record or in Cloud Storage -- see that
 * file for why.
 */

/** The box a photo is fitted inside, in pixels. */
const val PHOTO_MAX_W = 480
const val PHOTO_MAX_H = 600

/** What a stored data URL may weigh: about 90 KB of actual JPEG. */
const val PHOTO_MAX_BYTES = 120_000

/** Tried in order until one comes in under the cap. */
val PHOTO_QUALITY_STEPS = listOf(82, 70, 60, 50, 40)

data class PhotoSize(val width: Int, val height: Int)

/**
 * The size an image becomes when fitted inside the box.
 *
 * Never upscales: a 200px passport scan stays 200px rather than being blown
 * up to 480 and printed soft.
 */
fun fitWithin(w: Int, h: Int, maxW: Int = PHOTO_MAX_W, maxH: Int = PHOTO_MAX_H): PhotoSize {
    if (w <= 0 || h <= 0) return PhotoSize(0, 0)
    val scale = minOf(maxW.toDouble() / w, maxH.toDouble() / h, 1.0)
    return PhotoSize(
        width = maxOf(1, Math.round(w * scale).toInt()),
        height = maxOf(1, Math.round(h * scale).toInt()),
    )
}

/** Roughly what a data URL weighs in bytes, from its base64 payload. */
fun dataUrlBytes(dataUrl: String): Int {
    val comma = dataUrl.indexOf(',')
    if (comma < 0) return 0
    val body = dataUrl.substring(comma + 1)
    val padding = when {
        body.endsWith("==") -> 2
        body.endsWith("=") -> 1
        else -> 0
    }
    return maxOf(0, body.length * 3 / 4 - padding)
}

fun photoTooBig(dataUrl: String): Boolean = dataUrlBytes(dataUrl) > PHOTO_MAX_BYTES

class PhotosRepository(
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
) {
    private fun photos() =
        db.collection("schools").document(SCHOOL_ID).collection("studentPhotos")

    suspend fun get(studentId: String): String? =
        photos().document(studentId).get().await().getString("jpeg")

    suspend fun save(studentId: String, jpeg: String, by: String) {
        require(!photoTooBig(jpeg)) { "That photo is too large to store." }
        photos().document(studentId).set(
            mapOf(
                "jpeg" to jpeg,
                "bytes" to dataUrlBytes(jpeg),
                "updatedBy" to by,
                "updatedAt" to FieldValue.serverTimestamp(),
            ),
        ).await()
    }

    suspend fun remove(studentId: String) {
        photos().document(studentId).delete().await()
    }
}
