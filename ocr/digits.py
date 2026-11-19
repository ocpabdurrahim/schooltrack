"""
Reading the digits out of one box.

Recognition only, never detection. The box is already known — grid.py found
it — so asking a general OCR engine to go and look for text in a 60-pixel
crop is both slower and worse: it is built to find words in photographs of
streets, and it will happily decide a printed rule is a letter.

The engine is RapidOCR: the PP-OCR models converted to ONNX. It matters that
it is ONNX and not PyTorch, because this runs on a school office machine --
about fifteen megabytes of model and no two-gigabyte install.

THE RULE THAT MATTERS: when it is not sure, the answer is None. Not zero.
A zero is a mark, and a failing one, and a plausible wrong number is the only
kind of error nothing downstream can catch.
"""

from __future__ import annotations

import re
from functools import lru_cache

import cv2
import numpy as np
from pathlib import Path

# Below this, the engine is guessing and we would rather have a blank box for
# a person to fill in than a number nobody checked.
CONFIDENT = 0.55

# What a straight printed line gets mistaken for. Built with re.escape so the
# awkward members -- the backslash, the quote -- cannot break the pattern.
RULE_LOOKALIKES = " 	|iIlL!:;.,'\"`-_/\\"
RULE_EDGE = re.compile(f"^[{re.escape(RULE_LOOKALIKES)}]+")


MODELS = Path(__file__).resolve().parent / "models"


@lru_cache(maxsize=1)
def _engine():
    """
    The reader, in ENGLISH.

    RapidOCR ships the Chinese PP-OCR model, and on a page of handwritten
    marks that is not a small detail: it returned Chinese characters for
    empty boxes and, worse, read a handwritten 6 as "G" and a 3 as "G" --
    so 56 came back as "5G" and 34 as "G4". Those were refused as unreadable,
    which was safe but meant a third of the sheet came back blank.

    The English model reads the same boxes as 56 at 0.99 and 27 at 0.95. The
    alphabet it is choosing from is the whole difference.

    Falls back to whatever ships with the package if the English model is not
    beside this file, so the reader still runs -- just less well, and the
    download is in the README.
    """
    from rapidocr_onnxruntime import RapidOCR

    rec, keys = MODELS / "en_rec.onnx", MODELS / "en_dict.txt"
    if rec.is_file() and keys.is_file():
        return RapidOCR(rec_model_path=str(rec), rec_keys_path=str(keys))
    return RapidOCR()


def prepare(cell: np.ndarray) -> np.ndarray | None:
    """
    One box, made easy to read: upscaled, evened out, and black on white.

    Upscaled because a mark cell on a phone photograph is perhaps forty pixels
    tall, and these models were trained on text several times that.
    """
    if cell is None or cell.size == 0:
        return None
    h, w = cell.shape[:2]
    if h < 6 or w < 6:
        return None

    scale = max(1.0, 64 / h)
    big = cv2.resize(cell, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    big = cv2.fastNlMeansDenoising(big, None, 7, 7, 21)
    # Otsu rather than a fixed level: the page is grey in the shadows and
    # white in the light, and the ink is darker than its own surroundings.
    _, binary = cv2.threshold(big, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    binary = _rub_out_rules(binary)
    return cv2.copyMakeBorder(binary, 12, 12, 12, 12, cv2.BORDER_CONSTANT, value=255)


def _rub_out_rules(binary: np.ndarray) -> np.ndarray:
    """
    Erases what is left of the printed box from inside the crop.

    A sliver of the ruling almost always survives, and an OCR engine reads a
    straight vertical line as a 1. That is how 20 became 201 and 23 became
    123 -- the mark read perfectly, with the edge of its own box stuck to it.

    Cropping harder is the obvious answer and the wrong one: it clips real
    digits, which is how 56 became 5 earlier. A rule is not merely near the
    edge, it is a line that crosses the WHOLE cell, and a digit stroke never
    does. So they are told apart by that, not by where they are.
    """
    ink = binary < 128           # True where there is something written
    h, w = ink.shape
    out = binary.copy()

    # A printed rule and a handwritten 1 are both a tall vertical stroke, so
    # height alone cannot tell them apart -- erasing every full-height column
    # would rub out the 1s. What separates them is WHERE: the rule is the edge
    # of the box and hugs the margin, while a mark is written in the middle.
    # So only the margins are swept, and a 1 in the middle of its box is safe.
    margin_x = max(1, int(w * 0.18))
    margin_y = max(1, int(h * 0.18))

    tall = ink.sum(axis=0) > h * 0.55
    wide = ink.sum(axis=1) > w * 0.55

    edge_x = np.zeros(w, bool)
    edge_x[:margin_x] = True
    edge_x[w - margin_x:] = True
    edge_y = np.zeros(h, bool)
    edge_y[:margin_y] = True
    edge_y[h - margin_y:] = True

    out[:, tall & edge_x] = 255
    out[wide & edge_y, :] = 255
    return out


def is_blank(cell: np.ndarray, ink_fraction: float = 0.012) -> bool:
    """
    Nothing written here.

    Decided before the engine is asked, because most of a mark sheet is empty
    -- those scripts are in another pile -- and an OCR engine shown an empty
    box will eventually find something in it.
    """
    if cell is None or cell.size == 0:
        return True
    _, binary = cv2.threshold(cell, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    # The box's own ruling is not writing. Without rubbing it out first, every
    # empty cell on the sheet looks like it has something in it, and "nothing
    # was written here" -- which is what holds a row that has marks but no
    # total -- can never be true.
    binary = _rub_out_rules(binary)
    ink = np.count_nonzero(binary < 128)
    return float(ink) / binary.size < ink_fraction


def read_number(cell: np.ndarray, maximum: int | None = None) -> tuple[int | None, float]:
    """
    The number written in this box, and how sure the engine was.

    Returns (None, confidence) for a box that is empty, unreadable, or holds
    something that is not a plausible mark. Never a guess.
    """
    if is_blank(cell):
        return None, 1.0

    image = prepare(cell)
    if image is None:
        return None, 0.0

    try:
        result, _ = _engine()(image, use_det=False, use_cls=False, use_rec=True)
    except Exception:
        return None, 0.0
    if not result:
        return None, 0.0

    text, score = str(result[0][0]), float(result[0][1])

    # Letters are a REFUSAL, not something to strip out.
    #
    # This was the worst bug in the reader and it looked like the opposite of
    # a bug. Stripping non-digits turned a partial misread into a confident
    # wrong number: a handwritten 6 comes back as "b", so "5b" quietly became
    # 5 and a child's 56 was recorded as 5. Every wrong answer on the real
    # sheet came through here.
    #
    # A cell holding something that is not simply a number is a cell this
    # cannot read, and the honest answer is to leave it blank for a person.
    # The edge of the box, stuck to the number, is still the commonest thing
    # in these readings: "i 31", ":06", "|02", ". 11". Those leading marks are
    # the printed rule, not ink the teacher left, and refusing the whole cell
    # over them is why the Total column almost never read -- which in turn is
    # why the checksum that should catch a bad mark never ran.
    #
    # ONLY the characters a straight line can be mistaken for, and only at the
    # ends. Never a digit: stripping a leading "1" would turn 113 into 13 and
    # invent a mark. Any other letter is still a flat refusal, because a 6
    # read as "G" is a misreading of the mark itself.
    cleaned = RULE_EDGE.sub("", text)
    cleaned = RULE_EDGE.sub("", cleaned[::-1])[::-1]
    if not re.fullmatch(r"\d{1,3}", cleaned):
        return None, score
    digits = cleaned
    if score < CONFIDENT:
        return None, score

    value = int(digits)
    if maximum is not None and value > maximum:
        # Out of the possible range for this column: more likely a misread
        # than a teacher writing 180 out of 70.
        return None, score
    return value, score
