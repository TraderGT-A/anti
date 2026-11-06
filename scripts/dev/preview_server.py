#!/usr/bin/env python
"""เซิร์ฟเวอร์ทดสอบในเครื่อง: เสิร์ฟไฟล์ rsdash/ แล้ว proxy /api/* ไปเว็บจริง

ใช้ตรวจหน้าเว็บ/การ์ดแชร์ก่อนดีพลอย (ประหยัดโควตา Vercel)

  python scripts/dev/preview_server.py [--port 8880]
  เปิด http://127.0.0.1:8880/index.html
"""
import argparse, http.server, os, socketserver, socketserver, urllib.request, urllib.error, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "rsdash"))
UPSTREAM = "https://rsdashclean.vercel.app"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        pass

    def do_GET(self):
        if self.path.startswith("/api/"):
            try:
                req = urllib.request.Request(UPSTREAM + self.path, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=60) as r:
                    body = r.read()
                    self.send_response(r.status)
                    for k, v in r.headers.items():
                        if k.lower() in ("content-length", "transfer-encoding", "connection"):
                            continue
                        self.send_header(k, v)
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
            except urllib.error.HTTPError as e:
                body = e.read()
                self.send_response(e.code)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except Exception as e:
                msg = str(e).encode()
                self.send_response(502)
                self.send_header("Content-Length", str(len(msg)))
                self.end_headers()
                self.wfile.write(msg)
            return
        return super().do_GET()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8880)
    a = ap.parse_args()
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", a.port), Handler) as httpd:
        print(f"preview: http://127.0.0.1:{a.port}/index.html  (root={ROOT})", flush=True)
        httpd.serve_forever()


if __name__ == "__main__":
    main()
