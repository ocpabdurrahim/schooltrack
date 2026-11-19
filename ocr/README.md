# Photographed mark sheet → spreadsheet

A local program that reads the printed mark-sheet form into an .xlsx, which is
then uploaded on the app's **Mark entry** screen. No Gemini, no quota, no
network, and a person sees the spreadsheet before anything reaches a pupil's
record.

## Why this can work locally at all

General handwriting OCR is hard and the honest answer to "can a script read
handwriting" is usually no. This is a narrower job:

- the form is **printed with ruled boxes**, so the lines can be found and each
  cell cropped rather than guessed at;
- every cell holds **one to three digits**, from an alphabet of ten;
- the teacher writes a **Total**, which is a checksum over the parts.

Finding the boxes is ordinary computer vision; recognising a digit in a known
box is a small, well-understood problem. That is a different proposition from
reading free handwriting off a blank page.

## Running it

    .venv/Scripts/python.exe sheet_to_excel.py samples/history.jpg --parts CQ MCQ

Writes `marks.xlsx` beside the photograph. Upload it on **Mark entry**.

## The spreadsheet

The paper form's own shape, so nobody has to translate between the form, the
file and the screen:

    Roll | CQ | MCQ | Total
       3 |  51 |  18 |   69

`Total` is written for a **person** to check against. The app ignores it and
computes the total from the parts itself — two numbers that should agree, one
of them computed, is the whole reason a misread digit gets noticed.

**An empty cell is left empty, never 0.** A zero is a mark, and a failing one;
"the reader could not tell" and "the child scored nothing" must never arrive at
a teacher looking the same. A row that was not read in full gets no Total
either: a total over a half-read row is a checksum that agrees with a mistake.

## The contract with the app

`web/src/data/fixtures/marks-parts.xlsx` is written by `make_fixture.py` and
read back in `web/src/data/marksfile.test.ts` by the **app's own** .xlsx
reader. The two halves are different languages written by different hands and
only ever meet as that file, so they are tested against it rather than against
each other's descriptions.

Rebuild it after any change to `workbook.py`:

    .venv/Scripts/python.exe make_fixture.py

## Where it actually stands

Run `selftest.py` for a number rather than an opinion. Two results, and the
difference between them is the whole story:

**On a clean generated sheet — 97% correct, ~2% wrong.** The pipeline is
sound: the grid is found, the columns line up, the roll sequence is settled
from the printed run, the spreadsheet is written and the app accepts it.

**On a real photographed sheet — the grid is found correctly (15 columns,
3 blocks, 37 rules) but almost nothing is read.** Not wrong: BLANK. It
refuses rather than inventing, which is the behaviour that was designed for,
but a reader that holds everything is no use to anybody.

The difference between those two numbers is not the grid. It is the
**recogniser**: RapidOCR's models are trained on PRINTED text, and they read
rendered digits beautifully and this teacher's handwriting not at all. That
is the thing to change — a handwriting model, or a small digit classifier
trained on digits written by hand — and it is a different problem from the
one solved so far, not a tuning exercise on this one.

What is already worth keeping either way: the grid finding, the trimming of
desk and shadow from the page, the roll-sequence check that stopped marks
landing against the wrong child, and the rule that an unsure box is blank.

## Samples

`samples/` holds photographs of real filled sheets. They carry a whole
section's marks and **this repository is public**, so that folder is
gitignored. Never move one out of it.
