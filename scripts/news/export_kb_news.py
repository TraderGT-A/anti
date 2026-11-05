#!/usr/bin/env python3
"""ดึงข่าวหุ้นไทยจาก Obsidian KB (Stocks_TH/*.md → ## Feed) ไปเป็นไฟล์ข่าวของเว็บ
  เอาต์พุต: rsdash/news_th.json  { "KCE": {updated_at, headlines:[{date,source,title,url}]} }
ใช้: python scripts/news/export_kb_news.py [--days 21] [--max 6]
"""
import argparse
import json
import os
import re
from datetime import date, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
KB = os.path.join(ROOT, "Stocks_TH")
OUT = os.path.join(ROOT, "rsdash", "news_th.json")

# - [แหล่ง] หัวข่าว ([ลิงก์](url))
BULLET = re.compile(r"^-\s*\[(?P<src>[^\]]+)\]\s*(?P<title>.*?)\s*\(\[ลิงก์\]\((?P<url>https?://[^)\s]+)\)\)\s*$")
DATE_H = re.compile(r"^###\s*(\d{4}-\d{2}-\d{2})\s*$")


def parse(md, days, maxn):
    tk = None
    m = re.search(r"^ticker:\s*([A-Z0-9.\-]+)", md, re.M)
    if m:
        tk = m.group(1)
    if not tk:
        return None
    cut = (date.today() - timedelta(days=days)).isoformat()
    cur = None
    heads = []
    for line in md.splitlines():
        dm = DATE_H.match(line.strip())
        if dm:
            cur = dm.group(1)
            continue
        bm = BULLET.match(line.strip())
        if bm and cur and cur >= cut:
            heads.append({
                "date": cur,
                "source": bm.group("src").strip()[:28],
                "title": bm.group("title").strip()[:180],
                "url": bm.group("url"),
            })
    if not heads:
        return None
    heads.sort(key=lambda x: x["date"], reverse=True)
    heads = heads[:maxn]
    return tk, {"updated_at": heads[0]["date"], "headlines": heads}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=21)
    ap.add_argument("--max", type=int, default=6)
    a = ap.parse_args()
    if not os.path.isdir(KB):
        raise SystemExit(f"ไม่พบโฟลเดอร์ {KB}")
    out = {}
    n = 0
    for fn in sorted(os.listdir(KB)):
        if not fn.endswith(".md"):
            continue
        with open(os.path.join(KB, fn), encoding="utf-8", errors="replace") as fh:
            r = parse(fh.read(), a.days, a.max)
        if r:
            out[r[0]] = r[1]
            n += 1
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"เขียน {OUT}: {n} หุ้น · {os.path.getsize(OUT)/1024:.0f}KB")


if __name__ == "__main__":
    main()
