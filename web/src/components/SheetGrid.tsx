import { useRef } from 'react';
import {
  type Cells,
  pasteInto,
  removeRow,
  setCell,
  withSpareRows,
} from '../data/gridedit';

/**
 * A grid you type into, the way a spreadsheet is.
 *
 * Not a table of inputs with a table's manners. The three things people
 * actually do in a spreadsheet are here, because without them a grid is a
 * worse paste box rather than a better one:
 *
 *   * PASTE A BLOCK and it lands from the cell you are in, growing the form
 *     downwards to fit. Pasting forty names into a form showing eight rows
 *     is the normal case, not the awkward one.
 *   * RUN OUT OF ROWS and more appear, so nobody has to press "add a row"
 *     forty times or guess how many they will need.
 *   * ENTER goes DOWN, not nowhere. Tab goes across, which the browser
 *     already does. Those two are how a column of names gets typed.
 *
 * It holds strings and knows nothing about students. What a column means is
 * the caller's business, and what the values mean is the list parser's.
 */
export type Column = {
  key: string;
  label: string;
  /** Roughly how wide, in characters, so a mobile number is not in a box for 3. */
  size?: number;
  hint?: string;
};

export default function SheetGrid({
  columns,
  cells,
  onChange,
  disabled = false,
}: {
  columns: Column[];
  cells: Cells;
  onChange: (next: Cells) => void;
  disabled?: boolean;
}) {
  const boxes = useRef<(HTMLInputElement | null)[][]>([]);

  const focus = (row: number, col: number) => {
    const el = boxes.current[row]?.[col];
    if (el) { el.focus(); el.select(); }
  };

  function onKeyDown(e: React.KeyboardEvent, row: number, col: number) {
    // Enter goes down a row, the way it does in a spreadsheet, because a
    // column of names is typed down and not across.
    if (e.key === 'Enter') {
      e.preventDefault();
      const next = withSpareRows(cells);
      if (next !== cells) onChange(next);
      setTimeout(() => focus(row + 1, col), 0);
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); focus(row + 1, col); }
    if (e.key === 'ArrowUp') { e.preventDefault(); focus(row - 1, col); }
  }

  function onPaste(e: React.ClipboardEvent, row: number, col: number) {
    const text = e.clipboardData.getData('text/plain');
    if (!text.includes('\t') && !text.includes('\n')) return;  // ordinary typing
    e.preventDefault();
    onChange(withSpareRows(pasteInto(cells, row, col, text)));
  }

  return (
    <div className="scroll">
      <table className="grid sheet">
        <thead>
          <tr>
            <th style={{ width: 34 }} aria-label="row number" />
            {columns.map((c) => (
              <th key={c.key} title={c.hint}>{c.label}</th>
            ))}
            <th style={{ width: 34 }} aria-label="remove" />
          </tr>
        </thead>
        <tbody>
          {cells.map((row, r) => (
            // eslint-disable-next-line react/no-array-index-key
            <tr key={r}>
              <td className="muted small">{r + 1}</td>
              {columns.map((c, i) => (
                <td key={c.key}>
                  <input
                    ref={(el) => {
                      boxes.current[r] = boxes.current[r] ?? [];
                      boxes.current[r][i] = el;
                    }}
                    value={row[i] ?? ''}
                    disabled={disabled}
                    size={c.size ?? 10}
                    aria-label={`${c.label}, row ${r + 1}`}
                    onChange={(e) => {
                      // Typing in the last row makes another, so the form
                      // never runs out underneath somebody.
                      onChange(withSpareRows(setCell(cells, r, i, e.target.value)));
                    }}
                    onKeyDown={(e) => onKeyDown(e, r, i)}
                    onPaste={(e) => onPaste(e, r, i)}
                  />
                </td>
              ))}
              <td>
                <button
                  type="button"
                  className="link"
                  disabled={disabled}
                  aria-label={`Remove row ${r + 1}`}
                  onClick={() => onChange(withSpareRows(removeRow(cells, r)))}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
