#!/usr/bin/env python3
"""The app's screens in a desktop browser: python3 tools/serve.py, then http://localhost:4412/

Without a television there are stand-in apps, and a strip at the bottom switches the look and day or night
(1, 2, 3 and N on the keyboard; the arrows, Enter and Esc are the remote). --lan opens it to a phone on the same
network, which gets a remote drawn under the picture. Only web/ is served.
"""
import functools
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

WEB = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'web')


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    port = int(sys.argv[sys.argv.index('--port') + 1]) if '--port' in sys.argv else 4412
    host = '0.0.0.0' if '--lan' in sys.argv else '127.0.0.1'
    print('Free My Android TV, in a browser: http://localhost:%d/' % port)
    ThreadingHTTPServer((host, port), functools.partial(Handler, directory=WEB)).serve_forever()
