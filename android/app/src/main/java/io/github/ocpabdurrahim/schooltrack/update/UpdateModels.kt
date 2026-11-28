package io.github.ocpabdurrahim.schooltrack.update

import org.json.JSONObject
import java.io.File

/**
 * Keeping the phone's copy up to date.
 *
 * The web app reloads itself when a new version is deployed (freshness.ts).
 * The phone cannot: it is an APK, installed by hand, and every version so far
 * has needed somebody at a desk with a cable. A school teacher does not have
 * a cable, so the app fetches its own new version and installs it.
 *
 * The pieces in THIS file are the ones worth testing on their own: which
 * release is newer, and what GitHub's answer actually said. The machinery
 * that downloads and installs is AppUpdater.kt, which cannot be tested
 * without a package installer.
 *
 * NO WEB TWIN. The web has the same problem and a different answer — it
 * reloads a page rather than replacing a program.
 */

/** The APK attached to a GitHub release. */
data class ReleaseInfo(
    val version: String,
    val apkUrl: String,
    /** Bytes, or -1 if unknown. */
    val size: Long,
    /** Lower-case hex SHA-256 that GitHub publishes for the asset, if any. */
    val sha256: String?,
    val notes: String,
)

sealed interface UpdateState {
    data object Idle : UpdateState
    data object Checking : UpdateState
    data class UpToDate(val checkedAt: Long) : UpdateState
    data class Downloading(val release: ReleaseInfo, val progress: Float) : UpdateState
    /** Downloaded and checked over; installs when the app is put down. */
    data class Ready(val release: ReleaseInfo, val file: File) : UpdateState
    data class Installing(val release: ReleaseInfo) : UpdateState
    data class Failed(val message: String) : UpdateState
}

object Versions {
    /**
     * Compares "1.10.2"-style versions part by part.
     *
     * Part by part, NOT as text: "1.10.0" is newer than "1.9.0", and a string
     * comparison says the opposite. A leading "v" and anything after a "-"
     * are ignored, so the tag v1.5.2 and the build 1.5.2-debug are the same
     * version.
     */
    fun compare(a: String, b: String): Int {
        val pa = parts(a)
        val pb = parts(b)
        for (i in 0 until maxOf(pa.size, pb.size)) {
            val d = pa.getOrElse(i) { 0 }.compareTo(pb.getOrElse(i) { 0 })
            if (d != 0) return d
        }
        return 0
    }

    private fun parts(v: String) =
        v.trim().removePrefix("v").substringBefore('-').split('.').map { it.toIntOrNull() ?: 0 }
}

object ReleaseParser {
    /**
     * GitHub's "latest release" JSON -> its APK, or null when it has none.
     *
     * Null rather than an exception for a release with no APK attached: a
     * release published for its notes alone is not a fault, it is simply not
     * an update, and the app should go quiet rather than show an error.
     */
    fun parse(json: String): ReleaseInfo? {
        val root = runCatching { JSONObject(json) }.getOrNull() ?: return null
        val tag = root.optString("tag_name")
        if (tag.isEmpty()) return null
        val assets = root.optJSONArray("assets") ?: return null
        for (i in 0 until assets.length()) {
            val asset = assets.getJSONObject(i)
            if (!asset.optString("name").endsWith(".apk")) continue
            val digest = asset.optString("digest")
            return ReleaseInfo(
                version = tag.removePrefix("v"),
                apkUrl = asset.getString("browser_download_url"),
                size = asset.optLong("size", -1),
                sha256 = if (digest.startsWith("sha256:")) {
                    digest.removePrefix("sha256:").lowercase()
                } else {
                    null
                },
                notes = root.optString("body"),
            )
        }
        return null
    }
}
