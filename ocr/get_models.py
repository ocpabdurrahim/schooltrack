"""
Fetches the ENGLISH recognition model.

    .venv/Scripts/python.exe get_models.py

RapidOCR ships the Chinese PP-OCR model, which is not a small detail on a
page of handwritten marks: it read a handwritten 6 as "G" and a 3 as "G", so
56 came back as "5G" and 34 as "G4". Those were refused as unreadable -- safe,
but a third of the sheet came back blank.

With the English model the same boxes read 56 at 0.99 and 27 at 0.95. On a
real photographed sheet that was the difference between 64% and 86% correct.

The models are not in the repository (they are binaries, and this repository
is public and small on purpose), so they are fetched here instead.
"""

import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent / "models"
WANT = {
    "en_rec.onnx": (
        "https://huggingface.co/SWHL/RapidOCR/resolve/main/PP-OCRv3/"
        "en_PP-OCRv3_rec_infer.onnx"
    ),
    "en_dict.txt": (
        "https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/"
        "ppocr/utils/en_dict.txt"
    ),
}


def main() -> int:
    HERE.mkdir(parents=True, exist_ok=True)
    for name, url in WANT.items():
        target = HERE / name
        if target.is_file() and target.stat().st_size > 50:
            print(f"{name}: already here ({target.stat().st_size // 1000} kB)")
            continue
        print(f"{name}: fetching from {url}")
        try:
            urllib.request.urlretrieve(url, target)
        except Exception as e:  # noqa: BLE001
            print(f"   could not fetch it: {e}")
            print("   The reader still runs without it, but reads handwriting")
            print("   markedly worse. See the note at the top of this file.")
            return 1
        print(f"   {target.stat().st_size // 1000} kB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
