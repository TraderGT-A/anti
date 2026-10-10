import test from 'node:test';
import assert from 'node:assert/strict';
import '../rsdash/trendlib.js';
const T = globalThis.TrendLib;

const strong = { price: 100, sma50: 95, sma150: 85, sma200: 75, hi52: 105, lo52: 50, rs: 92, p6m: 40, p3m: 30,
  ema20: 98, atr: 3, volW: 2.0, volM: 2.6, relVol: 0.7, val: 1e8 };

test('gate: green / yellow / red', () => {
  assert.equal(T.gate({ price: 110, sma50: 100, sma200: 90 }).state, 'green');
  assert.equal(T.gate({ price: 95, sma50: 100, sma200: 90 }).state, 'yellow');      // หลุด SMA50 แต่เหนือ SMA200
  assert.equal(T.gate({ price: 115, sma50: 100, sma200: 110 }).state, 'yellow');    // เหนือ SMA50/200 แต่ SMA50<SMA200
  assert.equal(T.gate({ price: 105, sma50: 100, sma200: 110 }).state, 'red');       // ต่ำกว่า SMA200 = แดง
  assert.equal(T.gate({ price: 80, sma50: 100, sma200: 90 }).state, 'red');
  assert.equal(T.gate({ price: 95, sma50: 100, sma200: 110 }).state, 'red');
  assert.equal(T.gate({}).state, 'unknown');
  assert.equal(T.gate({ price: 110, sma50: 100, sma200: 90 }).mult, 1);
  assert.ok(T.gate({ price: 80, sma50: 100, sma200: 90 }).mult < T.gate({ price: 95, sma50: 100, sma200: 90 }).mult);
});

test('trend template: strong stock passes 8/8, boundaries respected', () => {
  assert.equal(T.ttCount(T.ttRules(strong, 85)), 8);
  assert.equal(T.ttCount(T.ttRules({ ...strong, rs: 84 }, 85)), 7);                 // RS ต่ำกว่าเกณฑ์
  assert.equal(T.ttRules({ ...strong, price: 74 }, 85)[6].ok, false);               // ห่างจุดสูง >25% (74 < 105*.75)
  assert.equal(T.ttRules({ ...strong, lo52: 80 }, 85)[5].ok, false);                // สูงกว่าจุดต่ำไม่ถึง 30%
  assert.equal(T.ttRules({ ...strong, sma150: null }, 85)[0].missing, true);        // ข้อมูลขาด = ไม่ผ่าน ไม่ใช่ผ่าน
  assert.equal(T.ttRules({ ...strong, sma150: null }, 85)[0].ok, false);
});

test('setup: pass / fail filters and gate multiplier', () => {
  const g = T.gate({ price: 110, sma50: 100, sma200: 90 });
  const r = T.setup(strong, {}, g);
  assert.equal(r.pass, true);
  assert.ok(r.raw > 60 && r.raw <= 100);
  assert.equal(T.setup({ ...strong, atr: 9 }, {}, g).pass, false);                  // ATR 9% > 5%
  assert.equal(T.setup({ ...strong, atr: 0.3 }, {}, g).pass, false);                // ATR 0.3% = ราคาตรึง (deal-pinned) ไม่นับว่าบีบตัว
  assert.equal(T.setup({ ...strong, price: 80 }, {}, g).pass, false);               // ไกลจุดสูง
  assert.equal(T.setup({ ...strong, p3m: 5 }, {}, g).pass, false);
  assert.equal(T.setup({ ...strong, val: 1 }, { minVal: 1e7 }, g).pass, false);
  const red = T.gate({ price: 80, sma50: 100, sma200: 90 });
  const rr = T.setup(strong, {}, red);
  assert.equal(rr.raw, r.raw);
  assert.equal(rr.score, Math.round(r.raw * 0.4));
  assert.ok(Number.isFinite(T.setup({}, {}, g).score));                             // ข้อมูลว่างไม่ทำให้ NaN
});

test('fromBars: steady uptrend passes; downtrend fails; short history -> null', () => {
  const up = Array.from({ length: 260 }, (_, i) => { const c = 50 * Math.pow(1.004, i); return { time: i, open: c, high: c * 1.01, low: c * 0.99, close: c, volume: 1000 }; });
  const r = T.fromBars(up, 90, 85);
  assert.equal(r.tt, 8);
  assert.ok(r.contraction.atrRatio > 0.9 && r.contraction.atrRatio < 1.1);          // ความผันผวนคงที่ ≈ 1
  const dn = up.map((b, i) => { const c = 200 * Math.pow(0.996, i); return { ...b, open: c, high: c * 1.01, low: c * 0.99, close: c }; });
  assert.ok(T.fromBars(dn, 90, 85).tt <= 3);
  assert.equal(T.fromBars(up.slice(0, 150), 90), null);
  // ทะลุหลังบีบตัว: 15 แท่งสุดท้ายแคบลงมาก → atrRatio ต่ำ
  const sq = up.map((b, i) => i < 245 ? b : { ...b, high: b.close * 1.002, low: b.close * 0.998 });
  assert.ok(T.fromBars(sq, 90, 85).contraction.atrRatio < 0.5);
});
