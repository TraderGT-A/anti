/* trendlib.js — Minervini Trend Template + Scanner "พักตัวแคบ" + Market Gate
   ไฟล์เดียวใช้ทั้งในเว็บ (window.TrendLib) และ node (require / import) เพื่อให้เทสต์ได้
   หมายเหตุ: เกณฑ์เป็นการตีความจากหนังสือ/แหล่งรอง — ยังไม่ได้ผ่าน backtest ของเราเอง (ดูข้อจำกัดใน UI) */
(function (g) {
  'use strict';
  const fin = (v) => (typeof v === 'number' && isFinite(v)) ? v : null;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const ATR_MIN = 1.0;   // ATR% ต่ำกว่านี้ = ราคาตรึง (เช่น หุ้นที่ถูกเทกโอเวอร์/ซื้อคืน) ไม่ใช่การบีบตัวที่เทรดได้
  const DEFAULTS = { rsMin: 85, nearHigh: 15, atrMax: 5, p3mMin: 20, minVal: 0, ttOnly: true, needSqueeze: true };
  const SQ_MAX = 0.85;   // บีบตัว = ATR10/ATR50 ≤ 0.85 (เกณฑ์เดียวกับ backtest ที่ล็อกไว้)

  /* ---------- Market Gate: ไฟเขียว/เหลือง/แดง จากดัชนีหลัก (ราคา vs SMA50/SMA200) ---------- */
  function gate(idx) {
    const p = fin(idx && idx.price), s50 = fin(idx && idx.sma50), s200 = fin(idx && idx.sma200);
    if (p == null || s50 == null || s200 == null) return { state: 'unknown', mult: 1, label: 'ไม่มีข้อมูลดัชนี', reason: '' };
    if (p > s50 && s50 > s200) return { state: 'green', mult: 1, label: 'ไฟเขียว — ตลาดขาขึ้น', reason: 'ดัชนีเหนือ SMA50 และ SMA50 เหนือ SMA200' };
    if (p < s200 && p < s50) return { state: 'red', mult: 0.4, label: 'ไฟแดง — ตลาดอ่อนแอ', reason: 'ดัชนีต่ำกว่า SMA50 และ SMA200' };
    if (p < s200 || (p < s50 && s50 < s200)) return { state: 'red', mult: 0.4, label: 'ไฟแดง — ตลาดอ่อนแอ', reason: p < s200 ? 'ดัชนีต่ำกว่า SMA200' : 'ดัชนีต่ำกว่า SMA50 และ SMA50 ต่ำกว่า SMA200' };
    return { state: 'yellow', mult: 0.7, label: 'ไฟเหลือง — ตลาดผสม', reason: p < s50 ? 'ดัชนีหลุด SMA50 แต่ยังเหนือ SMA200' : 'ดัชนีเหนือ SMA50 แต่ SMA50 ยังไม่เหนือ SMA200' };
  }

  /* ---------- Trend Template 8 ข้อ จากข้อมูลสแกน (TradingView) ---------- */
  function ttRules(s, rsMin) {
    const p = fin(s.price), s50 = fin(s.sma50), s150 = fin(s.sma150), s200 = fin(s.sma200);
    const hi = fin(s.hi52), lo = fin(s.lo52), rs = fin(s.rs), p6m = fin(s.p6m);
    const has = (...a) => a.every((x) => x != null);
    const R = (id, label, ok, detail, approx) => ({ id, label, ok: !!ok, detail: detail || '', approx: !!approx, missing: ok === null });
    return [
      R(1, 'ราคา > SMA150 และ SMA200', has(p, s150, s200) ? (p > s150 && p > s200) : null),
      R(2, 'SMA150 > SMA200', has(s150, s200) ? s150 > s200 : null),
      // SMA200 ชี้ขึ้น ≥ 1 เดือน: สแกนไม่มีประวัติ SMA → ใช้ตัวแทน (SMA150>SMA200 และ 6M เป็นบวก) แล้วยืนยันจริงในหน้าต่างหุ้น
      R(3, 'SMA200 ชี้ขึ้น ≥ 1 เดือน', has(s150, s200, p6m) ? (s150 > s200 && p6m > 0) : null, 'ประมาณจากข้อมูลสแกน — ยืนยันจริงในหน้าต่างหุ้น', true),
      R(4, 'SMA50 > SMA150 และ SMA200', has(s50, s150, s200) ? (s50 > s150 && s50 > s200) : null),
      R(5, 'ราคา > SMA50', has(p, s50) ? p > s50 : null),
      R(6, 'ราคาสูงกว่าจุดต่ำ 52 สัปดาห์ ≥ 30%', has(p, lo) && lo > 0 ? p >= lo * 1.3 : null, has(p, lo) && lo > 0 ? '+' + ((p / lo - 1) * 100).toFixed(0) + '%' : ''),
      R(7, 'ราคาห่างจุดสูง 52 สัปดาห์ ≤ 25%', has(p, hi) && hi > 0 ? p >= hi * 0.75 : null, has(p, hi) && hi > 0 ? '-' + ((1 - p / hi) * 100).toFixed(0) + '%' : ''),
      R(8, 'RS ≥ ' + rsMin, rs != null ? rs >= rsMin : null, rs != null ? 'RS ' + rs : ''),
    ];
  }

  const ttCount = (rules) => rules.filter((r) => r.ok).length;

  /* ---------- สแกน "พักตัวแคบ" + Setup score ---------- */
  function setup(s, params, gateInfo) {
    const P = Object.assign({}, DEFAULTS, params || {});
    const rules = ttRules(s, P.rsMin);
    const tt = ttCount(rules);
    const price = fin(s.price), hi = fin(s.hi52), atr = fin(s.atr), ema20 = fin(s.ema20);
    const pctFromHigh = (price != null && hi) ? (1 - price / hi) * 100 : null;
    const atrPct = (price && atr != null) ? atr / price * 100 : null;
    const ratio = (s.sq && fin(s.sq.atrRatio) != null) ? s.sq.atrRatio : null;   // ATR10/ATR50 จากแท่งราคาจริง (s.sq มาจาก /api/scan?universe=squeeze)
    const above20 = (price != null && ema20 != null) ? price > ema20 : null;
    const relVol = fin(s.relVol);
    const p3m = fin(s.p3m);
    const mult = gateInfo ? gateInfo.mult : 1;

    const checks = {
      tt: tt === 8,
      near: pctFromHigh != null && pctFromHigh <= P.nearHigh,
      tight: atrPct != null && atrPct >= ATR_MIN && atrPct <= P.atrMax,
      above20: above20 === true,
      mom: p3m != null && p3m >= P.p3mMin,
      liq: (fin(s.val) || 0) >= P.minVal,
    };
    const pass1 = checks.near && checks.tight && checks.above20 && checks.mom && checks.liq && (!P.ttOnly || checks.tt);   // ผ่านทุกข้อยกเว้นบีบตัว (ใช้เลือกตัวไปคำนวณ ATR10/ATR50)
    checks.squeeze = ratio != null && ratio <= SQ_MAX;
    const pass = pass1 && (!P.needSqueeze || checks.squeeze);

    const rs = fin(s.rs) || 0;
    const sRs = 30 * clamp((rs - 50) / 49, 0, 1);
    const sTt = 25 * tt / 8;
    const sNear = pctFromHigh == null ? 0 : 15 * clamp(1 - pctFromHigh / Math.max(P.nearHigh, 1), 0, 1);
    const sTight = 20 * (0.5 * (atrPct == null || atrPct < ATR_MIN ? 0 : clamp(1 - atrPct / P.atrMax, 0, 1)) + 0.5 * (ratio == null ? 0 : clamp((1 - ratio) / 0.4, 0, 1)));
    const sDry = relVol == null ? 0 : 10 * clamp((1.5 - relVol) / 0.8, 0, 1);
    const raw = sRs + sTt + sNear + sTight + sDry;
    return {
      pass, pass1, checks, rules, tt, pctFromHigh, atrPct, ratio, relVol,
      raw: Math.round(raw), score: Math.round(raw * mult),
      parts: { rs: sRs, tt: sTt, near: sNear, tight: sTight, dry: sDry },
    };
  }

  /* ---------- ตรวจแบบแม่นจากแท่งราคารายวัน (ใช้ในหน้าต่างหุ้น) ---------- */
  function smaAt(bars, n, endIdx) {
    if (endIdx - n + 1 < 0) return null;
    let t = 0;
    for (let i = endIdx - n + 1; i <= endIdx; i++) t += bars[i].close;
    return t / n;
  }
  function trAvg(bars, n, endIdx) {
    if (endIdx - n < 0) return null;
    let t = 0;
    for (let i = endIdx - n + 1; i <= endIdx; i++) {
      const b = bars[i], pc = bars[i - 1].close;
      t += Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
    }
    return t / n;
  }
  /* การบีบตัวจากแท่งรายวัน: ATR10/ATR50, ช่วงราคา 10 วัน, ปริมาณ 5 วัน/50 วัน */
  function squeeze(bars) {
    const n = bars ? bars.length : 0;
    if (n < 60) return null;
    const last = n - 1, price = bars[last].close;
    const atr10 = trAvg(bars, 10, last), atr50 = trAvg(bars, 50, last);
    const w10 = bars.slice(n - 10), range10 = (Math.max.apply(null, w10.map((b) => b.high)) - Math.min.apply(null, w10.map((b) => b.low))) / price * 100;
    let volDry = null;
    if (bars.slice(n - 50).every((b) => b.volume > 0)) {
      const av = (a, b2) => { let t = 0; for (let i = a; i <= b2; i++) t += bars[i].volume; return t / (b2 - a + 1); };
      volDry = av(n - 5, last) / av(n - 50, last);
    }
    return { atrRatio: atr10 / atr50, atr10Pct: atr10 / price * 100, range10Pct: range10, volDry, asOf: bars[last].time };
  }
  function fromBars(bars, rs, rsMin) {
    rsMin = rsMin == null ? DEFAULTS.rsMin : rsMin;
    const n = bars ? bars.length : 0;
    if (n < 200) return null;
    const last = n - 1, price = bars[last].close;
    const s50 = smaAt(bars, 50, last), s150 = smaAt(bars, 150, last), s200 = smaAt(bars, 200, last);
    const s200prev = n >= 221 ? smaAt(bars, 200, last - 21) : null;     // เมื่อ ~1 เดือนก่อน
    const win = bars.slice(Math.max(0, n - 252));
    const hi = Math.max.apply(null, win.map((b) => b.high)), lo = Math.min.apply(null, win.map((b) => b.low));
    const R = (id, label, ok, detail) => ({ id, label, ok: !!ok, detail: detail || '', approx: false, missing: ok === null });
    const rules = [
      R(1, 'ราคา > SMA150 และ SMA200', price > s150 && price > s200, 'ราคา ' + price.toFixed(2) + ' · SMA150 ' + s150.toFixed(2) + ' · SMA200 ' + s200.toFixed(2)),
      R(2, 'SMA150 > SMA200', s150 > s200),
      R(3, 'SMA200 ชี้ขึ้น ≥ 1 เดือน', s200prev == null ? null : s200 > s200prev, s200prev == null ? 'ข้อมูลไม่พอ' : 'SMA200 ' + ((s200 / s200prev - 1) * 100).toFixed(2) + '% ใน 21 วันทำการ'),
      R(4, 'SMA50 > SMA150 และ SMA200', s50 > s150 && s50 > s200),
      R(5, 'ราคา > SMA50', price > s50),
      R(6, 'ราคาสูงกว่าจุดต่ำ 52 สัปดาห์ ≥ 30%', price >= lo * 1.3, '+' + ((price / lo - 1) * 100).toFixed(0) + '%'),
      R(7, 'ราคาห่างจุดสูง 52 สัปดาห์ ≤ 25%', price >= hi * 0.75, '-' + ((1 - price / hi) * 100).toFixed(0) + '%'),
      R(8, 'RS ≥ ' + rsMin, rs == null ? null : rs >= rsMin, rs == null ? '' : 'RS ' + rs),
    ];
    return {
      rules, tt: ttCount(rules), price, hi, lo,
      contraction: squeeze(bars),
    };
  }

  const api = { DEFAULTS, ATR_MIN, SQ_MAX, squeeze, gate, ttRules, ttCount, setup, fromBars, smaAt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  g.TrendLib = api;
})(typeof window !== 'undefined' ? window : globalThis);
