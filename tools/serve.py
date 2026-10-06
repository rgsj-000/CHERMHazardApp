#!/usr/bin/env python3
"""Portable, standard-library local server for start.sh."""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
from threading import Thread
import webbrowser

ROOT = Path(__file__).resolve().parent.parent


class AppHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript; charset=utf-8',
        '.geojson': 'application/geo+json; charset=utf-8',
        '.tif': 'image/tiff',
        '.tiff': 'image/tiff',
    }

    def send_head(self):
        # Keep symlinks inside the app root and do not expose directory listings.
        path = Path(self.translate_path(self.path)).resolve()
        try:
            path.relative_to(ROOT)
        except ValueError:
            self.send_error(404, 'Not found')
            return None
        if path.is_dir():
            index = next(((path / name).resolve() for name in ('index.html', 'index.htm') if (path / name).is_file()), None)
            if index is None:
                self.send_error(404, 'Not found')
                return None
            try:
                index.relative_to(ROOT)
            except ValueError:
                self.send_error(404, 'Not found')
                return None
        return super().send_head()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


class LocalServer(ThreadingHTTPServer):
    allow_reuse_address = False
    daemon_threads = True


def bind_server(port):
    candidates = [0] if port == 0 else list(range(port, min(port + 20, 65536))) + [0]
    handler = partial(AppHandler, directory=str(ROOT))
    last_error = None
    for candidate in candidates:
        try:
            return LocalServer(('127.0.0.1', candidate), handler)
        except OSError as error:
            last_error = error
    raise last_error


def open_browser(url):
    try:
        opened = webbrowser.open(url, new=2)
    except Exception as error:
        print('Automatic browser launch failed: {}. Open {} in your browser.'.format(error, url), flush=True)
    else:
        if not opened:
            print('Open {} in your browser. Automatic browser launch is unavailable.'.format(url), flush=True)


def main():
    parser = argparse.ArgumentParser(description='Serve CHERM locally; choose another port automatically if needed.')
    parser.add_argument('--port', '-Port', type=int, default=8000, help='Preferred port (0 chooses any available port).')
    parser.add_argument('--no-browser', '-NoBrowser', action='store_true', help='Keep serving without opening a browser.')
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error('Port must be between 0 and 65535.')
    try:
        server = bind_server(args.port)
    except OSError as error:
        print('Could not start the local CHERM server: {}'.format(error), file=sys.stderr)
        return 1

    with server:
        actual_port = server.server_address[1]
        url = 'http://127.0.0.1:{}/'.format(actual_port)
        if args.port and actual_port != args.port:
            print('Port {} is unavailable; using {}.'.format(args.port, actual_port), flush=True)
        print('CHERM Hazard Simulator running at {}'.format(url), flush=True)
        print('Keep this window open while using the app. Press Ctrl+C to stop.', flush=True)
        if not args.no_browser:
            # Opening a browser must not delay serving the application.
            Thread(target=open_browser, args=(url,), daemon=True).start()
        try:
            server.serve_forever(poll_interval=0.25)
        except KeyboardInterrupt:
            print('\nCHERM server stopped.', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
