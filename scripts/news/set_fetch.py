#!/usr/bin/env python
"""SET Thailand: ดึงข่าวงบ + MD&A ผ่าน Chrome headless (เลี่ยง Incapsula)

ใช้ CDP ของ Chrome จริง (headless=new) เปิดหน้าข่าว SET เพื่อให้ได้คุกกี้
แล้วเรียก API ภายในหน้าเว็บ:
  - /api/set/news/search        รายการข่าว (กรอง tag financial-statement)
  - /api/cms-w/v1/news/set-news-view   เนื้อหาเต็ม (MD&A)

ผลลัพธ์: rsdash/set_earn.json
  { "updated_at": ISO, "items": { "KCE": {"date":"2026-11-05T18:27:00+07:00",
      "quarter":"3/2569","ids":[...],"mdna_id":"...","mdna":"ข้อความ ~4000 ตัว" } } }

Usage: python scripts/news/set_fetch.py [--days 7] [--port 9333]
"""
import argparse, json, os, re, subprocess, sys, tempfile, time, urllib.parse, urllib.request
from datetime import datetime, timedelta

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "rsdash", "set_earn.json")
CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
]

try:
    import websocket  # websocket-client
except Exception:
    websocket = None


def find_chrome():
    for p in CHROME_CANDIDATES:
        if p and os.path.exists(p):
            return p
    raise SystemExit("ไม่พบ Chrome")


class CDP:
    def __init__(self, port=None, headless=True):
        import random
        self.port = port or 0          # 0 = ให้ Chrome เลือกพอร์ตเอง แล้วอ่านจาก log
        self.profile = os.path.join(tempfile.gettempdir(), "setprof_" + str(os.getpid()))
        self.logpath = os.path.join(tempfile.gettempdir(), "set_chrome_%d.log" % os.getpid())
        args = [
            find_chrome(),
            "--remote-debugging-port=%d" % self.port,
            f"--user-data-dir={self.profile}",
            "--no-first-run", "--no-default-browser-check",
            "--disable-background-networking", "--disable-blink-features=AutomationControlled",
            "--remote-allow-origins=*",
            "--lang=th-TH", "about:blank",
        ]
        if headless:
            args.insert(1, "--headless=new")
        self.log = open(self.logpath, "wb")
        self.proc = subprocess.Popen(args, stdout=self.log, stderr=self.log)
        self.ws = None
        self.mid = 0
        # อ่าน ws endpoint จาก log (Chrome พิมพ์ 'DevTools listening on ws://host:port/...')
        ws_url = None
        for _ in range(120):
            try:
                txt = open(self.logpath, "r", encoding="utf-8", errors="replace").read()
                m = re.search(r"DevTools listening on (ws://[^\s]+)", txt)
                if m:
                    ws_url = m.group(1)
                    break
            except Exception:
                pass
            if self.proc.poll() is not None:
                break
            time.sleep(0.5)
        if not ws_url:
            raise SystemExit("เชื่อม Chrome ไม่ได้ (ดู log: %s)" % self.logpath)
        base = ws_url.split("/devtools/")[0]          # ws://host:port
        hostport = base.replace("ws://", "")
        self.port = int(hostport.rsplit(":", 1)[1])
        for host in ("127.0.0.1", "[::1]"):
            try:
                info = json.loads(urllib.request.urlopen(f"http://{host}:{self.port}/json", timeout=3).read())
                pages = [t for t in info if t.get("type") == "page"]
                if pages:
                    self.ws = websocket.create_connection(pages[0]["webSocketDebuggerUrl"], timeout=40, suppress_origin=True)
                    return
            except Exception:
                continue
        # fallback: ต่อ browser endpoint ตรง ๆ
        self.ws = websocket.create_connection(ws_url, timeout=40, suppress_origin=True)
        tgt = self.send("Target.createTarget", url="about:blank")
        att = self.send("Target.attachToTarget", targetId=tgt["targetId"], flatten=True)
        self.session = att["sessionId"]

    def send(self, method, **params):
        self.mid += 1
        msg = {"id": self.mid, "method": method, "params": params}
        if getattr(self, "session", None):
            msg["sessionId"] = self.session
        self.ws.send(json.dumps(msg))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.mid:
                if "error" in msg:
                    raise RuntimeError(msg["error"])
                return msg.get("result", {})

    def goto(self, url, wait=6):
        self.send("Page.navigate", url=url)
        time.sleep(wait)

    def js(self, expr, timeout=45):
        r = self.send("Runtime.evaluate", expression=expr, awaitPromise=True,
                      returnByValue=True, timeout=timeout * 1000)
        res = r.get("result", {})
        if res.get("subtype") == "error":
            raise RuntimeError(res.get("description", "js error"))
        return res.get("value")

    def close(self):
        try:
            if self.ws:
                self.ws.close()
        except Exception:
            pass
        try:
            self.proc.terminate()
        except Exception:
            pass


FETCH_JS = """
(async () => {
  const out = { list: null, err: null };
  try {
    const u = 'https://www.set.or.th/api/set/news/search?fromDate=%s&toDate=%s&keyword=%s&lang=th';
    const r = await fetch(u, { headers: { accept: 'application/json' } });
    out.list = await r.json();
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
"""

DOM_JS = r"""
(() => {
  try {
    const t = document.body ? document.body.innerText : '';
    const i = t.indexOf('รายละเอียดแบบเต็ม');
    let body = i >= 0 ? t.slice(i + 'รายละเอียดแบบเต็ม'.length) : t;
    body = body.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    let pdf = '';
    for (const a of document.querySelectorAll('a')) {
      const h = a.href || '';
      if (/weblink\.set\.or\.th\/dat\/news\/.*\.pdf/i.test(h)) { pdf = h; break; }
    }
    if (!pdf) {
      const html = document.documentElement.outerHTML || '';
      const key = 'weblink.set.or.th/dat/news/';
      const i = html.indexOf(key);
      if (i > 0) {
        const start = html.lastIndexOf('http', i);
        let e = i;
        while (e < html.length) {
          const c = html[e];
          if (c === '"' || c === "'" || c === '<' || c === ' ' || c === '\n' || c === '\\') break;
          e++;
        }
        pdf = html.slice(start, e);
      }
    }
    return JSON.stringify({ text: body.slice(0, 20000), pdf: pdf });
  } catch (e) { return JSON.stringify({ text: '', err: String(e) }); }
})()
"""


PDF_DIR = os.path.join(ROOT, "rsdash", "set_pdf")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36")


def pdf_text(url, limit=30000):
    """ดาวน์โหลด PDF ของ MD&A (weblink.set.or.th ไม่ติด WAF ถ้าใส่ referer) แล้วสกัดข้อความ"""
    try:
        os.makedirs(PDF_DIR, exist_ok=True)
        name = re.sub(r"[^A-Za-z0-9_.-]", "_", url.rsplit("/", 1)[-1])[:80]
        path = os.path.join(PDF_DIR, name)
        if not os.path.exists(path) or os.path.getsize(path) < 1000:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://www.set.or.th/"})
            data = urllib.request.urlopen(req, timeout=90).read()
            if len(data) < 1000:
                return ""
            open(path, "wb").write(data)
        from pypdf import PdfReader
        r = PdfReader(path)
        out = []
        for pg in r.pages[:25]:
            try:
                out.append(pg.extract_text() or "")
            except Exception:
                continue
            if sum(len(x) for x in out) > limit:
                break
        txt = "\n".join(out)
        txt = re.sub(r"[ \t]{2,}", " ", txt)
        txt = re.sub(r"\n{3,}", "\n\n", txt)
        return txt[:limit]
    except Exception as e:
        print("   pdf err:", e, flush=True)
        return ""

QUARTER_RE = re.compile(r"ไตรมาสที่\s*(\d)\s*(?:/\s*(\d{4}))?")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--port", type=int, default=None)
    ap.add_argument("--headful", action="store_true")
    ap.add_argument("--limit", type=int, default=40)
    a = ap.parse_args()

    today = datetime.now()
    frm = (today - timedelta(days=a.days)).strftime("%d/%m/%Y")
    to = today.strftime("%d/%m/%Y")

    prev = {}
    if os.path.exists(OUT):
        try:
            prev = (json.load(open(OUT, encoding="utf-8")) or {}).get("items", {})
        except Exception:
            prev = {}

    c = CDP(port=a.port, headless=not a.headful)
    try:
        c.goto("https://www.set.or.th/th/market/news-and-alert/news", wait=8)
        kw = urllib.parse.quote("งบการเงิน")
        raw = c.js(FETCH_JS % (urllib.parse.quote(frm), urllib.parse.quote(to), kw))
        data = json.loads(raw)
        if data.get("err") or not data.get("list"):
            raise SystemExit(f"ดึงรายการไม่สำเร็จ: {data.get('err')}")
        news = data["list"].get("newsInfoList", [])
        print(f"พบข่าวงบ {len(news)} รายการ ({frm} - {to})", flush=True)

        items = {}
        for n in news[: a.limit]:
            tk = n.get("symbol") or ""
            if not tk or n.get("tag") != "financial-statement":
                continue
            q = ""
            m = QUARTER_RE.search(n.get("headline") or "")
            if m:
                q = f"{m.group(1)}/{m.group(2) or ''}".strip("/")
            cur = items.get(tk)
            if cur and cur["date"] >= n["datetime"]:
                continue
            items[tk] = {"date": n["datetime"], "quarter": q, "id": n["id"],
                         "headline": n.get("headline", ""), "url": n.get("url", "")}
        print(f"หุ้นที่มีงบใหม่ {len(items)} ตัว", flush=True)

        # ดึง MD&A (ข่าว 'คำอธิบายและวิเคราะห์ของฝ่ายจัดการ') ของแต่ละตัว
        for tk, it in items.items():
            old = prev.get(tk) or {}
            if old.get("date") == it["date"] and (old.get("mdna_full") or old.get("mdna")):
                it.update({k: v for k, v in old.items() if k in ("mdna", "mdna_full", "mdna_pdf", "mdna_url", "mdna_id", "sum")})
                print(f"  ข้าม {tk} (เคยดึงแล้ว)", flush=True)
                continue
            try:
                lst = c.js("""(async () => {
                  const u='https://www.set.or.th/api/set/news/search?symbol=%s&fromDate=%s&toDate=%s&keyword=&lang=th';
                  const r=await fetch(u,{headers:{accept:'application/json'}}); const j=await r.json();
                  return JSON.stringify((j.newsInfoList||[]).filter(x=>/คำอธิบายและวิเคราะห์|MD&A|Management Discussion/i.test(x.headline||'')).slice(0,2));
                })()""" % (tk, urllib.parse.quote(frm), urllib.parse.quote(to)))
                md = json.loads(lst) if lst else []
                if md:
                    m0 = md[0]
                    c.goto(m0.get("url", ""), wait=8)
                    det = json.loads(c.js(DOM_JS))
                    tries = 0
                    while (not det.get("pdf")) and tries < 4:
                        time.sleep(2.5)
                        det = json.loads(c.js(DOM_JS))
                        tries += 1
                    it["mdna_id"] = m0["id"]
                    it["mdna_url"] = m0.get("url", "")
                    it["mdna"] = (det.get("text") or "").strip()
                    it["mdna_pdf"] = det.get("pdf") or ""
                    full = ""
                    if it["mdna_pdf"]:
                        full = pdf_text(it["mdna_pdf"])
                        if full:
                            it["mdna_full"] = full
                    print(f"  MD&A {tk}: {len(it['mdna'])} ตัวอักษร, PDF {len(full)} ตัวอักษร", flush=True)
            except Exception as e:
                print(f"  MD&A {tk} ผิดพลาด: {e}", flush=True)
    finally:
        c.close()

    # คงข้อมูลเดิมของหุ้นที่ยังไม่ถูกดึงในรอบนี้ (เช่น งบออกไปก่อนหน้าช่วง days)
    for tk, it in prev.items():
        if tk not in items:
            items[tk] = it

    payload = {"updated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
               "source": "set.or.th news/search + set-news-view", "items": items}
    new_tk = [tk for tk, it in items.items()
              if not prev.get(tk) or prev[tk].get("date") != it.get("date")]
    payload["new_tickers"] = new_tk
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)
    print("NEW_TICKERS:", ",".join(new_tk), flush=True)
    print("เขียน", OUT, "หุ้น", len(items))


if __name__ == "__main__":
    main()
