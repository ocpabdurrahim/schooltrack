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
