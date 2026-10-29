"""Launch the packaged prototype on loopback. Python 3 standard library only.

When a handover/ folder sits next to this file (the developer copy), the server
also reads and saves handover/data.json, so the handover layer can be edited
in the browser. The client package has no handover/ folder, so it stays read-only.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import webbrowser

ROOT = Path(__file__).resolve().parent
DIRECTORY = ROOT if (ROOT / 'index.html').exists() else ROOT / 'dist'
HANDOVER = ROOT / 'handover' / 'data.json'
ENDPOINT = '/__handover/data'


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def _json(self, status, body):
        payload = body.encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path.split('?')[0] == ENDPOINT:
            if not HANDOVER.parent.exists():
                return self._json(404, '{"error":"No handover folder"}')
            text = HANDOVER.read_text('utf-8') if HANDOVER.exists() else '{"version":1,"notes":[],"handovers":[]}'
            return self._json(200, text)
        return super().do_GET()

    def do_POST(self):
        if self.path.split('?')[0] != ENDPOINT or not HANDOVER.parent.exists():
            return self._json(404, '{"error":"Not found"}')
        length = int(self.headers.get('Content-Length') or 0)
        if length > 5_000_000:
            return self._json(413, '{"error":"Too large"}')
        try:
            data = json.loads(self.rfile.read(length).decode('utf-8'))
            if not isinstance(data, dict) or not isinstance(data.get('notes'), list):
                raise ValueError('notes missing')
        except (ValueError, UnicodeDecodeError):
            return self._json(400, '{"error":"Invalid data"}')
        HANDOVER.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', 'utf-8')
        return self._json(200, '{"ok":true}')


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
    if HANDOVER.parent.exists():
        print('Handover notes are editable: press Alt+H in the prototype.')
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
