import { describe, expect, it } from 'vitest';
import { columnName, crc32, safeFileName, sheetXml, xlsxOf, zip } from './xlsx';

/** The SAME cases exist in android/.../data/XlsxTest.kt. */

const bytes = (s: string) => new TextEncoder().encode(s);
const u16 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const u32 = (b: Uint8Array, at: number) =>
  (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

describe('the zip this writes', () => {
  const data = bytes('hello, marks');
  const out = zip([{ name: 'a.txt', data }]);

  it('puts the crc and the sizes where the format says they go', () => {
    // Written two bytes out once. Nothing complained: python, the app's own
    // reader and this file's other tests all go by the central directory, so
    // a malformed LOCAL header sails straight past them — and Excel would
    // have been entitled to refuse the file. These offsets are the format's.
    expect(u32(out, 0)).toBe(0x04034b50);   // local header signature
    expect(u16(out, 4)).toBe(20);           // version needed
    expect(u16(out, 6)).toBe(0);            // flags
    expect(u16(out, 8)).toBe(0);            // stored, not deflated
    expect(u32(out, 14)).toBe(crc32(data)); // crc32 at 14, not 16
    expect(u32(out, 18)).toBe(data.length); // compressed size at 18
    expect(u32(out, 22)).toBe(data.length); // uncompressed size at 22
    expect(u16(out, 26)).toBe('a.txt'.length);
    expect(u16(out, 28)).toBe(0);           // extra field length
  });

  it('writes the name, then the bytes, straight after the header', () => {
    expect(new TextDecoder().decode(out.slice(30, 35))).toBe('a.txt');
    expect(new TextDecoder().decode(out.slice(35, 35 + data.length))).toBe('hello, marks');
  });

  it('ends with a directory that agrees with the header', () => {
    const at = 30 + 5 + data.length;
    expect(u32(out, at)).toBe(0x02014b50);  // central directory signature
    expect(u32(out, at + 16)).toBe(crc32(data));
    expect(u32(out, at + 42)).toBe(0);      // this entry's local header is at 0
    const end = out.length - 22;
    expect(u32(out, end)).toBe(0x06054b50);
    expect(u16(out, end + 8)).toBe(1);      // one entry
  });

  it('is byte for byte the same twice, so "did it change?" is answerable', () => {
    expect(Array.from(zip([{ name: 'a.txt', data }]))).toEqual(Array.from(out));
  });
});

describe('the little pieces', () => {
  it('counts columns the way a spreadsheet does', () => {
    expect(columnName(0)).toBe('A');
    expect(columnName(25)).toBe('Z');
    expect(columnName(26)).toBe('AA');
    expect(columnName(27)).toBe('AB');
  });

  it('writes a number as a number and a word as text', () => {
    const xml = sheetXml([[1, 'Ayesha']]);
    expect(xml).toContain('<c r="A1"><v>1</v></c>');
    expect(xml).toContain('<c r="B1" t="inlineStr"><is><t>Ayesha</t></is></c>');
  });

  it('writes an empty cell as NOTHING, so blank never reads as zero', () => {
    expect(sheetXml([['', null, undefined]])).toContain('<row r="1"></row>');
  });

  it('escapes what XML cannot hold raw', () => {
    expect(sheetXml([['Smith & Co <x>']])).toContain('Smith &amp; Co &lt;x&gt;');
  });

  it('keeps a file name a file system will take', () => {
    expect(safeFileName('Class 9/A: maths?')).toBe('Class 9-A- maths-');
  });

  it('builds a workbook of the five parts a reader expects', () => {
    const book = new TextDecoder().decode(xlsxOf([['Roll']]));
    for (const part of [
      '[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels', 'xl/worksheets/sheet1.xml',
    ]) {
      expect(book).toContain(part);
    }
  });
});
