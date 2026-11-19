"""
The answer shape, which is Gemini's answer shape.

Deliberately not a shape of our own. The app already parses Gemini's reply,
checks the Total against the parts, holds a row that does not add up and stops
a sheet whose class is wrong -- several hundred lines that are already written
and already tested. Answering in a different shape would mean writing all of
that a second time, in Python, and then keeping the two in step for ever.

So the local reader's job is narrow: read the digits, and say them the way
Google says them.

    { "header": { "exam": "", "year": "", "className": "", "subject": "" },
      "rows":   [ { "roll": 3,
                    "cells": [ { "column": "CQ", "value": 51 },
                               { "column": "MCQ", "value": null } ] } ] }

The one rule that matters more than any other is in `cell`: a box the reader
will not commit to is **null**, never 0. A zero is a mark, and a failing one.
Guessing produces a plausible wrong number, which is the only kind of error
this system cannot catch.
"""

from __future__ import annotations

from typing import Optional


TOTAL_COLUMN = "Total"


def cell(column: str, value: Optional[int]) -> dict:
    """One box. `value` is None when the reader is not sure, never 0."""
    return {"column": column, "value": value}


def row(roll: Optional[int], cells: list[dict]) -> dict:
    return {"roll": roll, "cells": cells}


def header(exam: str = "", year: str = "", class_name: str = "", subject: str = "") -> dict:
    """
    Whatever is printed or written at the top of the sheet.

    Every field may be empty: the app treats a disagreement between the sheet
    and the screen as a reason to STOP, but an empty field as "could not read
    it", which is only a warning. Saying nothing is therefore safer than
    guessing -- an invented class name would stop a sheet that was fine, or
    worse, agree with the wrong one.
    """
    return {"exam": exam, "year": year, "className": class_name, "subject": subject}


def reply(head: dict, rows: list[dict]) -> dict:
    return {"header": head, "rows": rows}


class CannotRead(Exception):
    """
    Something the teacher can act on: a photograph with no grid in it, a page
    too blurred to segment. Said in words, not in codes, because it goes
    straight to somebody holding a stack of scripts.
    """
