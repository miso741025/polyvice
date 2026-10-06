#!/usr/bin/env python3
"""Serve the game without letting the browser cache anything.

The game is plain ES modules with no build step, so a browser that keeps an old copy of one
file next to new copies of the others fails to start (stuck on "Loading..."). This server
tells the browser never to store what it is given.

    python3 serve.py            # http://localhost:8137
    python3 serve.py 9000       # another port
"""
import json
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


AUDIO = ('.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.wav', '.flac')


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()

    def do_GET(self):
        # /music/list.json and /sounds/list.json: what is in those folders right now, so songs and
        # recordings can be dropped in without touching the code.
        path = self.path.split('?')[0]
        if path in ('/music/list.json', '/sounds/list.json'):
            folder = path.split('/')[1]
            names = sorted(f for f in os.listdir(folder) if f.lower().endswith(AUDIO) and not f.startswith('.')) if os.path.isdir(folder) else []
            body = json.dumps(names).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        # Browsers ask for audio in byte ranges (Safari will not play it otherwise), which the stock handler ignores.
        rng = self.headers.get('Range')
        if rng and rng.startswith('bytes='):
            local = self.translate_path(self.path)
            if os.path.isfile(local):
                size = os.path.getsize(local)
                first, _, last = rng[6:].partition('-')
                try:
                    start = int(first) if first else max(0, size - int(last))
                    end = min(int(last), size - 1) if first and last else size - 1
                except ValueError:
                    start, end = 0, size - 1
                if start >= size:
                    self.send_error(416)
                    return
                self.send_response(206)
                self.send_header('Content-Type', self.guess_type(local))
                self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
                self.send_header('Content-Length', str(end - start + 1))
                self.end_headers()
                with open(local, 'rb') as f:
                    f.seek(start)
                    left = end - start + 1
                    try:
                        while left > 0:
                            chunk = f.read(min(65536, left))
                            if not chunk:
                                break
                            self.wfile.write(chunk)
                            left -= len(chunk)
                    except (BrokenPipeError, ConnectionResetError):
                        pass
                return
        super().do_GET()

    def log_message(self, *args):  # quiet
        pass


if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8137
    print(f'Serving on http://localhost:{port}')
    ThreadingHTTPServer(('', port), NoCache).serve_forever()
