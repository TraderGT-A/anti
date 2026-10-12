import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeNotes, validRows } from '../rsdash/api/_lib/notes.js';

test('mergeNotes: แถวใหม่ไม่มี summary → เก็บ summary เดิมไว้', () => {
  const old = [{ ticker: 'A', news_7d: 1, summary: 'why A', summary_at: '2026-10-10' }];
  const out = mergeNotes(old, [{ ticker: 'A', news_7d: 5 }]);
  assert.deepEqual(out, [{ ticker: 'A', news_7d: 5, summary: 'why A', summary_at: '2026-10-10' }]);
});

test('mergeNotes: แถวใหม่มี summary → ใช้ของใหม่', () => {
  const out = mergeNotes([{ ticker: 'A', summary: 'old' }], [{ ticker: 'A', summary: 'new', summary_at: '2026-10-12' }]);
  assert.equal(out[0].summary, 'new');
});

test('mergeNotes: หุ้นที่ไม่อยู่ในชุดใหม่ (หลุด Top20) ถูกตัดออก', () => {
  const out = mergeNotes([{ ticker: 'A' }, { ticker: 'GONE', summary: 'x' }], [{ ticker: 'A' }]);
  assert.deepEqual(out.map((r) => r.ticker), ['A']);
});

test('validRows: ต้องเป็น array ≤100 แถว และ ticker เป็นตัวอักษรสั้น ๆ', () => {
  assert.equal(validRows([{ ticker: 'BRK.B' }]), true);
  assert.equal(validRows('x'), false);
  assert.equal(validRows([{ ticker: '<script>' }]), false);
  assert.equal(validRows(Array.from({ length: 101 }, (_, i) => ({ ticker: 'T' + i }))), false);
});
