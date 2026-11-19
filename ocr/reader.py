"""
A photographed mark sheet, into rows of marks.

grid.py finds the boxes; digits.py reads one box; this works out WHICH box is
which, which is the part that needs to know what the form looks like.

The form is three blocks across the page, each of them:

    Roll | CQ | MCQ | Prac | Total

so the number of columns found should be a whole number of blocks. That is a
rule worth checking rather than assuming: if the grid does not divide into
blocks of the expected width, something has gone wrong -- a cut-off page, a
fold, a shadow swallowing a rule -- and saying so is far better than reading
the marks into the wrong columns and producing a spreadsheet that looks fine.

THE PRINTED ROLL IS THE ANCHOR. It is the one column whose contents are known
before the photograph is taken, so it says which row is which. A row whose
roll cannot be read is reported with roll None rather than being quietly
numbered by its position, because position is exactly what goes wrong when a
rule is missed and two rows become one.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from digits import read_number
from grid import Cell, find_cells, load_gray


class CannotRead(Exception):
    """Something a person can act on, said in words rather than in codes."""


@dataclass
class SheetRead:
    rows: list[dict] = field(default_factory=list)
    note: dict = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


def _by_row(cells: list[Cell]) -> dict[int, list[Cell]]:
    out: dict[int, list[Cell]] = {}
    for c in cells:
        out.setdefault(c.row, []).append(c)
    for r in out:
        out[r].sort(key=lambda c: c.col)
    return out


def read_sheet(
    photo: Path,
    component_names: list[str],
    maxima: dict[str, int] | None = None,
    debug_dir: Path | None = None,
) -> SheetRead:
    """
    One photographed sheet into rows of {"roll": int|None, "parts": {...}}.

    `maxima` is each part's full marks, used only to reject a reading that
    cannot be a mark for that column -- 180 out of 70 is a misread, not a
    result.
    """
    gray = load_gray(photo)
    cells, note = find_cells(gray)
    if not cells:
        raise CannotRead(
            f"No printed grid was found on {photo.name}. Is it a photograph of "
            "the mark sheet, taken square on with the whole page in frame?"
        )

    rows = _by_row(cells)
    widths = {len(v) for v in rows.values()}
    per_block = 1 + len(component_names) + 1          # Roll + parts + Total
    full = max(widths) if widths else 0

    if full < per_block:
        raise CannotRead(
            f"{photo.name}: only {full} columns were found, and this form needs "
            f"at least {per_block} (Roll, {', '.join(component_names)}, Total). "
            "Some of the printed lines were missed — try a squarer photograph "
            "in flatter light."
        )

    blocks = full // per_block
    result = SheetRead(note={**note, "columns": full, "blocks": blocks,
                              "per_block": per_block})
    if full % per_block:
        result.warnings.append(
            f"{full} columns do not divide into blocks of {per_block}; "
            f"reading the first {blocks * per_block} and ignoring the rest."
        )

    maxima = maxima or {}
    usable = [r for r in sorted(rows) if len(rows[r]) >= per_block]

    for b in range(blocks):
        base = b * per_block

        # The roll column first, for the whole block, because the rolls are
        # PRINTED AND CONSECUTIVE and that is worth far more than reading each
        # one on its own. A misread roll is the worst thing this can do: not a
        # wrong mark, but a right mark against the wrong child, and nothing
        # downstream can see it. So the column is read, the run is found, and
        # any cell that disagrees with the run loses.
        seen: list[tuple[int, int]] = []
        for r in usable:
            roll, _ = read_number(rows[r][base].crop(gray))
            if roll is not None:
                seen.append((r, roll))

        offset, agreed = _settle_rolls(seen)
        if offset is not None and agreed < len(seen):
            result.warnings.append(
                f"block {b + 1}: {len(seen) - agreed} roll number(s) disagreed "
                "with the printed run and were taken from it instead."
            )
        if offset is None and seen:
            result.warnings.append(
                f"block {b + 1}: the printed roll numbers do not run in order, "
                "so each was read on its own. Check them against the paper."
            )

        read_rolls = dict(seen)
        for r in usable:
            roll = (r + offset) if offset is not None else read_rolls.get(r)

            parts: dict[str, int | None] = {}
            unsure = False
            line = rows[r]
            for i, name in enumerate(component_names, start=1):
                if base + i >= len(line):
                    continue
                value, _ = read_number(
                    line[base + i].crop(gray), maximum=maxima.get(name),
                )
                parts[name] = value
                if value is None:
                    unsure = True

            if all(v is None for v in parts.values()):
                continue  # nothing written on this row of this block
            result.rows.append({"roll": roll, "parts": parts, "unsure": unsure})

    if debug_dir is not None:
        _write_debug(photo, gray, cells, debug_dir)

    if not result.rows:
        raise CannotRead(
            f"The grid was found on {photo.name} ({full} columns) but no marks "
            "were read from it. If the sheet is blank that is right; otherwise "
            "the writing may be too faint or the photograph too small."
        )
    return result


def _settle_rolls(seen: list[tuple[int, int]]) -> tuple[int | None, int]:
    """
    The one offset that explains the printed roll column, and how many cells
    agreed with it.

    The rolls on a block run 1, 2, 3 ... down the page, so roll minus row
    index is the same number for every row. Reading the column therefore has
    one right answer rather than thirty independent ones, and a cell that
    produced something else was misread -- which is exactly the case that
    would otherwise put one child's marks against another's name.

    Returns (None, 0) when no offset explains most of the column, because
    then the assumption itself is wrong and guessing from it would be worse
    than admitting it.
    """
    if len(seen) < 3:
        return None, 0
    counts: dict[int, int] = {}
    for row, roll in seen:
        counts[roll - row] = counts.get(roll - row, 0) + 1
    offset, agreed = max(counts.items(), key=lambda kv: kv[1])
    # Most of the column must agree, not merely more than any other answer.
    return (offset, agreed) if agreed >= max(3, len(seen) * 0.6) else (None, 0)


def _write_debug(photo: Path, gray: np.ndarray, cells: list[Cell], out: Path) -> None:
    """
    The grid as it was found, drawn on the photograph.

    Worth more than any log line: one look says whether the lines were found
    in the right places, and that is the thing that goes wrong.
    """
    import cv2

    out.mkdir(parents=True, exist_ok=True)
    canvas = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    for c in cells:
        cv2.rectangle(canvas, (c.x, c.y), (c.x + c.w, c.y + c.h), (0, 160, 0), 1)
    target = out / f"{photo.stem}-grid.png"
    ok, buf = cv2.imencode(".png", canvas)
    if ok:
        buf.tofile(str(target))
