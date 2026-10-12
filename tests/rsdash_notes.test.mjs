import test from 'node:test';
import assert from 'node:assert/strict';
import '../rsdash/notes.js';
const N = globalThis.Notes;

const row = {
  ticker: 'NVDA', market: 'america', news_7d: 6, reddit_7d: 2,
  headlines: [
    { title: '<script>alert(1)</script> Nvidia beats', url: 'https://reuters.com/x', source: 'Reuters', date: '2026-10-12' },
    { title: 'bad link', url: 'javascript:alert(1)', source: 'Yahoo', date: '2026-10-11' },
  ],
  summary: '_อัปเดต 2026-10-14 · อธิบายย้อนหลัง_\n- **ข้อเท็จจริง:** งบดี [Reuters](https://reuters.com/x)\n- ลิงก์อันตราย [x](javascript:alert(1)) <img src=x onerror=alert(1)>',
  summary_at: '2026-10-14', updated_at: '2026-10-14T10:00:00Z',
};

test('esc ทำให้ HTML เป็นข้อความ', () => {
  const s = N.esc('<img onerror=x> & "q" \'s\'');
  assert.ok(!s.includes('<img'));
  assert.equal(s, '&lt;img onerror=x&gt; &amp; &quot;q&quot; &#39;s&#39;');
});

test('notesHtml: ไม่มี <script>, <img, href="javascript: จากข้อมูลภายนอก', () => {
  const h = N.notesHtml(row);
  assert.ok(!h.includes('<script'));
  assert.ok(!h.includes('<img'));
  assert.ok(!/href="javascript:/i.test(h));
});

test('notesHtml: ลิงก์ https กลายเป็น <a> เปิดแท็บใหม่, **ตัวหนา** เป็น <b>', () => {
  const h = N.notesHtml(row);
  assert.match(h, /<a href="https:\/\/reuters\.com\/x" target="_blank" rel="noopener noreferrer"[^>]*>Reuters<\/a>/);
  assert.match(h, /<b>ข้อเท็จจริง:<\/b>/);
  assert.match(h, /อธิบายย้อนหลัง ไม่ใช่สัญญาณซื้อขาย/);
});

test('notesHtml: ไม่มี summary → "ยังไม่มีสรุป" แต่ยังแสดงหัวข่าว', () => {
  const h = N.notesHtml({ ...row, summary: null });
  assert.match(h, /ยังไม่มีสรุป/);
  assert.match(h, /Nvidia beats/);
});

test('badgeHtml: ไม่มีแถว → ""; มีแถว → ปุ่ม 📰 จำนวนข่าว 7 วัน เรียก toggleNotes', () => {
  assert.equal(N.badgeHtml(undefined, 'america', 'NVDA'), '');
  const b = N.badgeHtml(row, 'america', 'NVDA');
  assert.match(b, /📰 6/);
  assert.match(b, /toggleNotes\('america','NVDA'\)/);
  assert.match(b, /event\.stopPropagation\(\)/);
});

test('panelId ปลอดภัยสำหรับ ticker มีจุด', () => {
  assert.equal(N.panelId('america', 'BRK.B'), 'notes_america_BRK_B');
});

test('[bug: แผงหายเมื่อตารางวาดใหม่] panelHtml: เปิดอยู่ → แสดงเนื้อหาเลย, ปิด → ซ่อนและว่าง, ไม่มีข้อมูล → ""', () => {
  const open = N.panelHtml(row, 'america', 'NVDA', true, 'table');
  assert.match(open, /^<tr id="notes_america_NVDA"/);
  assert.ok(!open.includes('display:none'));
  assert.match(open, /Nvidia beats/);
  const closed = N.panelHtml(row, 'america', 'NVDA', false, 'card');
  assert.match(closed, /^<div id="notes_america_NVDA"/);
  assert.match(closed, /display:none/);
  assert.ok(!closed.includes('Nvidia beats'));
  assert.equal(N.panelHtml(undefined, 'america', 'NVDA', true, 'table'), '');
});
