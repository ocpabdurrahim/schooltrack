/**
 * Reading a spreadsheet file — CSV, or the .xlsx an office actually has.
 *
 * No dependency. An .xlsx is a zip of XML, the browser can inflate a zip
 * entry on its own (DecompressionStream), and the three parts that matter are
 * small and machine-written. A library for this would be a megabyte of parser
 * and a standing advisory to watch, for one button in a school app.
 *
 * The file is turned into a GRID of plain text and then into tab-separated
 * lines, which is exactly what a paste out of Excel already looks like — so
 * the file goes through batch.ts, the same reading and the same preview as
 * anything typed in. One parser, one set of rules, one thing to get right.
 *
 * What it deliberately does handle, because real exports do:
 *   - a date, which Excel stores as the NUMBER 38353 with a format on it;
 *   - shared strings, inline strings and rich text (a cell styled mid-word);
 *   - a missing cell, so a row still lines up by column;
 *   - an entry stored rather than deflated;
 *   - several sheets — the first one in the workbook is the one read.
 *
 * What it does not: .xls (the old binary format, nothing like this one),
 * formulas (the cached result is read, which is what a reader wants), and
 * zip64. Each says so rather than guessing.
 */

export type Grid = string[][];

// ---------------------------------------------------------------------------
// CSV

/** The separator a line uses, outside quotes. */
function guessDelimiter(text: string): string {
  const line = firstDataLine(text);
  const counts = [
    ['\t', count(line, '\t')],
    [',', count(line, ',')],
    [';', count(line, ';')],   // Excel writes these where the decimal mark is a comma
  ] as const;
  const best = counts.reduce((a, b) => (b[1] > a[1] ? b : a));
  return best[1] > 0 ? best[0] : ',';
}

function firstDataLine(text: string): string {
  let out = '';
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (ch === '\n' && !quoted) break;
    else out += ch;
  }
  return out;
}

const count = (s: string, ch: string) => s.split(ch).length - 1;

/**
 * A CSV as the standard describes it: quotes around a field that holds the
 * separator, a doubled quote for a quote, and a newline allowed inside quotes.
 *
 * The naive split on commas is what makes "Mia, Karim" into two students.
 */
export function parseCsv(text: string, delimiter?: string): Grid {
  const body = text.replace(/^﻿/, '');   // Excel writes a byte-order mark
  const sep = delimiter ?? guessDelimiter(body);
  const grid: Grid = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === sep) { row.push(cell); cell = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(cell); grid.push(row); row = []; cell = ''; continue; }
    cell += ch;
  }
  row.push(cell);
  grid.push(row);
  return grid;
}

/**
 * A grid as the tab-separated text the paste boxes already understand.
 *
 * A tab or a newline inside a cell becomes a space: they would otherwise make
 * one cell look like two, and no name or mark has either in it.
 */
export function gridToText(grid: Grid): string {
  const rows = grid.map((row) => {
    const cells = row.map((c) => c.replace(/[\t\r\n]+/g, ' ').trim());
    while (cells.length && cells[cells.length - 1] === '') cells.pop();
    return cells.join('\t');
  });
  while (rows.length && rows[rows.length - 1] === '') rows.pop();
  return rows.join('\n');
}

// ---------------------------------------------------------------------------
// zip

const u32 = (b: DataView, at: number) => b.getUint32(at, true);
const u16 = (b: DataView, at: number) => b.getUint16(at, true);

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

async function inflate(bytes: Uint8Array, method: number): Promise<Uint8Array> {
  if (method === 0) return bytes;
  if (method !== 8) throw new Error(`This file uses a compression this reader does not know (${method}).`);
  const stream = new Blob([bytes as BlobPart]).stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Every entry of a zip, by name. Reads the central directory, not the stream. */
async function unzip(data: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const view = new DataView(data);
  const bytes = new Uint8Array(data);

  // The end-of-directory record is last, after a comment of up to 64 KB.
  let eocd = -1;
  for (let i = data.byteLength - 22; i >= 0 && i >= data.byteLength - 22 - 0xffff; i -= 1) {
    if (u32(view, i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('That file is not a spreadsheet — it is not even a zip.');

  const entries = u16(view, eocd + 10);
  let at = u32(view, eocd + 16);
  if (at === 0xffffffff) throw new Error('That spreadsheet is in the zip64 format, which this reader cannot open.');

  const out = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  for (let n = 0; n < entries; n += 1) {
    if (u32(view, at) !== CENTRAL) break;
    const method = u16(view, at + 10);
    const compressed = u32(view, at + 20);
    const nameLen = u16(view, at + 28);
    const extraLen = u16(view, at + 30);
    const commentLen = u16(view, at + 32);
    const localAt = u32(view, at + 42);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLen));

    if (u32(view, localAt) === LOCAL) {
      // the local header's own lengths, which need not match the directory's
      const start = localAt + 30 + u16(view, localAt + 26) + u16(view, localAt + 28);
      // eslint-disable-next-line no-await-in-loop
      out.set(name, await inflate(bytes.subarray(start, start + compressed), method));
    }
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

// ---------------------------------------------------------------------------
// the XML inside

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
};

function unescapeXml(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

const attr = (tag: string, name: string): string => {
  const m = new RegExp(`${name}="([^"]*)"`).exec(tag);
  return m ? unescapeXml(m[1]) : '';
};

/** The <t> runs of one element, joined — a styled word is several runs. */
function textOf(xml: string): string {
  const parts = xml.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [];
  return parts.map((p) => unescapeXml(p.replace(/<t[^>]*>/, '').replace(/<\/t>$/, ''))).join('');
}

function sharedStrings(xml: string): string[] {
  return (xml.match(/<si>[\s\S]*?<\/si>/g) ?? []).map(textOf);
}

/** Built-in number formats that mean a date or a time. */
const DATE_BUILTINS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/** For each cell style, whether its number format is a date. */
function dateStyles(xml: string): boolean[] {
  const custom = new Map<number, string>();
  for (const tag of xml.match(/<numFmt\b[^>]*\/?>/g) ?? []) {
    custom.set(Number(attr(tag, 'numFmtId')), attr(tag, 'formatCode'));
  }
  const block = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  if (!block) return [];
  return (block[1].match(/<xf\b[^>]*\/?>/g) ?? []).map((tag) => {
    const id = Number(attr(tag, 'numFmtId') || '0');
    if (DATE_BUILTINS.has(id)) return true;
    const code = custom.get(id);
    if (!code) return false;
    // d, m or y outside quoted text and outside [colour]/[condition] blocks
    return /[dmy]/i.test(code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, ''));
  });
}

/**
 * An Excel date number as a plain YYYY-MM-DD.
 *
 * Day 1 is 1 January 1900 and day 60 is 29 February 1900, a day that never
 * existed — Excel kept Lotus's bug deliberately. Every date a school writes is
 * far above 60, so the epoch is 1899-12-30 and anything at or below 60 is left
 * as the number it is rather than silently shifted.
 */
export function excelDate(serial: number): string {
  if (!Number.isFinite(serial) || serial <= 60) return '';
  const ms = Math.floor(serial) * 86400000 + Date.UTC(1899, 11, 30);
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** "BC12" -> column 54 (0-based). */
function columnOf(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

function rowOf(ref: string): number {
  const m = /(\d+)/.exec(ref);
  return m ? Number(m[1]) - 1 : 0;
}

/** The worksheet part of the FIRST sheet in the workbook. */
function firstSheetName(parts: Map<string, Uint8Array>, text: (p: string) => string): string {
  const book = text('xl/workbook.xml');
  const rels = text('xl/_rels/workbook.xml.rels');
  const sheet = /<sheet\b[^>]*>/.exec(book)?.[0];
  const id = sheet ? attr(sheet, 'r:id') : '';
  if (id) {
    for (const tag of rels.match(/<Relationship\b[^>]*>/g) ?? []) {
      if (attr(tag, 'Id') === id) {
        const target = attr(tag, 'Target').replace(/^\//, '');
        const full = target.startsWith('xl/') ? target : `xl/${target}`;
        if (parts.has(full)) return full;
      }
    }
  }
  const any = [...parts.keys()].filter((k) => /^xl\/worksheets\/sheet[^/]*\.xml$/.test(k)).sort();
  if (any.length === 0) throw new Error('That spreadsheet has no sheet in it.');
  return any[0];
}

/** An .xlsx as a grid of plain text. */
export async function readXlsx(data: ArrayBuffer): Promise<Grid> {
  const parts = await unzip(data);
  const decoder = new TextDecoder();
  const text = (p: string) => {
    const bytes = parts.get(p);
    return bytes ? decoder.decode(bytes) : '';
  };

  const shared = sharedStrings(text('xl/sharedStrings.xml'));
  const styles = dateStyles(text('xl/styles.xml'));
  const sheet = text(firstSheetName(parts, text));

  const grid: Grid = [];
  const put = (r: number, c: number, value: string) => {
    while (grid.length <= r) grid.push([]);
    const row = grid[r];
    while (row.length <= c) row.push('');
    row[c] = value;
  };

  for (const cell of sheet.match(/<c\b[^>]*(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
    const tag = /<c\b[^>]*?\/?>/.exec(cell)?.[0] ?? '';
    const ref = attr(tag, 'r');
    const kind = attr(tag, 't');
    const style = attr(tag, 's');
    const raw = /<v[^>]*>([\s\S]*?)<\/v>/.exec(cell)?.[1] ?? '';

    let value = '';
    if (kind === 's') value = shared[Number(raw)] ?? '';
    else if (kind === 'inlineStr') value = textOf(cell);
    else if (kind === 'b') value = raw === '1' ? 'TRUE' : 'FALSE';
    else if (kind === 'e') value = '';                       // an error cell is nothing
    else if (kind === 'str') value = unescapeXml(raw);       // a formula's cached text
    else if (raw !== '') {
      const n = Number(raw);
      const dated = style !== '' && styles[Number(style)] === true;
      value = dated ? (excelDate(n) || String(n)) : String(n);
    }
    if (value !== '') put(rowOf(ref), columnOf(ref), value);
  }
  return grid;
}

// ---------------------------------------------------------------------------
// what the screens call

export const SHEET_ACCEPT = '.csv,.txt,.tsv,.xlsx,.xlsm,text/csv,text/plain,'
  + 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * A chosen file as the text the paste box holds.
 *
 * It fills the box rather than saving anything: the file is only a faster way
 * to type, and what was read is on the screen to be corrected before it goes
 * anywhere near the register.
 */
export async function readSheetFile(file: File): Promise<string> {
  return gridToText(await readSheetGrid(file));
}

/**
 * The same file, kept as COLUMNS.
 *
 * readSheetFile flattens a sheet to text, which is right for a tally of one
 * mark per student but throws away the only thing that can say which part a
 * number belongs to. A subject marked in CQ and MCQ needs the columns.
 */
export async function readSheetGrid(file: File): Promise<Grid> {
  if (file.name.toLowerCase().endsWith('.xls')) {
    throw new Error(
      'That is the old .xls format, which this cannot read. Open it in Excel and '
      + 'save it again as .xlsx, or as CSV.',
    );
  }
  const data = await file.arrayBuffer();
  // Judged by content as well as by name, because a name can be anything.
  // "PK" is where every zip starts, and an .xlsx is a zip.
  return looksZipped(data) ? readXlsx(data) : parseCsv(new TextDecoder().decode(data));
}

/** True if these bytes begin a zip, and so possibly an .xlsx. */
export function looksZipped(data: ArrayBuffer): boolean {
  const head = new Uint8Array(data, 0, Math.min(2, data.byteLength));
  return head.length === 2 && head[0] === 0x50 && head[1] === 0x4b;
}
