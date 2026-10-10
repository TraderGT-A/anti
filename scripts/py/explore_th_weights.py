"""เทียบวิธีให้น้ำหนัก Top20 ไทย (EW / inverse-vol / risk parity / HRP) + stress test
กฎล็อกใน research/PREREG_th_weighting_riskfolio_2026-10-10.md — ห้ามแก้เกณฑ์หลังเห็นผล
ใช้:  research_py/.venv/Scripts/python scripts/py/explore_th_weights.py
ต้องรัน scripts/explore_th_weights_export.mjs ก่อน"""
import json, os, sys, warnings
import numpy as np, pandas as pd
import riskfolio as rp

warnings.filterwarnings("ignore")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
HERMES = os.environ.get("HERMES_SCRIPTS", os.path.join(os.environ["LOCALAPPDATA"], "hermes", "scripts"))
D = json.load(open(os.path.join(HERMES, "em", "th_weights_export.json"), encoding="utf8"))
COST, CAP, M = D["cost"], 0.15, D["months"]
LB = int(os.environ.get("LB", 252))
SCHEMES = ["EW", "InvVol", "RiskParity", "HRP"]
fallback = {"RiskParity": 0, "HRP": 0}


def cap_weights(w, cap=CAP):
    w = np.asarray(w, float).copy()
    for _ in range(50):
        over = w > cap + 1e-12
        if not over.any():
            break
        ex = (w[over] - cap).sum(); w[over] = cap
        free = ~over; s = w[free].sum()
        if s <= 0:
            break
        w[free] += ex * w[free] / s
    return w / w.sum()


def weights(scheme, R):
    n = R.shape[1]
    if scheme == "EW":
        return np.full(n, 1 / n)
    vol = R.std().replace(0, np.nan).fillna(R.std().mean() or 1.0)
    iv = (1 / vol.values); iv = iv / iv.sum()
    if scheme == "InvVol":
        return cap_weights(iv)
    try:
        if scheme == "RiskParity":
            port = rp.Portfolio(returns=R)
            port.assets_stats(method_mu="hist", method_cov="ledoit")
            w = port.rp_optimization(model="Classic", rm="MV", hist=True, rf=0, b=None)
        else:
            hc = rp.HCPortfolio(returns=R)
            w = hc.optimization(model="HRP", codependence="pearson", obj="MinRisk", rm="MV", rf=0, linkage="single", max_k=10, leaf_order=True)
        if w is None or w.isnull().any().any():
            raise ValueError("no solution")
        return cap_weights(w.reindex(R.columns).iloc[:, 0].values)
    except Exception:
        fallback[scheme] += 1
        return cap_weights(iv)


def run(scheme, lb=LB, drop=None):
    """คืน (net returns, gross-ungated returns, turnover, maxw, effN, contrib by ticker)"""
    prev = {}; rets, gross, tos, mw, en = [], [], [], [], []; contrib = {}
    for mo in M:
        tk = [p["tk"] for p in mo["picks"]]
        R = pd.DataFrame({p["tk"]: pd.Series([np.nan if x is None else x for x in p["r"]][-lb:]) for p in mo["picks"]}).fillna(0.0)
        w = weights(scheme, R); e = mo["gate"]
        cur = {t: e * x for t, x in zip(tk, w)}
        to = sum(abs(cur.get(t, 0) - prev.get(t, 0)) for t in set(cur) | set(prev)); prev = cur
        pr = np.array([p["ret"] for p in mo["picks"]])
        keepm = np.array([0.0 if (drop and t in drop) else 1.0 for t in tk])
        g = float((w * pr * keepm).sum())
        for t, x, r_ in zip(tk, w, pr): contrib[t] = contrib.get(t, 0) + x * r_ * e
        rets.append(g * e - COST * to); gross.append(g); tos.append(to); mw.append(w.max()); en.append(1 / (w ** 2).sum())
    return np.array(rets), np.array(gross), float(np.sum(tos)) / (len(M) / 12), float(np.mean(mw)), float(np.mean(en)), contrib


dates = [m["date"] for m in M]
hold = [str(pd.Period(d[:7]) + 1) for d in dates]   # เดือนที่ถือจริง = เดือนถัดจากวันสัญญาณ
ERAS = [("2006-12", "2006-01-01", "2012-12-31"), ("2013-19", "2013-01-01", "2019-12-31"), ("2020-26", "2020-01-01", "9999")]
msk = lambda a, b: np.array([a <= d <= b for d in dates])


def stats(r):
    n = len(r); g = np.prod(1 + r); eq = np.cumprod(1 + r); dd = (eq / np.maximum.accumulate(eq) - 1).min()
    sd = r.std(ddof=1)
    return {"cagr": g ** (12 / n) - 1, "sharpe": (r.mean() / sd * np.sqrt(12)) if sd else 0.0, "mdd": dd, "worst": r.min(), "n": n}


res = {s: run(s) for s in SCHEMES}
# ตรวจว่า EW ตรงกับ explore_em_portfolio (near52+mom Top20 +Gate)
chk = os.path.join(ROOT, "data", "explore_em_portfolio_thailand_2026-10-10.json")
if os.path.exists(chk):
    ref = json.load(open(chk, encoding="utf8"))["results"].get("near52+mom Top20 +Gate")
    if ref:
        d = np.max(np.abs(np.array(ref["rets"]) - res["EW"][0])); print(f"[ตรวจ] EW vs ผลเดิม: max|diff| = {d:.2e} ({'ตรง' if d < 1e-4 else 'ไม่ตรง — ห้ามใช้ผลต่อ'})")
        if d >= 1e-4:
            sys.exit(2)
else:
    print("[ตรวจ] ไม่พบไฟล์ผลเดิมของไทย — ข้ามการตรวจ")

out = {"fallback": fallback, "lb": LB, "schemes": {}}
print(f"\nlookback={LB} วัน · cap {CAP:.0%} · ต้นทุน {COST:.2%}/ข้าง · fallback เป็น inverse-vol: {fallback}")
print(f"{'วิธี':<11}{'CAGR':>7}{'Sharpe':>7}{'MaxDD':>8}{'เดือนแย่':>8}{'TO/ปี':>6}{'maxW':>6}{'effN':>6} | " + " ".join(f"Sh {e[0]:>7}" for e in ERAS))
for s in SCHEMES:
    r, g, to, mw, en, _ = res[s]; st = stats(r); eras = {e[0]: stats(r[msk(e[1], e[2])]) for e in ERAS}
    out["schemes"][s] = {"all": st, "eras": eras, "to": to, "maxw": mw, "effn": en}
    print(f"{s:<11}{st['cagr']*100:6.1f}%{st['sharpe']:7.2f}{st['mdd']*100:7.1f}%{st['worst']*100:7.1f}%{to:6.1f}{mw:6.2f}{en:6.1f} | " + " ".join(f"{eras[e[0]]['sharpe']:11.2f}" for e in ERAS))

# bootstrap แบบจับคู่ (seed 7) + ตัดสินตามเกณฑ์ที่ล็อกไว้ (ใช้เฉพาะเมื่อ LB=252 = ค่าที่ลงทะเบียน)
rng = np.random.default_rng(7); n = len(M); idx = rng.integers(0, n, size=(5000, n)); ew = res["EW"][0]
sh = lambda x: x.mean(axis=1) / x.std(axis=1, ddof=1)
print("\nเกณฑ์ที่ลงทะเบียน (ต้องครบ 4 ข้อ ต่อวิธี):")
verdict = {}
for s in SCHEMES[1:]:
    r = res[s][0]; p = float((sh(r[idx]) - sh(ew[idx]) > 0).mean())
    c1 = out["schemes"][s]["all"]["sharpe"] >= out["schemes"]["EW"]["all"]["sharpe"] + 0.10
    c2 = all(out["schemes"][s]["eras"][e[0]]["sharpe"] >= out["schemes"]["EW"]["eras"][e[0]]["sharpe"] for e in ERAS)
    c3 = out["schemes"][s]["all"]["cagr"] >= out["schemes"]["EW"]["all"]["cagr"] - 0.01
    c4 = p >= 0.98
    verdict[s] = {"sharpe+0.10": bool(c1), "all_eras": bool(c2), "cagr-1pp": bool(c3), "bootstrapP": p, "bootstrap>=0.98": bool(c4), "PASS": bool(c1 and c2 and c3 and c4)}
    print(f"  {s:<11} Sharpe≥EW+0.10:{'✓' if c1 else '✗'}  ทุกช่วง≥EW:{'✓' if c2 else '✗'}  CAGR≥EW−1pp:{'✓' if c3 else '✗'}  P(boot)={p:.3f}:{'✓' if c4 else '✗'}  → {'ผ่าน' if verdict[s]['PASS'] else 'ไม่ผ่าน'}")
out["verdict"] = verdict

# stress
print("\nStress (ผลตอบแทนสะสมช่วงถือจริง):")
sel = {"2008": [i for i, h in enumerate(hold) if h.startswith("2008")], "โควิด 2020-02..04": [i for i, h in enumerate(hold) if "2020-02" <= h <= "2020-04"], "3 เดือนแย่สุดของ EW": list(np.argsort(ew)[:3])}
out["stress"] = {}
for name, ix in sel.items():
    row = {s: float(np.prod(1 + res[s][0][ix]) - 1) for s in SCHEMES}; out["stress"][name] = row
    print(f"  {name:<20}" + "  ".join(f"{s}:{v*100:6.1f}%" for s, v in row.items()))
pool = np.array([m["poolRet"] for m in M]); gate_now = M[-1]["gate"]
print(f"\n'ตลาดลง 20%' ผ่าน beta ต่อ EW พูล (ก่อนคูณ Gate) · Gate เดือนล่าสุด = {gate_now:.0%}")
out["beta"] = {}
for s in SCHEMES:
    g = res[s][1]; b = float(np.cov(g, pool)[0, 1] / pool.var(ddof=1)); out["beta"][s] = {"beta": b, "loss_gate_now": b * -0.20 * gate_now, "loss_gate_full": b * -0.20}
    print(f"  {s:<11} beta {b:5.2f}  → ขาดทุนโดยประมาณ {b*-0.2*gate_now*100:6.1f}% (Gate ปัจจุบัน) | {b*-0.2*100:6.1f}% (Gate 100%)")

# รายงานเสริม: ตัดหุ้นกำไรสูงสุด 5 ตัว
print("\nตัดหุ้นกำไรสะสมสูงสุด 5 ตัว (ถือเงินสดแทน): CAGR ก่อน → หลัง")
out["drop5"] = {}
for s in SCHEMES:
    top5 = [t for t, _ in sorted(res[s][5].items(), key=lambda x: -x[1])[:5]]; r2 = run(s, drop=set(top5))[0]
    out["drop5"][s] = {"top5": top5, "cagr_after": stats(r2)["cagr"]}; print(f"  {s:<11} {out['schemes'][s]['all']['cagr']*100:5.1f}% → {stats(r2)['cagr']*100:5.1f}%  ({', '.join(top5)})")

tag = os.environ.get("TAG", "")
json.dump(out, open(os.path.join(ROOT, "data", f"explore_th_weights{tag}_2026-10-11.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1, default=float)


