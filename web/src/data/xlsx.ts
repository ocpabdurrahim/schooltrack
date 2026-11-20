/**
 * Writing a .xlsx, and a .zip of them, in the browser.
 *
 * An .xlsx is a zip of five small XML files, and a zip is a format you can
 * write by hand. Doing that costs about a hundred lines and saves a
 * dependency in a bundle a school downloads over a phone connection — the
 * same trade ocr/workbook.py and tools/mark-templates.mjs already make on the
 * other two sides of this project.
 *
 * STORED, NOT DEFLATED. A zip entry may simply hold its bytes, and these
 * files are a few kilobytes of text; compressing them would mean shipping an
 * implementation of deflate, or depending on CompressionStream, which is not
 * everywhere yet. Excel, Numbers, LibreOffice and the app's own reader all
 * open a stored zip without noticing.
 */

export type Cell = string | number | null | undefined;

// ---------------------------------------------------------------------------
// zip

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

type Entry = { name: string; data: Uint8Array };

/**
 * A zip holding these files, stored rather than compressed.
 *
 * The date is fixed at 1980-01-01 on purpose: two runs with the same content
 * then produce the same bytes, which is what makes "did this actually
 * change?" answerable.
 */
export function zip(entries: Entry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const sum = crc32(entry.data);

    // The offsets are the format's, and they are not negotiable: signature 0,
    // version 4, flags 6, method 8, time 10, date 12, crc 14, compressed 18,
    // uncompressed 22, name length 26, extra 28. Written two bytes out the
    // first time, which python and the app both read anyway — they go by the
    // central directory — and which Excel would have been entitled to reject.
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);          // version needed
    local.setUint16(6, 0, true);           // flags
    local.setUint16(8, 0, true);           // stored
    local.setUint16(10, 0, true);          // time
    local.setUint16(12, 0x21, true);       // date: 1980-01-01
    local.setUint32(14, sum, true);
    local.setUint32(18, entry.data.length, true);
    local.setUint32(22, entry.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);          // extra
    chunks.push(new Uint8Array(local.buffer), name, entry.data);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(10, 0, true);            // stored
    dir.setUint16(12, 0, true);
    dir.setUint16(14, 0x21, true);
    dir.setUint32(16, sum, true);
    dir.setUint32(20, entry.data.length, true);
    dir.setUint32(24, entry.data.length, true);
    dir.setUint16(28, name.length, true);
    dir.setUint32(42, offset, true);       // where the local header is
    central.push(new Uint8Array(dir.buffer), name);

    offset += 30 + name.length + entry.data.length;
  }

  const dirSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, dirSize, true);
  end.setUint32(16, offset, true);

  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of all) { out.set(c, at); at += c.length; }
  return out;
}

// ---------------------------------------------------------------------------
// the workbook

const PARTS: Record<string, string> = {
  '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
  '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Marks" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
  'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
};

/** 0 -> A, 25 -> Z, 26 -> AA. Spreadsheets count in a strange base. */
export function columnName(index: number): string {
  let name = '';
  let n = index;
  for (;;) {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
    if (n < 0) return name;
  }
}

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function cellXml(ref: string, value: Cell): string {
  // An empty cell is written as nothing at all, which is how a spreadsheet
  // says "blank" and how this app's reader reads it. A zero is a mark; blank
  // is not, and the two must never arrive looking the same.
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') return `<c r="${ref}"><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t>${escape(String(value))}</t></is></c>`;
}

export function sheetXml(rows: readonly (readonly Cell[])[]): string {
  const body = rows.map((row, r) => {
    const cells = row.map((v, c) => cellXml(`${columnName(c)}${r + 1}`, v)).join('');
    return `<row r="${r + 1}">${cells}</row>`;
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `<sheetData>${body}</sheetData></worksheet>`;
}

/** A one-sheet .xlsx, as bytes. */
export function xlsxOf(rows: readonly (readonly Cell[])[]): Uint8Array {
  const text = new TextEncoder();
  return zip([
    ...Object.entries(PARTS).map(([name, xml]) => ({ name, data: text.encode(xml) })),
    { name: 'xl/worksheets/sheet1.xml', data: text.encode(sheetXml(rows)) },
  ]);
}

/** A name a file system will take: no slashes, colons or the rest of it. */
export const safeFileName = (s: string) =>
  s.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();

/** Hands the bytes to the browser as a download. */
export function save(name: string, bytes: Uint8Array, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
