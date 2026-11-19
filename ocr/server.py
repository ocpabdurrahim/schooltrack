"""
The local reader: a small HTTP service the app calls instead of Google.

Runs on one computer in the office. The app offers it a photographed sheet and
it answers in Gemini's reply shape, so nothing downstream of the reading has to
know or care which of the two did the work.

    .venv/Scripts/python.exe server.py            # http://localhost:8765

Deliberately the standard library and nothing else. A school's office machine
should not need a web framework installed to add up marks, and every dependency
is another thing to break on a day when nobody can fix it.
"""

from __future__ import annotations

import base64
import binascii
import json
import mimetypes
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from contract import CannotRead
from reader import read_sheets

PORT = 8765

# The app is served from these; a browser will not let a page call this service
# without being told the service is willing. Localhost is the normal case (the
# web app open on the same machine); the deployed site is listed so the office
# machine can be used with the real app rather than a local copy.
#
# NOT "*": that would let any page on the internet the teacher happens to have
# open make this computer read things.
ALLOWED_ORIGINS = {
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "https://schooltrack-1941.web.app",
    "https://schooltrack-1941.firebaseapp.com",
}

MAX_BODY = 64 * 1024 * 1024  # a few photographs of a sheet, and no more

# The built web app, served by this same service when it has been built.
#
# This exists because of a hard browser rule, found by testing rather than
# guessed at: a page on https://schooltrack-1941.web.app CANNOT call
# http://localhost, and Chrome blocks it before a single byte leaves the
# machine, so no amount of CORS on this end helps. Serving the app from here
# puts the app and the reader on ONE origin, and the question stops existing.
#
# The office machine then opens http://localhost:8765 and has both.
APP_DIR = (Path(__file__).resolve().parent.parent / "web" / "dist")


class Handler(BaseHTTPRequestHandler):
    server_version = "SchoolTrackReader/0.1"

    # -------------------------------------------------------------- plumbing

    def _cors(self) -> None:
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _refuse(self, status: int, why: str) -> None:
        self._json(status, {"error": why})

    def log_message(self, fmt: str, *args) -> None:
        # One readable line, so somebody watching this window can see it work.
        sys.stderr.write("%s  %s\n" % (self.log_date_time_string(), fmt % args))

    # --------------------------------------------------------------- routing

    def do_OPTIONS(self) -> None:  # noqa: N802  (the stdlib spells it this way)
        self.send_response(204)
        self._cors()
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        # The deployed app is on https:// and this service is on a private
        # address, which a browser treats as a public page reaching into the
        # local network and blocks unless the local end says it is willing.
        # Without this, the real app at schooltrack-1941.web.app simply gets
        # "Failed to fetch" and the office machine could only use a local copy.
        if self.headers.get("Access-Control-Request-Private-Network") == "true":
            self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        if path.rstrip("/") == "/health":
            # Something a person can open in a browser to see it is alive.
            self._json(200, {"reader": "SchoolTrack local reader", "ready": True})
            return
        if self._serve_app(path):
            return
        self._refuse(
            404,
            "Nothing here. The reader answers POST /read. To serve the app "
            "from here too, build it: npm --prefix web run build",
        )

    # ------------------------------------------------------------- the app

    def _serve_app(self, path: str) -> bool:
        """The built web app, if it has been built. False when there is none."""
        if not APP_DIR.is_dir():
            return False

        rel = path.lstrip("/") or "index.html"
        target = (APP_DIR / rel).resolve()
        # Never outside the built app, whatever the request asks for.
        if not str(target).startswith(str(APP_DIR.resolve())):
            return False
        if not target.is_file():
            # A single-page app: every unknown path is its own routing.
            target = APP_DIR / "index.html"
            if not target.is_file():
                return False

        body = target.read_bytes()
        kind = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        if target.name == "index.html":
            # So a rebuilt app is actually picked up rather than cached.
            self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)
        return True

    def do_POST(self) -> None:  # noqa: N802
        if self.path.rstrip("/") != "/read":
            self._refuse(404, "Nothing here. The reader answers POST /read.")
            return

        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self._refuse(400, "That request had no readable length.")
            return
        if length <= 0:
            self._refuse(400, "That request had nothing in it.")
            return
        if length > MAX_BODY:
            self._refuse(413, "That is more than this reader will take at once.")
            return

        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            self._refuse(400, "That request was not readable JSON.")
            return

        images = body.get("images") or []
        components = [str(c) for c in (body.get("components") or [])]
        if not isinstance(images, list) or not images:
            self._refuse(400, "There was no photograph to read.")
            return

        try:
            pictures = [_bytes_of(i) for i in images]
        except CannotRead as e:
            self._refuse(400, str(e))
            return

        try:
            answer = read_sheets(pictures, components)
        except CannotRead as e:
            # Something the teacher can act on, so it is said in words.
            self._refuse(422, str(e))
            return
        except Exception as e:  # noqa: BLE001 - last line before a 500 page
            self.log_message("unexpected: %r", e)
            self._refuse(500, "This reader hit a problem it did not expect: %s" % e)
            return

        self._json(200, answer)


def _bytes_of(image: object) -> bytes:
    """The JPEG itself, out of what the app sent."""
    if not isinstance(image, dict):
        raise CannotRead("One of those photographs was not in a shape this reader knows.")
    raw = image.get("base64") or ""
    if not isinstance(raw, str) or raw == "":
        raise CannotRead("One of those photographs arrived empty.")
    # A data: prefix is harmless to allow and annoying to debug if it is not.
    if "," in raw[:64] and raw.lstrip().startswith("data:"):
        raw = raw.split(",", 1)[1]
    try:
        return base64.b64decode(raw, validate=False)
    except (binascii.Error, ValueError):
        raise CannotRead("One of those photographs could not be decoded.") from None


def main() -> None:
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"SchoolTrack local reader listening on http://localhost:{PORT}")
    if APP_DIR.is_dir():
        print(f"The app is served from here too — open http://localhost:{PORT}")
        print("On its Setup screen, set the reader address to the same thing.")
    else:
        print("The app is not built, so only the reader is served here.")
        print("  npm --prefix web run build     to serve the app from here too")
        print("A page on https://schooltrack-1941.web.app CANNOT reach this")
        print("service — browsers forbid it — so use the app served from here.")
    print("Stop it with Ctrl+C.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
