// พอร์ตตรรกะ VCP Screener ของ tradermonty/claude-trading-skills (skills/vcp-screener/scripts/calculators/*) เป็น JS
// ตามนิยามที่ล็อกใน research/PREREG_vcp_us_2026-10-11.md — ห้ามแก้ตรรกะหลังเห็นผล backtest
// อินพุตเป็นอาร์เรย์เรียงจากเก่า→ใหม่ (แท่งสุดท้าย = แท่ง k ที่ใช้ตัดสินใจ) ไม่ใช้ข้อมูลหลังแท่ง k
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const round1 = (x) => Math.round(x * 10) / 10;

/* ATR แบบเฉลี่ยง่าย (ไม่ใช่ Wilder): TR[i] i=1..n-1, ATR(p) = เฉลี่ย p ค่าสุดท้าย, 0 ถ้า n < p+1 */
export function atrSimple(H, L, C, p) {
  const n = H.length; if (n < p + 1) return 0;
  const tr = []; for (let i = 1; i < n; i++) tr.push(Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1])));
  return mean(tr.slice(-p));
}

/* ZigZag ด้วย ATR14×1.5; fallback หน้าต่าง 5 แท่งเมื่อไม่พบ high หรือ low */
export function zigzag(H, L, atr14) {
  const n = H.length, highs = [], lows = [];
  if (n >= 15 && atr14 > 0) {
    const thr = atr14 * 1.5; let ei = 0, ev = H[0]; for (let i = 0; i < 14; i++) if (H[i] > ev) { ev = H[i]; ei = i; }
    let up = true;
    for (let i = ei + 1; i < n; i++) {
      if (up) { if (H[i] > ev) { ev = H[i]; ei = i; } else if (ev - L[i] >= thr) { highs.push({ i: ei, v: ev }); up = false; ev = L[i]; ei = i; } }
      else { if (L[i] < ev) { ev = L[i]; ei = i; } else if (H[i] - ev >= thr) { lows.push({ i: ei, v: ev }); up = true; ev = H[i]; ei = i; } }
    }
  }
  if (!highs.length || !lows.length) {
    const fh = [], fl = [];
    for (let i = 5; i < n - 5; i++) { let isH = true, isL = true; for (let j = i - 5; j <= i + 5; j++) { if (j === i) continue; if (!(H[i] > H[j])) isH = false; if (!(L[i] < L[j])) isL = false; } if (isH) fh.push({ i, v: H[i] }); if (isL) fl.push({ i, v: L[i] }); }
    if (!highs.length || !lows.length) return { highs: fh, lows: fl };
  }
  return { highs, lows };
}

function buildFrom(start, highs, lows) {
  const out = []; let H = start;
  for (let k = 0; k < 4; k++) {
    let Lw = lows.find((x) => x.i > H.i); if (!Lw) break;
    let dur = Lw.i - H.i;
    if (dur < 5) {
      const B = highs.find((x) => x.i > H.i);
      const L2 = lows.find((x) => x.i - H.i >= 5 && (B ? x.i <= B.i : true)); if (!L2) break; Lw = L2; dur = Lw.i - H.i;
    }
    const depth = (H.v - Lw.v) / H.v * 100;
    if (out.length && Math.abs(H.v - out[0].hi) / out[0].hi * 100 > 5) break;
    out.push({ hi: H.v, hiIdx: H.i, lo: Lw.v, loIdx: Lw.i, depth, dur });
    const nh = highs.find((x) => x.i > Lw.i); if (!nh) break; H = nh;
  }
  return out;
}
function validate(cs) {
  if (cs.length < 2) return { valid: false, ratios: [], t1: cs[0] ? cs[0].depth : 0 };
  let valid = true; const ratios = [];
  if (cs[0].depth < 8) valid = false;
  for (let i = 1; i < cs.length; i++) { const r = cs[i - 1].depth > 0 ? cs[i].depth / cs[i - 1].depth : 0; ratios.push(r); if (r > 0.75) valid = false; }
  const duration = cs[cs.length - 1].loIdx - cs[0].hiIdx; if (duration < 15) valid = false;
  return { valid, ratios, t1: cs[0].depth, duration };
}
function scoreContractions(cs, v) {
  if (!v.valid) return Math.min(40, cs.length * 15);
  let s = cs.length >= 4 ? 90 : cs.length === 3 ? 80 : 60;
  if (cs[cs.length - 1].depth < 5) s += 10; if (mean(v.ratios) < 0.4) s += 10; if (v.t1 > 30) s -= 10;
  return Math.max(0, Math.min(100, s));
}

/* ตรวจรูป VCP บนหน้าต่างที่ให้ (ผู้เรียกส่ง 120 แท่งล่าสุด) */
export function detectVCP(H, L, C) {
  const n = H.length; if (n < 30) return null;
  const atr14 = atrSimple(H, L, C, 14), atr10 = atrSimple(H, L, C, 10), atr50 = atrSimple(H, L, C, 50);
  const { highs, lows } = zigzag(H, L, atr14);
  let best = null, bestKey = [0, -1, 0];
  const starts = [...highs].sort((a, b) => b.v - a.v).slice(0, 3);
  for (const st of starts) {
    const cs = buildFrom(st, highs, lows); let v, sc;
    if (cs.length >= 2) { v = validate(cs); sc = scoreContractions(cs, v); } else { v = { valid: false, ratios: [] }; sc = 0; }
    const key = [v.valid ? 1 : 0, sc, cs.length];
    if (key[0] > bestKey[0] || (key[0] === bestKey[0] && (key[1] > bestKey[1] || (key[1] === bestKey[1] && key[2] > bestKey[2])))) { best = { cs, v, sc }; bestKey = key; }
  }
  if (!best || best.cs.length < 2) return { valid: false, score: 0, contractions: best ? best.cs : [], pivot: null, lastLow: null, wideAndLoose: false, atrR: atr50 > 0 && atr10 > 0 ? atr10 / atr50 : null };
  const last = best.cs[best.cs.length - 1];
  return { valid: best.v.valid, score: best.sc, contractions: best.cs, pivot: Math.round(last.hi * 100) / 100, lastLow: last.lo, wideAndLoose: last.depth > 15 && last.dur < 10, atrR: atr50 > 0 && atr10 > 0 ? atr10 / atr50 : null };
}

/* วอลุ่ม: V, C เรียงเก่า→ใหม่ ยาวถึงแท่ง k; winStart = ดัชนีสัมบูรณ์ของแท่งแรกของหน้าต่างรูป VCP (แปลงดัชนี contraction) */
export function volumePattern(V, C, pivot, contractions, winStart) {
  const n = V.length; if (n < 20) return { score: 0, dryUp: null, breakout: false };
  const avg50 = mean(V.slice(-50)); if (!(avg50 > 0)) return { score: 0, dryUp: null, breakout: false };
  const zoneB = mean(V.slice(Math.max(0, n - 11), n - 1)), dry = zoneB / avg50;
  let s = dry < 0.3 ? 90 : dry < 0.5 ? 75 : dry < 0.7 ? 60 : dry <= 1 ? 40 : 20, breakout = false;
  if (pivot && C[n - 1] > pivot) { const r0 = V[n - 1] / avg50; if (r0 >= 1.5) { s += 10; breakout = true; } }
  const period = Math.min(20, n - 1); let up = 0, dn = 0;
  for (let m = 0; m < period; m++) { const i = n - 1 - m; if (V[i] > avg50) { if (C[i] > C[i - 1]) up++; else if (C[i] < C[i - 1]) dn++; } }
  const net = up - dn; if (net > 3) s += 10; else if (net < -3) s -= 10;
  if (contractions && contractions.length >= 2) {
    const abs = V.length - 1, avgs = contractions.map((c) => { const a = winStart + c.hiIdx, b = winStart + c.loIdx; return mean(V.slice(a, b + 1)); });
    let dec = true; for (let i = 1; i < avgs.length; i++) if (!(avgs[i] < avgs[i - 1])) dec = false; if (dec) s += 10;
  }
  return { score: Math.max(0, Math.min(100, s)), dryUp: dry, breakout };
}

/* ใกล้ pivot + stop/risk */
export function pivotProximity(price, pivot, lastLow, breakoutVol) {
  if (!(pivot > 0)) return { score: 0, status: "NO PIVOT", dist: null, stop: null, risk: null };
  if (!(price > 0)) return { score: 0, status: "INVALID PRICE", dist: null, stop: null, risk: null };
  const d = (price - pivot) / pivot * 100;
  let s = d > 20 ? 20 : d > 10 ? 35 : d > 5 ? 50 : d > 3 ? 65 : d > 0 ? 90 : d >= -2 ? 90 : d >= -5 ? 75 : d >= -8 ? 60 : d >= -10 ? 45 : d >= -15 ? 30 : 10;
  if (breakoutVol && d > 0 && d <= 5) s += 10;
  const stop = lastLow > 0 ? Math.round(lastLow * 0.99 * 100) / 100 : null;
  let risk = null, status = "OK";
  if (stop != null) { if (price > stop) risk = (price - stop) / price * 100; else { status = "BELOW STOP LEVEL"; s = 0; } }
  return { score: s, status, dist: d, stop, risk };
}

/* RS เทียบ S&P: return difference ถ่วง 63/126/189/252 (เท่ากับ relative_strength_calculator) */
export function weightedRS(stockRets, spxRets) {
  const w = [0.4, 0.2, 0.2, 0.2]; let num = 0, den = 0;
  for (let i = 0; i < 4; i++) { if (stockRets[i] == null || spxRets[i] == null) continue; num += w[i] * (stockRets[i] - spxRets[i]); den += w[i]; }
  return den > 0 ? num / den : null;
}
export const rsRankEstimate = (w) => (w == null ? 0 : w >= 50 ? 99 : w >= 30 ? 95 : w >= 20 ? 90 : w >= 10 ? 80 : w >= 5 ? 70 : w >= 0 ? 60 : w >= -5 ? 50 : w >= -10 ? 40 : w >= -20 ? 25 : 10);
export const rsScore = (w) => (w == null ? 0 : w >= 50 ? 100 : w >= 30 ? 95 : w >= 20 ? 90 : w >= 10 ? 80 : w >= 5 ? 70 : w >= 0 ? 60 : w >= -5 ? 50 : w >= -10 ? 40 : w >= -20 ? 20 : 0);

/* Trend Template 7 ข้อ: v = {price, sma50, sma150, sma200, sma200ago22, lo52, hi52, rsRank} → { passed, count, raw, score } */
export function trendTemplate(v) {
  const ok = [
    v.sma200 != null ? v.price > v.sma150 && v.price > v.sma200 : v.price > v.sma150,
    v.sma150 > v.sma200,
    v.sma200ago22 != null && v.sma200 > v.sma200ago22,
    v.price > v.sma50,
    v.lo52 > 0 && (v.price - v.lo52) / v.lo52 * 100 >= 25,
    v.hi52 > 0 && (v.hi52 - v.price) / v.hi52 * 100 <= 25,
    v.rsRank > 70,
  ];
  const count = ok.filter(Boolean).length, raw = Math.min(100, round1(count * 14.3));
  const dist = v.sma50 > 0 ? (v.price - v.sma50) / v.sma50 * 100 : 0;
  const pen = dist < 8 ? 0 : dist < 12 ? -5 : dist < 18 ? -10 : dist < 25 ? -15 : -20;
  return { ok, count, raw, passed: raw >= 85, score: Math.max(0, raw + pen) };
}

/* Execution state */
export function executionState(x) {
  const { dist, price, sma50, sma200, sma200Dist, lastLow, breakoutVol } = x;
  if (sma50 != null && sma200 != null && price < sma50 && sma50 < sma200) return "Invalid";
  if (lastLow > 0 && price < lastLow) return "Damaged";
  if (sma50 != null && price < sma50) return "Damaged";
  if (sma200Dist != null && sma200Dist > 50) return "Overextended";
  if (dist == null) return "Pre-breakout";
  if (dist > 10) return "Overextended";
  if (dist > 5) return "Extended";
  if (dist > 3) return "Early-post-breakout";
  if (dist >= 0) return breakoutVol ? "Breakout" : "Early-post-breakout";
  return "Pre-breakout";
}

export const RATINGS = ["No VCP", "Weak VCP", "Developing VCP", "Good VCP", "Strong VCP", "Textbook VCP"];
const bandOf = (c) => (c >= 90 ? 5 : c >= 80 ? 4 : c >= 70 ? 3 : c >= 60 ? 2 : c >= 50 ? 1 : 0);
/* composite + เรตติ้งหลัง override/เพดาน → { composite, rating (ดัชนี 0..5) } */
export function rate({ tt, contraction, volume, pivot, rs, valid, state, wideAndLoose }) {
  const composite = round1(0.25 * tt + 0.25 * contraction + 0.2 * volume + 0.15 * pivot + 0.15 * rs);
  let r = bandOf(composite);
  if (!valid && composite >= 70) r = Math.min(r, 2);
  const cap = { Invalid: 0, Damaged: 0, Overextended: 1, Extended: 2, "Early-post-breakout": 4 }[state];
  if (cap != null) r = Math.min(r, cap);
  if (wideAndLoose && r >= 3) r = 2;
  return { composite, rating: r };
}
export const ratingMult = (composite) => (composite >= 90 ? 1.5 : composite >= 80 ? 1 : 0.75);
