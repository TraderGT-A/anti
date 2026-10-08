#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""ดึง S&P 500 (503 ตัว) ราคารายวัน 5 ปี ผ่าน /api/chart ของเรา (resume-friendly). [--- US study ---]"""
import re, json, os, sys, time, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
RS = os.path.join(HERE, "..", "research", "three-matrices")
OUT = os.path.join(RS, "data", "daily_us.json")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
BASE = "https://rsdashclean.vercel.app"


def get(u, t=90):
    return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=t).read().decode("utf-8", "replace"))


def main():
    store = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
    h = open(os.path.join(HERE, "index.html"), encoding="utf-8").read()
    m = re.search(r'US_INDEXES=\{\"sp500\":\s*(\[[^\]]+\])', h)
    syms = re.findall(r'\"([A-Z0-9.]+)\"', m.group(1))
    print("S&P500:", len(syms), "| have", len(store), flush=True)
    got = fails = 0
    for i, tk in enumerate(syms, 1):
        if tk in store and store[tk].get("dates"):
            continue
        u = BASE + "/api/chart?market=america&symbol=" + urllib.parse.quote(tk) + "&interval=1d&range=5y"
        bars = None
        for a in range(3):
            try:
                bars = (get(u).get("data") or [])
                break
            except Exception:
                time.sleep(1 + a)
        if bars and len(bars) >= 30:
            store[tk] = {"name": tk, "industry": "US",
                         "dates": [b["time"] for b in bars], "close": [b["close"] for b in bars],
                         "volume": [b["volume"] for b in bars]}
            got += 1
        else:
            fails += 1
        time.sleep(0.14)
        if i % 60 == 0:
            json.dump(store, open(OUT, "w", encoding="utf-8"))
            print("  %d/%d got=%d fails=%d" % (i, len(syms), got, fails), flush=True)
    json.dump(store, open(OUT, "w", encoding="utf-8"))
    print("DONE: symbols=%d got=%d fails=%d" % (len(store), got, fails))
    sys.exit(0 if fails < len(syms) // 2 else 1)


if __name__ == "__main__":
    main()