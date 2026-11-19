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

Run `selftest.py` for a number rather than an opinion, and score a real
photograph the same way. Three numbers, not equally important:

    correct   what it got right
    blank     what it would not commit to -- SAFE, a person fills these in
    WRONG     what it got wrong and did not know -- the only dangerous one

    clean generated sheet    92% correct,  2% wrong
    real photographed sheet  45% correct,  7% wrong

Not good enough to trust yet. But the reason is worth writing down, because
it is not the one everybody assumes.

## It was never the handwriting

The obvious theory was that a printed-text recogniser cannot read a
teacher's handwriting, and the obvious fix was a handwriting model. Looking
at the actual cell crops killed that theory in one glance: the marks were
perfectly legible, and the two columns to the left of them were the DESK.

The photograph contains a desk, the pile of paper underneath, and a shadow.
Those are long, straight and dark, which is the whole definition of a printed
rule to anything looking for one. Two of them down the left margin became two
extra columns, so every column shifted by two: the tablecloth was read as the
Roll column, Roll as CQ, CQ as MCQ. The grid looked immaculate and the marks
came out as nonsense.

Cropping to the page first -- find the big bright thing, cut to it -- took
the real sheet from **0% to 33%** without touching the recogniser.
Regularising the column grid took it to **45%**.

So the recogniser is reading handwriting. It is the geometry that is still
losing marks, and that is where the remaining work is:

  * the EMPTY block's rules are the faintest on the page (nothing was written
    to darken them) and are still being missed, so a third of the sheet is
    dropped;
  * the Roll/CQ boundary lands slightly inside the digits, so 56 reads as 5
    and 34 as 4 -- always that one column.

A handwriting model may still be worth having afterwards. It is not what is
costing the marks today.

## Samples

`samples/` holds photographs of real filled sheets. They carry a whole
section's marks and **this repository is public**, so that folder is
gitignored. Never move one out of it.
