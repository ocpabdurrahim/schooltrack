"""
Finding the printed grid on a photographed mark sheet.

This is why reading the form locally is a reasonable thing to attempt at all.
Nobody can promise to read free handwriting off a blank page, but this page is
not blank: it is RULED, and the rules are printed, straight, and much longer
than anything a person writes. Find those, and the problem collapses from
"read handwriting" to "read one to three digits out of a known box".

The method is the standard one for a ruled table and it is worth saying why
each step is there:

  * threshold so ink is white on black, adaptively, because a photograph of a
    page is never evenly lit -- one corner in shadow is normal and a single
    global threshold loses it;
  * keep only runs of ink much LONGER than a digit, horizontally and then
    vertically. A handwritten 7 cannot survive that; a printed rule does.
    This is what separates the form from what is written on it;
  * where the two survivors cross is a corner of a cell, and the spread of
    those crossings gives the column and row lines;
  * the cells are the rectangles between consecutive lines.

What this does NOT do is assume the sheet is square to the camera or that the
columns are where they were last time. The lines are found on this photograph.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class Cell:
    """One box of the printed grid, in pixels on the straightened image."""
    row: int
    col: int
    x: int
    y: int
    w: int
    h: int

    def crop(self, image: np.ndarray, inset_x: float = 0.05,
             inset_y: float = 0.12) -> np.ndarray:
        """
        The inside of the box.

        Inset because the printed rule is not part of what is written in the
        box, and a stray line along the edge reads as a 1 more often than you
        would like.

        Far less off the SIDES than the top and bottom, and the asymmetry is
        not fussiness: a two-digit mark fills its box across and a tenth off
        each side took 56 down to 5 and 34 down to 4. Vertically there is
        room to spare, and the rules above and below are the ones most likely
        to be mistaken for ink.
        """
        dx, dy = int(self.w * inset_x), int(self.h * inset_y)
        return image[self.y + dy: self.y + self.h - dy, self.x + dx: self.x + self.w - dx]


# Tuned against a real photographed sheet, not chosen by eye. The rules on
# this form are THIN and GREY -- far fainter than the handwriting -- so a
# large window with a small bias is what keeps them: at a bias of 15 the
# vertical rules of two of the three blocks vanished entirely and the sheet
# read as "no grid found".
INK_WINDOW = 41
INK_BIAS = 3

def _ink(gray: np.ndarray) -> np.ndarray:
    """Ink as white on black, evenly, whatever the lighting across the page."""
    return cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV,
        INK_WINDOW, INK_BIAS,
    )


def _lines(ink: np.ndarray, horizontal: bool, min_fraction: float = 0.12) -> np.ndarray:
    """
    Only the printed rules: runs of ink far longer than any handwriting.

    `min_fraction` is of the page, not of a cell. A twelfth of the page is
    still many times the height of a digit, so handwriting cannot survive it
    -- but the rules of THIS form only span one of three blocks across, so a
    third of the page, which sounds safely conservative, finds nothing at all.
    """
    h, w = ink.shape
    length = max(12, int((w if horizontal else h) * min_fraction))
    shape = (length, 1) if horizontal else (1, length)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, shape)
    out = cv2.erode(ink, kernel, iterations=1)
    return cv2.dilate(out, kernel, iterations=1)


def _positions(mask: np.ndarray, axis: int, gap: int, evenly_spaced: bool = False) -> list[int]:
    """
    Where the lines are, one number per line.

    A printed rule is several pixels thick and a photograph smears it further,
    so neighbouring hits are collapsed into the middle of their run. `gap` is
    how far apart two lines must be to count as two.
    """
    counts = mask.sum(axis=axis) / 255.0
    # Relative to the strongest line, but with a floor: a block border runs
    # the whole page and an inner column rule only the height of the table,
    # and judging the second against the first loses it.
    strong = counts > max(40.0, counts.max() * 0.15) if counts.max() else counts > 0
    out: list[int] = []
    run: list[int] = []
    for i, hit in enumerate(strong):
        if hit:
            run.append(i)
        elif run:
            out.append(int(np.mean(run)))
            run = []
    if run:
        out.append(int(np.mean(run)))

    merged: list[int] = []
    for p in out:
        if merged and p - merged[-1] < gap:
            merged[-1] = (merged[-1] + p) // 2
        else:
            merged.append(p)
    return _one_rule_per_line(merged) if evenly_spaced else merged


def _one_rule_per_line(positions: list[int]) -> list[int]:
    """
    Drops lines that would cut a row of the form in half.

    A printed rule photographed at an angle, or thickened by the threshold,
    is often found TWICE -- once at each edge of its own ink. Left alone that
    turns one row of boxes into two slivers, and a digit cut across the middle
    is a digit nothing can read. It is also invisible in the numbers: the grid
    looks fine, every cell is a neat rectangle, and the sheet simply comes
    back empty.

    The form's rows are evenly spaced, so the usual gap IS the row height,
    and anything much smaller is a second sighting of one rule rather than a
    row of its own.
    """
    if len(positions) < 4:
        return positions
    gaps = [b - a for a, b in zip(positions, positions[1:])]
    usual = sorted(gaps)[len(gaps) // 2]
    if usual <= 0:
        return positions

    kept = [positions[0]]
    for p in positions[1:]:
        if p - kept[-1] < usual * 0.55:
            # The same rule seen twice: keep the middle of the pair.
            kept[-1] = (kept[-1] + p) // 2
        else:
            kept.append(p)
    return kept


def deskew(gray: np.ndarray) -> np.ndarray:
    """
    Straightens the page using the printed rules themselves.

    A sheet photographed on a desk is never quite square, and a few degrees is
    enough to make a row of boxes drift into the row below by the far side of
    the page.
    """
    ink = _ink(gray)
    rows = _lines(ink, horizontal=True)
    found = cv2.HoughLinesP(
        rows, 1, np.pi / 180, threshold=120,
        minLineLength=int(gray.shape[1] * 0.35), maxLineGap=20,
    )
    if found is None:
        return gray

    angles = []
    # OpenCV 4 hands back (N, 1, 4); OpenCV 5 hands back (N, 4). Reshaping
    # copes with both rather than depending on which is installed.
    for x1, y1, x2, y2 in np.asarray(found).reshape(-1, 4):
        if x2 == x1:
            continue
        a = np.degrees(np.arctan2(y2 - y1, x2 - x1))
        if abs(a) < 20:  # a page rule, not something standing on end
            angles.append(a)
    if not angles:
        return gray

    angle = float(np.median(angles))
    if abs(angle) < 0.2:
        return gray
    h, w = gray.shape
    m = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    return cv2.warpAffine(
        gray, m, (w, h), flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE,
    )


def find_cells(gray: np.ndarray) -> tuple[list[Cell], dict]:
    """
    Every box of the printed grid, with a note on what was found.

    The note is for a person looking at a photograph that did not work: how
    many rules were found each way is the difference between "this is not a
    form" and "the bottom of the page was cut off".
    """
    ink = _ink(gray)
    h, w = gray.shape

    # The two directions are not symmetric on this form. A horizontal rule
    # spans one block, about a third of the page; a vertical one spans only
    # the height of the table, and the inner column rules are the faintest
    # thing printed on the sheet. Asking as much of them loses them.
    # evenly_spaced only for the rows: the form's ROWS are all one height,
    # so a gap much under that is one rule seen twice. The COLUMNS are not --
    # Roll is deliberately narrower than Total -- and applying the same rule
    # to them collapses real columns and loses whole blocks.
    across = _lines(ink, horizontal=True, min_fraction=0.12)
    down = _lines(ink, horizontal=False, min_fraction=0.05)

    rows = _positions(across, axis=1, gap=max(8, h // 120), evenly_spaced=True)
    cols = _positions(down, axis=0, gap=max(8, w // 150))

    # Trim to where the table actually is.
    #
    # A photograph has a page in it, and around the page a desk, a shadow, the
    # edge of the sheet underneath. Those produce long straight dark lines
    # which are, to everything above, indistinguishable from a printed rule --
    # and two of them down the left margin shift every column by one, so the
    # margin is read as the Roll column, the Roll column as CQ, and the sheet
    # comes back as nonsense that looks like a clean grid.
    #
    # The horizontal rules say where the table is: they are printed INSIDE it
    # and span it. Anything outside their reach is not part of the form.
    cols = _regularise(_within(cols, _extent(across, axis=0), w))
    rows = _within(rows, _extent(down, axis=1), h)

    note = {"horizontal_rules": len(rows), "vertical_rules": len(cols),
            "width": w, "height": h}

    cells: list[Cell] = []
    for r in range(len(rows) - 1):
        for c in range(len(cols) - 1):
            y, yy = rows[r], rows[r + 1]
            x, xx = cols[c], cols[c + 1]
            # Slivers between two renderings of the same rule are not boxes.
            if yy - y < 10 or xx - x < 10:
                continue
            cells.append(Cell(row=r, col=c, x=x, y=y, w=xx - x, h=yy - y))
    return cells, note


def _regularise(positions: list[int]) -> list[int]:
    """
    Makes the column lines a grid again: no duplicates, no holes.

    Two things go wrong on a real photograph and they pull in opposite
    directions. A thick rule is found twice, a few pixels apart, which splits
    one column into two slivers and cuts a two-digit mark in half. And the
    faintest rules — always the EMPTY block's, since nothing was written to
    darken them — are not found at all, which silently merges five columns
    into one and loses a third of the sheet.

    The form's columns are near enough one width, so that width is the
    measure for both: anything far below it is one rule seen twice, and a gap
    far above it is a rule that was missed and can be put back.
    """
    if len(positions) < 4:
        return positions

    gaps = sorted(b - a for a, b in zip(positions, positions[1:]))
    usual = gaps[len(gaps) // 2]
    if usual <= 0:
        return positions

    kept = [positions[0]]
    for p in positions[1:]:
        if p - kept[-1] < usual * 0.45:
            kept[-1] = (kept[-1] + p) // 2   # the same rule, twice
        else:
            kept.append(p)

    filled = [kept[0]]
    for p in kept[1:]:
        span = p - filled[-1]
        missing = int(round(span / usual)) - 1
        # Only fill a gap that is a whole number of columns wide. A gap that
        # is 1.4 columns is not a missing rule, it is simply a wider column.
        if 1 <= missing <= 6 and abs(span / usual - round(span / usual)) < 0.22:
            step = span / (missing + 1)
            filled.extend(int(filled[-1] + step * (i + 1)) for i in range(missing))
        filled.append(p)
    return filled


def _extent(mask: np.ndarray, axis: int) -> tuple[int, int] | None:
    """Where this set of rules begins and ends, along the given axis."""
    counts = mask.sum(axis=axis) / 255.0
    # A low bar on purpose. This is only asking "is any of the table here",
    # and the emptiest block has the faintest rules -- judging it against the
    # busiest block's maximum cuts the empty block off the page.
    hit = np.flatnonzero(counts > 2.0) if counts.max() else []
    if len(hit) < 2:
        return None
    return int(hit[0]), int(hit[-1])


def _within(positions: list[int], extent: tuple[int, int] | None, size: int) -> list[int]:
    """Only the lines inside the table, plus a little slack for its own edges."""
    if extent is None:
        return positions
    lo, hi = extent
    slack = max(6, size // 100)
    return [p for p in positions if lo - slack <= p <= hi + slack]


def crop_to_page(gray: np.ndarray) -> np.ndarray:
    """
    Throws away everything that is not the sheet of paper.

    This has to happen BEFORE looking for rules, and leaving it out was the
    bug that made a legible sheet unreadable. A photograph taken on a desk
    contains the desk, the edge of the pile underneath, and a shadow — and
    those are long, straight and dark, which is the entire definition of a
    printed rule as far as the next step is concerned. Two of them down the
    left margin became two extra columns, so every column shifted by two: the
    tablecloth was read as the Roll column, Roll as CQ, CQ as MCQ. The grid
    looked perfect and the marks came out as nonsense.

    The page is the big bright thing. Find it, cut to it, and the desk stops
    being able to pretend.
    """
    h, w = gray.shape
    soft = cv2.GaussianBlur(gray, (9, 9), 0)
    _, bright = cv2.threshold(soft, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    bright = cv2.morphologyEx(
        bright, cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_RECT, (25, 25)),
    )
    found, _ = cv2.findContours(bright, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not found:
        return gray

    x, y, cw, ch = cv2.boundingRect(max(found, key=cv2.contourArea))
    # Only believe it if it looks like a page rather than a highlight: a
    # quarter of the frame at least, and not a sliver.
    if cw * ch < 0.25 * w * h or min(cw, ch) < 0.3 * min(w, h):
        return gray

    # A little inside the edge: the paper's own border is not part of the form
    # and is itself a long dark line.
    m = max(3, min(cw, ch) // 100)
    return gray[y + m: y + ch - m, x + m: x + cw - m]


def load_gray(path) -> np.ndarray:
    """The photograph as grey, straightened, and not absurdly large."""
    data = np.fromfile(str(path), dtype=np.uint8)
    image = cv2.imdecode(data, cv2.IMREAD_GRAYSCALE)
    if image is None:
        raise ValueError(f"{path} is not an image this can read.")
    # Big enough for the thin printed rules to survive, small enough to work
    # on: a 12-megapixel photo takes four times as long for no better reading.
    # 3000 rather than 2200: a printed rule on this form is about one pixel
    # at 2200 and survives neither the downscale nor the threshold, and the
    # marks are easier to read larger too.
    long_edge = max(image.shape)
    if long_edge > 3000:
        scale = 3000 / long_edge
        image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    return deskew(crop_to_page(image))
