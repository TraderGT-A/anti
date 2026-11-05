#!/usr/bin/env python3
"""ย่อ rshist ให้เว็บโหลดไว + ให้ serverless bundle เล็กลง
  อินพุต : rsdash/rshist_<th|us>.json  (ข้อมูลเต็ม)
  เอาต์พุต:
    1) rsdash/rshist_<mk>_lite.json   → เว็บใช้ (เก็บ 60 แท่งล่าสุดพอสำหรับ streak/ΔRank)
    2) rsdash/api/_lib/rshist_<mk>_data.js → ฝั่งเซิร์ฟเวอร์ใช้แค่ค่าล่าสุด (bundle เล็กลงมาก)
ใช้: python scripts/flow/make_rshist_lite.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RS = os.path.join(ROOT, "rsdash")
KEEP = 60
SERIES = ["rs", "rs3", "rs6", "rs1"]


def build(mk):
    src = os.path.join(RS, f"rshist_{mk}.json")
    if not os.path.exists(src):
        print(f"ข้าม {mk}: ไม่พบ {src}")
        return
    j = json.load(open(src, encoding="utf-8"))
    dates = j.get("dates") or []
    n = len(dates)
    keep_from = max(0, n - KEEP)

    lite = {
        "generatedAt": j.get("generatedAt"),
        "mk": j.get("mk", mk),
        "dates": dates[keep_from:],
        "sigAsOf": j.get("sigAsOf"),
        "universe": j.get("universe"),
        "shown": j.get("shown"),
        "liqMin": j.get("liqMin"),
    }
    for k in SERIES:
        lite[k] = {tk: (arr[keep_from:] if isinstance(arr, list) else arr) for tk, arr in (j.get(k) or {}).items()}
    for k in ("rk3", "rk6", "rk1", "sc3", "sc6", "sc1", "sig", "sig3", "sig6", "sig1", "bh", "bh3", "bh6", "bh1", "liq", "sigDate", "check"):
        if k in j:
            lite[k] = j[k]

    p_lite = os.path.join(RS, f"rshist_{mk}_lite.json")
    json.dump(lite, open(p_lite, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

    srv = {
        "generatedAt": j.get("generatedAt"),
        "mk": j.get("mk", mk),
        "sigAsOf": j.get("sigAsOf"),
        "universe": j.get("universe", 0),
    }
    for k in SERIES:
        srv[k] = {tk: [arr[-1]] for tk, arr in (j.get(k) or {}).items() if isinstance(arr, list) and arr}
    for k in ("rk3", "rk6", "rk1", "sc3", "sc6", "sc1", "sig", "sig3", "sig6", "sig1", "bh", "bh3", "bh6", "bh1"):
        if k in j:
            srv[k] = j[k]

    p_srv = os.path.join(RS, "api", "_lib", f"rshist_{mk}_data.js")
    with open(p_srv, "w", encoding="utf-8") as fh:
        fh.write(f"// สร้างอัตโนมัติจาก rshist_{mk}.json (make_rshist_lite.py) — ห้ามแก้มือ\n")
        fh.write("export default " + json.dumps(srv, ensure_ascii=False, separators=(",", ":")) + ";\n")

    print(f"{mk}: เต็ม {os.path.getsize(src)/1048576:.2f}MB → lite {os.path.getsize(p_lite)/1048576:.2f}MB · server {os.path.getsize(p_srv)/1048576:.2f}MB (เก็บ {len(lite['dates'])} แท่ง)")


for mk in ("th", "us"):
    build(mk)
print("เสร็จ")
