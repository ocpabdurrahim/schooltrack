"""
Draws a mark sheet, remembers what it wrote, reads it back, and scores it.

    .venv/Scripts/python.exe selftest.py

A number, not an impression. The three it prints are not equally important:

    correct   what it got right
    blank     what it would not commit to -- SAFE, a person fills these in
    WRONG     what it got wrong and did not know -- the only dangerous one

A reader that leaves a box blank costs somebody a moment. A reader that puts
51 where the paper says 15 costs a child a grade, and nothing downstream can
tell. So WRONG is the number to watch, and it should be zero.

This draws a CLEAN sheet with printed digits, so it is a test of the pipeline
-- the grid, the column alignment, the roll sequence -- and NOT a measure of
how well real handwriting reads. Only a real photograph says that.
"""
import json, random, sys, time
from pathlib import Path
import cv2, numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent))
from reader import read_sheet

random.seed(11)
W, H = 1700, 2300
img = np.full((H, W), 252, np.uint8)
TOP, BOT, BLOCKS, COLS, ROWS = 210, 2240, 3, 5, 34
bw, rh = (W - 80) // BLOCKS, (BOT - TOP) // ROWS
widths = [0.18, 0.21, 0.21, 0.19, 0.21]
truth = {}

for b in range(BLOCKS):
    x0 = 40 + b * bw
    xs, acc = [x0], x0
    for f in widths:
        acc += int(bw * f); xs.append(acc)
    for r in range(ROWS + 1):
        cv2.line(img, (xs[0], TOP + r*rh), (xs[-1], TOP + r*rh), 30, 2)
    for x in xs: cv2.line(img, (x, TOP), (x, BOT), 30, 2)
    for i, head in enumerate(["Roll","CQ","MCQ","Prac","Total"]):
        cv2.putText(img, head, (xs[i]+8, TOP+26), cv2.FONT_HERSHEY_SIMPLEX, 0.55, 40, 1)
    for r in range(1, ROWS):
        roll = b*(ROWS-1) + r
        y = TOP + r*rh
        cv2.putText(img, f"{roll:02d}", (xs[0]+10, y+32), cv2.FONT_HERSHEY_SIMPLEX, 0.7, 50, 2)
        if random.random() < 0.6:
            cq, mcq = random.randint(20,68), random.randint(8,29)
            truth[roll] = {"CQ": cq, "MCQ": mcq}
            for i, v in ((1,cq),(2,mcq),(4,cq+mcq)):
                cv2.putText(img, str(v), (xs[i]+14, y+34), cv2.FONT_HERSHEY_DUPLEX, 0.85, 20, 2)

img = cv2.GaussianBlur(img, (3,3), 0)
p = Path(__file__).resolve().parent / "_selftest-sheet.png"
cv2.imencode(".png", img)[1].tofile(str(p))

t = time.time()
got = read_sheet(p, ["CQ","MCQ","Prac"], maxima={"CQ":70,"MCQ":30,"Prac":100})
secs = time.time() - t

by_roll = {r["roll"]: r["parts"] for r in got.rows if r["roll"] is not None}
right = wrong = missed = 0
wrong_rows = []
for roll, want in truth.items():
    have = by_roll.get(roll)
    if have is None:
        missed += 2; continue
    for name, v in want.items():
        g = have.get(name)
        if g == v: right += 1
        elif g is None: missed += 1
        else:
            wrong += 1
            wrong_rows.append((roll, name, v, g))

total = right + wrong + missed
print(f"{len(truth)} filled rows, {len(by_roll)} rows read, {secs:.0f}s")
print(f"  correct : {right}/{total}  ({100*right/total:.0f}%)")
print(f"  blank   : {missed}/{total}  ({100*missed/total:.0f}%)   <- held for a person")
print(f"  WRONG   : {wrong}/{total}  ({100*wrong/total:.0f}%)   <- the dangerous one")
for w in wrong_rows[:10]: print("     roll %s %s: wrote %s, read %s" % w)
