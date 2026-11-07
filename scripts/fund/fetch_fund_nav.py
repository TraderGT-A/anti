#!/usr/bin/env python
"""ดึง NAV รายวันของกองทุนรวมไทยจาก WealthX (API สาธารณะของหน้าเว็บ)

- อ่านรายชื่อกองจาก rsdash/index_proxy.json (เฉพาะหมวด th)
- หา fundId จากหน้า /funds/<code> แล้วเรียก /api/funds/<id>/navs/Y3
- เขียน rsdash/fund_nav.json: { code: {id, name, navs:[[date,nav]], ret:{1M,3M,6M,1Y,YTD}, aum} }

Usage: python scripts/fund/fetch_fund_nav.py [--only CODE,CODE]
"""
import argparse, json, os, re, sys, urllib.parse, urllib.request
from datetime import datetime, timedelta

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "rsdash", "index_proxy.json")
OUT = os.path.join(ROOT, "rsdash", "fund_nav.json")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}


def get(url, timeout=30):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def fund_id(code):
    try:
        html = get("https://www.wealthx.co/funds/" + urllib.parse.quote(code))
    except Exception as e:
        print("   เปิดหน้าไม่ได้:", e, flush=True)
        return None
    ids = re.findall(r'fundId[^0-9a-f]{0,12}([0-9a-f]{24})', html)
    return ids[0] if ids else None


def navs(fid, rng="Y3"):
    j = json.loads(get(f"https://www.wealthx.co/api/funds/{fid}/navs/{rng}"))
    n = (j.get("fund") or {}).get("navs") or []
    out = []
    for x in n:
        try:
            out.append([x["at"][:10], float(x["nav"])])
        except Exception:
            pass
    return out


def ret(series, days):
    if len(series) < 2:
        return None
    last = series[-1]
    end = datetime.fromisoformat(last[0])
    target = (end - timedelta(days=days)).isoformat()[:10]
    base = None
    for d, v in series:
        if d >= target:
            base = v
            break
    if not base:
        return None
    return round((last[1] / base - 1) * 100, 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    data = json.load(open(SRC, encoding="utf-8"))
    codes = []
    for k, v in data.items():
        if not isinstance(v, dict):
            continue
        for x in v.get("th", []):
            if x.get("t") and x["t"] not in codes:
                codes.append(x["t"])
    only = {x.strip() for x in a.only.split(",") if x.strip()}
    if only:
        codes = [c for c in codes if c in only]

    prev = {}
    if os.path.exists(OUT):
        try:
            prev = json.load(open(OUT, encoding="utf-8"))
        except Exception:
            prev = {}

    result = {}
    for c in codes:
        print("•", c, flush=True)
        fid = fund_id(c)
        if not fid:
            print("   หา fundId ไม่ได้ — ข้าม", flush=True)
            if c in prev:
                result[c] = prev[c]
            continue
        try:
            s = navs(fid)
        except Exception as e:
            print("   ดึง NAV ไม่ได้:", e, flush=True)
            if c in prev:
                result[c] = prev[c]
            continue
        if not s:
            print("   ไม่มีข้อมูล NAV", flush=True)
            continue
        y = str(datetime.now().year)
        ytd_base = next((v for d, v in s if d[:4] == y), None)
        item = {
            "id": fid,
            "navs": s,
            "last": {"date": s[-1][0], "nav": s[-1][1]},
            "ret": {
                "1M": ret(s, 30), "3M": ret(s, 91), "6M": ret(s, 182),
                "1Y": ret(s, 365),
                "YTD": round((s[-1][1] / ytd_base - 1) * 100, 2) if ytd_base else None,
            },
        }
        result[c] = item
        print("   NAV", s[-1], "1Y", item["ret"]["1Y"], flush=True)

    json.dump(result, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    print("เขียน", OUT, len(result), "กอง")


if __name__ == "__main__":
    main()
