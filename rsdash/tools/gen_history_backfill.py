#!/usr/bin/env python3
# gen_history_backfill.py — สร้าง snapshot รายวันย้อนหลัง (1 ปี) จาก OHLC ในเครื่อง
# ใช้สูตรเดียวกับ Dashboard: score = 0.4*p3m + 0.3*p6m + 0.3*p1y → จัดอันดับ percentile = rs
# ผลตอบแทนใช้จำนวน "วันเทรด": 1W=5, 1M=21, 3M=63, 6M=126, 1Y=250 (ตรวจกับ snapshot จริงแล้วตรงเป๊ะ)
# YTD = เทียบราคาปิดวันเทรดแรกของปีนั้น
# เกณฑ์เก็บแถว (เหมือนลิสต์ clean ของไทย ยกเว้น mcap ที่ย้อนหลังไม่มี): val>=5e6, price>=1, volume>=5e5
import json, os, re, sys, bisect
from datetime import datetime, timedelta

HERMES = r"C:\Users\Tar\AppData\Local\hermes"
SRC = r"C:\Users\Tar\OneDrive\เดสก์ท็อป\THUSHOUSE\rsdash"
OUTDIR = os.path.join(SRC, "hist", "th")
DAYS_BACK = 520          # จำนวนวันเทรดย้อนหลัง (~2 ปี) — พอให้ครอบคลุมสูตร 2 ปีแบบ 730 วันปฏิทิน
MIN_VALUE, MIN_PRICE, MIN_VOL = 5_000_000, 1.0, 500_000

def norm_pct(cur, base):
    if not base or base <= 0 or cur is None:
        return None
    return round((cur / base - 1.0) * 100.0, 6)

def main():
    ohlc = json.load(open(os.path.join(HERMES, "scripts", "bt_ohlcv_full.json"), encoding="utf-8"))
    print("โหลด OHLC:", len(ohlc), "หุ้น")

    # DR list (กันไว้ — OHLC อาจมีตัว DR หลงมา)
    drs = set()
    try:
        dr = json.load(open(os.path.join(HERMES, "cache", "scratch", "dr_th_real.json"), encoding="utf-8"))
        drs = {str(x).upper() for x in (dr if isinstance(dr, list) else dr.get("tickers", []))}
    except Exception:
        pass
    # DR จากรายชื่อ csv ที่สร้างไว้
    try:
        for line in open(r"C:\Users\Tar\OneDrive\เดสก์ท็อป\THUSHOUSE\DR_Thai_List_2026-10-05.csv", encoding="utf-8-sig").read().splitlines()[1:]:
            t = line.split(",")[0].strip().upper()
            if t:
                drs.add(t)
    except Exception:
        pass
    print("DR ที่ต้องตัด:", len(drs))

    # ชื่อ/sector/industry จาก scan สด (ค่าไม่เปลี่ยนบ่อย)
    meta = {}
    try:
        import urllib.request
        sc = json.loads(urllib.request.urlopen("https://rsdashclean.vercel.app/api/scan?market=thailand", timeout=180).read().decode())
        for s in sc.get("data", []):
            meta[s["ticker"]] = {"name": s.get("name"), "sector": s.get("sector"), "industry": s.get("industry")}
        print("meta จาก scan สด:", len(meta))
    except Exception as e:
        print("⚠️ scan สดไม่สำเร็จ (จะไม่ใส่ชื่อ):", e)

    # index group (SET50/SET100/mai)
    try:
        mem = json.load(open(os.path.join(HERMES, "scripts", "th_index_members.json"), encoding="utf-8"))
        s50 = {t.upper() for t in mem.get("SET50", mem.get("set50", []))}
        s100 = {t.upper() for t in mem.get("SET100", mem.get("set100", []))}
        if not s50:
            s50 = {t.upper() for t in (mem.get("set50") or [])}
        print("membership: SET50", len(s50), "SET100", len(s100))
    except Exception as e:
        s50, s100 = set(), set()
        print("⚠️ membership ไม่ได้:", e)
    def grp(t):
        return "SET50" if t in s50 else ("SET100" if t in s100 else "mai/Small")

    # ปฏิทินวันเทรด: วันที่มีหุ้นซื้อขาย >=30 ตัว และต้องไม่ใช่วันปลอม (วันหยุดที่ data ใส่บาร์ v=0 มาให้)
    from collections import Counter
    cnt = Counter()
    zerov = Counter()
    for tkr, bars in ohlc.items():
        for b in bars:
            cnt[b["t"]] += 1
            if not b.get("v"):
                zerov[b["t"]] += 1
    cal = sorted([d for d, c in cnt.items() if c >= 30 and (zerov[d] / c) < 0.5])
    dropped = [d for d, c in cnt.items() if c >= 30 and (zerov[d] / c) >= 0.5]
    print("ตัดวันปลอม (v=0 เกินครึ่ง):", len(dropped), "วัน →", sorted(dropped)[-6:])
    end = cal[-1]
    cal_use = cal[-DAYS_BACK:]
    print("วันเทรดทั้งหมด:", len(cal), "| ใช้:", cal_use[0], "→", cal_use[-1], f"({len(cal_use)} วัน)")

    # เตรียม index ต่อหุ้น (วันที่ → ตำแหน่ง) เพื่อหาค่าย้อนหลังเร็ว
    idx = {}
    dlist = {}
    for tkr, bars in ohlc.items():
        idx[tkr] = ({b["t"]: i for i, b in enumerate(bars)}, bars)
        dlist[tkr] = [b["t"] for b in bars]
    jan_first = {}
    for tkr, (im, bars) in idx.items():
        for i, b in enumerate(bars):
            y = b["t"][:4]
            if y not in jan_first:
                jan_first[(tkr, y)] = i

    def is_junk(t):
        u = t.upper()
        if u in drs: return True
        if u.endswith(".R"): return True
        if re.search(r"-W\d", u): return True
        return False

    os.makedirs(OUTDIR, exist_ok=True)
    days_meta = []
    files_written = 0
    for D in cal_use:
        t2 = (datetime.strptime(D, "%Y-%m-%d") - timedelta(days=730)).strftime("%Y-%m-%d")   # 2 ปี = 730 วันปฏิทิน (สูตรเดียวกับหน้า Top20)
        rows = []
        for tkr, (im, bars) in idx.items():
            if is_junk(tkr): continue
            i = im.get(D)
            if i is None or i < 1: continue
            c = bars[i]["c"]
            if not c or c <= 0: continue
            v = bars[i].get("v") or 0
            val = c * v
            def off(k):
                j = i - k
                return bars[j]["c"] if j >= 0 else None
            p1w, p1m, p3m, p6m, p1y = (norm_pct(c, off(k)) for k in (5, 21, 63, 126, 250))
            # 2 ปี — สูตรเดียวกับหน้า Top20 เป๊ะ: ราคาปิด ณ วันย้อนหลัง 730 วัน "ปฏิทิน" (แท่งที่ใกล้ที่สุดก่อนวันนั้น)
            j2 = bisect.bisect_right(dlist[tkr], t2) - 1
            p2y = norm_pct(c, bars[j2]["c"]) if (j2 >= 0 and (i - j2) >= 200) else None
            j0 = jan_first.get((tkr, D[:4]))
            pYTD = norm_pct(c, bars[j0]["c"]) if j0 is not None and j0 <= i else None
            score = 0.4 * (p3m or 0) + 0.3 * (p6m or 0) + 0.3 * (p1y or 0)
            hasPerf = (p3m is not None or p6m is not None or p1y is not None)
            prev = bars[i - 1]["c"] if i >= 1 else None
            rows.append({
                "ticker": tkr, "price": round(c, 4), "change": round(norm_pct(c, prev), 4) if prev else None,
                "volume": v, "val": round(val, 2), "mcap": None,
                "p1w": p1w, "p1m": p1m, "p3m": p3m, "p6m": p6m, "p1y": p1y, "p2y": p2y, "pYTD": pYTD,
                "score": round(score, 6), "hasPerf": hasPerf, "_pass": (val >= MIN_VALUE and c >= MIN_PRICE and v >= MIN_VOL),
            })
        # RS = percentile ของอันดับ score (ฐาน = ทุกหุ้นที่ผ่านการคำนวณ เหมือน raw ของ Dashboard)
        rows.sort(key=lambda r: -r["score"])
        n = len(rows)
        for i, r in enumerate(rows):
            r["rs"] = max(1, min(99, round(((n - i) / n) * 99)))
            r["rT_full"] = i + 1
        keep = []
        for r in rows:
            if not r.pop("_pass"): continue
            m = meta.get(r["ticker"], {})
            r["name"] = m.get("name") or r["ticker"]
            r["sector"] = m.get("sector") or "Other"
            r["industry"] = m.get("industry") or m.get("sector") or "Other"
            r["group"] = grp(r["ticker"])
            r["isDR"] = False
            keep.append(r)
        payload = {"date": D, "market": "thailand", "source": "ohlc_backfill", "count": len(keep),
                   "universe": n, "rows": keep}
        with open(os.path.join(OUTDIR, D + ".json"), "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        files_written += 1
        days_meta.append({"date": D, "count": len(keep), "universe": n})
        if files_written % 50 == 0:
            print("  เขียนแล้ว", files_written, "วัน ...")

    index = {"market": "thailand", "source": "ohlc_backfill", "generated_at": datetime.now().isoformat(timespec="seconds"),
             "days": days_meta, "count": len(days_meta), "first": days_meta[0]["date"], "last": days_meta[-1]["date"],
             "note": "สร้างจาก OHLC ในเครื่อง — ไม่มี mcap (ไม่มีจำนวนหุ้นย้อนหลัง) และ RS คำนวณจากฐานหุ้นในเครื่อง"}
    with open(os.path.join(OUTDIR, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))

    total = sum(os.path.getsize(os.path.join(OUTDIR, f)) for f in os.listdir(OUTDIR))
    print(f"\nเสร็จ: {files_written} วัน | ไฟล์รวม {total/1024/1024:.2f} MB | {OUTDIR}")
    print("ตัวอย่างวันแรก:", json.dumps(days_meta[0], ensure_ascii=False), "\nตัวอย่างวันท้าย:", json.dumps(days_meta[-1], ensure_ascii=False))

if __name__ == "__main__":
    main()
