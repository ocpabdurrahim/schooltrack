package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The SAME cases exist in web/src/data/gemini.test.ts. */
class GeminiTest {

    private fun m(name: String, methods: List<String> = listOf("generateContent")) =
        ModelInfo(name, methods)

    // ------------------------------------------------------ picking a model

    @Test
    fun `prefers flash over pro, because a school pays per page`() {
        assertEquals(
            "gemini-2.5-flash",
            pickVisionModel(listOf(m("models/gemini-2.5-pro"), m("models/gemini-2.5-flash"))),
        )
    }

    @Test
    fun `prefers the newer version of the same family`() {
        assertEquals(
            "gemini-2.5-flash",
            pickVisionModel(listOf(m("models/gemini-1.5-flash"), m("models/gemini-2.5-flash"))),
        )
    }

    @Test
    fun `passes over lite, which is the one that guesses at handwriting`() {
        assertEquals(
            "gemini-2.5-flash",
            pickVisionModel(listOf(m("models/gemini-2.5-flash-lite"), m("models/gemini-2.5-flash"))),
        )
    }

    @Test
    fun `prefers a stable model to a preview of the same thing`() {
        assertEquals(
            "gemini-2.5-flash",
            pickVisionModel(
                listOf(m("models/gemini-2.5-flash-preview-09"), m("models/gemini-2.5-flash")),
            ),
        )
    }

    @Test
    fun `takes a preview when there is nothing stable`() {
        assertEquals(
            "gemini-3.0-flash-preview",
            pickVisionModel(listOf(m("models/gemini-3.0-flash-preview"))),
        )
    }

    @Test
    fun `skips models that cannot read a picture into text`() {
        assertEquals(
            "gemini-2.5-flash",
            pickVisionModel(
                listOf(
                    m("models/text-embedding-004"),
                    m("models/imagen-3.0-generate"),
                    m("models/gemini-2.5-flash-tts"),
                    m("models/gemini-2.5-flash"),
                ),
            ),
        )
    }

    @Test
    fun `skips a model that does not do generateContent at all`() {
        assertNull(pickVisionModel(listOf(m("models/gemini-2.5-flash", listOf("countTokens")))))
    }

    @Test
    fun `gives null when the account has nothing usable`() {
        assertNull(pickVisionModel(emptyList()))
    }

    @Test
    fun `picks the same model twice from the same list`() {
        val list = listOf(m("models/gemini-2.5-flash"), m("models/gemini-2.5-flash-002"))
        assertEquals(pickVisionModel(list), pickVisionModel(list.reversed()))
    }

    // ------------------------------------------------------------ the reply

    @Test
    fun `takes JSON out of a code fence`() {
        assertEquals("{\"a\":1}", stripFence("```json\n{\"a\":1}\n```"))
        assertEquals("{\"a\":1}", stripFence("```\n{\"a\":1}\n```"))
        assertEquals("{\"a\":1}", stripFence("{\"a\":1}"))
    }

    private val good = """
        {"header":{"exam":"Half Yearly","year":"2026","className":"Ten","subject":"History"},
         "rows":[
           {"roll":3,"cells":[{"column":"CQ","value":51},{"column":"MCQ","value":18},
                              {"column":"Prac","value":null},{"column":"Total","value":69}]},
           {"roll":23,"cells":[{"column":"CQ","value":null},{"column":"MCQ","value":15},
                               {"column":"Total","value":53}]}]}
    """.trimIndent()

    @Test
    fun `reads the header and the rows`() {
        val r = parseScanReply(good)
        assertEquals(ScanHeader("Half Yearly", "2026", "Ten", "History"), r.header)
        assertEquals(2, r.rows.size)
        assertEquals(3, r.rows[0].roll)
        assertEquals(
            mapOf<String, Int?>("CQ" to 51, "MCQ" to 18, "Prac" to null, "Total" to 69),
            r.rows[0].values,
        )
    }

    @Test
    fun `keeps a cell the reader would not commit to as null, not zero`() {
        assertNull(parseScanReply(good).rows[1].values["CQ"])
    }

    @Test
    fun `reads numbers the model sent as text`() {
        val r = parseScanReply(
            """{"header":{},"rows":[{"roll":"09","cells":[{"column":"CQ","value":"51"}]}]}""",
        )
        assertEquals(9, r.rows[0].roll)
        assertEquals(51, r.rows[0].values["CQ"])
    }

    @Test
    fun `reads the ways a model writes nothing here`() {
        val r = parseScanReply(
            """{"header":{},"rows":[{"roll":1,"cells":[
               {"column":"A","value":"-"},{"column":"B","value":""},
               {"column":"C","value":"null"},{"column":"D","value":"N/A"}]}]}""",
        )
        assertEquals(mapOf<String, Int?>("A" to null, "B" to null, "C" to null, "D" to null),
            r.rows[0].values)
    }

    @Test
    fun `copes with a plain object of columns instead of the cells array`() {
        val r = parseScanReply(
            """{"header":{"subject":"History"},
                "rows":[{"roll":4,"values":{"CQ":56,"MCQ":18,"Total":74}}]}""",
        )
        assertEquals(mapOf<String, Int?>("CQ" to 56, "MCQ" to 18, "Total" to 74), r.rows[0].values)
    }

    @Test
    fun `copes with a code fence around the answer`() {
        assertEquals(2, parseScanReply("```json\n$good\n```").rows.size)
    }

    @Test
    fun `leaves missing header fields empty rather than null`() {
        val r = parseScanReply("""{"rows":[]}""")
        assertEquals(ScanHeader("", "", "", ""), r.header)
        assertEquals(0, r.rows.size)
    }

    @Test
    fun `says so plainly when the answer is not a sheet at all`() {
        val e = runCatching { parseScanReply("I could not read that image.") }.exceptionOrNull()
        assertTrue(e?.message?.contains("did not answer with a sheet") == true)
    }

    // ----------------------------------------------------------- the prompt

    @Test
    fun `names the parts the subject actually has`() {
        assertTrue(buildPrompt(listOf("CQ", "MCQ")).contains("CQ, MCQ"))
    }

    @Test
    fun `never tells the reader which rolls to expect`() {
        // A reader given the answers starts producing them.
        val p = buildPrompt(listOf("CQ", "MCQ"))
        assertTrue(!Regex("roll numbers are|students are|expect rolls", RegexOption.IGNORE_CASE)
            .containsMatchIn(p))
    }

    @Test
    fun `forbids the two mistakes that would be silent`() {
        val p = buildPrompt(listOf("CQ", "MCQ"))
        assertTrue(p.contains("Never report an empty cell as 0"))
        assertTrue(p.contains("Never compute the Total yourself"))
    }

    // ------------------------------------------------------------- masking

    @Test
    fun `shows only the last four characters of a key`() {
        assertEquals("••••••••cdef", maskKey("AIzaSyAbcdef"))
        assertEquals("", maskKey(""))
        assertEquals("••••", maskKey("abc"))
    }
}
