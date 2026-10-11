import test from 'node:test';
import assert from 'node:assert/strict';
import { atrSimple, zigzag, detectVCP, volumePattern, pivotProximity, weightedRS, rsRankEstimate, rsScore, trendTemplate, executionState, rate, ratingMult } from '../scripts/lib/vcp.mjs';

// สร้างอนุกรมจากเส้นทางราคา (จุดหัวท้ายของแต่ละช่วง, ช่วงละ 10 แท่ง) high/low = ปิด ±0.4
function path(pts, step = 10) {
  const c = [pts[0]];
  for (let s = 1; s < pts.length; s++) for (let i = 1; i <= step; i++) c.push(pts[s - 1] + (pts[s] - pts[s - 1]) * i / step);
  return { C: c, H: c.map((x) => x + 0.4), L: c.map((x) => x - 0.4) };
}

test('atrSimple: เฉลี่ยง่าย ไม่ใช่ Wilder; ข้อมูลไม่พอ = 0', () => {
  const H = [11, 12, 13, 14], L = [9, 10, 11, 12], C = [10, 11, 12, 13];
  assert.equal(atrSimple(H, L, C, 3), 2.0);   // TR = 2,2,2 ... (H-L=2; |H-Cprev|=2; |L-Cprev|=0)
  assert.equal(atrSimple(H, L, C, 5), 0);
});

test('detectVCP: ย่อตัว 3 ช่วงแคบลงเรื่อย ๆ → valid, pivot = high ช่วงสุดท้าย', () => {
  // ขึ้น 70→100, ย่อ 20% (→80), ขึ้น 99, ย่อ 9% (→90), ขึ้น 98.5, ย่อ ~4.6% (→94), ขึ้นออก
  const p = path([70, 100, 80, 99, 90, 98.5, 94, 99]);
  const r = detectVCP(p.H, p.L, p.C);
  assert.equal(r.valid, true); assert.equal(r.contractions.length, 3);
  assert.ok(Math.abs(r.contractions[0].depth - 20) < 1.5, 'T1 ~20% ได้ ' + r.contractions[0].depth);
  assert.ok(r.contractions[1].depth / r.contractions[0].depth <= 0.75 && r.contractions[2].depth / r.contractions[1].depth <= 0.75);
  assert.ok(Math.abs(r.pivot - 98.9) < 0.6, 'pivot ~98.9 ได้ ' + r.pivot);   // high 98.5+0.4
  assert.equal(r.score, 80);   // 3 ช่วง = 80 (depth สุดท้ายไม่ < 5%, ค่าเฉลี่ยอัตราส่วนไม่ < 0.4)
});

test('detectVCP: ช่วงที่สองลึกกว่าเดิม (ขยาย) → ไม่ valid; ข้อมูล < 30 แท่ง → null', () => {
  const p = path([70, 100, 92, 99, 78, 99]);   // 8% แล้ว 21% (ขยาย) และไม่มีชุดย่อยที่ valid
  const r = detectVCP(p.H, p.L, p.C); assert.equal(r.valid, false);
  assert.equal(detectVCP([1, 2], [1, 2], [1, 2]), null);
});

test('volumePattern: วอลุ่มคงที่ → dry-up = 1.0 → ฐาน 40; breakout 1.5× เหนือ pivot → +10', () => {
  const V = Array(120).fill(100), C = Array(120).fill(50);
  const a = volumePattern(V, C, null, null, 0); assert.equal(a.score, 40); assert.equal(a.dryUp, 1);
  const V2 = V.slice(); V2[119] = 200; const C2 = C.slice(); C2[119] = 52;   // วอลุ่มวันนี้ 2× (avg50 ≈ 102) เหนือ pivot 51
  const b = volumePattern(V2, C2, 51, null, 0); assert.equal(b.breakout, true);
  assert.ok(b.score >= 50);
  const V3 = Array(120).fill(100); for (let i = 109; i < 119; i++) V3[i] = 20;   // วอลุ่มแห้งก่อน pivot
  assert.ok(volumePattern(V3, C, null, null, 0).dryUp < 0.3);
});

test('pivotProximity: ช่วงคะแนน, โบนัสวอลุ่ม, stop = low×0.99, ต่ำกว่า stop = 0', () => {
  assert.equal(pivotProximity(100, 100, 90, false).score, 90);        // 0% = at pivot (≥ −2)
  assert.equal(pivotProximity(101, 100, 90, true).score, 100);        // 0–3% + วอลุ่ม
  assert.equal(pivotProximity(104, 100, 90, true).score, 75);         // 3–5% + วอลุ่ม
  assert.equal(pivotProximity(108, 100, 90, true).score, 50);         // เกิน 5% ไม่มีโบนัส
  assert.equal(pivotProximity(85, 100, 80, false).score, 30);         // −15% (stop 79.2 ต่ำกว่าราคา)
  const x = pivotProximity(100, 100, 90, false); assert.equal(x.stop, 89.1); assert.ok(Math.abs(x.risk - 10.9) < 1e-9);
  const y = pivotProximity(89, 100, 90, false); assert.equal(y.status, 'BELOW STOP LEVEL'); assert.equal(y.score, 0);
  assert.equal(pivotProximity(100, null, 90, false).status, 'NO PIVOT');
});

test('RS: return difference ถ่วง 40/20/20/20, ตารางแปลงเป็น rank และคะแนน', () => {
  assert.equal(weightedRS([20, 20, 20, 20], [10, 10, 10, 10]), 10);
  assert.ok(Math.abs(weightedRS([30, null, null, null], [10, null, null, null]) - 20) < 1e-9);   // ใช้น้ำหนักเท่าที่มี
  assert.equal(rsRankEstimate(10), 80); assert.equal(rsRankEstimate(9.99), 70); assert.equal(rsRankEstimate(-25), 10); assert.equal(rsRankEstimate(null), 0);
  assert.equal(rsScore(30), 95); assert.equal(rsScore(-30), 0);
});

test('trendTemplate: 7 ข้อ, ผ่านที่ ≥ 6, RS ต้อง > 70, penalty extended', () => {
  const ok = { price: 100, sma50: 95, sma150: 90, sma200: 80, sma200ago22: 79, lo52: 60, hi52: 105, rsRank: 80 };
  let t = trendTemplate(ok); assert.equal(t.count, 7); assert.equal(t.raw, 100); assert.equal(t.passed, true); assert.equal(t.score, 100);
  t = trendTemplate({ ...ok, rsRank: 70 }); assert.equal(t.count, 6); assert.equal(t.raw, 85.8); assert.equal(t.passed, true);   // RS = 70 ไม่ผ่านข้อ 7 แต่ยังรวม 6
  t = trendTemplate({ ...ok, rsRank: 70, lo52: 85 }); assert.equal(t.passed, false);       // ผิด 2 ข้อ → 5
  t = trendTemplate({ ...ok, price: 110, hi52: 111 }); assert.equal(t.score, 90);           // เหนือ SMA50 15.8% → penalty −10
});

test('executionState: ลำดับตัดสินตรงต้นฉบับ', () => {
  const b = { dist: -3, price: 100, sma50: 95, sma200: 80, sma200Dist: 25, lastLow: 90, breakoutVol: false };
  assert.equal(executionState(b), 'Pre-breakout');
  assert.equal(executionState({ ...b, dist: 1, breakoutVol: true }), 'Breakout');
  assert.equal(executionState({ ...b, dist: 1, breakoutVol: false }), 'Early-post-breakout');
  assert.equal(executionState({ ...b, dist: 4 }), 'Early-post-breakout');
  assert.equal(executionState({ ...b, dist: 7 }), 'Extended');
  assert.equal(executionState({ ...b, dist: 12 }), 'Overextended');
  assert.equal(executionState({ ...b, sma200Dist: 55 }), 'Overextended');
  assert.equal(executionState({ ...b, price: 88 }), 'Damaged');          // ต่ำกว่า low ช่วงสุดท้าย
  assert.equal(executionState({ ...b, lastLow: 80, price: 90, sma50: 95 }), 'Damaged');   // ต่ำกว่า SMA50
  assert.equal(executionState({ ...b, price: 70, sma50: 85, sma200: 90 }), 'Invalid');
});

test('rate: composite → เรตติ้ง, valid override, เพดานสถานะ, wide_and_loose, ตัวคูณขนาดไม้', () => {
  const base = { tt: 100, contraction: 80, volume: 75, pivot: 100, rs: 90, valid: true, state: 'Breakout', wideAndLoose: false };
  let r = rate(base); assert.equal(r.composite, 0.25 * 100 + 0.25 * 80 + 0.2 * 75 + 0.15 * 100 + 0.15 * 90); assert.equal(r.rating, 4);   // 88.5 = Strong
  assert.equal(rate({ ...base, valid: false }).rating, 2);
  assert.equal(rate({ ...base, state: 'Extended' }).rating, 2);
  assert.equal(rate({ ...base, state: 'Early-post-breakout', tt: 100, contraction: 100, volume: 100, pivot: 100, rs: 100 }).rating, 4);
  assert.equal(rate({ ...base, wideAndLoose: true }).rating, 2);
  assert.equal(rate({ ...base, state: 'Damaged' }).rating, 0);
  assert.equal(ratingMult(95), 1.5); assert.equal(ratingMult(85), 1); assert.equal(ratingMult(72), 0.75);
});
