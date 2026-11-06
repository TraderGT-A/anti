#!/usr/bin/env python
"""สรุปหลังตลาดปิด (ไทย/สหรัฐ) — สิ่งที่ระบบอัปเดตวันนี้

ดึงจากไฟล์ที่สแกนไว้แล้ว + API ของเว็บ ไม่ได้คำนวณสัญญาณใหม่
  - ดัชนีตลาด + เปอร์เซ็นต์เปลี่ยน
  - หุ้นเบรกยอดฐานใหม่วันนี้ (Pivot Break)
  - งบใหม่จาก SET (ตลาดไทย)
  - หุ้นขึ้น/ลงแรงในกลุ่ม RS สูง
  - ภาพกว้าง: เปอร์เซ็นต์หุ้นเหนือ SMA50/SMA200

Usage: python scripts/report/close_digest.py --market th|us
"""
import argparse, json, os, sys, urllib.request
from datetime import datetime

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BASE = "https://rsdashclean.vercel.app"


def get_json(url, timeout=90):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        return json.loads(urllib.request.urlopen(req, timeout=timeout).read())
    except Exception:
        return None


def fmt_pct(v):
    try:
        v = float(v)
        return ("+" if v >= 0 else "") + f"{v:.2f}%"
    except Exception:
        return "—"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--market", default="th", choices=["th", "us"])
    ap.add_argument("--date", default="")
    a = ap.parse_args()
    mk = "thailand" if a.market == "th" else "america"
    tag = "ไทย" if a.market == "th" else "สหรัฐ"

    # 1) หุ้นทั้งตลาด
    scan = get_json(f"{BASE}/api/scan?market={mk}" + ("" if a.market == "th" else "&universe=all"))
    rows = (scan or {}).get("data") or []
    if not rows:
        print(f"⚠️ ดึงข้อมูลตลาด{tag}ไม่ได้ — ข้ามสรุปรอบนี้")
        return

    # 2) ดัชนี
    idx_sym = "^SET.BK" if a.market == "th" else "^GSPC"
    idx_name = "SET" if a.market == "th" else "S&P500"
    if a.market == "th":
        # ดัชนีไทยใช้ /api/idxchart (TradingView) เพราะ Yahoo ให้ประวัติมาแท่งเดียว
        ch = get_json(f"{BASE}/api/idxchart?symbol={urllib.parse.quote(idx_sym)}&interval=1d&range=1y")
    else:
        ch = get_json(f"{BASE}/api/chart?market={mk}&symbol={urllib.parse.quote(idx_sym)}&interval=1d&range=1mo")
    bars = (ch or {}).get("data") or []
    idx_txt = ""
    if len(bars) >= 2:
        c0, c1 = bars[-1]["close"], bars[-2]["close"]
        idx_txt = f"{idx_name} {c0:,.2f} ({fmt_pct((c0/c1-1)*100)})"

    # 3) ภาพกว้าง
    def above(key):
        ok = tot = 0
        for r in rows:
            p, s = r.get("price"), r.get(key)
            if isinstance(p, (int, float)) and isinstance(s, (int, float)) and p > 0 and s > 0:
                tot += 1
                if p > s:
                    ok += 1
        return (ok / tot * 100) if tot else None

    b50, b200 = above("sma50"), above("sma200")

    # 4) เบรกยอดฐานใหม่วันนี้
    pv = {}
    try:
        pv = json.load(open(os.path.join(ROOT, "rsdash", f"pivot_{a.market}.json"), encoding="utf-8"))
    except Exception:
        pass
    asof = a.date or pv.get("asOf") or ""
    brk = [r for r in (pv.get("rows") or []) if r.get("st") == "BREAK" and str(r.get("brkDate")) == str(asof)]
    brk.sort(key=lambda r: -float(r.get("brkVol") or 0))

    # 5) หุ้นขึ้น/ลงแรง (เฉพาะ RS สูง)
    strong = [r for r in rows if isinstance(r.get("score"), (int, float)) and r["score"] >= 80 and isinstance(r.get("change"), (int, float))]
    ups = [r for r in sorted(strong, key=lambda r: -r["change"]) if r["change"] > 0][:5]
    dns = [r for r in sorted(strong, key=lambda r: r["change"]) if r["change"] < 0][:5]

    # 6) งบใหม่ (ไทย)
    earn_lines = []
    if a.market == "th":
        try:
            se = json.load(open(os.path.join(ROOT, "rsdash", "set_earn.json"), encoding="utf-8"))
            today = datetime.now().strftime("%Y-%m-%d")
            items = se.get("items") or {}
            new = []
            for tk, it in items.items():
                if str(it.get("date", ""))[:10] == today:
                    s = it.get("sum") or {}
                    n = s.get("nums") or {}
                    bit = f"{tk}"
                    if n.get("yoy"):
                        bit += f" (กำไร YoY {n['yoy']})"
                    new.append(bit)
            if new:
                earn_lines = new[:10]
        except Exception:
            pass

    # ── ประกอบข้อความ ──
    out = []
    out.append(f"📊 ปิดตลาด{tag} {(asof or datetime.now().strftime('%d/%m/%Y'))}")
    if idx_txt:
        out.append(idx_txt)
    if b50 is not None:
        out.append(f"หุ้นเหนือ SMA50 {b50:.0f}% · SMA200 {b200:.0f}%" if b200 is not None else f"หุ้นเหนือ SMA50 {b50:.0f}%")
    if brk:
        names = ", ".join(f"{r['tk']}" for r in brk[:8])
        out.append(f"เบรกยอดฐานใหม่ {len(brk)} ตัว: {names}" + (" …" if len(brk) > 8 else ""))
    else:
        out.append("ไม่มีหุ้นเบรกยอดฐานใหม่รอบนี้")
    if earn_lines:
        out.append("งบใหม่จาก SET: " + ", ".join(earn_lines))
    if ups:
        out.append("RS สูงขึ้นแรง: " + ", ".join(f"{r['ticker']} {fmt_pct(r['change'])}" for r in ups))
    if dns:
        out.append("RS สูงลงแรง: " + ", ".join(f"{r['ticker']} {fmt_pct(r['change'])}" for r in dns))
    out.append("ระบบอัปเดตแล้ว: สแกนสัญญาณ · Pivot Break · breadth · ภาพรวมตลาด")
    print("\n".join(out)[:1900])


if __name__ == "__main__":
    import urllib.parse  # noqa: E402
    main()
