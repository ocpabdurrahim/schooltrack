"""
Writing the marks out as a .xlsx the app will accept.

The shape is the paper form's own: a heading row, then Roll and one column per
part. That is not a coincidence — the teacher's form, the spreadsheet and the
app's upload all describe the same thing, and keeping one layout across the
three means nobody has to translate between them.

    Roll | CQ | MCQ | Total
       3 | 51 |  18 |    69

Total is written for a person to check against, and the app ignores it: it
computes the total from the parts itself, and has done since long before any
of this. Two numbers that should agree, one of them computed, is the whole
reason a misread digit gets noticed at all.

AN EMPTY CELL IS LEFT EMPTY. Not zero. A zero is a mark, and a failing one;
"the reader could not tell" and "the child scored nothing" must never arrive
at a teacher looking the same.

Written with the standard library, like tools/make-xlsx-fixture.py: an .xlsx
is a zip of XML, and a school's office machine should not need a spreadsheet
library installed to add up marks.
"""

from __future__ import annotations

import zipfile
from pathlib import Path
from typing import Optional, Sequence

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>"""

ROOT_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"""

WORKBOOK = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Marks" sheetId="1" r:id="rId1"/></sheets>
</workbook>"""

WORKBOOK_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>"""

Cell = Optional[object]


def column_name(index: int) -> str:
    """0 -> A, 25 -> Z, 26 -> AA. Spreadsheets count in a strange base."""
    name = ""
    n = index
    while True:
        name = chr(ord("A") + n % 26) + name
        n = n // 26 - 1
        if n < 0:
            return name


def _escape(text: str) -> str:
    return (text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def _cell_xml(ref: str, value: Cell) -> str:
    # An empty cell is written as nothing at all, which is how a spreadsheet
    # says "blank" and how the app's reader reads it.
    if value is None or value == "":
        return ""
    if isinstance(value, bool):
        value = str(value)
    if isinstance(value, (int, float)):
        return f'<c r="{ref}"><v>{value}</v></c>'
    return f'<c r="{ref}" t="inlineStr"><is><t>{_escape(str(value))}</t></is></c>'


def sheet_xml(rows: Sequence[Sequence[Cell]]) -> str:
    out = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
        "<sheetData>",
    ]
    for r, row in enumerate(rows, start=1):
        cells = "".join(_cell_xml(f"{column_name(c)}{r}", v) for c, v in enumerate(row))
        out.append(f'<row r="{r}">{cells}</row>')
    out.append("</sheetData></worksheet>")
    return "".join(out)


def write_xlsx(path: Path, rows: Sequence[Sequence[Cell]]) -> Path:
    """Writes the grid as a one-sheet .xlsx."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", ROOT_RELS)
        z.writestr("xl/workbook.xml", WORKBOOK)
        z.writestr("xl/_rels/workbook.xml.rels", WORKBOOK_RELS)
        z.writestr("xl/worksheets/sheet1.xml", sheet_xml(rows))
    return path


def marks_grid(
    component_names: Sequence[str],
    rows: Sequence[dict],
    with_total: bool = True,
) -> list[list[Cell]]:
    """
    The grid the app reads: a heading row, then one row per student.

    `rows` are {"roll": int|None, "parts": {name: int|None}}. A part that is
    missing or None is left blank -- never written as 0.
    """
    heading: list[Cell] = ["Roll", *component_names]
    if with_total:
        heading.append("Total")
    heading.append("Check")

    grid: list[list[Cell]] = [heading]
    for row in rows:
        parts = row.get("parts") or {}
        line: list[Cell] = [row.get("roll")]
        got: list[int] = []
        for name in component_names:
            v = parts.get(name)
            line.append(v)
            if isinstance(v, int):
                got.append(v)

        if with_total:
            # The TEACHER'S total, as written on the paper, not one computed
            # from the parts. A computed total always agrees with the parts,
            # which makes it worthless as a check; the paper's total is the
            # independent second opinion, and a row where the two disagree is
            # visible at a glance in the spreadsheet.
            written = row.get("written_total")
            if written is None and len(got) == len(component_names):
                written = sum(got)
            line.append(written)

        # Why this row is worth a look, in words, in the sheet itself.
        line.append(row.get("held") or "")
        grid.append(line)
    return grid
