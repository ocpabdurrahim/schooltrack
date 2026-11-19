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

    clean generated sheet       87% correct,  8% wrong
    photographed on a desk      90% correct,  2% wrong
    scanned flat (best format)  86% correct,  0% wrong

The generated sheet is now the WORST of the three, which sounds wrong and is
not. It is drawn with a computer font, and the English model reads a quirk of
that font as a trailing 6 -- it is a test of the pipeline, not of reading
handwriting, and the two real sheets are the ones that matter.

## Running it

Double-click **Mark Sheet Reader.bat**, or:

    .venv/Scripts/python.exe get_models.py     # once
    .venv/Scripts/pythonw.exe app.py

## The model has to be the English one

RapidOCR ships the CHINESE PP-OCR model, and on a page of handwritten marks
that is not a small detail. It returned Chinese characters for empty boxes
and, worse, read a handwritten **6 as "G"** and a **3 as "G"** -- so 56 came
back as "5G" and 34 as "G4". Both were refused as unreadable, which was safe
but left a third of the sheet blank.

The English model reads those same boxes as 56 at 0.99 and 27 at 0.95. That
one change took the real sheet from 64% to 86% correct and the wrong answers
to nought. `get_models.py` fetches it; the reader falls back to the bundled
Chinese model if it is missing, and reads markedly worse.

## What makes a photograph read well

The flat scan beats the desk photograph on the number that matters -- no
wrong answers at all. If sheets are to be photographed:

  * fill the frame with the page and keep the desk out of it;
  * flat, even light, no shadow across the sheet;
  * square on, not at an angle.

## What is still wrong

  * about one box in seven comes back blank on a good scan, which is safe
    but is still typing left to do;
  * a few rows that are blank on the paper come back with something on them;
  * the self-test's generated font misreads, as above.

## Samples

`samples/` holds photographs of real filled sheets. They carry a whole
section's marks and **this repository is public**, so that folder is
gitignored. Never move one out of it.
