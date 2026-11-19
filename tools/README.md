# tools — the Oracle → Firestore mirror

One way only: Oracle is read, Firestore is written. Never the reverse
(see `docs/data-model.md` §0).

## Once

Firebase console → Project settings → **Service accounts** → *Generate new
private key*. Save it here as **`serviceAccount.json`**.

That file is a master key to the whole project — it bypasses every security
rule, which is exactly why the importer can mirror into collections the rules
mark read-only. It is in `.gitignore` and **must never be committed**. If it
ever is, revoke it in the console immediately; a public repo is permanent.

```bash
npm install
```

## Every time

1. Run the queries in `export-reference.sql`, one at a time, in APEX
   **SQL Workshop → SQL Commands**.
2. From the results grid use **Download → CSV** and save each file into
   `tools/data/` under the name written above its query
   (`students.csv`, `classes.csv`, …). That folder is gitignored.
3. Look at what would happen:

   ```bash
   npm run import
   ```

   Nothing is written. It prints a count per collection and one example
   document, so you can see the mapping is right before trusting it.

4. Then write it:

   ```bash
   npm run import:commit
   ```

## What it guarantees

- **Ids are the Oracle ids.** `studentId` 76 stays 76, so the QR cards already
  printed (`SMS-STU-76`) keep working and a second run updates rather than
  duplicates.
- **Re-running is safe.** Every write is `{ merge: true }`, and empty CSV
  fields are dropped rather than written as nulls — so a blank column cannot
  erase a value the app has since added.
- **Order is dependency-first:** settings, classes, students, staff, subjects,
  exams, fee heads, fee structure, expense heads, holidays.
- Each document is stamped `mirroredFrom: 'ORACLE'`, so it is always obvious
  which records came from the old system.

## What it does not do

Historical attendance, receipts and results are not in here. They are far
larger, and while Oracle still owns those modules there is nothing to gain from
copying them yet. They get their own exporter when their screens are built and
their module changes owner.

```bash
node import.mjs --only students,classes --commit   # one collection at a time
```


---

# reset-school.mjs — empty the school and start again

```bash
node reset-school.mjs                     # what WOULD go. Deletes nothing.
node reset-school.mjs --wipe              # empties the school, after a backup
node reset-school.mjs --wipe --records    # keeps classes, subjects, fees, staff
node reset-school.mjs --restore=data/backup-matkhola-....json
```

## Why this is a script and not a button in the app

The security rules refuse deletes almost everywhere, and not by oversight.
Every `allow write: ... && stamped()` turns one away, because a delete carries
no `request.resource`; and `payments` says it outright:

```
allow update, delete: if false;
// A receipt is never edited or deleted. Money that was taken wrongly is
// corrected with another document, the way the paper ledger does it.
```

An in-app reset would mean opening delete on every collection **for ever**, so
that an append-only ledger stopped being append-only, in exchange for an
operation a school performs about once. This runs with the service account
instead, which bypasses the rules by design — from one computer, by hand.
Nothing on a phone or in a browser can reach it.

## What it keeps

| Mode | Kept |
|---|---|
| `--wipe` | `members`, `settings`, `integrations` |
| `--wipe --records` | those, plus `classes`, `subjects`, `feeHeads`, `feeStructure`, `expenseHeads`, `holidays`, `staff`, `salaryStructure` |

`members` is never cleared in either mode. It holds the only grant of access
there is — signing in gives nothing by itself — so a reset that cleared it
would lock the school out of its own app. `integrations` is the Gemini key:
it belongs to the school, it costs money, and re-pasting it is a nuisance
rather than a safeguard.

**Anything not on that list is cleared**, including a collection added later
that nobody has thought about. A "clean" database with last year's records
still in a corner is worse than no reset at all. Every collection found is
printed, under the heading it has been put, before anything is touched.

Clearing `counters` restarts student, staff and receipt numbering at 1. The
app creates a counter it cannot find (`snap.exists() ? next : 1`), so this is
safe.

## The guards

1. **No flags is a dry run.** The first thing anyone does with an unfamiliar
   script is run it to see what it says, and that must not be the thing that
   empties the school.
2. **It says which database it is about to empty**, live or emulator, before
   anything else. The one unrecoverable mistake here is running it against the
   live project while believing it is the emulator.
3. **Every run backs up first** — all of it, not only what is going — and
   reads the file back and counts it before a single delete. If the backup is
   short, nothing is deleted.
4. **You type the school's name.** Not `yes`, not `y`: a sentence you cannot
   produce by leaning on the keyboard, and one that names which school. Case
   and extra spaces are forgiven; anything else is refused.
5. **It counts what is left afterwards**, from the database, and says so
   rather than reporting success from its own arithmetic.

## The backup

`tools/data/backup-matkhola-<when>.json`, which is gitignored (it is the whole
school: real names, guardians, marks and money — this repo is public).

Timestamps are tagged on the way out and rebuilt on the way in. Written
straight to JSON a Firestore Timestamp comes back as `{_seconds, _nanoseconds}`
— an ordinary map — and the restore would look perfect while every "last
changed" was quietly wrong for ever. A type the backup does not recognise
stops it rather than being written out as whatever `JSON.stringify` makes of
it.

Restoring does **not** delete first: it writes the file's documents over
whatever is there, so putting last month back does not take this month away.

## Tests

```bash
node --test tools/reset-plan.test.mjs tools/reset-values.test.mjs
```

The plan is the whole of the dangerous decision, so it is the part with tests:
what survives, what the confirmation accepts, and how the flags are read.
