import { describe, expect, it } from 'vitest';
import {
  blankGrid,
  clipboardCells,
  filledRows,
  gridToList,
  pasteInto,
  removeRow,
  rowIsBlank,
  setCell,
  underColumns,
  withSpareRows,
} from './gridedit';

/** The SAME cases exist in android/.../data/GridEditTest.kt. */

describe('an empty form', () => {
  it('is a grid of empty cells', () => {
    expect(blankGrid(2, 3)).toEqual([['', '', ''], ['', '', '']]);
  });

  it('knows a row nobody has typed in', () => {
    expect(rowIsBlank(['', '  ', ''])).toBe(true);
    expect(rowIsBlank(['', 'Ayesha', ''])).toBe(false);
  });
});

describe('changing one cell', () => {
  it('leaves every other cell alone', () => {
    const before = blankGrid(2, 2);
    const after = setCell(before, 0, 1, 'Ayesha');
    expect(after).toEqual([['', 'Ayesha'], ['', '']]);
    // and does not write through to the grid it was given
    expect(before).toEqual([['', ''], ['', '']]);
  });

  it('ignores a cell that is not there', () => {
    const g = blankGrid(1, 1);
    expect(setCell(g, 5, 0, 'x')).toBe(g);
  });
});

describe('what the clipboard holds', () => {
  it('reads tabs as columns and newlines as rows', () => {
    expect(clipboardCells('1\tAyesha\n2\tBashir'))
      .toEqual([['1', 'Ayesha'], ['2', 'Bashir']]);
  });

  it('reads a single typed value as one cell, not as a mangled row', () => {
    expect(clipboardCells('Ayesha')).toEqual([['Ayesha']]);
  });

  it('ignores the trailing newline every spreadsheet adds', () => {
    expect(clipboardCells('1\tAyesha\n')).toEqual([['1', 'Ayesha']]);
    expect(clipboardCells('')).toEqual([]);
  });

  it('copes with Windows line endings', () => {
    expect(clipboardCells('1\tA\r\n2\tB')).toEqual([['1', 'A'], ['2', 'B']]);
  });
});

describe('pasting a block', () => {
  it('lands where the cursor is', () => {
    const got = pasteInto(blankGrid(3, 3), 1, 1, 'x\ty\nz\tw');
    expect(got).toEqual([
      ['', '', ''],
      ['', 'x', 'y'],
      ['', 'z', 'w'],
    ]);
  });

  it('grows downwards so a long list is not cut off', () => {
    // Forty names pasted into a form showing eight rows must not lose
    // thirty-two of them.
    const got = pasteInto(blankGrid(2, 1), 0, 0, Array.from({ length: 40 }, (_, i) => `n${i}`).join('\n'));
    expect(got).toHaveLength(40);
    expect(got[39]).toEqual(['n39']);
  });

  it('does NOT grow sideways, so a stray column invents no field', () => {
    const got = pasteInto(blankGrid(1, 2), 0, 0, 'a\tb\tc');
    expect(got[0]).toEqual(['a', 'b']);
  });

  it('drops what would fall off the right-hand edge', () => {
    const got = pasteInto(blankGrid(1, 3), 0, 2, 'a\tb\tc');
    expect(got[0]).toEqual(['', '', 'a']);
  });

  it('leaves the grid alone when the clipboard is empty', () => {
    const g = blankGrid(2, 2);
    expect(pasteInto(g, 0, 0, '')).toBe(g);
  });
});

describe('rows lined up under a form', () => {
  const FORM = ['roll', 'name', 'father', 'mobile'];

  it('takes the columns in the form order when there is no heading row', () => {
    expect(underColumns([['1', 'Ayesha', 'Karim']], FORM))
      .toEqual([['1', 'Ayesha', 'Karim', '']]);
  });

  it('honours a heading row whose columns are in another order', () => {
    expect(underColumns([['Name', 'Roll'], ['Ayesha', '1']], FORM))
      .toEqual([['1', 'Ayesha', '', '']]);
  });

  it('matches a heading whatever its spacing and case', () => {
    expect(underColumns([['  NAME ', 'Roll'], ['Ayesha', '1']], FORM))
      .toEqual([['1', 'Ayesha', '', '']]);
  });

  it('can be given a vocabulary, so "Father\'s Name" is the father column', () => {
    // The students form hands in the list parser's own heading table. Without
    // that, a sheet headed "Father's Name" would not be recognised as a
    // heading row at all and the headings would import as a student.
    const key = (s: string) => {
      const k = s.trim().toLowerCase().replace(/[^a-z]/g, '');
      return ({ fathersname: 'father', fathername: 'father' } as Record<string, string>)[k] ?? k;
    };
    expect(underColumns([["Father's Name", 'Roll'], ['Karim', '7']], FORM, key))
      .toEqual([['7', '', 'Karim', '']]);
  });

  it('does NOT eat a student row that happens to match one heading', () => {
    // A child actually called Roll is unlikely; a one-cell list under a
    // stray word is not. One match is a coincidence, two is a heading row.
    expect(underColumns([['Roll', 'Ayesha'], ['2', 'Bashir']], FORM))
      .toEqual([['Roll', 'Ayesha', '', ''], ['2', 'Bashir', '', '']]);
  });

  it('ignores a column the form has not got', () => {
    expect(underColumns([['Roll', 'Nickname', 'Name'], ['1', 'Ayu', 'Ayesha']], FORM))
      .toEqual([['1', 'Ayesha', '', '']]);
  });

  it('drops what falls off the right-hand edge', () => {
    expect(underColumns([['1', 'A', 'B', 'C', 'D', 'E']], FORM))
      .toEqual([['1', 'A', 'B', 'C']]);
  });

  it('gives nothing for nothing', () => {
    expect(underColumns([], FORM)).toEqual([]);
  });
});

describe('which rows count', () => {
  it('drops the empty tail', () => {
    expect(filledRows([['a'], [''], ['']])).toEqual([['a']]);
  });

  it('KEEPS a gap in the middle, so nothing shifts under the typist', () => {
    // Somebody who left a row blank meant to come back to it. Closing the gap
    // would move every row they were looking at.
    expect(filledRows([['a'], [''], ['b'], ['']])).toEqual([['a'], [''], ['b']]);
  });

  it('is empty when nothing has been typed', () => {
    expect(filledRows(blankGrid(5, 2))).toEqual([]);
  });
});

describe('spare rows to keep typing into', () => {
  it('keeps a few free below what is filled in', () => {
    const grid = [['a'], ['b'], [''], ['']];
    expect(withSpareRows(grid, 3, 2).length).toBe(5);
  });

  it('never shrinks a grid somebody is working in', () => {
    const grid = blankGrid(12, 1);
    expect(withSpareRows(grid, 3, 8)).toBe(grid);
  });

  it('starts with a usable number of rows, not one', () => {
    expect(withSpareRows(blankGrid(1, 1), 3, 8).length).toBe(8);
  });
});

describe('taking a row out', () => {
  it('removes the one asked for', () => {
    expect(removeRow([['a'], ['b'], ['c']], 1)).toEqual([['a'], ['c']]);
  });

  it('ignores a row that is not there', () => {
    const g = [['a']];
    expect(removeRow(g, 7)).toBe(g);
  });
});

describe('handing the grid to the list reader', () => {
  it('writes a heading line and tab-separated rows', () => {
    expect(gridToList(['roll', 'name'], [['1', 'Ayesha'], ['2', 'Bashir']]))
      .toBe('roll\tname\n1\tAyesha\n2\tBashir');
  });

  it('leaves out the empty tail', () => {
    expect(gridToList(['roll', 'name'], [['1', 'Ayesha'], ['', '']]))
      .toBe('roll\tname\n1\tAyesha');
  });

  it('gives nothing at all for an untouched form', () => {
    expect(gridToList(['roll', 'name'], blankGrid(8, 2))).toBe('');
  });
});
