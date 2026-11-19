"""
Reading the digits off a photographed mark sheet.

THIS IS THE PART THAT IS NOT WRITTEN YET, and it is the only part that decides
whether any of this is worth having. Everything around it -- the service, the
contract, the app's choice of reader -- is plumbing that works the moment this
function does.

The plan, which needs real photographs to build against:

  1. Find the printed grid. The form is ruled, so the lines can be found with
     morphology (long horizontal and vertical runs of dark pixels) rather than
     guessed at. Their intersections give the cells. This also gives the skew,
     so a photograph taken at an angle can be straightened.

  2. Work out the blocks and columns. The sheet is three blocks across, each
     Roll | CQ | MCQ | Prac | Total. The printed roll column is the anchor: it
     is the one column whose contents are known in advance, so it says which
     block is which and which row is which.

  3. Crop each mark cell and recognise one to three digits in it. This is the
     narrow problem that makes local reading plausible at all -- ten symbols,
     in a known box, on a known background.

  4. Return nothing at all for a box that is empty or unclear. Never a zero.

Accuracy is then measured against sheets whose right answers are known, not
asserted. If it cannot do better than holding half the rows, it is not worth
shipping and this file should say so plainly rather than quietly guessing.
"""

from __future__ import annotations

from contract import CannotRead, header, reply


def read_sheets(pictures: list[bytes], components: list[str]) -> dict:
    """
    Reads one or more photographs of the SAME sheet-set into one answer.

    Several pictures rather than one each, because a form that runs to a second
    page shares one header, and two separate readings would have to be stitched
    together afterwards with nothing to say they came from the same sheet.
    """
    if not pictures:
        raise CannotRead("There was no photograph to read.")

    raise CannotRead(
        "This school's reader is installed but cannot read sheets yet — the "
        "digit recognition is still being built. Use Google for now, or set "
        "'Who reads the sheets' to Google on the Setup screen."
    )


def _unused_so_the_shape_is_visible() -> dict:
    """What a real answer looks like. Kept as documentation, not called."""
    return reply(header(class_name="Ten", subject="History"), [])
