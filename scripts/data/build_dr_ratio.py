#!/usr/bin/env python3
"""คำนวณอัตราแปลงหน่วย (conversion ratio) ของ DR ไทยจากข้อมูลจริง

หลักคิด: ราคา DR บาท = ราคาหุ้นแม่ USD × USDTHB × ratio × (1 + พรีเมียม)
DR ไทยปิด 16:30 (ก่อนตลาดเมกาเปิด) → ราคาวัน D สะท้อนราคาแม่ของคืนก่อนหน้า (lag 1)
จึงใช้ ratio = DR(D) / (US(D-1) × FX(D)) แล้วหาค่ากลางย้อนหลัง 3 เดือน + ปัดไปหา 1/n ที่ใกล้สุด
ผลลัพธ์ → rsdash/dr_ratio.json
"""
import json
import os
import statistics
import urllib.request

REPO = r"C:/Users/Tar/OneDrive/เดสก์ท็อป/THUSHOUSE"
OUT = os.path.join(REPO, "rsdash", "dr_ratio.json")
DRJSON = os.path.join(REPO, "rsdash", "dr_us.json")
API = "https://rsdashclean.vercel.app/api/chart"
CAND = [1, 2, 4, 5, 8, 10, 20, 25, 40, 50, 100, 200, 250, 400, 500, 800, 1000,
        2000, 2500, 4000, 5000, 7500, 8000, 10000, 20000, 25000, 50000, 100000]


def bars(sym, market, rng="6mo"):
    u = f"{API}?symbol={urllib.parse.quote(sym)}&interval=1d&range={rng}&market={market}"
    req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
    j = json.load(urllib.request.urlopen(req, timeout=90))
    return {x["time"]: x["close"] for x in (j.get("data") or []) if x.get("close")}


def main():
    dr = json.load(open(DRJSON, encoding="utf-8"))["byTicker"]
    fx = bars("THB=X", "america")
    fxk = sorted(fx)

    def fx_at(d):
        ks = [k for k in fxk if k <= d]
        return fx[max(ks)] if ks else None

    out = {}
    for parent, lst in dr.items():
        us = bars(parent, "america")
        if not us:
            continue
        usd = sorted(us)
        for z in lst:
            t = z["t"]
            try:
                th = bars(t, "thailand")
            except Exception:
                continue
            dates = sorted(set(th) & set(usd))
            rs = []
            for d in dates:
                i = usd.index(d) - 1          # lag 1 คืน
                if i < 0:
                    continue
                f = fx_at(d)
                if not f or not us[usd[i]]:
                    continue
                rs.append(th[d] / (us[usd[i]] * f))
            if len(rs) < 10:
                continue
            med = statistics.median(rs)
            sd = statistics.pstdev(rs) / med * 100
            denom = min(CAND, key=lambda n: abs((1 / n) - med) / med)
            out[t] = {
                "p": parent,
                "denom": denom,                              # 1 DR = 1/denom หุ้นแม่
                "ratio": 1 / denom,
                "fit": (med / (1 / denom) - 1) * 100,        # พรีเมียมเฉลี่ยเทียบอัตรากลม
                "sd": round(sd, 1),
                "n": len(rs),
            }
    json.dump({"updated": None, "items": out}, open(OUT, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("เขียนแล้ว", len(out), "ตัว →", OUT)
    for t, v in list(out.items())[:12]:
        print(f"{t:10s} {v['p']:6s} 1/{v['denom']:<7} mean premium {v['fit']:+.1f}% sd {v['sd']}%")


if __name__ == "__main__":
    import urllib.parse
    main()
