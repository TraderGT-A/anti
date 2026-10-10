# S&P 500 — vol/return chain (เปรียบเทียบกับเปเปอร์ & ไทย)
- สัญลักษณ์: 498 ตัว (S&P500) | transition 207756 | train 1962-01 → 2016-01 | test 2016-02 → 2026-09 (ตัดขอบเดือน)
## chain R
- P(อยู่ decile เดิม) top/bottom: 0.150 / 0.137 · σ=0.0009
- OOS gain: +0.0049 nats (t=9.54)  ← ทำนายได้
- covariate regime: in-sample +0.0015 / OOS -0.0008
- covariate อีก chain: in-sample +0.0309 / OOS +0.0161
## chain V
- P(อยู่ decile เดิม) top/bottom: 0.428 / 0.486 · σ=0.0004
- OOS gain: +0.1866 nats (t=62.44)  ← ทำนายได้
- covariate regime: in-sample +0.0007 / OOS -0.0009
- covariate อีก chain: in-sample +0.0066 / OOS -0.0023
- เงียบสุดอยู่ต่อ: 1 เดือน 40.1% · 2 เดือน 38.0% · 3 เดือน 38.8%
- ตลาด EW เดือนหน้า: +1.35%/เดือน
- R decile1: +1.51%/เดือน (excess +0.10%, เดือน-level t=0.79, n=777)
- V decile1: +0.78%/เดือน (excess -0.56%, เดือน-level t=-4.74, n=777)
- V(calm) decile1: mean +0.78% excess -0.56% (t=-9.47)
- V(volatile) decile10: mean +2.64% excess +1.29% (t=7.65)
- ผันผวนสุด → เดือนหน้า top10%: 21.6% / bottom10%: 20.1%
- เงียบสุด → เดือนหน้า top10%: 4.8% / bottom10%: 6.1%