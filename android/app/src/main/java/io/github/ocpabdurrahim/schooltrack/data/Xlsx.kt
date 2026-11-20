package io.github.ocpabdurrahim.schooltrack.data

import java.io.ByteArrayOutputStream
import java.util.zip.CRC32

/**
 * Writing a .xlsx, and a .zip of them, on the phone.
 *
 * An .xlsx is a zip of five small XML files, and a zip is a format you can
 * write by hand. Doing that costs about a hundred lines and saves a
 * dependency — the same trade ocr/workbook.py, tools/mark-templates.mjs and
 * the web's xlsx.ts already make on the other three sides of this project.
 *
 * STORED, NOT DEFLATED. A zip entry may simply hold its bytes, and these
 * files are a few kilobytes of text. Excel, Sheets, LibreOffice and the app's
 * own reader all open a stored zip without noticing.
 *
 * This file has a twin: web/src/data/xlsx.ts.
 */

private fun le16(value: Int) = byteArrayOf((value and 0xff).toByte(), ((value shr 8) and 0xff).toByte())

private fun le32(value: Long) = byteArrayOf(
    (value and 0xff).toByte(),
    ((value shr 8) and 0xff).toByte(),
    ((value shr 16) and 0xff).toByte(),
    ((value shr 24) and 0xff).toByte(),
)

data class ZipEntry(val name: String, val data: ByteArray) {
    override fun equals(other: Any?) = other is ZipEntry && name == other.name &&
        data.contentEquals(other.data)
    override fun hashCode() = 31 * name.hashCode() + data.contentHashCode()
}

fun crc32(data: ByteArray): Long = CRC32().apply { update(data) }.value

/**
 * A zip holding these files, stored rather than compressed.
 *
 * The date is fixed at 1980-01-01 on purpose: two runs with the same content
 * then produce the same bytes, which is what makes "did this actually
 * change?" answerable.
 *
 * The offsets are the format's and are not negotiable: signature 0, version
 * 4, flags 6, method 8, time 10, date 12, crc 14, compressed 18, uncompressed
 * 22, name length 26, extra 28. The web twin had the crc and sizes two bytes
 * out at first and everything still read it, because every reader involved
 * goes by the CENTRAL directory — Excel would have been entitled to refuse.
 */
fun zip(entries: List<ZipEntry>): ByteArray {
    val body = ByteArrayOutputStream()
    val central = ByteArrayOutputStream()
    var offset = 0

    for (entry in entries) {
        val name = entry.name.toByteArray(Charsets.UTF_8)
        val sum = crc32(entry.data)
        val size = entry.data.size

        body.write(le32(0x04034b50))
        body.write(le16(20))            // version needed
        body.write(le16(0))             // flags
        body.write(le16(0))             // stored
        body.write(le16(0))             // time
        body.write(le16(0x21))          // date: 1980-01-01
        body.write(le32(sum))
        body.write(le32(size.toLong()))
        body.write(le32(size.toLong()))
        body.write(le16(name.size))
        body.write(le16(0))             // extra
        body.write(name)
        body.write(entry.data)

        central.write(le32(0x02014b50))
        central.write(le16(20))         // version made by
        central.write(le16(20))         // version needed
        central.write(le16(0))          // flags
        central.write(le16(0))          // stored
        central.write(le16(0))          // time
        central.write(le16(0x21))       // date
        central.write(le32(sum))
        central.write(le32(size.toLong()))
        central.write(le32(size.toLong()))
        central.write(le16(name.size))
        central.write(le16(0))          // extra
        central.write(le16(0))          // comment
        central.write(le16(0))          // disk
        central.write(le16(0))          // internal attributes
        central.write(le32(0))          // external attributes
        central.write(le32(offset.toLong()))
        central.write(name)

        offset += 30 + name.size + size
    }

    val dir = central.toByteArray()
    val out = ByteArrayOutputStream()
    out.write(body.toByteArray())
    out.write(dir)
    out.write(le32(0x06054b50))
    out.write(le16(0))                  // this disk
    out.write(le16(0))                  // disk with the directory
    out.write(le16(entries.size))
    out.write(le16(entries.size))
    out.write(le32(dir.size.toLong()))
    out.write(le32(offset.toLong()))
    out.write(le16(0))                  // comment length
    return out.toByteArray()
}

// ---------------------------------------------------------------------------
// the workbook

private val PARTS = linkedMapOf(
    "[Content_Types].xml" to """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>""",
    "_rels/.rels" to """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>""",
    "xl/workbook.xml" to """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Marks" sheetId="1" r:id="rId1"/></sheets>
</workbook>""",
    "xl/_rels/workbook.xml.rels" to """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>""",
)

/** 0 -> A, 25 -> Z, 26 -> AA. Spreadsheets count in a strange base. */
fun columnName(index: Int): String {
    var name = ""
    var n = index
    while (true) {
        name = ('A' + (n % 26)) + name
        n = n / 26 - 1
        if (n < 0) return name
    }
}

private fun escape(text: String) =
    text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

private fun cellXml(ref: String, value: Any?): String {
    // An empty cell is written as nothing at all, which is how a spreadsheet
    // says "blank" and how this app's reader reads it. A zero is a mark;
    // blank is not, and the two must never arrive looking the same.
    if (value == null || value == "") return ""
    if (value is Number) return "<c r=\"$ref\"><v>$value</v></c>"
    return "<c r=\"$ref\" t=\"inlineStr\"><is><t>${escape(value.toString())}</t></is></c>"
}

fun sheetXml(rows: List<List<Any?>>): String {
    val body = rows.mapIndexed { r, row ->
        val cells = row.mapIndexed { c, v -> cellXml("${columnName(c)}${r + 1}", v) }.joinToString("")
        "<row r=\"${r + 1}\">$cells</row>"
    }.joinToString("")
    return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
        "<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">" +
        "<sheetData>$body</sheetData></worksheet>"
}

/** A one-sheet .xlsx, as bytes. */
fun xlsxOf(rows: List<List<Any?>>): ByteArray = zip(
    PARTS.map { (name, xml) -> ZipEntry(name, xml.toByteArray(Charsets.UTF_8)) } +
        ZipEntry("xl/worksheets/sheet1.xml", sheetXml(rows).toByteArray(Charsets.UTF_8)),
)

/** A name a file system will take: no slashes, colons or the rest of it. */
fun safeFileName(s: String) =
    s.replace(Regex("[\\\\/:*?\"<>|]"), "-").replace(Regex("\\s+"), " ").trim()
