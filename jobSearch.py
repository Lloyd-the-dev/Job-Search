"""Run the local job application tracker."""

from __future__ import annotations

import argparse
import sys
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


APP_DIRECTORY = Path(__file__).resolve().parent
ALLOWED_FILES = {
    "/": "index.html",
    "/index.html": "index.html",
    "/styles.css": "styles.css",
    "/app.js": "app.js",
}


class JobSearchHandler(BaseHTTPRequestHandler):
    """Serve only the tracker interface files on the local machine."""

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        filename = ALLOWED_FILES.get(path)
        if filename is None:
            self.send_error(404, "Not found")
            return

        file_path = APP_DIRECTORY / filename
        content_type = "text/html; charset=utf-8"
        if filename.endswith(".css"):
            content_type = "text/css; charset=utf-8"
        elif filename.endswith(".js"):
            content_type = "text/javascript; charset=utf-8"

        content = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run your local job application tracker.")
    parser.add_argument("--port", type=int, default=8000, help="Local port to use (default: 8000)")
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Do not open the tracker automatically",
    )
    args = parser.parse_args()

    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")

    address = f"http://127.0.0.1:{args.port}/"
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), JobSearchHandler)
    except OSError as error:
        print(f"Could not start the tracker at {address}: {error}", file=sys.stderr)
        return 1

    print(f"Job application tracker running at {address}")
    print("Your application history is stored in this browser's IndexedDB.")
    print("Press Ctrl+C to stop the server.")
    if not args.no_browser:
        webbrowser.open(address)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping the job application tracker.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())