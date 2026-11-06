#!/usr/bin/env python
"""คำนวณสัญญาณ Buy / Wait / Sell ใหม่หลังตลาดปิด แล้วเก็บ snapshot ไว้เทียบวันถัดไป

ใช้ข้อมูลจาก /api/scan (TradingView) ซึ่งเป็นแท่งปิดล่าสุด:
  Sell = SMA50 <= SMA200 หรือ ราคาปิด <= SMA150
  Buy  = ไม่ใช่ Sell + 3M > 0 + RS > 60 + ปิด < เส้นสั้น (EMA20 จาก TradingView)
         + ปิด > เปิดวันนี้ + ปริมาณมากกว่าค่าเฉลี่ย
  Wait = ที่เหลือ

ผลลัพธ์: rsdash/signals_<th|us>.json
  { asOf, counts:{buy,wait,sell}, buy:[tickers], sell:[tickers], prev:{...}, diff:{...} }

Usage: python scripts/flow/precompute_signals.py --market th|us|both
"""
import argparse, json, os, urllib.request
from datetime import datetime

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BASE = "https://rsdashclean.vercel.app"


def num(v):
    return v if isinstance(v, (int, float)) else None


def label(r):
    p, s50, s150, s200 = num(r.get("price")), num(r.get("sma50")), num(r.get("sma150")), num(r.get("sma200"))
    if not p:
        return "wait"
    if (s50 and s200 and s50 <= s200) or (s150 and p <= s150):
        return "sell"
    p3, rs, ema, o = num(r.get("p3m")), num(r.get("rs")), num(r.get("ema20")), num(r.get("o"))
    vol, avg = num(r.get("volume")), num(r.get("avgVol"))
    if (p3 is not None and p3 > 0 and rs is not None and rs > 60 and ema and p < ema
            and o is not None and p > o and vol and avg and vol > avg):
        return "buy"
    return "wait"


def run(mk_tag):
    mk = "thailand" if mk_tag == "th" else "america"
    url = f"{BASE}/api/scan?market={mk}" + ("" if mk_tag == "th" else "&universe=all")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Cache-Control": "no-cache"})
    rows = (json.loads(urllib.request.urlopen(req, timeout=120).read()) or {}).get("data") or []
    if not rows:
        print(f"⚠️ ดึงข้อมูลตลาด {mk_tag} ไม่ได้")
        return None

    buckets = {"buy": [], "wait": [], "sell": []}
    for r in rows:
        buckets[label(r)].append(r.get("ticker"))

    out_path = os.path.join(ROOT, "rsdash", f"signals_{mk_tag}.json")
    prev = {}
    try:
        prev = json.load(open(out_path, encoding="utf-8"))
    except Exception:
        prev = {}

    prev_buy = set(prev.get("buy") or [])
    prev_sell = set(prev.get("sell") or [])
    buy, sell = set(buckets["buy"]), set(buckets["sell"])

    payload = {
        "asOf": datetime.now().strftime("%Y-%m-%d"),
        "market": mk_tag,
        "counts": {k: len(v) for k, v in buckets.items()},
        "buy": sorted(buy),
        "sell": sorted(sell),
        "prevAsOf": prev.get("asOf"),
        "prevCounts": prev.get("counts"),
        "diff": {
            "buyIn": sorted(buy - prev_buy),
            "buyOut": sorted(prev_buy - buy),
            "sellIn": sorted(sell - prev_sell),
            "sellOut": sorted(prev_sell - sell),
        } if prev else None,
    }
    json.dump(payload, open(out_path, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"{mk_tag}: buy {payload['counts']['buy']} · wait {payload['counts']['wait']} · sell {payload['counts']['sell']}"
          + (f" | เข้า Buy ใหม่ {len(payload['diff']['buyIn'])} · ออก {len(payload['diff']['buyOut'])}" if payload["diff"] else " (ไม่มีข้อมูลเดิมเทียบ)"))
    return payload


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--market", default="both", choices=["th", "us", "both"])
    a = ap.parse_args()
    tags = ["th", "us"] if a.market == "both" else [a.market]
    for t in tags:
        run(t)


if __name__ == "__main__":
    main()
