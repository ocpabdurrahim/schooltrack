package io.github.ocpabdurrahim.schooltrack.update

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * No web twin: the web reloads a page, the phone replaces a program.
 *
 * These two decide whether a phone installs something, so they are worth
 * pinning on their own — the rest of the updater cannot run without a package
 * installer and a real APK.
 */
class UpdateModelsTest {

    // --- which version is newer --------------------------------------------

    @Test
    fun `compares part by part, not as text`() {
        // The one that matters: as text, "1.10.0" sorts BELOW "1.9.0", and a
        // school would sit on an old version for ever without noticing.
        assertTrue(Versions.compare("1.10.0", "1.9.0") > 0)
        assertTrue(Versions.compare("1.9.0", "1.10.0") < 0)
    }

    @Test
    fun `knows the ordinary cases`() {
        assertTrue(Versions.compare("1.5.2", "1.5.1") > 0)
        assertTrue(Versions.compare("1.5.1", "1.5.2") < 0)
        assertEquals(0, Versions.compare("1.5.1", "1.5.1"))
        assertTrue(Versions.compare("2.0.0", "1.99.99") > 0)
    }

    @Test
    fun `ignores a leading v and anything after a dash`() {
        // The GitHub tag is v1.5.2; the debug build calls itself 1.5.2-debug.
        assertEquals(0, Versions.compare("v1.5.2", "1.5.2"))
        assertEquals(0, Versions.compare("1.5.2-debug", "1.5.2"))
        assertTrue(Versions.compare("v1.5.2", "1.5.1-debug") > 0)
    }

    @Test
    fun `treats a missing part as nought`() {
        assertEquals(0, Versions.compare("1.5", "1.5.0"))
        assertTrue(Versions.compare("1.5.1", "1.5") > 0)
    }

    @Test
    fun `does not fall over on nonsense`() {
        assertEquals(0, Versions.compare("", ""))
        assertEquals(0, Versions.compare("rubbish", "rubbish"))
    }

    // --- what GitHub said ---------------------------------------------------

    private fun release(tag: String, assets: String, body: String = "notes") = """
        { "tag_name": "$tag", "body": "$body", "assets": [ $assets ] }
    """.trimIndent()

    private val apk = """
        {
          "name": "SchoolTrack-1.5.2.apk",
          "browser_download_url": "https://example.test/SchoolTrack-1.5.2.apk",
          "size": 35234854,
          "digest": "sha256:ABC123"
        }
    """.trimIndent()

    @Test
    fun `finds the APK on a release`() {
        val got = ReleaseParser.parse(release("v1.5.2", apk))!!
        assertEquals("1.5.2", got.version)              // the v is dropped
        assertEquals("https://example.test/SchoolTrack-1.5.2.apk", got.apkUrl)
        assertEquals(35234854L, got.size)
        assertEquals("abc123", got.sha256)              // lower case, prefix gone
        assertEquals("notes", got.notes)
    }

    @Test
    fun `walks past assets that are not the APK`() {
        val other = """{ "name": "notes.txt", "browser_download_url": "x", "size": 2 }"""
        val got = ReleaseParser.parse(release("v1.5.2", "$other, $apk"))!!
        assertEquals("https://example.test/SchoolTrack-1.5.2.apk", got.apkUrl)
    }

    @Test
    fun `says nothing rather than failing when a release has no APK`() {
        // A release published for its notes alone is not a fault; it is
        // simply not an update, and the app should go quiet.
        val other = """{ "name": "notes.txt", "browser_download_url": "x", "size": 2 }"""
        assertNull(ReleaseParser.parse(release("v1.5.2", other)))
        assertNull(ReleaseParser.parse(release("v1.5.2", "")))
    }

    @Test
    fun `says nothing when there is no release at all`() {
        assertNull(ReleaseParser.parse("""{ "message": "Not Found" }"""))
        assertNull(ReleaseParser.parse(""))
        assertNull(ReleaseParser.parse("not json"))
    }

    @Test
    fun `leaves the checksum null when GitHub did not publish one`() {
        // Older releases carry no digest. The download still happens; it is
        // the signature and version checks that refuse a wrong APK.
        val noDigest = """
            {
              "name": "SchoolTrack-1.5.2.apk",
              "browser_download_url": "https://example.test/a.apk",
              "size": 10
            }
        """.trimIndent()
        assertNull(ReleaseParser.parse(release("v1.5.2", noDigest))!!.sha256)
    }
}
