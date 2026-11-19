# Reading a mark sheet without Gemini

A local reader for the printed mark-sheet form, so a school on a free Gemini
key is not at the mercy of "this model is currently experiencing high demand".

## Why this can work locally at all

General handwriting OCR is hard and the honest answer to "can a script read
handwriting" is usually no. This is a narrower job:

- the form is **printed with ruled boxes**, so the lines can be found and each
  cell cropped rather than guessed at;
- every cell holds **one to three digits**, from an alphabet of ten;
- the teacher writes a **Total**, which is a checksum — a row whose parts do
  not add up to it is held rather than believed.

Finding the boxes is ordinary computer vision. Recognising a digit in a known
box is a small, well-understood problem. That is a different proposition from
reading free handwriting off a blank page.

## What it is

A small HTTP service on this computer. The app calls it **instead of Gemini**
and gets back the same JSON it already knows how to read, so everything after
the reading — the review grid, the Total checksum, the class/subject STOP
guards, the save — is the code that is already there and already tested.

    POST /read
    { "images": [ { "mimeType": "image/jpeg", "base64": "..." } ],
      "components": ["CQ", "MCQ"] }

    200
    { "header": { "exam": "", "year": "", "className": "Ten", "subject": "History" },
      "rows":   [ { "roll": 3, "cells": [ { "column": "CQ", "value": 51 } ] } ] }

The shape is Gemini's own reply shape on purpose. `parseScanReply` in
`web/src/data/gemini.ts` reads it unchanged, and a cell the reader will not
commit to is `null` — never `0`, because a zero is a mark, and a failing one.

## What it is not

- **Not on the phone.** This runs on a computer. The web app on the same
  machine reaches it at `http://localhost`; a phone would have to reach this
  machine over the school's wifi, which needs the machine switched on.
- **Not proven.** Whether the digits come out right is the whole question, and
  it is answered by running it against real photographed sheets, not by
  reasoning about it.

## Running it

    .venv/Scripts/python.exe server.py

## Samples

`samples/` holds photographs of real filled sheets. They carry a whole
section's marks and **this repository is public**, so that folder is
gitignored. Never move one out of it.
