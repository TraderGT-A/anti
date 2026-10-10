import test from 'node:test';
import assert from 'node:assert/strict';
import '../rsdash/trendlib.js';
import '../rsdash/leaders.js';
const L = globalThis.Leaders, T = globalThis.TrendLib;

const mkRows = (day = 0, move = 0) => Array.from({ length: 100 }, (_, i) => {
  const close = (100 + i) * (1 + move * (i % 7 === 0 ? 1 : 0.2));
  // i สูง = ใกล้จุดสูง + โมเมนตัมสูง + สภาพคล่องสูง (กำหนดให้อันดับคาดเดาได้)
  return { tk: 'S' + String(i).padStart(3, '0'), name: 'Stock ' + i, close, open: close * 0.999, hi52: close / (0.6 + 0.004 * i), p1y: 10 + i, p1m: 2, turn: (i + 1) * 1e6 };
});
const GREEN = { price: 110, sma50: 100, sma200: 90 }, YELLOW = { price: 95, sma50: 100, sma200: 90 }, RED = { price: 80, sma50: 100, sma200: 90 };
const snap = (date, rows, gate = GREEN, setClose = 1500) => ({ date, rows, gate, setClose });

test('gateOf ตรงกับ TrendLib.gate และสัดส่วน 100/50/0', () => {
  for (const g of [GREEN, YELLOW, RED, { price: 105, sma50: 100, sma200: 110 }, {}]) assert.equal(L.gateOf(g).state, T.gate(g).state === 'unknown' ? 'unknown' : T.gate(g).state);
  assert.equal(L.gateOf(GREEN).exposure, 1); assert.equal(L.gateOf(YELLOW).exposure, 0.5); assert.equal(L.gateOf(RED).exposure, 0);
});

test('pool: ตัดแถวเสีย + เก็บครึ่งบนตามมูลค่าซื้อขาย', () => {
  const rows = [...mkRows(), { tk: 'BAD1', close: 0.5, open: 0.5, hi52: 1, p1y: 5, p1m: 1, turn: 9e9 }, { tk: 'BAD2', close: 10, hi52: 0, p1y: 5, p1m: 1, turn: 9e9 }, { tk: 'BAD3', close: 10, hi52: 11, p1y: NaN, p1m: 1, turn: 9e9 }];
  const p = L.pool(rows); assert.equal(p.length, 50); assert.ok(p.every((r) => r.turn >= 51e6)); assert.ok(!p.some((r) => r.tk.startsWith('BAD')));
});

test('score/pick: อันดับตามคะแนนรวม และน้ำหนัก = exposure/20', () => {
  const g = L.pick(mkRows(), GREEN); assert.equal(g.top.length, 20); assert.equal(g.top[0].tk, 'S099'); assert.ok(g.top[0].score > g.top[19].score);
  assert.ok(g.top.every((t) => Math.abs(t.weight - 0.05) < 1e-12)); assert.equal(L.pick(mkRows(), YELLOW).top[0].weight, 0.025); assert.equal(L.pick(mkRows(), RED).top[0].weight, 0);
  assert.ok(g.top.every((t) => t.near52 > 0 && t.near52 <= 1.0001));
});

test('step: เริ่ม → วันธรรมดาไม่ซื้อขาย → เดือนใหม่ซื้อที่ราคาเปิดด้วยสัญญาณเดือนก่อน', () => {
  let s = L.newState();
  let r = L.step(s, snap('2026-10-29', mkRows(0, 0))); assert.equal(r.reason, 'started'); assert.equal(s.nav.length, 1);
  r = L.step(s, snap('2026-10-30', mkRows(0, 0.01))); assert.equal(r.changed, true); assert.equal(r.rebalanced, false); assert.equal(Object.keys(s.S.pos).length, 0);   // ยังไม่ซื้อ (ยังไม่ถึงเดือนใหม่)
  assert.ok(Math.abs(s.nav.at(-1).s - 1) < 1e-12);   // ยังเป็นเงินสด
  const lastOct = s.lastSnap, nov = snap('2026-11-02', mkRows(0, 0.02));
  r = L.step(s, nov); assert.equal(r.rebalanced, true);
  const expected = L.pick(lastOct.rows, lastOct.gate).top.map((t) => t.tk).sort(), held = Object.keys(s.S.pos).sort();
  assert.deepEqual(held, expected);                          // ใช้สัญญาณของ snapshot 30 ต.ค. ไม่ใช่ข้อมูลวันที่ 2 พ.ย. (ไม่มี look-ahead)
  const rec = s.rebal.at(-1); assert.equal(rec.signalDate, '2026-10-30'); assert.equal(rec.gate, 'green');
  const inv = Object.entries(s.S.pos).reduce((a, [tk, p]) => a + p.sh * nov.rows.find((x) => x.tk === tk).open, 0), eq = s.S.cash + inv;
  assert.ok(Math.abs(inv / eq - 1) < 0.02);                  // เขียว: ลงหุ้น ~100% (ต้นทุน/แถบ 1% ทำให้คลาดเล็กน้อย)
  assert.ok(Math.abs(eq - L.CAPITAL * (1 - L.COST)) / L.CAPITAL < 0.0006);   // ซื้อ 100% ของพอร์ตครั้งเดียว → ต้นทุน ≈ 0.35%
  assert.ok(s.nav.at(-1).e > 0.99 && s.E.cash >= 0);         // EW benchmark ก็ซื้อ (พูล ~50 ตัว)
});

test('step: Gate แดง → ไม่ถือหุ้น; เดือนถัดไปเขียวกลับเข้า; ขายออกจริงเมื่อแดง', () => {
  let s = L.newState(); L.step(s, snap('2026-10-29', mkRows(), GREEN)); L.step(s, snap('2026-10-30', mkRows(0, 0.01), GREEN)); L.step(s, snap('2026-11-02', mkRows(0, 0.02), GREEN));
  assert.ok(Object.keys(s.S.pos).length >= 15);
  L.step(s, snap('2026-11-27', mkRows(0, 0.03), RED)); L.step(s, snap('2026-11-30', mkRows(0, 0.031), RED));
  const r = L.step(s, snap('2026-12-01', mkRows(0, 0.032), RED)); assert.equal(r.rebalanced, true);
  assert.equal(Object.keys(s.S.pos).length, 0); assert.equal(s.rebal.at(-1).gate, 'red'); assert.ok(s.S.cash > 0.95 * L.CAPITAL);   // ขายหมดเป็นเงินสด
});

test('step: idempotent ต่อวันที่เดิม และข้ามวันที่ตลาดหยุด (ราคาเหมือนเดิม)', () => {
  let s = L.newState(); L.step(s, snap('2026-10-29', mkRows()));
  const same = L.step(s, snap('2026-10-29', mkRows(0, 0.05))); assert.equal(same.changed, false);
  const holiday = L.step(s, snap('2026-10-30', mkRows())); assert.equal(holiday.reason, 'no-new-trading-day'); assert.equal(s.nav.length, 1);
  assert.equal(L.step(s, snap('2026-10-31', mkRows().slice(0, 10))).reason, 'no-data');
});

test('summary: ผลตอบแทนสะสมเทียบ EW และ SET', () => {
  let s = L.newState(); L.step(s, snap('2026-10-29', mkRows(), GREEN, 1500)); L.step(s, snap('2026-10-30', mkRows(0, 0.01), GREEN, 1515));
  const m = L.summary(s); assert.equal(m.start, '2026-10-29'); assert.ok(Math.abs(m.set - 0.01) < 1e-12); assert.equal(m.rebalances, 0);
});
