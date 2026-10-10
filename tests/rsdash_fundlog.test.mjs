import test from 'node:test';
import assert from 'node:assert/strict';
import '../rsdash/fundlog.js';
const F = globalThis.FundLog;

test('pack: ปัดเศษ, ค่าว่างเป็น null', () => {
  assert.deepEqual(F.pack([1.234567, 12.345, 1000.4, null, 1787775600.2]), [1.2346, 12.3, 1000, null, 1787775600]);
  assert.deepEqual(F.pack([NaN, undefined, 'x', null, null]), [null, null, null, null, null]);
});

test('diff: ครั้งแรกบันทึกทั้งหมด, ซ้ำไม่บันทึก, เปลี่ยนจึงบันทึก, หายจากสแกนคงค่าเดิม', () => {
  const a = { AAA: [1, 10, 100, 5, 1], BBB: [2, 20, 200, 6, 2], EMPTY: [null, null, null, null, null] };
  let r = F.diff({}, a); assert.equal(r.added, 2); assert.equal(r.changes.length, 2); assert.ok(!('EMPTY' in r.latest));
  r = F.diff(r.latest, a); assert.equal(r.changes.length, 0);
  r = F.diff(r.latest, { AAA: [1.5, 15, 150, 5, 3] }); assert.equal(r.changed, 1); assert.deepEqual(r.latest.BBB, [2, 20, 200, 6, 2]); assert.deepEqual(r.changes[0], { tk: 'AAA', v: [1.5, 15, 150, 5, 3] });
});
