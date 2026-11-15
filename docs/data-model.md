# SchoolTrack — data model

Android (Kotlin/Compose) + Web (React/Vite) on Firestore, rebuilding the
Oracle APEX app **SMS** (app 161019, Matkhola ML High School).
Same shape as [[SkillTrack]]: `firebase/firestore.rules` quotes the section
headings below, so when a rule looks surprising the reason is here.

---

## 0. The decision that matters most: who owns the data

The APEX app is **in daily use** — fees are being collected, attendance taken,
salaries paid. Firestore is a second database. The moment both are live for the
same module, the two disagree and neither can be trusted.

So this is a **migration with a transition**, not two systems running forever:

| Module | Owner at launch | Then |
|---|---|---|
| Attendance (incl. QR gate) | **SchoolTrack** from go-live day | APEX pages 35/44/55 stop being used |
| Fees | **SchoolTrack** once the receipt counter is cut over | APEX page 15 becomes read-only |
| Students, staff, classes, subjects | **Oracle**, mirrored read-only | ported when their screens land |
| Results, exams, certificates, payroll, expenses | **Oracle** | ported module by module |

Two rules that keep this honest:

1. **One owner per module, written down, from day one.** No module is ever
   written by both systems — not "temporarily", not "just this week".
2. **The mirror is one-way.** Oracle → Firestore, re-runnable, never the
   reverse. A mirrored collection is read-only in the rules, so a bug in the app
   cannot corrupt data that Oracle still owns.

Cut-over day for a module = flip its owner here, make the APEX page read-only,
re-run the mirror once more, and let SchoolTrack write from then on.

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

## 6. Migration from Oracle

One-way, re-runnable, in `tools/`:

1. Export from APEX SQL Workshop as JSON/CSV per table.
2. `tools/import.mjs` maps rows to the documents above, preserving ids, in
   dependency order: settings → classes → students → staff → members → subjects
   → exams → results → holidays → feeHeads → feeStructure → discounts →
   payments → expenses → salaryPayments.
3. Re-running updates in place (`set` with merge on the same ids). Safe to run
   repeatedly while the mirror is live.

The seven Oracle objects with no DDL on disk (`school_settings`, the five
finance tables, `v_fee_paid`) are **read** by the export, so the missing scripts
do not block this — but generating that DDL is still worth doing before the
school depends on two systems at once.

---

## 7. Build order

1. **Foundation** — project scaffold, auth, `members`/`guardians`, rules + rules
   tests, the mirror importer.
2. **Attendance + QR** — the module that justifies a phone app: camera scanning,
   offline queue, today's register, monthly view. Cut over from APEX.
3. **Lookups and dashboards** — student 360, school totals. Read-only, no
   migration risk.
4. **Fees** — collection, receipt, dues. Cut over once the counter is moved.
5. **Guardian portal** — my child's results, attendance, dues. Read-only.
6. **The rest** — results and mark entry, exams, certificates, payroll,
   expenses, until APEX is only a back office and then not needed.
