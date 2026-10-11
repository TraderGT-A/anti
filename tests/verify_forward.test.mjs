import test from 'node:test';
import assert from 'node:assert/strict';
import '../rsdash/trendlib.js';
import '../rsdash/leaders.js';
import { verifyRebalance } from '../scripts/verify_forward.mjs';
const L = globalThis.Leaders;
const mkRows = (move = 0) => Array.from({ length: 100 }, (_, i) => { const close = (100 + i) * (1 + move * (i % 7 === 0 ? 1 : 0.2)); return { tk: 'S' + String(i).padStart(3, '0'), name: 'S' + i, close, open: close * 0.999, hi52: close / (0.6 + 0.004 * i), p1y: 10 + i, p1m: 2, turn: (i + 1) * 1e6 }; });
const G = { price: 110, sma50: 100, sma200: 90 };

test('verifyRebalance: ตรงกับ state จาก step จริง และจับความผิดพลาดได้', () => {
  const s = L.newState(); L.step(s, { date: '2026-10-29', rows: mkRows(), gate: G, setClose: 1 }); L.step(s, { date: '2026-10-30', rows: mkRows(0.01), gate: G, setClose: 1 });
  const sigSnap = s.lastSnap; L.step(s, { date: '2026-11-02', rows: mkRows(0.02), gate: G, setClose: 1 });
  const rb = s.rebal.at(-1), snap = { date: sigSnap.date, gate: sigSnap.gate, rows: sigSnap.rows };
  assert.deepEqual(verifyRebalance(rb, snap), []);
  const bad = { ...rb, picks: rb.picks.slice(1) }; assert.ok(verifyRebalance(bad, snap).some((x) => x.startsWith('ขาด')));
  assert.ok(verifyRebalance({ ...rb, gate: 'red' }, snap).some((x) => x.startsWith('gate')));
  assert.ok(verifyRebalance({ ...rb, signalDate: '2026-10-29' }, snap).some((x) => x.startsWith('signalDate')));
});
