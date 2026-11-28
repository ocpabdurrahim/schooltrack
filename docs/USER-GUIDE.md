# SchoolTrack — the guide for the office

This is for the people who use SchoolTrack every day: the head teacher, the
office, the accounts clerk and the teachers. It assumes nothing technical.

There are two ways in, and they are the same system:

- **The website** — <https://schooltrack-1941.web.app>
- **The Android app** — <https://schooltrack-1941.web.app/app> tells a phone
  how to install it

Whatever is entered on one appears on the other within a second or two. Both
need an account, and an account can be signed in on several devices at once.

---

## 1. Accounts and who can do what

Everybody signs in with an email address and a password they choose. A new
account can see **nothing** until the head teacher grants it a role on
**Setup → Users**. That is deliberate: an account appearing on the sign-in
screen is not the same as being let into the school's records.

| Role | What it is for | What it may do |
|---|---|---|
| **ADMIN** | the head teacher | everything, including money, payroll, users and setup |
| **ACCOUNTS** | whoever handles fees | fees, receipts, dues, expenses — plus everything a teacher can do |
| **OFFICE** | whoever keeps the records | add and change students, certificates, ID cards — plus everything a teacher can do |
| **TEACHER** | class teachers | attendance, marks, results, reports. **Cannot see fees or salaries at all** |
| **Guardian** | a parent | only their own child's attendance, results and fees |

A teacher who opens a fee page is not merely hidden from it — the database
itself refuses them. The screens are hidden to save them a refusal, not as the
protection.

**Email must be confirmed.** After creating an account, open the link the
system emails. Until that is done, signing in will say so and stop.

---

## 2. The year's work, in order

### Setting up a year

1. **Setup → School** — name, address, EIIN, head teacher's name, session.
   These appear on every printed sheet, so get the spelling right once.
2. **Setup → Classes** — every class and section. A student cannot be added
   until the section they belong to exists.
3. **Setup → Subjects** — which subjects each class sits, and the mark layout
   (CQ, MCQ, Practical and their pass marks).
4. **Fee setup** — the rate card: what each class pays per head, per session.
   The rates are per class, not per student.

### Students

- **Students → add** one at a time, or **Add many** to paste a whole class in
  from a list and fix it up in a grid before saving.
- A student has a **privilege**: Regular, Scholarship, Donor family or Half
  fee. It is not a discount on one receipt — it changes the tuition that
  student is charged every month until it is changed back. Only tuition is
  waived; the session, exam and other fees are charged in full.
- When a student leaves, mark them **Left** rather than deleting. Deleting
  would take their attendance, marks and receipts with them.

### Every day

- **Attendance** — the register for a section, or **Scan ID cards** to take it
  at the gate with a phone. A session starts everybody absent and each scan
  marks one present, so a half-finished session is still honest.
- **Holidays** are set once a year under Setup, and the register skips them.

### Every month

- **Collect fee** — choose year, class, section and student, tick what is
  being paid, and the receipt is written. A receipt can never be edited or
  deleted; a mistake is corrected with another entry, the way a paper ledger
  does it.
- **Dues** shows a whole section: what is expected, what was paid, what is
  owed.
- **Monthly attendance** prints the sheet the school keeps.

### Exam time

1. **Exam routine**, **Admit cards**, **Exam rooms** and **Seat plan**.
2. **Marks** — enter by subject, by student, or scan a filled mark sheet.
3. **Results** — tabulation, mark sheets, merit lists, report cards and the
   progress report comparing two exams side by side.
4. **Publish** a result when it is ready. Until it is published, parents do
   not see it.

### Year end

- **Promote students** moves a class up, keeps the ones who failed, and
  freezes the year's results so later changes cannot rewrite history.

---

## 3. Money

- **Collect fee** writes receipts. **Receipts** finds and reprints one.
- **Dues** is the list of who owes what.
- **Expenses** records what the school spends, against a head.
- **Income vs expense** is the monthly picture: collected, salaries, other
  spending, and what is left.
- **Payroll** — staff, their salary structure, paying a month, and the
  register. Payslips print from there.

Only ADMIN and ACCOUNTS can open any of this.

---

## 4. Printing

Every report that is meant for paper has a **Print** button and is laid out for
A4. The progress report prints landscape, one student per page. Printing is a
browser function, so if a sheet looks cramped check the browser's own scale
setting before changing anything in the app.

---

## 5. When something looks wrong

- **"No access record"** — the account exists but has no role yet. The head
  teacher grants one on Setup → Users.
- **A fee figure looks too low** — check the student's privilege on their own
  page. A Half fee or Donor family student is charged less on purpose.
- **A result says "not finished"** — a mark is missing, or a student's
  religion is blank so the system cannot tell which religion paper they sat.
- **The phone app is behind the website** — it updates itself, usually within
  a few hours of a new version. It can be forced from the app's own
  "Check for an update".
- **Anything else** — the website and the app read the same records, so if one
  of them shows something odd, check the other before assuming data is lost.
