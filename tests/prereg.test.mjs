import test from 'node:test';
import assert from 'node:assert/strict';
import { check, slugOf } from '../scripts/prereg.mjs';

test('slugOf แยกชนิด/slug/วันที่', () => {
  assert.deepEqual(slugOf('PREREG_setups_th_2026-10-10.md'), { kind: 'PREREG', slug: 'setups_th', date: '2026-10-10' });
  assert.equal(slugOf('README.md'), null);
});

test('check: PREREG ต้องมีและ commit ก่อน REPORT; รายงานเก่าก่อนวิธีนี้ไม่ตรวจ', () => {
  const t = { 'PREREG_a_2026-10-11.md': 100, 'REPORT_a_2026-10-12.md': 200, 'PREREG_b_2026-10-11.md': 300, 'REPORT_b_2026-10-12.md': 250, 'REPORT_c_2026-10-12.md': 400, 'REPORT_old_2026-10-06.md': 1, 'PREREG_d_2026-10-11.md': null, 'REPORT_d_2026-10-12.md': 500 };
  const bad = check(Object.keys(t), (f) => t[f]);
  assert.equal(bad.length, 3); assert.ok(bad.some((b) => b.includes('PREREG_b') && b.includes('หลัง')));
  assert.ok(bad.some((b) => b.includes('REPORT_c') && b.includes('ไม่มี PREREG'))); assert.ok(bad.some((b) => b.includes('PREREG_d') && b.includes('ยังไม่ได้ commit')));
});
