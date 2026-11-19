"""
Mark Sheet Reader — a desktop window.

Point it at a folder of photographed mark sheets and it writes one .xlsx to
upload on SchoolTrack's Mark entry screen.

    .venv/Scripts/pythonw.exe app.py

Tkinter, which comes with Python: a school office machine should not need
anything installed to run this beyond what is already in the folder.

The window is deliberately plain about three things, because they are what a
person needs to know and what software of this kind usually hides:

  * how many boxes it could NOT read, said as loudly as how many it could;
  * which photograph each problem came from;
  * that nothing is saved to the school's records by this program at all --
    it writes a spreadsheet, and a person uploads it after looking at it.
"""

from __future__ import annotations

import queue
import threading
import traceback
from pathlib import Path
from tkinter import BOTH, END, LEFT, RIGHT, W, X, Y, filedialog, messagebox
from tkinter import StringVar, Tk, BooleanVar
from tkinter import ttk, scrolledtext

from reader import CannotRead, read_sheet
from workbook import marks_grid, write_xlsx

PHOTOS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
TITLE = "Mark Sheet Reader"


def photos_in(folder: Path) -> list[Path]:
    """Every photograph in the folder, in the order a person would expect."""
    return sorted(
        (p for p in folder.iterdir() if p.suffix.lower() in PHOTOS and p.is_file()),
        key=lambda p: p.name.lower(),
    )


class App:
    def __init__(self, root: Tk) -> None:
        self.root = root
        self.folder: Path | None = None
        self.messages: queue.Queue = queue.Queue()
        self.working = False

        root.title(TITLE)
        root.geometry("760x560")
        root.minsize(640, 480)

        pad = {"padx": 12, "pady": 6}
        frame = ttk.Frame(root)
        frame.pack(fill=BOTH, expand=True)

        # ---- the folder -------------------------------------------------
        top = ttk.LabelFrame(frame, text="1. The photographs")
        top.pack(fill=X, **pad)

        line = ttk.Frame(top)
        line.pack(fill=X, padx=10, pady=8)
        self.folder_label = StringVar(value="No folder chosen yet.")
        ttk.Button(line, text="Choose a folder…", command=self.choose).pack(side=LEFT)
        ttk.Label(line, textvariable=self.folder_label).pack(side=LEFT, padx=10)

        # ---- the form ---------------------------------------------------
        mid = ttk.LabelFrame(frame, text="2. The form")
        mid.pack(fill=X, **pad)

        row = ttk.Frame(mid)
        row.pack(fill=X, padx=10, pady=8)
        ttk.Label(row, text="Mark columns:").pack(side=LEFT)
        self.parts = StringVar(value="CQ, MCQ")
        ttk.Entry(row, textvariable=self.parts, width=28).pack(side=LEFT, padx=8)
        ttk.Label(
            row,
            text="as printed on the sheet, in order, between Roll and Total",
            foreground="#666",
        ).pack(side=LEFT)

        row2 = ttk.Frame(mid)
        row2.pack(fill=X, padx=10, pady=(0, 8))
        self.debug = BooleanVar(value=True)
        ttk.Checkbutton(
            row2,
            text="Also save a picture of the grid it found (helps when a sheet will not read)",
            variable=self.debug,
        ).pack(side=LEFT)

        # ---- doing it ---------------------------------------------------
        go = ttk.Frame(frame)
        go.pack(fill=X, **pad)
        self.button = ttk.Button(go, text="Read the sheets", command=self.start, state="disabled")
        self.button.pack(side=LEFT)
        self.progress = ttk.Progressbar(go, mode="determinate")
        self.progress.pack(side=LEFT, fill=X, expand=True, padx=10)

        # ---- what happened ----------------------------------------------
        out = ttk.LabelFrame(frame, text="3. What it read")
        out.pack(fill=BOTH, expand=True, **pad)
        self.log = scrolledtext.ScrolledText(out, height=14, wrap="word", state="disabled")
        self.log.pack(fill=BOTH, expand=True, padx=10, pady=8)

        self.say(
            "Choose a folder of photographed mark sheets.\n\n"
            "Nothing is written to the school's records here. This produces a "
            "spreadsheet, which you look at and then upload on SchoolTrack's "
            "Mark entry screen.\n"
        )
        self.root.after(120, self._drain)

    # ------------------------------------------------------------- saying

    def say(self, text: str) -> None:
        self.log.configure(state="normal")
        self.log.insert(END, text + "\n")
        self.log.see(END)
        self.log.configure(state="disabled")

    def _drain(self) -> None:
        """Messages from the working thread, shown on the window's own thread."""
        try:
            while True:
                kind, payload = self.messages.get_nowait()
                if kind == "say":
                    self.say(payload)
                elif kind == "step":
                    self.progress["value"] = payload
                elif kind == "done":
                    self._finished(payload)
        except queue.Empty:
            pass
        self.root.after(120, self._drain)

    # ------------------------------------------------------------ choosing

    def choose(self) -> None:
        picked = filedialog.askdirectory(title="The folder with the photographs")
        if not picked:
            return
        folder = Path(picked)
        found = photos_in(folder)
        self.folder = folder
        self.folder_label.set(f"{folder}  —  {len(found)} photograph(s)")
        self.button.configure(state="normal" if found else "disabled")
        self.log.configure(state="normal")
        self.log.delete("1.0", END)
        self.log.configure(state="disabled")
        if found:
            self.say(f"{len(found)} photograph(s) in {folder.name}:")
            for p in found:
                self.say(f"    {p.name}")
            self.say("")
        else:
            self.say(f"No photographs in {folder}. Looked for: "
                     + ", ".join(sorted(PHOTOS)))

    # ------------------------------------------------------------- working

    def start(self) -> None:
        if self.working or not self.folder:
            return
        names = [p.strip() for p in self.parts.get().split(",") if p.strip()]
        if not names:
            messagebox.showwarning(TITLE, "Name the mark columns, such as: CQ, MCQ")
            return
        self.working = True
        self.button.configure(state="disabled")
        threading.Thread(target=self._work, args=(self.folder, names), daemon=True).start()

    def _work(self, folder: Path, names: list[str]) -> None:
        try:
            found = photos_in(folder)
            self.messages.put(("say", f"Reading {len(found)} sheet(s) with columns: "
                                      + ", ".join(names) + "\n"))
            self.progress.configure(maximum=max(1, len(found)))

            rows: list[dict] = []
            unread = 0
            failed: list[str] = []
            debug_dir = folder / "what-it-saw" if self.debug.get() else None

            for i, photo in enumerate(found, start=1):
                self.messages.put(("say", f"{photo.name} …"))
                try:
                    got = read_sheet(photo, names, debug_dir=debug_dir)
                except CannotRead as e:
                    failed.append(photo.name)
                    self.messages.put(("say", f"    could not read it. {e}"))
                    continue
                except Exception as e:  # noqa: BLE001
                    failed.append(photo.name)
                    self.messages.put(("say", f"    unexpected problem: {e}"))
                    continue

                blanks = sum(
                    1 for r in got.rows for n in names if r["parts"].get(n) is None
                )
                unread += blanks
                rows.extend(got.rows)
                for w in got.warnings:
                    self.messages.put(("say", f"    note: {w}"))
                self.messages.put((
                    "say",
                    f"    {len(got.rows)} row(s), {blanks} box(es) it could not "
                    f"read  ·  grid {got.note.get('columns')} columns"
                    f" × {got.note.get('horizontal_rules')} rules",
                ))
                self.messages.put(("step", i))

            self.messages.put(("done", {
                "folder": folder, "names": names, "rows": rows,
                "unread": unread, "failed": failed, "debug": debug_dir,
            }))
        except Exception:  # noqa: BLE001
            self.messages.put(("say", "Something went wrong:\n" + traceback.format_exc()))
            self.messages.put(("done", None))

    # ------------------------------------------------------------ finishing

    def _finished(self, outcome) -> None:
        self.working = False
        self.button.configure(state="normal")
        if not outcome:
            return

        rows = outcome["rows"]
        if not rows:
            self.say("\nNothing was read, so no spreadsheet was written.")
            if outcome["debug"]:
                self.say(f"Look in {outcome['debug']} to see what it found on the page.")
            return

        target = outcome["folder"] / "marks.xlsx"
        write_xlsx(target, marks_grid(outcome["names"], rows))

        named = sum(1 for r in rows if r.get("roll") is not None)
        self.say("")
        self.say(f"Wrote {target}")
        self.say(f"    {len(rows)} row(s), {named} with a roll number it could read.")
        if outcome["unread"]:
            self.say(f"    {outcome['unread']} box(es) left EMPTY because it was "
                     "not sure. They are blank in the spreadsheet on purpose — "
                     "a zero would be a failing mark nobody wrote.")
        if outcome["failed"]:
            self.say(f"    {len(outcome['failed'])} sheet(s) could not be read at "
                     "all: " + ", ".join(outcome["failed"]))
        if outcome["debug"]:
            self.say(f"    A picture of the grid it found is in {outcome['debug'].name}/.")
        self.say("\nOpen the spreadsheet, check it against the paper, fill in any "
                 "blanks, then upload it on SchoolTrack → Mark entry.")


def main() -> None:
    root = Tk()
    try:
        ttk.Style().theme_use("vista")
    except Exception:  # noqa: BLE001 - any platform without it
        pass
    App(root)
    root.mainloop()


if __name__ == "__main__":
    main()
