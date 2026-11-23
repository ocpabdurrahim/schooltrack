# Grading — Classes 9 and 10

How a mark becomes a grade, and how grades become a GPA, for the SSC classes.
This describes what the code **does**, not what a grading scheme in general
might do: every rule here is in `web/src/data/grading.ts` and its twin
`android/.../data/Grading.kt`, pinned by 37 test cases on each side.

Nothing below is stored. Grades, totals and GPA are computed from the marks
every time, so correcting a mark corrects the marksheet, the tabulation, the
progress report and the merit list together (see `data-model.md` §3).

---

## 1. Which subjects a student sits

A result is only as right as the list of subjects it is built from, so this
comes first. A subject carries three filters, and a student must pass all
three to sit it (`sitsSubject` / `excludedBy` in `exams.ts`):

| Filter | Field | Rule |
|---|---|---|
| Class | `classNames` | must contain the student's class name |
| Stream | `groupNames` | empty = everyone; otherwise must contain the student's group |
| Religion | `religions` | empty = everyone; otherwise must contain the student's religion |

A student whose group or religion is **blank** is excluded by nothing — a
missing field is treated as "not yet known", not as a mismatch. That is
deliberate: a half-entered student shows up on every sheet rather than
silently vanishing from the ones that matter.

### As this school is configured

**Everyone in 9–10:** Bangla 1st + 2nd, English 1st + 2nd, Mathematics, ICT,
and one religion paper — Islam **or** Hindu, by the student's religion. A
student recorded as "Other" sits neither.

| Stream | Also sits | Optional (4th) |
|---|---|---|
| Science | Bangladesh & Global Studies, Physics, Chemistry, Biology | Higher Maths |
| Humanities | General Science, Civics & Citizenship, History of Bangladesh, Geography | Agriculture |
| Business Studies | General Science, Accounting, Finance & Banking, Business Entrepreneurship | Agriculture |

---

## 2. From parts to a subject total

Most papers are marked in **parts**, each with its own maximum *and its own
pass mark*:

| Shape | Parts | Subjects |
|---|---|---|
| CQ 70 / MCQ 30 | pass 23 and 10 | Bangla, Maths, Religion, BGS, Science, Civics, History, Geography, Accounting, Finance, Business Entrepreneurship |
| CQ 50 / MCQ 25 / Practical 25 | pass 17, 8 and 8 | Physics, Chemistry, Biology, Higher Maths, Agriculture |
| CQ 25 / MCQ 25 | pass 8 and 8 | ICT (out of 50) |
| Written 100 | pass 0 | English 1st, English 2nd |

`subjectTotal()` adds the parts up. **One part still blank makes the total
null** — not a zero. A subject whose practical has not been marked yet has no
total, no grade and no GPA, and every sheet says so with a dash rather than
failing the student for work the teacher has not finished entering.

`enteredSoFar()` exists for exactly that gap: it reports what *has* arrived
so a teacher who has just keyed in English 1st Paper can see their work on
screen, even though the subject (out of 200) has no mark yet.

---

## 3. A failed part fails the subject

This is the rule that surprises people, and the reason parts are stored at all
rather than added up and forgotten:

> **60 in CQ and 8 in MCQ is 68 out of 100 — and still F**, because the MCQ
> pass mark is 10.

`gradeForSubject()` applies it in this order, and the order matters:

1. **Absent** → F, 0.00.
2. **No total yet** (a part unmarked) → `-`, no grade, not a fail.
3. **Any part below its own pass mark** → F, 0.00, whatever the total is.
   The failed part is named, so a marksheet can print *which* one.
4. Otherwise → the percentage scale below.

Because the English papers have a part pass mark of 0, they can never fail on
the part rule — only on the percentage.

---

## 4. The letter scale

Applied to the subject's **percentage** of its full marks:

| From | Letter | Point |
|---|---|---|
| 80% | A+ | 5.00 |
| 70% | A | 4.00 |
| 60% | A- | 3.50 |
| 50% | B | 3.00 |
| 40% | C | 2.00 |
| 33% | D | 1.00 |
| below 33% | F | 0.00 |

33% is the pass mark. ICT is out of 50, so 33% of it is 16.5 — the scale is
always a percentage of *that paper's* full marks, never a fixed number.

---

## 5. Combined papers: Bangla and English

Bangla 1st and 2nd Paper are **one subject out of 200**, and so are the two
English papers. Grading them separately would give a different GPA for the
same marks — two A- grades where the school's own sheet shows a single A.

`combineUnits()` merges papers that share a `combineGroup` **before anything
is graded**:

- The unit takes the place of the **first** of its papers, so Bangla stays
  where Bangla was on the sheet instead of being pushed to the bottom.
- Full marks add up (100 + 100 = 200), and so do the totals.
- **If either paper is unmarked, the unit has no total** — which is why a
  half-entered English shows a dash rather than a bad grade.
- Each part keeps its paper's name in front of it: "BANGLA 1ST PAPER MCQ",
  not "MCQ". A student told they failed "MCQ" would not know which paper.
- The unit's name is the common prefix of its papers ("BANGLA"), falling back
  to the group name if that comes to less than three letters.

A combine group with only **one** paper in it is left alone. ICT carries the
group `ICT` but is a single paper, so it is graded on its own — harmless, and
worth knowing before someone goes looking for the bug.

---

## 6. The GPA

Over the **graded units** — after combining, and only those the student sits.

```
          sum of the compulsory subjects' points  +  optional bonus
  GPA  =  ───────────────────────────────────────────────────────── ,  capped at 5.00
                   number of compulsory subjects
```

- **The optional (4th) subject only ever helps.** Points **above 2.00** are
  added to the top of the fraction; it is never counted in the divisor, and
  failing it costs nothing. An optional A+ adds 3.00; an optional C adds 0.00;
  an absent optional adds 0.00 and cannot fail the student.
- The result is rounded to two decimals, then the overall letter is read from
  the rounded number.

### The overall letter, from the GPA

| GPA | Letter |
|---|---|
| 5.00 | A+ |
| 4.00 – 4.99 | A |
| 3.50 – 3.99 | A- |
| 3.00 – 3.49 | B |
| 2.00 – 2.99 | C |
| 1.00 – 1.99 | D |
| below 1.00 | F |

Note this is read from the **GPA**, not from any one subject, and that A+
requires the full 5.00 — which is why the cap matters.

---

## 7. Fail, incomplete, absent

Three different things, and the app keeps them apart:

| State | Test | Result |
|---|---|---|
| **Incomplete** | any compulsory subject has no total and the student was not absent | GPA `null`, letter `—`, nothing published |
| **Failed** | any compulsory subject grades F | GPA **0.00**, letter **F**, the failed subjects named |
| **Absent** | marked absent in a compulsory subject | that subject is F, so the exam is failed |

An **optional** subject can be missing without making the result incomplete —
a student takes one 4th subject, not every optional one the class offers.

A result that is incomplete is never published, and never ranked: `sheetFor()`
leaves an incomplete student out of the merit order rather than placing them
last, because "not finished" is not a position.

---

## 8. Total marks

The printed total follows **exactly the same test as the GPA** — withheld
while any compulsory subject is unmarked:

- An optional subject with no mark is left out of **both** sides of the
  fraction. Counting its 100 full marks against a student who never sat it
  would read as a zero.
- An optional subject that *was* sat counts on both sides, so the total can
  exceed the compulsory out-of.
- An absent subject contributes 0 obtained and its full marks to the out-of.

This rule exists because the other way round was shipped and found: a sheet
once showed **"GPA 4.33" beside "Total —"**, which reads as a bug in the
arithmetic even though both numbers were right by their own rules.

---

## 9. Worked examples

### A Science student, all passed

| Subject | Marks | % | Letter | Point |
|---|---|---|---|---|
| Bangla (1st + 2nd) | 150 / 200 | 75 | A | 4.00 |
| English (1st + 2nd) | 130 / 200 | 65 | A- | 3.50 |
| Mathematics | 82 / 100 | 82 | A+ | 5.00 |
| ICT | 40 / 50 | 80 | A+ | 5.00 |
| Islam & Moral Education | 71 / 100 | 71 | A | 4.00 |
| Bangladesh & Global Studies | 66 / 100 | 66 | A- | 3.50 |
| Physics | 60 / 100 | 60 | A- | 3.50 |
| Chemistry | 55 / 100 | 55 | B | 3.00 |
| Biology | 72 / 100 | 72 | A | 4.00 |
| *Higher Maths (optional)* | *78 / 100* | *78* | *A* | *4.00* |

Compulsory points: 4.00 + 3.50 + 5.00 + 5.00 + 4.00 + 3.50 + 3.50 + 3.00 +
4.00 = **35.50** over **9** subjects.
Optional bonus: 4.00 − 2.00 = **2.00**.

**GPA = (35.50 + 2.00) ÷ 9 = 4.17 → A.**

**Total = 804 out of 1150** — the optional subject was sat, so its 78 marks
and its 100 full marks count on *both* sides. Had the student not taken a 4th
subject at all, the same compulsory marks would read **726 out of 1050**, and
the GPA would be 35.50 ÷ 9 = **3.94 (A-)**. That difference — 3.94 to 4.17 —
is what the optional subject is worth.

*(All four figures in this section are the code's own output, not arithmetic
done by hand: 9 compulsory units, GPA 4.17 A, total 804/1150.)*

### The same student, eight marks lower in one place

Chemistry: CQ 40, MCQ 7, Practical 8 — a total of 55, the same as above. But
the MCQ pass mark is 8.

**Chemistry is F.** The exam is failed: **GPA 0.00, letter F**, Chemistry
named as the reason. Every other grade stands on the marksheet exactly as
above — the student can see that one part of one paper did it.

### A Humanities student, one subject not yet entered

Geography has CQ 55 keyed in and the MCQ box still empty.

Geography has **no total** → the result is **incomplete**: GPA `—`, total
`—`, no position in the merit list, nothing published. Entering the MCQ mark
completes it; nothing else needs re-doing.

---

## 10. What the app deliberately does not do

- **No grace marks**, and no rounding a 32 up to a 33. A pass mark is a
  threshold, not a target.
- **No "golden A+"** (A+ in every subject) as a separate award — it is
  visible from the subject grades, and is not part of the GPA.
- **No subject-wise GPA ceiling other than 5.00**, and no weighting: every
  compulsory subject counts once, whatever its full marks. ICT out of 50
  carries the same weight as Physics out of 100, which is how the SSC scale
  works.
- **No stored grades.** Nothing is frozen except by publishing an exam.

---

## 11. Where it lives

| | |
|---|---|
| Rules | `web/src/data/grading.ts`, `android/.../data/Grading.kt` |
| Tests | `web/src/data/grading.test.ts` (37 cases), `android/.../GradingTest.kt` |
| Who sits what | `sitsSubject` / `excludedBy` in `exams.ts` |
| Tabulation and merit order | `sheetFor` / `tabulate` in `exams.ts` |
| Subject setup (parts, pass marks, streams) | Exams → Exams and subjects |

The two implementations must agree exactly: a student will be shown a GPA by
whichever app is to hand. The same cases are written against both, so changing
one without the other fails the build.
