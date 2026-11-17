package io.github.ocpabdurrahim.schooltrack.data

import java.io.ByteArrayInputStream
import java.time.LocalDate
import java.util.zip.ZipInputStream

/**
 * Reading a spreadsheet file — the Kotlin twin of web/src/data/sheet.ts.
 *
 * No dependency. An .xlsx is a zip of XML, the platform unzips it
 * (ZipInputStream), and the three parts that matter are small and
 * machine-written. A library for this would be a megabyte of parser and a
 * standing advisory to watch, for one button in a school app.
 *
 * The file becomes a GRID of plain text and then tab-separated lines, which is
 * exactly what a paste out of Excel already looks like — so a file goes through
 * Batch.kt, the same reading and the same preview as anything typed in. One
 * parser, one set of rules, one thing to get right.
 *
 * Handled because real exports do it: a date (which Excel stores as the NUMBER
 * 38353 with a format on it), shared and inline strings and rich text, a
 * missing cell, an entry stored rather than deflated, and several sheets — the
 * first in the workbook is the one read. Not handled, each saying so rather
 * than guessing: .xls (the old binary format) and zip64.
 */

typealias Grid = List<List<String>>

// ---------------------------------------------------------------------------
// CSV

private fun firstDataLine(text: String): String {
    val out = StringBuilder()
    var quoted = false
    for (ch in text) {
        when {
            ch == '"' -> quoted = !quoted
            ch == '\n' && !quoted -> return out.toString()
            else -> out.append(ch)
        }
    }
    return out.toString()
}

private fun guessDelimiter(text: String): Char {
    val line = firstDataLine(text)
    // Excel writes semicolons where the decimal mark is a comma.
    val best = listOf('\t', ',', ';').maxByOrNull { d -> line.count { it == d } } ?: ','
    return if (line.count { it == best } > 0) best else ','
}

/**
 * A CSV as the standard describes it: quotes around a field that holds the
 * separator, a doubled quote for a quote, a newline allowed inside quotes.
 *
 * The naive split on commas is what makes "Mia, Karim" into two students.
 */
fun parseCsv(text: String, delimiter: Char? = null): Grid {
    val body = text.removePrefix("﻿")   // Excel writes a byte-order mark
    val sep = delimiter ?: guessDelimiter(body)
    val grid = mutableListOf<List<String>>()
    var row = mutableListOf<String>()
    val cell = StringBuilder()
    var quoted = false
    var i = 0

    while (i < body.length) {
        val ch = body[i]
        if (quoted) {
            if (ch == '"') {
                if (i + 1 < body.length && body[i + 1] == '"') { cell.append('"'); i += 1 } else quoted = false
            } else {
                cell.append(ch)
            }
            i += 1
            continue
        }
        when (ch) {
            '"' -> quoted = true
            sep -> { row.add(cell.toString()); cell.setLength(0) }
            '\r' -> Unit
            '\n' -> {
                row.add(cell.toString()); cell.setLength(0)
                grid.add(row); row = mutableListOf()
            }
            else -> cell.append(ch)
        }
        i += 1
    }
    row.add(cell.toString())
    grid.add(row)
    return grid
}

/**
 * A grid as the tab-separated text the paste boxes already understand.
 *
 * A tab or a newline inside a cell becomes a space: they would otherwise make
 * one cell look like two, and no name or mark has either in it.
 */
fun gridToText(grid: Grid): String {
    val rows = grid.map { row ->
        val cells = row.map { it.replace(Regex("[\t\r\n]+"), " ").trim() }.toMutableList()
        while (cells.isNotEmpty() && cells.last().isEmpty()) cells.removeAt(cells.size - 1)
        cells.joinToString("\t")
    }.toMutableList()
    while (rows.isNotEmpty() && rows.last().isEmpty()) rows.removeAt(rows.size - 1)
    return rows.joinToString("\n")
}

// ---------------------------------------------------------------------------
// the XML inside

private val ENTITIES = mapOf("amp" to "&", "lt" to "<", "gt" to ">", "quot" to "\"", "apos" to "'")

private val ENTITY = Regex("&(#x?[0-9a-fA-F]+|[a-z]+);")

private fun unescapeXml(s: String): String = ENTITY.replace(s) { m ->
    val body = m.groupValues[1]
    if (body.startsWith("#")) {
        val code = if (body.length > 1 && (body[1] == 'x' || body[1] == 'X')) {
            body.substring(2).toIntOrNull(16)
        } else {
            body.substring(1).toIntOrNull()
        }
        if (code != null) String(Character.toChars(code)) else m.value
    } else {
        ENTITIES[body] ?: m.value
    }
}

private fun attr(tag: String, name: String): String {
    val m = Regex("""$name="([^"]*)"""").find(tag) ?: return ""
    return unescapeXml(m.groupValues[1])
}

private val T_RUN = Regex("""<t[^>]*>([\s\S]*?)</t>""")

/** The <t> runs of one element, joined — a styled word is several runs. */
private fun textOf(xml: String): String =
    T_RUN.findAll(xml).joinToString("") { unescapeXml(it.groupValues[1]) }

private fun sharedStrings(xml: String): List<String> =
    Regex("""<si>[\s\S]*?</si>""").findAll(xml).map { textOf(it.value) }.toList()

/** Built-in number formats that mean a date or a time. */
private val DATE_BUILTINS = setOf(14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47)

/** For each cell style, whether its number format is a date. */
private fun dateStyles(xml: String): List<Boolean> {
    val custom = mutableMapOf<Int, String>()
    for (m in Regex("""<numFmt\b[^>]*/?>""").findAll(xml)) {
        val id = attr(m.value, "numFmtId").toIntOrNull() ?: continue
        custom[id] = attr(m.value, "formatCode")
    }
    val block = Regex("""<cellXfs[^>]*>([\s\S]*?)</cellXfs>""").find(xml) ?: return emptyList()
    return Regex("""<xf\b[^>]*/?>""").findAll(block.groupValues[1]).map { m ->
        val id = attr(m.value, "numFmtId").toIntOrNull() ?: 0
        if (DATE_BUILTINS.contains(id)) {
            true
        } else {
            val code = custom[id]
            // d, m or y outside quoted text and outside [colour]/[condition]
            code != null && Regex("[dmy]", RegexOption.IGNORE_CASE).containsMatchIn(
                code.replace(Regex("\"[^\"]*\""), "").replace(Regex("""\[[^\]]*\]"""), ""),
            )
        }
    }.toList()
}

/** 1899-12-30 as an epoch day: Excel's day 0. */
private const val EXCEL_EPOCH_DAY = -25569L

/**
 * An Excel date number as a plain YYYY-MM-DD.
 *
 * Day 1 is 1 January 1900 and day 60 is 29 February 1900, a day that never
 * existed — Excel kept Lotus's bug deliberately. Every date a school writes is
 * far above 60, so anything at or below 60 is left as the number it is rather
 * than silently shifted.
 */
fun excelDate(serial: Double): String {
    if (serial.isNaN() || serial.isInfinite() || serial <= 60) return ""
    val day = EXCEL_EPOCH_DAY + serial.toLong()
    val d = LocalDate.ofEpochDay(day)
    return "%04d-%02d-%02d".format(d.year, d.monthValue, d.dayOfMonth)
}

/** "BC12" -> column 54 (0-based). */
private fun columnOf(ref: String): Int {
    var n = 0
    for (ch in ref) {
        if (ch !in 'A'..'Z') break
        n = n * 26 + (ch - 'A' + 1)
    }
    return n - 1
}

private fun rowOf(ref: String): Int =
    (Regex("""(\d+)""").find(ref)?.groupValues?.get(1)?.toIntOrNull() ?: 1) - 1

/** Every entry of a zip, by name. */
private fun unzip(bytes: ByteArray): Map<String, String> {
    val out = mutableMapOf<String, String>()
    ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
        while (true) {
            val entry = zip.nextEntry ?: break
            if (!entry.isDirectory) out[entry.name] = zip.readBytes().toString(Charsets.UTF_8)
            zip.closeEntry()
        }
    }
    if (out.isEmpty()) throw IllegalArgumentException("That file is not a spreadsheet — it is not even a zip.")
    return out
}

/** The worksheet part of the FIRST sheet in the workbook. */
private fun firstSheetName(parts: Map<String, String>): String {
    val book = parts["xl/workbook.xml"].orEmpty()
    val rels = parts["xl/_rels/workbook.xml.rels"].orEmpty()
    val sheet = Regex("""<sheet\b[^>]*>""").find(book)?.value
    val id = if (sheet != null) attr(sheet, "r:id") else ""
    if (id.isNotEmpty()) {
        for (m in Regex("""<Relationship\b[^>]*>""").findAll(rels)) {
            if (attr(m.value, "Id") == id) {
                val target = attr(m.value, "Target").removePrefix("/")
                val full = if (target.startsWith("xl/")) target else "xl/$target"
                if (parts.containsKey(full)) return full
            }
        }
    }
    val any = parts.keys.filter { Regex("""^xl/worksheets/sheet[^/]*\.xml$""").matches(it) }.sorted()
    if (any.isEmpty()) throw IllegalArgumentException("That spreadsheet has no sheet in it.")
    return any[0]
}

private val CELL = Regex("""<c\b[^>]*(?:/>|>[\s\S]*?</c>)""")
private val CELL_TAG = Regex("""<c\b[^>]*?/?>""")
private val V_VALUE = Regex("""<v[^>]*>([\s\S]*?)</v>""")

/** Marks and rolls are whole where they are whole: "78", not "78.0". */
private fun numberText(n: Double): String =
    if (n == Math.floor(n) && !n.isInfinite()) n.toLong().toString() else n.toString()

/** An .xlsx as a grid of plain text. */
fun readXlsx(bytes: ByteArray): Grid {
    val parts = unzip(bytes)
    val shared = sharedStrings(parts["xl/sharedStrings.xml"].orEmpty())
    val styles = dateStyles(parts["xl/styles.xml"].orEmpty())
    val sheet = parts[firstSheetName(parts)].orEmpty()

    val grid = mutableListOf<MutableList<String>>()
    fun put(r: Int, c: Int, value: String) {
        while (grid.size <= r) grid.add(mutableListOf())
        val row = grid[r]
        while (row.size <= c) row.add("")
        row[c] = value
    }

    for (match in CELL.findAll(sheet)) {
        val cell = match.value
        val tag = CELL_TAG.find(cell)?.value.orEmpty()
        val ref = attr(tag, "r")
        val kind = attr(tag, "t")
        val style = attr(tag, "s")
        val raw = V_VALUE.find(cell)?.groupValues?.get(1).orEmpty()

        val value = when {
            kind == "s" -> shared.getOrNull(raw.toIntOrNull() ?: -1).orEmpty()
            kind == "inlineStr" -> textOf(cell)
            kind == "b" -> if (raw == "1") "TRUE" else "FALSE"
            kind == "e" -> ""                        // an error cell is nothing
            kind == "str" -> unescapeXml(raw)        // a formula's cached text
            raw.isNotEmpty() -> {
                val n = raw.toDoubleOrNull()
                val dated = style.isNotEmpty() && styles.getOrNull(style.toIntOrNull() ?: -1) == true
                when {
                    n == null -> unescapeXml(raw)
                    dated -> excelDate(n).ifEmpty { numberText(n) }
                    else -> numberText(n)
                }
            }
            else -> ""
        }
        if (value.isNotEmpty()) put(rowOf(ref), columnOf(ref), value)
    }
    return grid
}

// ---------------------------------------------------------------------------
// what the screens call

/**
 * What the file chooser offers.
 *
 * Everything, deliberately. Android phones disagree about what an .xlsx is —
 * plenty of file managers hand one over as application/octet-stream — and a
 * filtered chooser then shows the file greyed out and unselectable, which
 * looks like the app is broken. The reader judges the file by its content
 * instead, and says plainly when it is not a spreadsheet.
 */
val SHEET_MIME_TYPES = arrayOf("*/*")

/**
 * A chosen file as the text the paste box holds.
 *
 * It fills the box rather than saving anything: the file is only a faster way
 * to type, and what was read is on the screen to be corrected before it goes
 * anywhere near the register.
 */
fun readSheetFile(name: String, bytes: ByteArray): String {
    val lower = name.lowercase()
    if (lower.endsWith(".xls")) {
        throw IllegalArgumentException(
            "That is the old .xls format, which this cannot read. Open it in Excel and " +
                "save it again as .xlsx, or as CSV.",
        )
    }
    // Judged by content as well as by name: a file manager can hand over a
    // name with no extension at all. "PK" is where every zip starts.
    val looksZipped = bytes.size > 1 && bytes[0] == 'P'.code.toByte() && bytes[1] == 'K'.code.toByte()
    return if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm") || looksZipped) {
        gridToText(readXlsx(bytes))
    } else {
        gridToText(parseCsv(bytes.toString(Charsets.UTF_8)))
    }
}
