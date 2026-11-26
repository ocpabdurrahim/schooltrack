# SchoolTrack — data model

Android (Kotlin/Compose) + Web (React/Vite) on Firestore: a **standalone
school management app**, the same shape as [[SkillTrack]].
`firebase/firestore.rules` quotes the section headings below, so when a rule
looks surprising the reason is here.

---

## 0. What this app is

SchoolTrack is the system of record. It holds its own data and is not linked
to any other system.

It began life (Nov 2026) as a companion to the Oracle APEX app **SMS** (app
161019), with a `settings/ownership` document saying which system owned each
module and rules that refused writes to anything Oracle owned. **That is gone.**
The switch, the rules gate and the one-way CSV mirror were removed on
2026-11-15 when the app became a standalone replica. Anything in this repo that
still speaks of a module "belonging" to Oracle is out of date — and the
importer under `tools/` is now only an optional one-time way to carry old
records in, not part of how the app works.

The APEX app remains the reference for *what the screens must do* — its
modules are listed in §7 as the build order — but not for where the data lives.

---

## 1. Tenancy

```
schools/{schoolId}                       e.g. "matkhola"
  members/{emailLower}                   staff access
  guardians/{emailLower}                 parent / student access
  classes/{classId}
  students/{studentId}
  staff/{staffId}
  subjects/{subjectId}
  exams/{examId}
  results/{resultId}
  attendance/{yyyy-mm-dd}                 the day was opened
  attendanceMarks/{yyyy-mm-dd}_{studentId}
  holidays/{yyyy-mm-dd}
  feeHeads/{feeHeadId}
  feeStructure/{structureId}
  discounts/{discountId}
  payments/{paymentId}
  expenseHeads/{expenseHeadId}
  expenses/{expenseId}
  salaryPayments/{salaryPaymentId}
  documents/{documentId}
  counters/{counterId}
  settings/school                        single doc
```

A top-level `schools/{schoolId}` even though there is one school. It costs
nothing now, it matches the `centers/{centerId}` pattern already proven in
SkillTrack, and the rules read the same way. Without it, adding a second school
later means rewriting every path, every rule and every query.

**Ids carry over from Oracle.** `studentId` is the Oracle `STUDENT_ID` as a
string. That keeps the printed QR cards valid — they encode `SMS-STU-76`, and
76 stays 76 — and makes the mirror idempotent: re-running it updates rows
rather than duplicating them.

---

## 2. Who may do what

### Staff — `members/{emailLower}`

```ts
{ email, name, staffId, role: 'ADMIN'|'TEACHER'|'ACCOUNTS'|'OFFICE',
  active: boolean, deleted: boolean, updatedAt }
```

Mirrors the APEX roles exactly (`fn_has_role`, `staff.app_username`, page 52),
so the same person has the same powers in both systems during the transition:

| Role | Reads | Writes |
|---|---|---|
| ADMIN | everything | everything |
| TEACHER | students, classes, attendance, results | attendance, marks |
| ACCOUNTS | students, fees, expenses, salary | payments, expenses |
| OFFICE | students, documents | documents, student contact details |

### Guardians — `guardians/{emailLower}`

```ts
{ email, name, studentIds: string[], active: boolean, updatedAt }
```

**A guardian sees only the students listed in their own doc.** Every
guardian-facing rule resolves through `studentIds.hasAny([...])`, never through
a field on the student. A parent must not be able to widen their own access by
editing anything they can write, so guardian docs are **writable by ADMIN only**.

Guardians are strictly read-only across the whole database. There is no
guardian write path at all — not for contact details, not for anything.

---

## 3. Collections

### `settings/school`
`instituteName, sessionLabel, address, eiin, headTeacher, weekendDays: ['FRI','SAT']`
— the Oracle `school_settings` row. Every printed document reads it, so it is
one doc, cached hard.

### `classes/{classId}`
`className ('Class 6'), section ('A'), displayName ('Class 6 - A'), sortOrder, active`

### `students/{studentId}`
```ts
{ fullName, rollNo, regNo, classId, className, section,   // class denormalised
  groupName, religion, gender, dob, fatherName, motherName,
  bloodGroup, mobileNo, photoPath,
  status: 'A'|'I',                                        // A = active
  guardianEmails: string[],                               // for notifications only
  updatedAt }
```

`className`/`section` are denormalised so a register or an ID card renders from
one read. **They are a snapshot of the student's CURRENT class** and must never
be used to label history — see §4.

### `attendanceMarks/{date}_{studentId}`
```ts
{ studentId, classId, className, section, rollNo,   // snapshot at marking time
  date: '2026-11-15', status: 'P'|'A'|'L'|'E',
  markedVia: 'SCAN'|'MANUAL', markedBy, markedAt }
```

**class and roll are copied in, exactly as `attendance_daily` does in Oracle.**
Reading them from the student doc would silently re-label every past register
the moment a student is promoted. This is the single most important modelling
rule carried over from the APEX app, and it applies to results and fees too.

One doc per student per day: ~78 × 195 = ~15k docs a year, trivial for
Firestore, and it is the right grain for an offline write queue — each scan is
one small independent write that can be retried on its own. The document id
carries the uniqueness, so a replayed scan overwrites rather than duplicates.

**FLAT, not `attendance/{date}/marks/{id}`.** The nested shape forced a
collection-group query for "one student across many days", and a
collection-group rule **cannot be scoped to a school** — it has to sit at the
root, where it cannot tell one school's marks from another's. Flat keeps every
query ordinary (`where date ==` for a register, `where studentId == … date >=`
for a history) and every rule scoped under `schools/{id}`. Found on 2026-11-15
when the student page was refused by the catch-all rule.

`attendance/{date}` remains as a small session document recording that the day
was opened at all — without it, "nobody marked yet" and "everyone absent" look
identical, since a student with no mark document is absent.

### `holidays/{yyyy-mm-dd}`
`{ date, name, source: 'GAZETTE'|'SCHOOL' }` — the 2026 list, 87 rows including
the head teacher's two reserved days. Weekend comes from `settings/school`.
A working day = not a holiday doc and not a weekend day.

### `feeHeads`, `feeStructure`, `discounts`
Straight copies of `fee_head`, `fee_structure`, `student_discount`.
`feeStructure` is keyed by `${feeHeadId}_${className}_${sessionYear}` so the
Oracle unique constraint survives as a document id.

### `payments/{paymentId}`
```ts
{ receiptNo: 'RCPT-000042', studentId, studentName, classLabel,  // snapshot
  paymentDate, totalAmount, method, receivedBy, remarks,
  lines: [ { feeHeadId, headName, sessionYear, periodLabel,
             grossAmount, discountAmount, amountPaid } ],
  createdAt, createdBy }
```

Header and lines in **one document**: a receipt is always read and written whole,
and this removes the join that page 15 needs. `periodLabel` keeps the Oracle
format exactly — `JAN-2026`, `HALF_YEARLY_EXAM-2026` — because the dues
calculation matches on it, and a mismatch there is what made Samia Putul show
as owing fees she had already paid.

**Each line is a snapshot**: `grossAmount` and `discountAmount` are what the fee
was *when it was collected*. Changing a rate later must never rewrite an old
receipt.

### `expenses`, `expenseHeads`, `salaryPayments`
As Oracle. `expenses.voucherNo` is generated at write time (§5) because Firestore
has no equivalent of the virtual column that derives `EXP-000001` from the id.

### `exams`, `results`
```ts
results/{resultId}   // id = `${examId}_${studentId}_${subjectId}_${component}`
{ examId, studentId, subjectId, component: 'MCQ'|'CQ'|'PRACTICAL'|'WRITTEN',
  marksObtained, isAbsent, classId, rollNo,   // snapshot again
  updatedAt }
```

A deterministic id makes mark entry idempotent: saving the same sheet twice
updates rather than duplicating.

Grades, GPA and position are **computed, never stored** on the way in — the
Oracle `v_tabulation` logic (4th-subject bonus, fail rules) moves into one
shared TypeScript module and one Kotlin module, with the same test cases on both
sides. When an exam is published, the computed tabulation is **frozen** into
`exams/{examId}.tabulation` — the direct equivalent of `result_archive`, and for
the same reason: a published result must not change because a student was
promoted or a subject was edited afterwards.

---

## 4. The rule behind half of this document

> Anything printed, published or receipted stores what was true **at that
> moment**: class, roll, name, rate, discount.

In the APEX app this was learned the hard way — it is why `attendance_daily`
snapshots class and roll, why `result_archive` exists, why `fee_payment_detail`
stores gross and discount per line, and why `fn_result_sheet` reads
`v_tabulation_final` rather than the live view. Firestore makes the wrong
version easier to write (just reference the student doc), so the rule is
restated here and enforced in review.

---

## 5. Things Firestore does not do, and what we do instead

**Sequential receipt and voucher numbers.** No sequences. A
`counters/{receipts|vouchers}` doc holds `next`, incremented in a
**transaction** that also writes the payment. Gaps are acceptable (a failed
transaction burns a number); duplicates are not. Never derive a number from a
count of documents.

**Dues.** Oracle computes them live from structure − discount − paid.
Firestore has `count()`/`sum()` aggregation queries, which cover the dashboard
totals, but per-student dues across every head and period is a walk. It runs
**on demand for one student** (fast, bounded) and as a **nightly Cloud Function**
for the school-wide defaulter list, written to `reports/dues-{date}`.

**Offline at the gate.** The Android app queues scans locally (Room) and
flushes them when there is signal. Each mark is an independent idempotent write
keyed by `studentId` + `date`, so a replay cannot double-count. Firestore's own
offline cache covers the web app.

**Joins.** Denormalise the display fields (student name on a payment, class
label on a mark) and accept that a rename does not propagate backwards. That is
the correct behaviour for history anyway (§4).

---

## 6. First run, and carrying old records in

A new Firebase project is empty, and access comes only from a `members`
document that only an ADMIN may write — a deliberate deadlock. `tools/
bootstrap.mjs` breaks it once through the Admin SDK: the school document, the
settings, and the first ADMIN. Everything after that happens in the app.

Carrying records over from the old APEX app is **optional** and not part of how
the app runs. If it is ever wanted: export per table from SQL Workshop with
`tools/export-reference.sql`, then `tools/import.mjs`, which preserves ids and
is safe to re-run (`set` with merge).

---

## 7. Build order

Each item is a module of the APEX app being rebuilt here. Done means: works on
**both** web and Android, with rules tests where it writes.

1. ~~**Foundation**~~ — scaffold, auth with sign-up, `members`/`guardians`,
   rules + 32 rules tests. *Done.*
2. ~~**Attendance + QR**~~ — camera scanning at the gate, offline queue,
   today's register. *Done.*
3. ~~**Lookups and dashboards**~~ — student search, student page, school
   totals, guardian portal. *Done.*
4. ~~**People**~~ — school setup, classes, students, staff, who may sign in.
   *Done.*
5. ~~**Fees**~~ — fee heads and rate card, collect a payment, printable
   receipt, dues, daily collection, and the fee position on the student page.
   *Done.* Two rules learned here and enforced in both clients: a **discount
   settles its share** (500 billed, 100 allowed, 400 taken leaves nothing
   owing), and **monthly heads are only expected up to the current month**, so
   nobody is billed in March for December. Exam fees are never predicted —
   there is no exam module yet, so they are collected as a named line.
6. ~~**Exams and results**~~ — exam and subject setup, mark entry, **two
   sheets** (tabulation and result sheet), publishing, and the printable
   progress report.
   The **tabulation sheet** is the working grid: every subject's mark *and*
   grade, the total, GPA, grade and position, with highest / lowest / average
   / failed per subject at the foot. It prints landscape — `@page` cannot be
   scoped to an element, so the rule is injected for the duration of the
   print.
   Each cell is in **two tiers** (`cellparts.ts` / `CellParts.kt`, twinned):
   the parts above in small type — CQ, MCQ, Practical, in the order the paper
   is marked in, the failing one bold — and the subject total with its letter
   below. Without the parts the sheet could show "68 F" and give no way to see
   why, the reason always being a part below *its own* pass mark; the marks
   that explain the letter were stored all along and thrown away at the last
   step. A wider gap between the small numbers is where the second paper of a
   combined subject starts. The **result sheet** is what goes on the noticeboard: merit order,
   total, GPA, grade, passed or failed with the failed subjects named, and a
   summary with the pass percentage and grade distribution.
   The **total includes the optional subject** even though it only partly
   counts towards the GPA — that is how a tabulation has always been read —
   and is null while any mark is missing, because a part-total is worse than
   none.
   *Done.* The grading rules live in ONE place per app — `web/src/data/
   grading.ts` and `android/.../data/Grading.kt` — with the **same 12 test
   cases on both sides**, because a student must not be shown two different
   GPAs. One F in a compulsory subject fails the exam; the optional 4th
   subject only ever adds (points above 2.00, never in the divisor, failing it
   fails nothing); a missing mark is not a zero, so there is no GPA and no
   position until it is entered. Publishing closes mark entry and is what
   lets a parent see the result — it freezes no numbers, since everything is
   computed from the marks.
7. ~~**Certificates and ID cards**~~ — testimonial, transfer and character
   certificates with a serial from a counter and a register of everything
   issued, plus printable ID cards carrying the QR the gate scanner reads.
   *Done.* The student's class, roll and parents' names are **snapshotted onto
   the certificate**: a transfer certificate must keep saying Class 8 after the
   roll is promoted. Nothing is edited or deleted — a certificate issued
   wrongly is cancelled by issuing another, and the register keeps both.
   **The card's QR is round-tripped in a test on both sides** (encoded, decoded
   by an independent decoder, then fed through the scanner's own parser),
   because a card that will not scan is discovered at the gate with a queue
   behind it. Cards are printed from the web; the phone shows one card so a
   card that will not scan can be held beside it.
8. ~~**Payroll**~~ — salary structure per person, the annual increment, paying
   a month, the salary register and printable payslips. APEX pages 47–51.
   *Done, ADMIN only.* **One payment per person per month**, because the
   document id is `staffId_YYYY-MM`: paying a month twice corrects the record
   instead of paying twice, and the screen shows who is already paid so the
   second run has to be deliberate. Every figure is copied onto the payment,
   so a rise cannot rewrite an old payslip. **Allowances are amounts, not
   percentages of the basic** — a percentage recalculates history. The
   increment falls due twelve months after the last one, never "every
   January", which would give someone who joined in November a thirteen-month
   first year.
9. ~~**Expenses and reports**~~ — expense heads, vouchers with a number from a
   counter (`EXP-000001`, the format Oracle derived with a virtual column),
   spending by head, and income against expense month by month. APEX pages 53,
   54, 1. *Done.* **Income is what was COLLECTED, never what was charged** —
   unpaid dues are a hope, and setting them beside real spending would make
   the school look solvent on money nobody has handed over. Paying a salary in
   the payroll screen does **not** post an expense by itself; that is stated on
   the report rather than hidden.

10. ~~**Exam operations**~~ — the routine, the rooms, the seat plan and the
    admit card. APEX pages 39–42. *Done.* None of it needed a new collection:
    the routine lives on `exams/{examId}.routine` and the rooms in
    `settings/rooms`, both of which already have rules — a new collection would
    have meant a rules change and a deploy for a printed timetable.
    **Two students of the same class are never seated side by side** while any
    other class still has someone waiting: the classes are interleaved
    round-robin in roll order, so the plan is also identical every time it is
    printed. Anyone who does not fit is **reported, not dropped** off the end of
    the last bench. The admit card reads its room and seat from the same
    functions the seat plan prints, so a card cannot disagree with the plan on
    the wall. Setting a paper and saving a room both run in a **transaction**:
    the routine is one array on one document, so writing a copy held on screen
    would silently drop whatever was added in between — two quick taps and a
    paper vanishes.
11. ~~**Attendance reports**~~ — the monthly sheet, the low-attendance list and
    the holidays the other two depend on. APEX pages 36–38. *Done.* A working
    day is a day that is neither a weekend nor a holiday, computed in one place
    and tested on both sides, because getting it wrong makes every percentage
    wrong; **a holiday falling on a weekend is counted once**, not twice.
    The percentage is **of the days actually marked**, the same rule as
    everywhere else here — a section nobody marked for a fortnight would
    otherwise show every child as a truant — and a student with nothing marked
    gets no percentage at all and stays off the low-attendance list: unmarked is
    not absent. **A holiday is the one record in this database that may be
    deleted** (a day marked by mistake has to come back, and nothing points at
    it), which is why the rule splits `create, update` from `delete`: there is
    no `request.resource` on a delete, so a single `write` rule with `stamped()`
    refuses every removal. Attendance already marked on a day later made a
    holiday is left alone — the register says what happened, and the calendar
    should not rewrite it.

---

## 8. What is still missing

Every module of the APEX app is now built on both clients. What is left is not
a feature:

- **The first sign-in** — the live project is set up (2026-11-16): the rules
  and indexes are deployed, `tools/bootstrap.mjs` has written the school, its
  settings and the first ADMIN, and the web app is live at
  **https://schooltrack-1941.web.app**. What is left is the part a script must
  not do: the administrator creates their own account in the app, with their
  own password, and confirms the address. Until somebody signs in, the school
  has no classes and no students. If the confirmation email never arrives,
  `bootstrap.mjs --verify` marks the address confirmed through the Admin SDK —
  the rules require a confirmed address and there is no other way to repair it
  from outside the console.

  Email/Password sign-in was switched off on the live project until 2026-11-16,
  which is why it had no accounts at all: the sign-up form could only answer
  "Sign-up is switched off for this project". It is on now. A new project needs
  that switch before anything else works — step 1 of the README.

- **A real printed QR scanned by a real phone** — the card code is round-tripped
  in a test on both sides, but no one has yet held a printed card in front of a
  handset.
- **Dependency advisories** — `npm audit` reports high-severity advisories in
  `firebase` (`@grpc/grpc-js`) and `react-router-dom` (`@remix-run/router`).
  They need a bump and a re-test, not a redesign.

---

## Hosting cache (why a deploy did not reach anybody)

`firebase.json` sets `Cache-Control: no-cache` on `**` and only then the
year-long `immutable` on `/assets/**`.

The obvious rule — `no-cache` on `/index.html` — does **not** work. Header
rules match the **request** path, not the file a rewrite ends up serving, so
`https://schooltrack-1941.web.app/` and `/students/12` matched nothing and fell
through to Firebase's own default of `max-age=3600`. A browser then kept
running the previous build for up to an hour after a deploy, which looks
exactly like the deploy having failed.

The asset rule stays safe because every built file carries a content hash in
its name: a new build is a new URL, so nothing stale can be reused.
