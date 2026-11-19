"""
Reading the digits off a photographed mark sheet.

THIS IS THE PART THAT IS NOT WRITTEN YET, and it is the only part that decides
whether any of this is worth having. The spreadsheet writing around it works
and is tested against the app; this is the hole in the middle.

The plan, which needs real photographs to build against:

  1. Find the printed grid. The form is ruled, so the lines can be found with
     morphology -- long horizontal and vertical runs of dark pixels -- rather
     than guessed at. Their intersections give the cells, and the angle of the
     lines gives the skew, so a photograph taken at a tilt can be straightened.

  2. Work out the blocks and the columns. The sheet is three blocks across,
     each Roll | CQ | MCQ | Prac | Total. The printed roll column is the
     anchor: it is the one column whose contents are known in advance, so it
     says which block is which and which row is which.

  3. Crop each mark cell and recognise one to three digits in it. This is the
     narrow problem that makes local reading plausible at all -- ten symbols,
     in a known box, on a known background -- as opposed to reading free
     handwriting off a blank page, which is not a thing to promise anybody.

  4. Return None for a box that is empty or unclear. NEVER 0. A zero is a
     mark, and a failing one; "could not read it" and "scored nothing" must
     not arrive at a teacher looking the same.

Accuracy is then MEASURED against sheets whose right answers are known, and
reported as a number. If it cannot do better than leaving half the rows blank
it is not worth having, and this file should say so plainly rather than
quietly guessing.
"""

from __future__ import annotations

from pathlib import Path


class CannotRead(Exception):
    """Something a person can act on, said in words rather than in codes."""


def read_sheet(photo: Path, component_names: list[str]) -> list[dict]:
    """
    One photographed sheet into rows of {"roll": int|None, "parts": {...}}.

    The shape workbook.marks_grid takes, so the only thing between a
    photograph and a spreadsheet the app accepts is this function.
    """
    raise CannotRead(
        "The digit recognition is not built yet. It needs real photographs of "
        "filled sheets in ocr/samples/ to be built against."
    )
