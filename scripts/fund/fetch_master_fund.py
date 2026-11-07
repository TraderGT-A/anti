#!/usr/bin/env python3
"""ดึง 'กองทุนหลัก' (master fund) ของกอง feeder ไทยจากหน้าผลิตภัณฑ์ Finnomena

ใช้: python scripts/fund/fetch_master_fund.py
ผลลัพธ์: rsdash/fund_master.json  {code: {master, ticker, text, src}}
"""
import json
import os
import re
import urllib.request

REPO = r"C:/Users/Tar/OneDrive/เดสก์ท็อป/THUSHOUSE"
SRC = os.path.join(REPO, "rsdash")
OUT = os.path.join(SRC, "fund_master.json")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

# ETF ที่พบบ่อยในกองไทย → ตัวย่อ
TICKERS = [
    ("iShares Core S&P 500", "IVV"), ("SPDR S&P 500", "SPY"), ("Vanguard S&P 500", "VOO"),
    ("iShares S&P 500", "IVV"), ("Invesco QQQ", "QQQ"), ("Invesco NASDAQ 100", "QQQM"),
    ("iShares NASDAQ 100", "QQQ"), ("Vanguard Total Stock", "VTI"), ("SPDR Dow Jones", "DIA"),
    ("iShares Russell 2000", "IWM"), ("Vanguard Russell 2000", "VTWO"), ("iShares MSCI", ""),
    ("SPDR Gold", "GLD"), ("iShares Gold", "IAU"),
]


def codes():
    out = []
    p = os.path.join(SRC, "index_proxy.json")
    if os.path.exists(p):
        d = json.load(open(p, encoding="utf-8"))
        for k, v in d.items():
            if isinstance(v, dict):
                for x in v.get("th", []):
                    if x.get("t"):
                        out.append(x["t"])
    p2 = os.path.join(SRC, "fund_nav.json")
    if os.path.exists(p2):
        out += list(json.load(open(p2, encoding="utf-8")).keys())
    seen, res = set(), []
    for c in out:
        if c not in seen:
            seen.add(c)
            res.append(c)
    return res


def fetch(code):
    u = "https://www.finnomena.com/fund/" + urllib.parse.quote(code)
    req = urllib.request.Request(u, headers=UA)
    return urllib.request.urlopen(req, timeout=45).read().decode("utf-8", "ignore")


def extract(html):
    txt = re.sub(r"<[^>]+>", " ", html)
    txt = txt.replace("&amp;", "&").replace("&nbsp;", " ")
    txt = re.sub(r"\s+", " ", txt)
    m = re.search(r"(?:กองทุนหลัก|ลงทุนในกองทุนต่างประเทศ[^.]{0,80}คือ)\s*(.{0,160})", txt)
    seg = m.group(1) if m else ""
    name = ""
    for cand in re.findall(r"([A-Z][A-Za-z0-9&\-\. ]{3,60}?(?:ETF|Fund|Index Fund))", seg or txt[:4000]):
        name = cand.strip(" ,.")
        break
    if not name:
        m2 = re.search(r"คือ\s*([^()]{4,70})\((?:กองทุนหลัก)\)", txt)
        if m2:
            name = m2.group(1).strip(" ,.")
    tk = ""
    for k, v in TICKERS:
        if name and k.lower() in name.lower():
            tk = v
            break
    return name, tk, seg[:220]


def main():
    old = {}
    if os.path.exists(OUT):
        try:
            old = json.load(open(OUT, encoding="utf-8"))
        except Exception:
            old = {}
    items = old.get("items", {}) if isinstance(old, dict) else {}
    for c in codes():
        try:
            h = fetch(c)
            name, tk, seg = extract(h)
            if name:
                items[c] = {"master": name, "ticker": tk, "text": seg, "src": "finnomena"}
                print(f"{c:16s} → {name} {('(' + tk + ')') if tk else ''}")
            else:
                print(f"{c:16s} → ไม่พบชื่อกองหลัก")
        except Exception as e:
            print(f"{c:16s} → ERROR {e}")
    json.dump({"items": items}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("เขียนแล้ว", len(items), "กอง →", OUT)


if __name__ == "__main__":
    import urllib.parse
    main()
