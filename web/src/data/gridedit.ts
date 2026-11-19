/**
 * The rules behind a typeable grid — the part that is not React.
 *
 * A form that is a grid is the one shape an office already knows, because it
 * is the shape of the register and of the spreadsheet the list arrived in.
 * The behaviour people expect from it is not "a table of inputs" but the few
 * things a spreadsheet does: paste a block and it lands where the cursor is,
 * run out of rows and more appear, blank rows at the bottom count for nothing.
 *
 * All of it is here rather than in the component so it can be tested without
 * a browser, and so the two clients can share one answer about what pasting
 * a block means.
 *
 * This file has a twin: android/.../data/GridEdit.kt.
 */

export type Cells = string[][];

/** A grid of empty cells, which is what an empty form is. */
export function blankGrid(rows: number, cols: number): Cells {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''));
}

/** One cell changed, without disturbing the rest. */
export function setCell(grid: Cells, row: number, col: number, value: string): Cells {
  if (row < 0 || col < 0 || row >= grid.length) return grid;
  return grid.map((r, i) => (i === row ? r.map((c, j) => (j === col ? value : c)) : r));
}

/**
 * What a clipboard holds, as rows and columns.
 *
 * Tabs between cells and newlines between rows is what every spreadsheet puts
 * on the clipboard, so that is what is read. A single cell copied from
 * anywhere else is simply one row of one column, which is the ordinary typing
 * case and must not be mangled.
 */
export function clipboardCells(text: string): Cells {
  const body = text.replace(/\r\n/g, '\n').replace(/\n+$/, '');
  if (body === '') return [];
  return body.split('\n').map((line) => line.split('\t'));
}

/**
 * A pasted block, landing at the cursor.
 *
 * Grows the grid downwards to fit, because a list of forty pasted into a form
 * showing eight rows should not lose thirty-two of them. Does NOT grow
 * sideways: the columns are the form's, and a sheet with a stray extra column
 * should not quietly invent a field nobody can see.
 */
export function pasteInto(
  grid: Cells,
  atRow: number,
  atCol: number,
  text: string,
): Cells {
  const block = clipboardCells(text);
  if (!block.length) return grid;

  const cols = grid[0]?.length ?? block[0].length;
  const needed = atRow + block.length;
  const out: Cells = grid.map((r) => [...r]);
  while (out.length < needed) out.push(Array.from({ length: cols }, () => ''));

  block.forEach((line, i) => {
    line.forEach((value, j) => {
      const col = atCol + j;
      if (col < cols) out[atRow + i][col] = value;
    });
  });
  return out;
}

/** A heading, reduced to its letters, so "Father's name" and "father name" match. */
const letters = (s: string) => s.trim().toLowerCase().replace(/[^a-z]/g, '');

/**
 * Rows from a file or a clipboard, lined up under a form's columns.
 *
 * A heading row is honoured where it names a column the form has, so a sheet
 * whose columns are in another order still lands in the right boxes. Without
 * one the columns are taken in the form's own order.
 *
 * TWO headings have to match before the first row is believed to be headings
 * at all. One is not enough: a list that happens to start with a student
 * called Group, or a stray cell reading "Sex", would otherwise have a real
 * child's row eaten as a title.
 *
 * `key` is the vocabulary. By default a heading is only its letters, so
 * "Roll No" and "rollno" are one column. A caller with a richer table of
 * spellings — the students form hands in the list parser's own — passes it,
 * and then the grid and whatever reads the grid afterwards cannot disagree
 * about what a heading meant.
 */
export function underColumns(
  lines: Cells,
  headings: string[],
  key: (s: string) => string = letters,
): Cells {
  if (!lines.length) return [];
  const head = lines[0].map(key);
  const known = headings.map(key);
  const named = head.filter((h) => h !== '' && known.includes(h)).length >= 2;

  const body = named ? lines.slice(1) : lines;
  return body.map((line) => {
    const row = headings.map(() => '');
    line.forEach((value, j) => {
      const col = named ? known.indexOf(head[j] ?? '') : j;
      if (col >= 0 && col < row.length) row[col] = value;
    });
    return row;
  });
}

/** True when nothing has been typed in this row. */
export const rowIsBlank = (row: string[]) => row.every((c) => c.trim() === '');

/**
 * The rows that are actually filled in.
 *
 * Blank rows in the middle are KEPT: somebody who left a gap while typing
 * meant to come back to it, and closing the gap under them would move every
 * row they were looking at. Only the empty tail is dropped.
 */
export function filledRows(grid: Cells): Cells {
  let end = grid.length;
  while (end > 0 && rowIsBlank(grid[end - 1])) end -= 1;
  return grid.slice(0, end);
}

/**
 * Enough spare rows to keep typing into, and no more.
 *
 * A form that runs out of rows at the bottom stops the person mid-list; one
 * with two hundred spare is a wall of empty boxes. So it keeps a few free
 * below whatever has been filled in.
 */
export function withSpareRows(grid: Cells, spare = 3, least = 8): Cells {
  const cols = grid[0]?.length ?? 0;
  const filled = filledRows(grid).length;
  const want = Math.max(least, filled + spare);
  if (grid.length >= want) return grid;
  const out = grid.map((r) => [...r]);
  while (out.length < want) out.push(Array.from({ length: cols }, () => ''));
  return out;
}

/** One row taken out, by the row's own position. */
export function removeRow(grid: Cells, row: number): Cells {
  if (row < 0 || row >= grid.length) return grid;
  return grid.filter((_, i) => i !== row);
}

/**
 * The grid as the text the existing list parser already reads.
 *
 * The grid is a nicer way to type; it is not a second way to interpret what
 * was typed. Everything about names, dates, duplicate rolls and the rest
 * stays in parseStudentRows, which is tested and shared with the paste box
 * this replaced.
 */
export function gridToList(headings: string[], grid: Cells): string {
  const rows = filledRows(grid);
  if (!rows.length) return '';
  return [headings.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');
}
