#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
A1: สร้าง vol_th.json — ความผันผวนรายหุ้นไทย (21 วันทำการ, annualized) + bucket เงียบ/ปกติ/แกว่ง + ทิศ ↑/↓
ใช้ข้อมูล research/three-matrices/data/daily_th.json (ราคารายวัน 5 ปี, อัปเดตล่าสุดวันปิดตลาด)
ออกมาเป็น static file ให้เว็บอ่านเป็น /vol_th.json — เดยploy พร้อมหน้าเว็บ
"""
import json, math, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "research", "three-matrices", "data", "daily_th.json")
OUT = os.path.join(HERE, "vol_th.json")
TAU = 21
ANNUAL = math.sqrt(252)

store = json.load(open(DATA, encoding="utf-8"))
out = {}
for tk, v in store.items():
    cl = v["close"]
    if len(cl) < TAU * 2 + 2:
        continue
    def vol(end):
        w = [cl[i] / cl[i - 1] - 1 for i in range(end - TAU + 1, end + 1) if i >= 1 and cl[i - 1]]
        if len(w) < TAU // 2:
            return None
        return float(np.std(w, ddof=1)) * ANNUAL * 100
    v_now = vol(len(cl) - 1)
    v_prev = vol(len(cl) - 1 - TAU)
    if v_now is None:
        continue
    out[tk] = {"v": round(v_now, 1), "vs": round(v_prev, 1) if v_prev is not None else None,
               "name": v.get("name", ""), "industry": v.get("industry", "Other")}

# bucket แบบตัดด้วย percentile ครอสเซกชัน (เงียบ = ต่ำสุด 1/3, แกว่ง = สูงสุด 1/3)
vs = sorted(o["v"] for o in out.values())
q33, q66 = vs[len(vs)//3], vs[(2*len(vs))//3]
for tk, o in out.items():
    o["b"] = "riom" if o["v"] <= q33 else ("norm" if o["v"] <= q66 else "wild")
    o["d"] = "up" if (o["vs"] is not None and o["v"] > o["vs"] * 1.05) else ("down" if (o["vs"] is not None and o["v"] < o["vs"] * 0.95) else "flat")

payload = {"generated": "th", "window_days": TAU, "tick": out, "q": {"low": round(q33, 1), "hi": round(q66, 1)}}
json.dump(payload, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
print("เขียน", OUT, "| หุ้น:", len(out))
print("cutoff q33=%.1f%% q66=%.1f%% (annualized)" % (q33, q66))
riom = sum(1 for o in out.values() if o["b"] == "riom")
norm = sum(1 for o in out.values() if o["b"] == "norm")
wild = sum(1 for o in out.values() if o["b"] == "wild")
print("เงียบ=%d ปกติ=%d แกว่ง=%d" % (riom, norm, wild))
import collections
print("ตัวอย่างเงียบ:", [(k, o["v"]) for k, o in out.items() if o["b"] == "riom"][:6])
print("ตัวอย่างแกว่ง:", [(k, o["v"]) for k, o in out.items() if o["b"] == "wild"][:6])