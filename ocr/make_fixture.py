"""
Rebuilds the .xlsx fixture the app is tested against.

    .venv/Scripts/python.exe make_fixture.py

web/src/data/marksfile.test.ts reads this file with the APP's own .xlsx reader
and checks the parts arrive. The two halves are in different languages and
only ever meet as this file, so they are tested against it rather than against
each other's descriptions.
"""

from pathlib import Path

from workbook import marks_grid, write_xlsx

HERE = Path(__file__).resolve().parent
TARGET = HERE.parent / "web" / "src" / "data" / "fixtures" / "marks-parts.xlsx"

# The real History sheet's opening rows. Roll 23 is the one whose parts do not
# add up to the total the teacher wrote; roll 27 has a part the reader could
# not make out, which must arrive blank rather than as a zero.
ROWS = [
    {"roll": 3, "parts": {"CQ": 51, "MCQ": 18}},
    {"roll": 4, "parts": {"CQ": 56, "MCQ": 18}},
    {"roll": 5, "parts": {"CQ": 40, "MCQ": 15}},
    {"roll": 23, "parts": {"CQ": 28, "MCQ": 15}},
    {"roll": 27, "parts": {"CQ": 28, "MCQ": None}},
]

if __name__ == "__main__":
    write_xlsx(TARGET, marks_grid(["CQ", "MCQ"], ROWS))
    print(f"wrote {TARGET}")
