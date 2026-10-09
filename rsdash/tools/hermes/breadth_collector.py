#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Breadth History Collector — เก็บ snapshot รายวันของ Breadth (up/down, %เหนือ SMA50/200)
ลง SQLite local (สำหรับสร้างกราฟย้อนหลัง + กันข้อมูลหายเมื่อ Supabase มีปัญหา)

Design (ตามการสั่ง: ทำแบบค่อยๆ รัน เก็บให้ครบ data เผื่อวันนึงข้อมูลหาย):
- รันทุกวันหลังตลาดปิด (ไทย + อเมริกา) — ครั้งเดียวต่อวัน ใช้ /api/scan ที่เราคำนวณมาแล้ว
  (ไม่ต้อง fetch ทุกหุ้นย้อนหลังครั้งเดียว → กัน Yahoo rate-limit 429)
- data ค่อยๆ สะสม → Breadth History graph เริ่มมีเส้นทีละจุด และ robust กันหาย

⚠️ cron ของ Hermes ส่ง "script" ได้แค่ path เดียว — ส่ง argument ไม่ได้
   (job schema ไม่มี script_args) → ตัวเลือก market อ่านจาก env BREADTH_MARKET ก่อน แล้วค่อย argv
   job US ใช้ wrapper `breadth_collector_us.py` (set env + เรียกไฟล์นี้)
   [บั๊กที่เจอ 8 ต.ค.: job US ไม่มีทางส่ง "america" ได้ → เก็บไทยซ้ำทุกเช้า, US ไม่เคยเก็บเลย]

⚠️ วันที่ที่บันทึก = วันที่ของ "ตลาดนั้น" ไม่ใช่วันที่เครื่อง
   job US รัน 06:45 น. ไทย = วันที่ไทยเป็นวันถัดไปแล้ว → ต้องใช้ date ของ US/Eastern

DB: THUSHOUSE/rsdash/breadth_history.db  (table breadth)
ความถี่: cron หลังตลาดไทยปิด (17:45) + หลังอเมริกาปิด (~06:45)
"""
import subprocess, json, os, sqlite3, sys, datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# ⚠️ DB ต้องเป็นไฟล์เดียวกับที่โปรเจกต์ใช้ (เดิมเขียนลง <hermes>/THUSHOUSE/... = คนละไฟล์, โฟลเดอร์ถูกสร้างใหม่)
DB_PATH = "C:/Users/Tar/OneDrive/เดสก์ท็อป/THUSHOUSE/rsdash/breadth_history.db"
MK = {"thailand": "ไทย 🇹🇭", "america": "อเมริกา (US) 🇺🇸"}
TZ_LOCAL = datetime.timezone(datetime.timedelta(hours=7))


def market_date(market):
    """วันที่ของตลาดนั้น — US ใช้เขตเวลา New York (job รัน 06:45 น. ไทย = วันที่ไทยล่วงหน้าไปแล้ว 1 วัน)"""
    if market == "america":
        try:
            from zoneinfo import ZoneInfo
            return datetime.datetime.now(ZoneInfo("America/New_York")).date().isoformat()
        except Exception:
            # fallback: UTC-4 (EDT) พอ — ผิดแค่ชั่วโมงขอบวัน
            return (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=4)).date().isoformat()
    return datetime.datetime.now(TZ_LOCAL).date().isoformat()


def write_key():
    """คีย์เขียน /api/breadth: env BREADTH_WRITE_KEY ก่อน ไม่มีก็อ่านจากไฟล์ secrets (อยู่นอก git/โปรเจกต์ ห้ามฝังในโค้ด)"""
    k = (os.environ.get("BREADTH_WRITE_KEY") or "").strip()
    if k:
        return k
    p = os.path.join(os.path.dirname(SCRIPT_DIR), "secrets", "breadth_write_key.txt")
    try:
        return open(p, encoding="utf-8").read().strip()
    except Exception:
        return ""


def get_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""CREATE TABLE IF NOT EXISTS breadth (
        market TEXT, date TEXT, up INT, down INT, total INT, up_pct REAL,
        above_ma50 INT, above_ma200 INT, pct_above_ma50 REAL, pct_above_ma200 REAL,
        created_at TEXT, PRIMARY KEY (market, date))""")
    return conn

def collect(market):
    url = f"https://rsdashclean.vercel.app/api/scan?market={market}&force=1"
    raw = ""
    res = None
    for attempt in range(1, 4):
        try:
            res = subprocess.run(["curl", "-s", "-m", "180", "-o", "-", url],
                                 capture_output=True, text=True, timeout=200)
            raw = (res.stdout or "").strip()
        except Exception:
            raw = ""
            res = None
        if raw:
            break
        # ⚠️ แยก "เน็ตล่ม" ออกจาก "ข้อมูลเสีย" ให้ชัด — เดิมรายงานว่า "ข้อมูลเสีย" ทั้งที่ DNS ล่ม (8 ต.ค.)
        rc = getattr(res, "returncode", None)
        print(f"… {MK[market]} ลองครั้งที่ {attempt}/3 ไม่ได้ข้อมูล (curl rc={rc}) — เน็ต/DNS อาจล่ม", flush=True)
        if attempt < 3:
            import time
            time.sleep(5 * attempt)
    if not raw:
        print(f"❌ {MK[market]} ดึงค่าตลาดไม่ได้หลังลอง 3 ครั้ง — เน็ต/DNS ล่ม (ไม่ใช่ข้อมูลเสีย)")
        return 1
    try:
        d = json.loads(raw)
    except Exception:
        print(f"❌ {MK[market]} อ่านค่าตลาดไม่ได้ (ข้อมูลเสีย) — ต้นทางตอบ: {raw[:120]!r}")
        return 1
    ms = d.get("marketSummary") or {}
    bf = ms.get("breadth_full") or {}
    if not bf or bf.get("pctAboveMA50") is None or bf.get("total", 0) == 0:
        print(f"❌ {MK[market]} ค่า Breadth ยังไม่พร้อม")
        return 1
    today = market_date(market)
    conn = get_db()
    # เทียบกับครั้งก่อน (trend)
    prev = conn.execute("SELECT date,pct_above_ma50,pct_above_ma200 FROM breadth WHERE market=? ORDER BY date DESC LIMIT 1", (market,)).fetchone()
    conn.execute("""INSERT OR REPLACE INTO breadth
        (market,date,up,down,total,up_pct,above_ma50,above_ma200,pct_above_ma50,pct_above_ma200,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (market, today, bf.get("up"), bf.get("down"), bf.get("total"), bf.get("upPct"),
         bf.get("aboveMA50"), bf.get("aboveMA200"), bf.get("pctAboveMA50"), bf.get("pctAboveMA200"),
         datetime.datetime.now().isoformat()))
    conn.commit()
    n = conn.execute("SELECT COUNT(*) FROM breadth WHERE market=? AND date<=?", (market, today)).fetchone()[0]
    conn.close()

    # --- สร้างรายงานอ่านรู้เรื่อง ---
    p50, p200 = bf.get("pctAboveMA50"), bf.get("pctAboveMA200")
    a50, a200, tot = bf.get("aboveMA50"), bf.get("aboveMA200"), bf.get("total")
    lbl = MK[market]
    # สภาวะตลาด (ย่อเป็นคำสั้น เห็นภาพ)
    s50 = "◉ แรงดี" if p50>=50 else ("○ อ่อน" if p50<=35 else "△ ปานกลาง")
    s200 = "◍ ฐานยาวแข็งแรง" if p200>=70 else ("◌ ฐานยาวอ่อนแอ" if p200<=35 else "◫ ฐานยาวนิ่ง")

    # เทรนด์ vs ครั้งก่อน
    trend50, trend200 = "เทียบได้ว่าครั้งก่อน", "เทียบได้ว่าครั้งก่อน"
    if prev:
        d50 = p50 - (prev[1] or 0)
        d200 = p200 - (prev[2] or 0)
        arrow50 = "▲ ดีขึ้น" if d50>0.5 else ("▼ แย่ลง" if d50<-0.5 else "＝ คงที่")
        arrow200 = "▲ ดีขึ้น" if d200>0.5 else ("▼ แย่ลง" if d200<-0.5 else "＝ คงที่")
        trend50 = f"{arrow50} (จาก {prev[1]:.0f}%)"
        trend200 = f"{arrow200} (จาก {prev[2]:.0f}%)"
    else:
        trend50 = "เริ่มสะสมจุดแรก"
        trend200 = "เริ่มสะสมจุดแรก"

    report = (
        f"📊 สรุป Breadth {lbl} ประจำวันที่ {today}\n"
        f"ㅤ• หุ้นเหนือ SMA50 (ระยะสั้น): {p50}% ({a50}/{tot} ตัว) — {s50} {trend50}\n"
        f"ㅤ• หุ้นเหนือ SMA200 (ระยะยาว): {p200}% ({a200}/{tot} ตัว) — {s200} {trend200}\n"
        f"ㅤ• อัปเดตครบไปแล้ว: {n} จุดสะสม (กราฟย้อนหลัง 1 ปี ต่อเนื่อง)\n"
        f"✅ เก็บเรียบร้อย สีตามสภาวะตลาด (เขียว=แรง, ส้ม=ปานกลาง, แดง=อ่อน)"
    )
    print(report)

    # push ขึ้น Supabase (เว็บอ่านได้)
    import urllib.request
    rec = {"market": market, "date": today, "up": bf.get("up"), "down": bf.get("down"),
           "total": bf.get("total"), "up_pct": bf.get("upPct"),
           "pct_above_ma50": p50, "pct_above_ma200": p200,
           "above_ma50": a50, "above_ma200": a200,
           "created_at": datetime.datetime.now().isoformat()}
    headers = {"Content-Type": "application/json"}
    wkey = write_key()
    if wkey:
        headers["x-write-key"] = wkey   # เว็บตั้ง BREADTH_WRITE_KEY ไว้ → ต้องส่ง header นี้ ไม่งั้น 401
    req = urllib.request.Request("https://rsdashclean.vercel.app/api/breadth",
        data=json.dumps(rec).encode(), headers=headers, method="POST")
    try:
        resp = urllib.request.urlopen(req, timeout=60)
        print(f"ㅤ↑ บันทึกขึ้นเว็บสำเร็จ (HTTP {resp.status})")
    except Exception as e:
        print(f"ㅤ⚠️ บันทึกขึ้นเว็บล้ม (เก็บในเครื่องแล้ว): {e}")
    return 0


if __name__ == "__main__":
    m = (os.environ.get("BREADTH_MARKET") or (sys.argv[1] if len(sys.argv) > 1 else "thailand")).strip().lower()
    if m not in MK:
        print(f"❌ market ไม่รู้จัก: {m!r} (ใช้ thailand|america)")
        sys.exit(2)
    sys.exit(collect(m))