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

    npm --prefix web run build          # once, and after any app change
    ocr/.venv/Scripts/python.exe ocr/server.py

Then open **http://localhost:8765** on that machine. On its Setup screen set
*Who reads the sheets* and put `http://localhost:8765` as the reader address.

## Why the app is served from here

Found by testing, not assumed: **a page on https://schooltrack-1941.web.app
cannot call http://localhost**. Chrome blocks it before anything leaves the
machine — nothing reaches this service at all — so no amount of CORS at this
end helps. It was checked in a real Chrome as well as in a test browser, and
both refused it.

Serving the built app from this same service puts the app and the reader on
**one origin**, and the problem stops existing: no CORS, no mixed content, no
private-network rules. One command, one address.

The deployed site keeps working exactly as before for everybody else — it just
uses Google, as it always did. The local reader is for the machine it runs on.

The Android app is not affected by any of this (it is not a browser), but a
phone reaching this service over the school wifi would be plain HTTP to a LAN
address, which Android blocks by default. That is not wired up yet.

## Samples

`samples/` holds photographs of real filled sheets. They carry a whole
section's marks and **this repository is public**, so that folder is
gitignored. Never move one out of it.
