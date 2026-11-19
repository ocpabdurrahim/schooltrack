import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseMarkParts } from './batch';
import { readXlsx } from './sheet';

/**
 * The contract between the Python reader and this app.
 *
 * marks-parts.xlsx is written BY ocr/workbook.py (see ocr/README.md) and read
 * here by the app's own .xlsx reader. The two halves are written in different
 * languages by different hands and only ever meet as this file, so they are
 * tested against it rather than against each other's descriptions.
 *
 * Rebuild it with:  ocr/.venv/Scripts/python.exe ocr/make_fixture.py
 */
const fixture = () => {
  const path = fileURLToPath(new URL('./fixtures/marks-parts.xlsx', import.meta.url));
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
};

describe('a marks spreadsheet written by the Python reader', () => {
  it('is a workbook this app can open at all', async () => {
    const grid = await readXlsx(fixture());
    expect(grid[0]).toEqual(['Roll', 'CQ', 'MCQ', 'Total']);
  });

  it('carries the parts into the app, which a pasted tally never could', async () => {
    const got = parseMarkParts(await readXlsx(fixture()), ['CQ', 'MCQ']);
    expect(got.problem).toBe('');
    expect(got.rows.map((r) => r.rollNo)).toEqual([3, 4, 5, 23, 27]);
    expect(got.rows[0].parts).toEqual({ CQ: 51, MCQ: 18 });
    expect(got.rows[3].parts).toEqual({ CQ: 28, MCQ: 15 });
  });

  it('leaves a box the reader could not make out EMPTY, not zero', async () => {
    // Roll 27's MCQ was unreadable. A zero here would be a failing mark
    // invented by a computer, and nothing downstream could tell.
    const got = parseMarkParts(await readXlsx(fixture()), ['CQ', 'MCQ']);
    const r27 = got.rows.find((r) => r.rollNo === 27);
    expect(r27?.parts).toEqual({ CQ: 28 });
    expect(r27?.parts.MCQ).toBeUndefined();
  });

  it('writes no Total for a row it could not read in full', async () => {
    // A total over a half-read row is a checksum that agrees with a mistake.
    const grid = await readXlsx(fixture());
    const r27 = grid.find((row) => row[0] === '27');
    expect(r27?.[3] ?? '').toBe('');
  });

  it('writes a Total that agrees with the parts, for a person to check', async () => {
    const grid = await readXlsx(fixture());
    for (const row of grid.slice(1)) {
      const [, cq, mcq, total] = row;
      if (cq && mcq && total) expect(Number(total)).toBe(Number(cq) + Number(mcq));
    }
  });
});
