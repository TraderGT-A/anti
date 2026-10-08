#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""US (S&P500) vol/return chain — เดียวกับที่วัดหุ้นไทย (เลียนวิธีเปเปอร์ถูกต้องทุกจุด)
อ่าน data/daily_us.json, กับ analyze_chains(v2) methodology เหมือนกัน → out/report_us.md"""
import json, os, math, sys
import numpy as np, pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
RS = os.path.join(HERE, "..", "research", "three-matrices")
DATA = os.environ.get("US_DATA") or os.path.join(RS, "data", "daily_us.json")
OUT = os.path.join(RS, "out", "report_us.md")
K, TAU, LAP = 10, 21, 0.5
store = json.load(open(DATA, encoding="utf-8"))
print("symbols:", len(store))

# ---------- build month-end obs ----------
rows = []
for tk, v in store.items():
    if len(v["dates"]) < 250:
        continue
    s = pd.Series(v["close"], index=pd.to_datetime(v["dates"]), dtype="float64")
    r = s.pct_change()
    last = pd.DataFrame({"close": s, "rstat": r.rolling(TAU).mean(), "vstat": r.rolling(TAU).std(),
                         "per": s.index.to_period("M")}).groupby("per").tail(1).dropna()
    last = last.reset_index(names="date")
    last["tk"] = tk
    rows.append(last)
d = pd.concat(rows, ignore_index=True)
d["fwd"] = d.groupby("tk")["close"].shift(-1) / d["close"] - 1
d["mkt"] = d.groupby("per")["fwd"].transform("mean")
d["dR"] = np.minimum(K, np.floor((d.groupby("per")["rstat"].rank(ascending=False, method="first") - 1) * K /
                                 d.groupby("per")["rstat"].transform("count")).astype(int) + 1)
d["dV"] = np.minimum(K, np.floor((d.groupby("per")["vstat"].rank(ascending=True, method="first") - 1) * K /
                                 d.groupby("per")["vstat"].transform("count")).astype(int) + 1)
d["ord"] = d["per"].astype("period[M]").astype(int)
d = d.sort_values(["tk", "ord"]).reset_index(drop=True)

tr_rows = []
for tk, g in d.groupby("tk"):
    g = g.reset_index(drop=True)
    for i in range(len(g) - 1):
        if g.loc[i + 1, "ord"] - g.loc[i, "ord"] != 1:
            continue
        tr_rows.append({"per": g.loc[i, "per"], "dR": g.loc[i, "dR"], "dV": g.loc[i, "dV"],
                        "bR": g.loc[i + 1, "dR"], "bV": g.loc[i + 1, "dV"],
                        "fwd": g.loc[i, "fwd"], "mkt": g.loc[i, "mkt"]})
t = pd.DataFrame(tr_rows)
t = t.sort_values("per").reset_index(drop=True)
target = int(len(t) * 0.7)
cm = t.groupby("per").size().cumsum()
cut_month = cm[cm >= target].index[0]
cut = int(cm.loc[cut_month])
tr, te = t.iloc[:cut], t.iloc[cut:]
print("transitions:", len(t), "train", len(tr), "test", len(te), "train_end", tr["per"].max(), "test_end", te["per"].max())


def fit(sub, a, b):
    C = np.full((K, K), LAP)
    for x, y in zip(sub[a].to_numpy(), sub[b].to_numpy()):
        C[x - 1, y - 1] += 1
    return C / C.sum(axis=1, keepdims=True)


def ll(P, sub, a, b):
    return np.array([math.log(P[x - 1, y - 1]) for x, y in zip(sub[a], sub[b])])


def gain(s_tr, s_te, a, b):
    P = fit(s_tr, a, b)
    m = np.bincount(s_tr[b].to_numpy(), minlength=K + 2)[1:K + 1] + LAP
    m = m / m.sum()
    lc = ll(P, s_te, a, b)
    lb = np.array([math.log(m[y - 1]) for y in s_te[b]])
    dd = lc - lb
    return dd.mean(), dd.mean() / (dd.std(ddof=1) / math.sqrt(len(dd))), P


def cond_gain(s_tr, s_te, a, b, col, nb):
    def fitc(sub):
        P = np.zeros((nb, K, K))
        for c in range(nb):
            Cs = np.full((K, K), LAP)
            for x, y, cc in zip(sub[a], sub[b], sub[col]):
                if cc == c:
                    Cs[x - 1, y - 1] += 1
            P[c] = Cs / Cs.sum(axis=1, keepdims=True)
        return P
    Pc, P0 = fitc(s_tr), fit(s_tr, a, b)
    ins = np.mean([math.log(Pc[cc, x - 1, y - 1]) - math.log(P0[x - 1, y - 1])
                   for x, y, cc in zip(s_tr[a], s_tr[b], s_tr[col])])
    outs = np.mean([math.log(Pc[cc, x - 1, y - 1]) - math.log(P0[x - 1, y - 1])
                    for x, y, cc in zip(s_te[a], s_te[b], s_te[col])])
    return ins, outs


t["st"] = t["mkt"].to_numpy()
q1, q2 = np.nanquantile(t["st"], [1 / 3, 2 / 3])
t["state"] = np.where(t["st"] <= q1, 0, np.where(t["st"] <= q2, 1, 2))
tr, te = t.iloc[:cut], t.iloc[cut:]

L = []
w = L.append
w("# S&P 500 — vol/return chain (เปรียบเทียบกับเปเปอร์ & ไทย)")
w("- สัญลักษณ์: %d ตัว (S&P500) | transition %d | train %s → %s | test %s → %s (ตัดขอบเดือน)"
  % (d["tk"].nunique(), len(t), tr["per"].min(), tr["per"].max(), te["per"].min(), te["per"].max()))
for lab, a, b in (("R", "dR", "bR"), ("V", "dV", "bV")):
    g, tt, P = gain(tr, te, a, b)
    C = np.full((K, K), LAP)
    for x, y in zip(t[a], t[b]):
        C[x - 1, y - 1] += 1
    C = C / C.sum()
    sig = float(np.sum(C * np.log(C / C.T)))
    ins, outs = cond_gain(tr, te, a, b, "state", 3)
    ins2, outs2 = cond_gain(tr, te, a, b, "dV" if a == "dR" else "dR", K + 1)
    w("## chain %s" % lab)
    w("- P(อยู่ decile เดิม) top/bottom: %.3f / %.3f · σ=%.4f" % (P[0, 0], P[K - 1, K - 1], sig))
    w("- OOS gain: %+.4f nats (t=%.2f)  ← %s"
      % (g, tt, "ทำนายได้" if tt > 2 else "ทำนายไม่ได้"))
    w("- covariate regime: in-sample %+.4f / OOS %+.4f" % (ins, outs))
    w("- covariate อีก chain: in-sample %+.4f / OOS %+.4f" % (ins2, outs2))

# persistence
pers = {}
for lag in (1, 2, 3):
    keep = tot = 0
    for tk, g in d.groupby("tk"):
        g = g.reset_index(drop=True)
        for i in range(len(g)):
            if g.loc[i, "dV"] != 1:
                continue
            j = i + lag
            if j >= len(g) or any(g.loc[i + k + 1, "ord"] - g.loc[i + k, "ord"] != 1 for k in range(lag)):
                continue
            tot += 1
            keep += int(g.loc[j, "dV"] == 1)
    pers[lag] = 100 * keep / tot
w("- เงียบสุดอยู่ต่อ: 1 เดือน %.1f%% · 2 เดือน %.1f%% · 3 เดือน %.1f%%" % (pers[1], pers[2], pers[3]))

# payoff
tt = t.dropna(subset=["fwd", "mkt"])
w("- ตลาด EW เดือนหน้า: %+.2f%%/เดือน" % (100 * tt["fwd"].mean()))
for lab, key in (("R", "dR"), ("V", "dV")):
    mm = []
    for m, g in tt.groupby("per"):
        s = g[g[key] == 1]
        if len(s):
            mm.append((s["fwd"] - s["mkt"]).mean())
    mm = np.array(mm)
    w("- %s decile1: %+.2f%%/เดือน (excess %+.2f%%, เดือน-level t=%.2f, n=%d)" %
      (lab, 100 * tt[tt[key] == 1]["fwd"].mean(), 100 * mm.mean(),
       mm.mean() / (mm.std(ddof=1) / math.sqrt(len(mm))), len(mm)))

# low-vol anomaly check (เปเปอร์: calm ชนะ) — V decile 1 vs decile 10
for lab, key in (("V(calm)", "dV"), ("V(volatile)", "dV")):
    dec = 1 if "calm" in lab else K
    s = tt[tt[key] == dec]
    ex = s["fwd"] - s["mkt"]
    w("- %s decile%d: mean %+.2f%% excess %+.2f%% (t=%.2f)" %
      (lab, dec, 100 * s["fwd"].mean(), 100 * ex.mean(),
       ex.mean() / (ex.std(ddof=1) / math.sqrt(len(ex)))))
# hit rate
t["q90"] = t.groupby("per")["fwd"].transform(lambda x: x.quantile(0.9))
t["q10"] = t.groupby("per")["fwd"].transform(lambda x: x.quantile(0.1))
vh, cm = t[t["dV"] == K], t[t["dV"] == 1]
w("- ผันผวนสุด → เดือนหน้า top10%%: %.1f%% / bottom10%%: %.1f%%" % (100 * (vh["fwd"] >= vh["q90"]).mean(), 100 * (vh["fwd"] <= vh["q10"]).mean()))
w("- เงียบสุด → เดือนหน้า top10%%: %.1f%% / bottom10%%: %.1f%%" % (100 * (cm["fwd"] >= cm["q90"]).mean(), 100 * (cm["fwd"] <= cm["q10"]).mean()))

open(OUT, "w", encoding="utf-8").write("\n".join(L))
print("\n".join(L))