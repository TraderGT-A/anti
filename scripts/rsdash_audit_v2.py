#!/usr/bin/env python3
"""ตรวจความสอดคล้องทั้งเว็บ rsdashclean (v2 — ไม่ต้องใช้เบราว์เซอร์)
ใช้: python scripts/rsdash_audit_v2.py

ตรวจ: index.html ตรงเครื่อง · ไฟล์แบรนด์ · อันดับไม่ซ้ำ+เรียงตรงกับ RS ทั้ง 3 ฐาน × 2 ชุด ·
      สองชุดต้องไม่เหมือนกัน · ΔRank ต้องมีคู่กับอันดับฐานเดียวกัน · Buy/Wait เทียบไฟล์ · breadth/heatmap
"""
import json
import os
import sys
import urllib.request
from collections import Counter

W = "https://rsdashclean.vercel.app"
SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "rsdash")
UA = {"User-Agent": "rsdash-audit/2.0"}
BASES = [("3m", "rs3", "rT3"), ("6m", "rs6", "rT6"), ("1y", "rs1", "rT1")]


def get(path, timeout=300):
    return urllib.request.urlopen(urllib.request.Request(W + path, headers=UA), timeout=timeout)


def gj(path, timeout=300):
    return json.loads(get(path, timeout).read())


def main():
    bad, warn = [], []

    try:
        local = open(os.path.join(SRC, "index.html"), "rb").read()
        if get("/index.html", 120).read() != local:
            bad.append("index.html บนเว็บไม่ตรงกับในเครื่อง")
    except Exception as e:
        bad.append(f"อ่าน index.html ไม่ได้: {e}")

    for u in ("/brand/thus-logo-white.png", "/brand/thus-logo-color.png", "/brand/thus-symbol-white.png"):
        try:
            if get(u, 60).status != 200:
                bad.append(f"{u} ไม่ตอบ 200")
        except Exception as e:
            bad.append(f"{u} โหลดไม่ได้: {e}")

    for mk in ("thailand", "america"):
        filt = gj(f"/api/scan?market={mk}&force=1")["data"]
        allm = gj(f"/api/scan?market={mk}&universe=all&v=2&force=1")["data"]
        fby = {x["ticker"]: x for x in filt}
        aby = {x["ticker"]: x for x in allm}

        for base, rf, rtf in BASES:
            for label, rows in (("ชุดกรอง", filt), ("ทั้งตลาด", allm)):
                ranks = [x.get(rtf) for x in rows if x.get(rtf) is not None]
                if not ranks:
                    bad.append(f"{mk}/{base}/{label}: ไม่มีค่า {rtf}")
                    continue
                dup = [k for k, v in Counter(ranks).items() if v > 1]
                if dup:
                    bad.append(f"{mk}/{base}/{label}: อันดับซ้ำ {len(dup)} ค่า เช่น {dup[:3]}")
                pairs = [(x[rf], x[rtf]) for x in rows if x.get(rf) is not None and x.get(rtf) is not None]
                pairs.sort(key=lambda t: -t[0])
                inv = sum(1 for a, b in zip(pairs, pairs[1:]) if b[0] < a[0] and b[1] <= a[1])
                if inv:
                    bad.append(f"{mk}/{base}/{label}: RS กับอันดับสวนกัน {inv} จุด")

            common = [t for t in fby if t in aby and fby[t].get(rtf) is not None and aby[t].get(rtf) is not None]
            same = sum(1 for t in common if fby[t][rtf] == aby[t][rtf])
            if common and same / len(common) > 0.95:
                bad.append(f"{mk}/{base}: อันดับชุดกรองกับทั้งตลาดเหมือนกัน {same}/{len(common)} (ไม่ได้แยกชุด)")

        with_delta = [x for x in filt if x.get("rD3") is not None]
        if with_delta:
            inc = [x["ticker"] for x in with_delta[:50] if x.get("rT3") is None]
            if inc:
                bad.append(f"{mk}: มี rD3 แต่ไม่มี rT3 {len(inc)} ตัว")

        rh = gj(f"/rshist_{'th' if mk == 'thailand' else 'us'}.json", 400)
        for sb, rf in (("sig3", "rs3"), ("sig1", "rs1"), ("sig6", "rs6")):
            file_buy = {t for t, v in rh.get(sb, {}).items() if v and v[0] == 2}
            thin = [t for t in file_buy if (rh.get("liq", {}).get(t) or 0) < (rh.get("liqMin") or 0)]
            if thin:
                warn.append(f"{mk}/{sb}: Buy สภาพคล่องต่ำกว่าเกณฑ์ {len(thin)} ตัว (ค้างสถานะตามกฎ)")

    mb = gj("/api/market-breadth")
    for m in mb.get("markets", []):
        if not m.get("total"):
            bad.append(f"{m.get('market')}: breadth ไม่มีจำนวนหุ้น")

    for mk in ("thailand", "america"):
        try:
            hm = gj(f"/api/heatmap?market={mk}")
            if not (hm.get("count") or hm.get("data")):
                bad.append(f"heatmap {mk}: ว่าง")
        except Exception as e:
            bad.append(f"heatmap {mk}: {e}")

    print("=== ผลตรวจ ===")
    print(("ไม่ผ่าน %d ข้อ:" % len(bad)) if bad else "ผ่านทุกข้อ")
    for b in bad:
        print(" -", b)
    if warn:
        print("คำเตือน %d ข้อ:" % len(warn))
        for w in warn:
            print(" ~", w)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
