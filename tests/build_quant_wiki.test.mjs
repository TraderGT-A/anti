import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlyMd } from '../scripts/build_quant_wiki.mjs';

test('monthlyMd: ก่อนเริ่มนับ ไม่พังและมีข้อความรอ; เตือนเมื่อส่วนต่างเทียบ EW < -15 จุด', () => {
  const j0 = { asOf: '2026-10-11', gate: { state: 'yellow', exposure: 0.5 }, poolSize: 299, paper: { lastDate: '2026-10-10', summary: { days: 1 }, rebalances: [], holdings: 0 } };
  const m0 = monthlyMd(j0, '2026-10'); assert.ok(m0.includes('ยังไม่เริ่มนับ NAV')); assert.ok(!m0.includes('สัญญาณเตือน'));
  const j1 = { ...j0, paper: { summary: { start: '2026-11-02', asOf: '2026-12-01', strategy: -0.2, ew: -0.02, set: -0.03, excessVsEW: -0.18, excessVsSET: -0.17, rebalances: 1 }, rebalances: [{ d: '2026-11-02', signalDate: '2026-10-30', gate: 'green', turnover: 1, picks: [{ tk: 'AAA' }, { tk: 'BBB' }] }], holdings: 2 } };
  const m1 = monthlyMd(j1, '2026-12'); assert.ok(m1.includes('สัญญาณเตือนตาม PREREG')); assert.ok(m1.includes('AAA, BBB')); assert.ok(m1.includes('-18.00%'));
});
