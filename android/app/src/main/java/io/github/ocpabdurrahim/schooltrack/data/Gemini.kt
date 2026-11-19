package io.github.ocpabdurrahim.schooltrack.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Asking Gemini to read a photographed mark sheet.
 *
 * Everything the reader is told, and everything it hands back, is shaped here.
 * Whether any of it may be BELIEVED is ScanMarks.kt's business, and this file
 * deliberately knows nothing about roll numbers, sections or totals: a reader
 * that is also the judge of its own reading is no check at all.
 *
 * The model is not hard-coded. Google renames these every few months and a
 * name baked in here would one day start returning 404 to a teacher standing
 * over a pile of scripts, so the one to use is discovered from the account's
 * own list and remembered in the settings document.
 *
 * HttpURLConnection rather than a new HTTP library: two calls do not justify
 * a dependency, and this one is in the platform.
 *
 * The twin of web/src/data/gemini.ts.
 */

private const val API = "https://generativelanguage.googleapis.com/v1beta"

data class ModelInfo(val name: String, val methods: List<String>)

/** Models that cannot read a photograph into text, whatever else they do. */
private val NOT_A_READER =
    Regex("embedding|aqa|imagen|veo|tts|audio|image-generation|learnlm", RegexOption.IGNORE_CASE)

/**
 * The cheapest model on this account that can read a picture.
 *
 * Flash over Pro: this is a page of digits, not a reasoning problem, and a
 * school pays per page. Lite is passed over because handwriting is the one job
 * where the smallest model starts guessing, and a plausible wrong digit is far
 * worse here than a slow one. Newer beats older; a preview beats nothing but
 * loses to anything stable.
 */
fun pickVisionModel(models: List<ModelInfo>): String? {
    val scored = models
        .filter { "generateContent" in it.methods }
        .filterNot { NOT_A_READER.containsMatchIn(it.name) }
        .map { m ->
            val name = m.name.removePrefix("models/")
            var score = 0
            if (name.contains("flash", true)) score += 100
            else if (name.contains("pro", true)) score += 60
            if (name.contains("lite", true)) score -= 45
            if (name.contains("preview", true) || name.contains("exp", true)) score -= 25
            Regex("(\\d+)\\.(\\d+)").find(name)?.let {
                score += it.groupValues[1].toInt() * 10 + it.groupValues[2].toInt()
            }
            name to score
        }
        .sortedWith(compareByDescending<Pair<String, Int>> { it.second }.thenBy { it.first })

    return scored.firstOrNull()?.first
}

/**
 * The reader is told what the paper IS, never what it should say.
 *
 * It is given the subject's parts so it can name the columns the same way, and
 * that is all. It is not told which rolls the section has: a reader that knows
 * the expected answers starts producing them.
 */
fun buildPrompt(componentNames: List<String>): String {
    val cols = if (componentNames.isEmpty()) {
        "whatever mark columns are printed"
    } else {
        componentNames.joinToString(", ")
    }
    return listOf(
        "This is a photograph of a school mark sheet filled in by hand.",
        "",
        "The sheet is printed with a row for every roll number, usually in two or",
        "three blocks side by side across the page. Read ALL the blocks.",
        "The mark columns are typically: $cols, and a Total.",
        "",
        "Report, for each row that has ANYTHING handwritten on it:",
        "  - the printed roll number of that row",
        "  - every mark column, with the number written in it",
        "",
        "Rules you must follow exactly:",
        "  1. An EMPTY cell is null. Never report an empty cell as 0. Most rows on",
        "     the sheet are empty — leave those rows out altogether.",
        "  2. Report the digits as written. \"09\" is 9. \"02\" is 2.",
        "  3. Never compute the Total yourself, and never correct it. Report it",
        "     exactly as the teacher wrote it, even when it does not equal the",
        "     other columns added up: it is the check against your own reading.",
        "  4. If a cell has been written over, crossed out or corrected and you",
        "     cannot tell which value was meant, report null for that cell rather",
        "     than guessing.",
        "  5. Read the roll number from the PRINTED column at the left of each",
        "     block, not from anything handwritten.",
        "",
        "Also report the header: the exam, the year, the class name and the subject",
        "name, exactly as written. Use an empty string for any you cannot read.",
    ).joinToString("\n")
}

/** Forces the shape of the reply, so nothing has to be guessed at by hand. */
private fun replySchema(): JSONObject {
    fun str() = JSONObject().put("type", "string")
    fun int() = JSONObject().put("type", "integer").put("nullable", true)

    val header = JSONObject()
        .put("type", "object")
        .put(
            "properties",
            JSONObject()
                .put("exam", str()).put("year", str())
                .put("className", str()).put("subject", str()),
        )
        .put("required", JSONArray(listOf("exam", "year", "className", "subject")))

    val cell = JSONObject()
        .put("type", "object")
        .put("properties", JSONObject().put("column", str()).put("value", int()))
        .put("required", JSONArray(listOf("column", "value")))

    val row = JSONObject()
        .put("type", "object")
        .put(
            "properties",
            JSONObject()
                .put("roll", int())
                .put("cells", JSONObject().put("type", "array").put("items", cell)),
        )
        .put("required", JSONArray(listOf("roll", "cells")))

    return JSONObject()
        .put("type", "object")
        .put(
            "properties",
            JSONObject()
                .put("header", header)
                .put("rows", JSONObject().put("type", "array").put("items", row)),
        )
        .put("required", JSONArray(listOf("header", "rows")))
}

// ---------------------------------------------------------------------------
// what comes back

private val NOTHING_HERE = Regex("^(-+|x|nil|na|null|none)$", RegexOption.IGNORE_CASE)

/** A cell as the model may have written it: a number, a string, or nothing. */
fun cellValue(raw: Any?): Int? {
    if (raw == null || raw == JSONObject.NULL) return null
    if (raw is Number) return raw.toInt()
    val s = raw.toString().trim()
    // "-", "x" and "" are all ways of writing "nothing here"; so is "null",
    // which a model hands back as text more often than it should.
    if (s.isEmpty() || NOTHING_HERE.matches(s)) return null
    return s.toDoubleOrNull()?.toInt()
}

/** Models still wrap JSON in ``` fences now and again. */
fun stripFence(raw: String): String {
    val t = raw.trim()
    if (!t.startsWith("```")) return t
    return t.replace(Regex("^```[a-zA-Z]*\\s*"), "").replace(Regex("```\\s*$"), "").trim()
}

private fun str(o: JSONObject, vararg keys: String): String {
    for (k in keys) {
        if (o.has(k) && !o.isNull(k)) return o.get(k).toString().trim()
    }
    return ""
}

/**
 * The reply, turned into something ScanMarks.kt can check.
 *
 * Defensive about shape on purpose. The schema makes a well-formed answer the
 * overwhelmingly likely one, but this runs on a teacher's phone at the end of
 * a marking day: a stray code fence or a number sent as a string must not be
 * the thing that loses the sheet.
 */
fun parseScanReply(raw: String): ScanRead {
    val body = try {
        JSONObject(stripFence(raw))
    } catch (_: Exception) {
        throw IllegalStateException("The reader did not answer with a sheet. Try the photo again.")
    }

    val h = body.optJSONObject("header") ?: JSONObject()
    val rows = mutableListOf<ScanRow>()
    val arr = body.optJSONArray("rows") ?: JSONArray()

    for (i in 0 until arr.length()) {
        val r = arr.optJSONObject(i) ?: continue
        val roll = cellValue(if (r.isNull("roll")) null else r.opt("roll"))
        val values = LinkedHashMap<String, Int?>()

        // Either shape is read: the array of cells the schema asks for, or a
        // plain object of column to value, which is what a model falls back to
        // when the schema is not honoured.
        val cells = r.opt("cells") ?: r.opt("values")
        if (cells is JSONArray) {
            for (j in 0 until cells.length()) {
                val c = cells.optJSONObject(j) ?: continue
                val column = str(c, "column", "name")
                if (column.isNotEmpty()) {
                    values[column] = cellValue(if (c.isNull("value")) null else c.opt("value"))
                }
            }
        } else if (cells is JSONObject) {
            for (column in cells.keys()) {
                if (column.trim().isNotEmpty()) {
                    values[column.trim()] =
                        cellValue(if (cells.isNull(column)) null else cells.opt(column))
                }
            }
        }

        rows.add(ScanRow(roll, values))
    }

    return ScanRead(
        header = ScanHeader(
            exam = str(h, "exam"),
            year = str(h, "year"),
            className = str(h, "className", "class"),
            subject = str(h, "subject"),
        ),
        rows = rows,
    )
}

// ---------------------------------------------------------------------------
// the call

data class SheetImage(val mimeType: String, val base64: String)

/**
 * How long to wait before sending a failed call again, or null to give up.
 *
 * Only Google's own 5xx is tried again. A 400 or a 403 means the request
 * itself is wrong and sending it a second time changes nothing, and a 429 is
 * Google asking for less — hammering it is the one thing that makes it worse.
 */
val RETRY_WAITS_MS = listOf(900L, 2600L)

fun retryAfter(status: Int, attempt: Int): Long? {
    if (status < 500) return null
    return if (attempt < RETRY_WAITS_MS.size) RETRY_WAITS_MS[attempt] else null
}

/**
 * What went wrong, in words a head teacher can act on.
 *
 * Google's own message is kept on the end because it is the only thing that
 * distinguishes a dead key from a key with billing switched off — and, on a
 * 5xx, the only thing that says whether their side was merely busy or choked
 * on what we sent. Swallowing it there left nothing to act on at all.
 */
fun apiError(status: Int, body: String, model: String = ""): String {
    val raw = try {
        JSONObject(body).optJSONObject("error")?.optString("message").orEmpty()
    } catch (_: Exception) {
        ""
    }
    return when {
        status == 400 && raw.contains("API key not valid", true) ->
            "That API key was not accepted. Check it was copied whole, with no spaces."
        status == 401 || status == 403 -> "The key was refused for this request. $raw".trim()
        status == 404 -> "That model is not available on this key. $raw".trim()
        status == 429 ->
            "Google is rate-limiting this key — too many sheets too quickly. " +
                "Wait a minute and try again."
        status >= 500 -> {
            // 503 is Google saying "not now"; 500 is Google saying "something
            // about this went wrong", and those want different things from the
            // teacher.
            val busy = status == 503 ||
                listOf("overload", "unavailable", "try again").any { raw.contains(it, true) }
            val head = if (busy) {
                "Google was busy and could not read it, even after trying again. " +
                    "Give it a minute and press Read sheets again."
            } else {
                "Google could not read it ($status), even after trying again."
            }
            val where = if (model.isNotEmpty()) " Model $model." else ""
            "$head$where $raw".trim()
        }
        raw.isNotEmpty() -> raw
        else -> "The reader answered with $status."
    }
}

private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

/**
 * One call to Google, sent again if their side falls over.
 *
 * A 500 or a 503 from Gemini is far more often a busy minute than anything
 * wrong with the sheet, and a teacher at the end of a marking day should not
 * have to be the retry mechanism. Already on a background thread, so sleeping
 * here blocks nothing the teacher can see.
 */
private fun call(url: String, payload: String?, model: String = ""): String {
    var attempt = 0
    while (true) {
        val (status, text) = once(url, payload)
        if (status in 200..299) return text
        val wait = retryAfter(status, attempt)
            ?: throw IllegalStateException(apiError(status, text, model))
        Thread.sleep(wait)
        attempt += 1
    }
}

private fun once(url: String, payload: String?): Pair<Int, String> {
    val conn = URL(url).openConnection() as HttpURLConnection
    conn.connectTimeout = 30_000
    // A page of handwriting takes the model a while, and a teacher would far
    // rather wait than be told to photograph it again.
    conn.readTimeout = 120_000
    try {
        if (payload != null) {
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
        }
        val status = conn.responseCode
        val stream = if (status in 200..299) conn.inputStream else conn.errorStream
        val text = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
        return status to text
    } finally {
        conn.disconnect()
    }
}

suspend fun listModels(apiKey: String): List<ModelInfo> = withContext(Dispatchers.IO) {
    val body = JSONObject(call("$API/models?key=${enc(apiKey)}", null))
    val arr = body.optJSONArray("models") ?: JSONArray()
    (0 until arr.length()).mapNotNull { i ->
        val m = arr.optJSONObject(i) ?: return@mapNotNull null
        val methods = m.optJSONArray("supportedGenerationMethods") ?: JSONArray()
        ModelInfo(
            name = m.optString("name"),
            methods = (0 until methods.length()).map { methods.optString(it) },
        )
    }
}

/**
 * Reads one or more photographs of the SAME sheet-set as a single answer.
 *
 * Several photographs go in one request rather than one each, because a form
 * that runs to a second page shares one header, and two separate readings
 * would have to be stitched together afterwards with nothing to say whether
 * they even came from the same sheet.
 */
suspend fun readSheets(
    apiKey: String,
    model: String,
    images: List<SheetImage>,
    componentNames: List<String>,
): ScanRead = withContext(Dispatchers.IO) {
    if (images.isEmpty()) throw IllegalStateException("There is no photograph to read.")

    val parts = JSONArray().put(JSONObject().put("text", buildPrompt(componentNames)))
    for (i in images) {
        parts.put(
            JSONObject().put(
                "inline_data",
                JSONObject().put("mime_type", i.mimeType).put("data", i.base64),
            ),
        )
    }

    val payload = JSONObject()
        .put("contents", JSONArray().put(JSONObject().put("role", "user").put("parts", parts)))
        .put(
            "generationConfig",
            JSONObject()
                // Nothing here should be invented, so the sampling is turned
                // off as far as it will go.
                .put("temperature", 0)
                .put("responseMimeType", "application/json")
                .put("responseSchema", replySchema()),
        )
        .toString()

    val body = JSONObject(
        call("$API/models/${enc(model)}:generateContent?key=${enc(apiKey)}", payload, model),
    )
    val text = body.optJSONArray("candidates")
        ?.optJSONObject(0)
        ?.optJSONObject("content")
        ?.optJSONArray("parts")
        ?.optJSONObject(0)
        ?.optString("text")
        .orEmpty()

    if (text.isBlank()) {
        val why = body.optJSONObject("promptFeedback")?.optString("blockReason")
            ?: body.optJSONArray("candidates")?.optJSONObject(0)?.optString("finishReason")
        throw IllegalStateException(
            if (!why.isNullOrBlank()) "The reader stopped without an answer ($why)."
            else "The reader sent back nothing. Try the photo again.",
        )
    }
    parseScanReply(text)
}
