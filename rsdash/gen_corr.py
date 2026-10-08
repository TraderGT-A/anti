#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
A2: สร้าง corr_th.json — คู่หุ้นที่ "วิ่งพร้อมกัน" (corr 126 วันทำการ > 0.70, arccos distance ตามเปเปอร์)
จาก daily_th.json. เว็บอ่านเป็น /corr_th.json → ใส่คำเตือน "วิ่งคู่กับ X" ในป็อปอัป + เตือนกระจุกตัว
"""
import json, os
import numpy as np, pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "research", "three-matrices", "data", "daily_th.json")
OUT = os.path.join(HERE, "corr_th.json")
LOOKBACK, TH = 126, 0.70

store = json.load(open(DATA, encoding="utf-8"))
ret = {}
for tk, v in store.items():
    if len(v["close"]) < LOOKBACK + 20:
        continue
    s = pd.Series(v["close"], index=pd.to_datetime(v["dates"]), dtype="float64")
    ret[tk] = s.pct_change()
R = pd.DataFrame(ret).tail(LOOKBACK)
C = R.corr()
pairs, by = [], {}
syms = list(C.columns)
for i in range(len(syms)):
    for j in range(i + 1, len(syms)):
        c = C.iat[i, j]
        if pd.notna(c) and c > TH:
            a, b = syms[i], syms[j]
            pairs.append([a, b, round(float(c), 3)])
            best_a, best_b = by.get(a), by.get(b)
            if best_a is None or c > best_a[1]:
                by[a] = [b, round(float(c), 3)]
            if best_b is None or c > best_b[1]:
                by[b] = [a, round(float(c), 3)]
pairs.sort(key=lambda x: -x[2])
payload = {"generated": "th", "window_days": LOOKBACK, "thr": TH,
           "pairs": pairs, "best": {k: v for k, v in by.items()}}
json.dump(payload, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
print("เขียน", OUT, "| คู่ corr>%.2f:" % TH, len(pairs))
for a, b, c in pairs:
    print("   %s-%s %.3f" % (a, b, c))