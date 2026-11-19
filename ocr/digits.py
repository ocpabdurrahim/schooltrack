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
    return cv2.copyMakeBorder(binary, 12, 12, 12, 12, cv2.BORDER_CONSTANT, value=255)


def is_blank(cell: np.ndarray, ink_fraction: float = 0.012) -> bool:
    """
    Nothing written here.

    Decided before the engine is asked, because most of a mark sheet is empty
    -- those scripts are in another pile -- and an OCR engine shown an empty
    box will eventually find something in it.
    """
    if cell is None or cell.size == 0:
        return True
    _, binary = cv2.threshold(cell, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return float(np.count_nonzero(binary)) / binary.size < ink_fraction


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
    cleaned = text.strip().strip(r".,:;|/\-_ ")
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
