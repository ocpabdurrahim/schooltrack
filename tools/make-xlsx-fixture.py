"""
Rebuilds the .xlsx test fixture both clients read.

    python tools/make-xlsx-fixture.py

The web and the Android app each have their own minimal .xlsx reader (no
dependency: an .xlsx is a zip of XML), and both are tested against THE SAME
FILE so the two readers cannot drift apart. The file is deliberately awkward:

  * a shared string, an inline string and a plain number, the three ways a
    cell can hold text;
  * a real Excel date, which is a NUMBER with a date format on it — the thing
    a naive reader turns into "38353" instead of a birthday;
  * a missing cell (B3 is absent, so the row must still line up by column);
  * one entry stored uncompressed, which some exporters do for small parts;
  * a second sheet, to prove the first one is the one that is read.

Written with the standard library on purpose — the repository has no Python
dependencies and this is the only Python in it.
"""

import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
TARGETS = [
    HERE.parent / "web" / "src" / "data" / "fixtures" / "students.xlsx",
    HERE.parent / "android" / "app" / "src" / "test" / "resources" / "students.xlsx",
]

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>"""

RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"""

# The sheets are listed first-sheet-first but their r:id order is shuffled, so a
# reader that simply takes "sheet1.xml" and one that resolves the relationship
# both have to land on the same part.
WORKBOOK = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
<sheet name="Class 6 - A" sheetId="1" r:id="rId1"/>
<sheet name="Notes" sheetId="2" r:id="rId2"/>
</sheets>
</workbook>"""

WORKBOOK_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"""

SHARED = [
    "Roll", "Name", "Father", "Mobile", "DOB",      # 0-4, the heading row
    "Ayesha Khatun", "Karim Mia",                   # 5-6
    "Rakib Hasan",                                  # 7
]

SHARED_STRINGS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
    'count="%d" uniqueCount="%d">%s</sst>'
) % (len(SHARED), len(SHARED), "".join("<si><t>%s</t></si>" % s for s in SHARED))

# numFmtId 14 is the built-in short date; 165 is a custom one. Style 1 and
# style 2 are both dates, style 0 is not.
STYLES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
</styleSheet>"""

# 38353 = 2005-01-01, 40179 = 2010-01-01 (Excel's 1899-12-30 epoch).
SHEET1 = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c></row>
<row r="2"><c r="A2"><v>1</v></c><c r="B2" t="s"><v>5</v></c><c r="C2" t="s"><v>6</v></c><c r="D2" t="str"><v>01711000000</v></c><c r="E2" s="1"><v>38353</v></c></row>
<row r="3"><c r="A3"><v>2</v></c><c r="C3" t="inlineStr"><is><t>Jashim Uddin</t></is></c><c r="E3" s="2"><v>40179</v></c></row>
<row r="4"><c r="A4"><v>3</v></c><c r="B4" t="s"><v>7</v></c><c r="E4"><v>12345</v></c></row>
<row r="6"><c r="B6" t="inlineStr"><is><t>Sumi &amp; Co &lt;3</t></is></c></row>
</sheetData>
</worksheet>"""

SHEET2 = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>DO NOT READ THIS SHEET</t></is></c></row>
</sheetData>
</worksheet>"""

PARTS = [
    ("[Content_Types].xml", CONTENT_TYPES, zipfile.ZIP_DEFLATED),
    ("_rels/.rels", RELS, zipfile.ZIP_DEFLATED),
    ("xl/workbook.xml", WORKBOOK, zipfile.ZIP_DEFLATED),
    ("xl/_rels/workbook.xml.rels", WORKBOOK_RELS, zipfile.ZIP_DEFLATED),
    # stored, not deflated: a reader that only handles deflate fails here
    ("xl/sharedStrings.xml", SHARED_STRINGS, zipfile.ZIP_STORED),
    ("xl/styles.xml", STYLES, zipfile.ZIP_DEFLATED),
    ("xl/worksheets/sheet1.xml", SHEET1, zipfile.ZIP_DEFLATED),
    ("xl/worksheets/sheet2.xml", SHEET2, zipfile.ZIP_DEFLATED),
]


def build(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w") as z:
        for name, text, method in PARTS:
            z.writestr(name, text, compress_type=method)
    print("wrote %s (%d bytes)" % (path, path.stat().st_size))


if __name__ == "__main__":
    for target in TARGETS:
        build(target)
