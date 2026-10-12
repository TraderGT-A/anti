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

test('[RLS] notesRowKey: เพิ่มแถวใหม่ทุกครั้ง (ห้าม update) — key ใหม่เรียงตามเวลาได้และขึ้นต้นด้วย prefix', async () => {
  const { notesPrefix, notesRowKey } = await import('../rsdash/api/_lib/notes.js');
  assert.equal(notesPrefix('america'), 'notes|america|');
  const a = notesRowKey('america', 1791800000000), b = notesRowKey('america', 1791800000001);
  assert.ok(a.startsWith('notes|america|') && b > a && a.length === b.length);
  assert.ok(notesRowKey('america', 999) < notesRowKey('america', 1791800000000));   // zero-pad ให้เรียงแบบข้อความได้
});

test('toPrune: เก็บ N แถวล่าสุด (เรียงตาม dt) ที่เหลือคืนไว้ลบ', async () => {
  const { toPrune } = await import('../rsdash/api/_lib/notes.js');
  const dts = ['notes|america|000000000000003', 'notes|america|000000000000001', 'notes|america|000000000000004', 'notes|america|000000000000002'];
  assert.deepEqual(toPrune(dts, 3), ['notes|america|000000000000001']);
  assert.deepEqual(toPrune(dts.slice(0, 2), 3), []);
});
