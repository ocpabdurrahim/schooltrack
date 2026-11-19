"""
A photographed mark sheet, into a spreadsheet the app accepts.

    .venv/Scripts/python.exe sheet_to_excel.py samples/history.jpg --parts CQ MCQ

Writes marks.xlsx beside the photograph. Upload it on the app's Mark entry
screen, where it lands in the same boxes a teacher would have typed into --
and where the marks are still checked, still shown, and still not saved until
somebody has looked at them.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from reader import CannotRead, read_sheet
from workbook import marks_grid, write_xlsx


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("photo", type=Path, help="the photographed sheet")
    ap.add_argument(
        "--parts", nargs="+", default=["CQ", "MCQ"],
        help="the mark columns on the form, in order (default: CQ MCQ)",
    )
    ap.add_argument("-o", "--out", type=Path, help="where to write the .xlsx")
    args = ap.parse_args()

    if not args.photo.is_file():
        print(f"No such photograph: {args.photo}", file=sys.stderr)
        return 2

    try:
        rows = read_sheet(args.photo, args.parts)
    except CannotRead as e:
        print(str(e), file=sys.stderr)
        return 1

    out = args.out or args.photo.with_name("marks.xlsx")
    write_xlsx(out, marks_grid(args.parts, rows))

    read = sum(1 for r in rows if r.get("roll") is not None)
    blank = sum(
        1 for r in rows for p in args.parts
        if (r.get("parts") or {}).get(p) is None
    )
    print(f"{out}  —  {read} rows, {blank} boxes left blank for somebody to fill in")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
