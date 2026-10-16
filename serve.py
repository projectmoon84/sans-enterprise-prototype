"""Launch the packaged prototype on loopback. Python 3 standard library only."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser

ROOT = Path(__file__).resolve().parent
DIRECTORY = ROOT if (ROOT / 'index.html').exists() else ROOT / 'dist'

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

if __name__ == '__main__':
    # A stable port keeps the browser's mock database consistent between visits.
    try:
        server = ThreadingHTTPServer(('127.0.0.1', 5189), partial(Handler, directory=str(DIRECTORY)))
    except OSError:
        print('Port 5189 is already in use. Close the other prototype server and try again.')
        input('Press Enter to close. ')
        raise SystemExit(1)
    url = 'http://127.0.0.1:5189/'
    print(f'Prototype running at {url}\nKeep this window open. Press Ctrl+C to stop.')
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
