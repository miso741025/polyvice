#!/usr/bin/env python3
"""Serve the game without letting the browser cache anything.

The game is plain ES modules with no build step, so a browser that keeps an old copy of one
file next to new copies of the others fails to start (stuck on "Loading..."). This server
tells the browser never to store what it is given.

    python3 serve.py            # http://localhost:8137
    python3 serve.py 9000       # another port
"""
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()

    def log_message(self, *args):  # quiet
        pass


if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8137
    print(f'Serving on http://localhost:{port}')
    ThreadingHTTPServer(('', port), NoCache).serve_forever()
