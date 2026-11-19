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

`selftest.py` prints a number rather than an opinion, and a real photograph is
scored the same way. Three numbers, not equally important:

    correct   what it got right
    blank     what it would not commit to -- SAFE, a person fills these in
    WRONG     what it got wrong and did not know -- the only dangerous one

    clean generated sheet    92% correct,  2% wrong
    real photographed sheet  62% correct,  2% wrong

The real sheet was 0% when its photograph first arrived. What closed the gap
was geometry and arithmetic, not a better recogniser:

  * **find the page first.** A photograph contains the desk, the pile
    underneath and a shadow, and those are long, straight and dark -- the
    whole definition of a printed rule. Two down the left margin shifted
    every column by two, so the tablecloth was read as Roll and Roll as CQ.
    Cropping to the paper: 0% -> 33%.
  * **blocks sit side by side**, so at each join there are TWO rules twenty
    pixels apart. Merging them as a double-sighting destroyed a real column
    boundary and lost a block.
  * **the empty block has the faintest rules on the page** -- no ink ever
    crossed them -- and no threshold finds what is not there. The three
    blocks are identical, so the best-read one is laid over the others at the
    same pitch. Only ever as a repair: a template over a grid that was
    already right is how a working sheet gets broken.
  * **letters are a refusal, not something to strip.** A handwritten 6 comes
    back as "b", and stripping non-digits turned "5b" into a confident 5 --
    a child's 56 recorded as 5. Every wrong answer came through that one
    line.
  * **the teacher's Total is a checksum.** The parts are read independently
    of it, so when 28 is misread as 8 the sum stops matching and the row is
    held instead of quietly recording 18.

## What is still wrong

  * 36% of boxes come back blank on the real sheet, which is safe but is
    still a third of the typing left to do;
  * seven rows that are blank on the paper came back with something on them;
  * block 3's roll numbers do not read, so its rows rely on the per-cell
    reading rather than the printed run.

A handwriting model is the obvious next thing to try, and it is now a fair
test: the boxes being handed to the recogniser are the right boxes.

## Samples

`samples/` holds photographs of real filled sheets. They carry a whole
section's marks and **this repository is public**, so that folder is
gitignored. Never move one out of it.
