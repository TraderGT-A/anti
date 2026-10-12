import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { itemKey, normTitle, dedupe, newState, loadState, saveState, updateMembership, sinceFor, pruneRecent, fileNameFor, renderFeedBlock, upsertStockMd, renderIndexMd } from '../scripts/news/store.mjs';

const it = (o) => ({ ticker: 'NVDA', source: 'yahoo', title: 'Nvidia rallies', url: 'https://a.com/x', published: '2026-10-12', ...o });

test('itemKey ไม่สนใจ utm_* และ #fragment', () => {
  assert.equal(itemKey(it({ url: 'https://a.com/x?utm_source=rss&id=1#top' })), itemKey(it({ url: 'https://a.com/x?id=1' })));
  assert.notEqual(itemKey(it({ url: 'https://a.com/x?id=1' })), itemKey(it({ url: 'https://a.com/x?id=2' })));
});

test('normTitle ตัดเครื่องหมายและช่องว่าง', () => {
  assert.equal(normTitle('  Nvidia & AMD:  Rally! '), 'nvidia amd rally');
});

test('dedupe: Yahoo + Google News ข่าวเดียวกัน → 1; รันซ้ำด้วย state เดิม → 0', () => {
  const s = newState();
  const batch = [it({ title: 'Nvidia & AMD rally on AI demand' }), it({ source: 'gnews', url: 'https://news.google.com/rss/articles/X', title: 'Nvidia & AMD Rally on AI demand' })];
  const first = dedupe(batch, s);
  assert.equal(first.length, 1);
  s.recent.NVDA = first;
  assert.equal(dedupe(batch, s).length, 0);
});

test('saveState/loadState: ไม่มีไฟล์ → state ว่าง; เขียนแล้วอ่านกลับได้เหมือนเดิม', () => {
  const dir = mkdtempSync(join(tmpdir(), 'news-'));
  const p = join(dir, 'state.json');
  assert.deepEqual(loadState(p), newState());
  const s = newState(); s.lastRun = '2026-10-12'; s.seen.k = '2026-10-12';
  saveState(p, s);
  assert.ok(existsSync(p));
  assert.deepEqual(loadState(p), s);
});

test('membership: เข้า → หลุด → กลับเข้า (since รีเซ็ต, ลบ left)', () => {
  const s = newState();
  const u = (...t) => t.map((x) => ({ ticker: x, name: x, lists: ['YTD'] }));
  assert.deepEqual(updateMembership(s, u('A', 'B'), '2026-10-01'), { entered: ['A', 'B'], left: [] });
  assert.deepEqual(updateMembership(s, u('B', 'C'), '2026-10-02'), { entered: ['C'], left: ['A'] });
  assert.equal(s.members.A.left, '2026-10-02');
  assert.equal(s.members.B.since, '2026-10-01');
  assert.deepEqual(updateMembership(s, u('A', 'B', 'C'), '2026-10-03'), { entered: ['A'], left: [] });
  assert.equal(s.members.A.since, '2026-10-03');
  assert.equal(s.members.A.left, undefined);
});

test('sinceFor: ตัวใหม่ย้อน 30 วัน, ตัวเดิมเริ่มจาก lastRun (ปิดเครื่องหลายวันก็ย้อนถึง)', () => {
  const s = newState();
  updateMembership(s, [{ ticker: 'A', name: 'A', lists: ['YTD'] }], '2026-10-01');
  assert.equal(sinceFor(s, 'A', '2026-10-01'), '2026-09-01');
  s.lastRun = '2026-10-01';
  assert.equal(sinceFor(s, 'A', '2026-10-05'), '2026-10-01');
});

test('pruneRecent: recent เก็บ 30 วัน, seen เก็บ 120 วัน', () => {
  const s = newState();
  s.recent.A = [it({ published: '2026-10-10' }), it({ published: '2026-08-01' })];
  s.seen = { new: '2026-10-01', old: '2026-05-01' };
  pruneRecent(s, '2026-10-12');
  assert.equal(s.recent.A.length, 1);
  assert.deepEqual(Object.keys(s.seen), ['new']);
});

test('fileNameFor: BRK.B → BRK-B.md', () => {
  assert.equal(fileNameFor('BRK.B'), 'BRK-B.md');
  assert.equal(fileNameFor('NVDA'), 'NVDA.md');
});

test('renderFeedBlock: ป้ายแหล่ง + ลิงก์', () => {
  const b = renderFeedBlock('2026-10-12', [
    it({}), it({ source: 'gnews', meta: { publisher: 'Reuters' } }), it({ source: 'sec', title: '8-K: 8-K', meta: { form: '8-K' } }),
    it({ source: 'reddit', meta: { sub: 'stocks', score: 412 } }),
  ]);
  assert.match(b, /^### 2026-10-12\n/);
  assert.match(b, /- \[Yahoo\] Nvidia rallies \(\[ลิงก์\]\(https:\/\/a\.com\/x\)\)/);
  assert.match(b, /- \[Reuters\] /);
  assert.match(b, /- \[SEC 8-K\] 8-K: 8-K/);
  assert.match(b, /- \[Reddit r\/stocks ▲412\] /);
});

const meta = { ticker: 'NVDA', name: 'NVIDIA Corp', lists: ['YTD', 'RS'], since: '2026-10-12', lastFetch: '2026-10-12' };

test('upsertStockMd: สร้างใหม่มีครบ 3 หัวข้อ + frontmatter', () => {
  const md = upsertStockMd(null, meta, renderFeedBlock('2026-10-12', [it({})]));
  assert.match(md, /^---\nticker: NVDA\nmarket: america\nin_top20_since: 2026-10-12\nlists: \[YTD, RS\]\nlast_fetch: 2026-10-12\n---\n# NVDA — NVIDIA Corp\n/);
  for (const h of ['## ทำไมติด Top20', '## มุมมองจาก X', '## Feed', '### 2026-10-12']) assert.ok(md.includes(h), h);
});

test('upsertStockMd: ส่วนที่เขียนเองก่อน ## Feed ไม่เปลี่ยนแม้แต่ไบต์เดียว, frontmatter อัปเดต', () => {
  let md = upsertStockMd(null, meta, renderFeedBlock('2026-10-12', [it({})]));
  md = md.replace('_ยังไม่มีสรุป — สั่ง "สรุป Top20 US"_', '_อัปเดต 2026-10-12 · อธิบายย้อนหลัง_\n- **ข้อเท็จจริง:** งบดี [แหล่ง](https://x.com)\n\nโน้ตผมเอง: ระวัง gap');
  const body = (s) => s.slice(s.indexOf('# NVDA'), s.indexOf('## Feed'));
  const before = body(md);
  let next = upsertStockMd(md, { ...meta, lastFetch: '2026-10-13' }, renderFeedBlock('2026-10-13', [it({ title: 'New one', url: 'https://a.com/y' })]));
  next = upsertStockMd(next, { ...meta, lastFetch: '2026-10-14', left: '2026-10-14' }, null);
  assert.equal(body(next), before);
  assert.match(next, /last_fetch: 2026-10-14/);
  assert.match(next, /left_top20: 2026-10-14/);
  assert.ok(next.indexOf('### 2026-10-13') < next.indexOf('### 2026-10-12'));   // ใหม่สุดอยู่บน
});

test('upsertStockMd: วันเดียวกันสองรอบ → มีหัว ### วันนั้นหัวเดียว และมีทั้งสองข่าว', () => {
  let md = upsertStockMd(null, meta, renderFeedBlock('2026-10-14', [it({ title: 'First' })]));
  md = upsertStockMd(md, meta, renderFeedBlock('2026-10-14', [it({ title: 'Second', url: 'https://a.com/2' })]));
  assert.equal(md.split('### 2026-10-14').length - 1, 1);
  assert.ok(md.includes('First') && md.includes('Second'));
});

test('renderIndexMd: ลิงก์ [[BRK-B]] + นับข่าว 7 วัน + ตารางหลุดแล้ว', () => {
  const s = newState();
  updateMembership(s, [{ ticker: 'BRK.B', name: 'Berkshire', lists: ['RS'] }, { ticker: 'OLD', name: 'Old Co', lists: ['YTD'] }], '2026-10-01');
  updateMembership(s, [{ ticker: 'BRK.B', name: 'Berkshire', lists: ['RS'] }], '2026-10-10');
  s.recent['BRK.B'] = [it({ ticker: 'BRK.B', published: '2026-10-11' }), it({ ticker: 'BRK.B', source: 'reddit', published: '2026-10-11', meta: { sub: 'stocks', score: 1 } }), it({ ticker: 'BRK.B', published: '2026-09-20' })];
  const md = renderIndexMd(s, '2026-10-12');
  assert.match(md, /\| \[\[BRK-B\]\] \| Berkshire \| RS \| 2026-10-01 \| 1 \| 1 \|/);
  assert.match(md, /## หลุดแล้ว/);
  assert.match(md, /\| \[\[OLD\]\] \| Old Co \| 2026-10-01 \| 2026-10-10 \|/);
  assert.match(md, /last_fetch: 2026-10-12/);
});

// ---- final review fixes ----
test('[review C1] ไฟล์จบที่ "## Feed" ไม่มี newline → frontmatter ยังอยู่บนสุด และ block อยู่ใต้ Feed', () => {
  const base = upsertStockMd(null, meta, null).replace(/\n$/, '');   // จบที่ "## Feed" พอดี
  const md = upsertStockMd(base, meta, renderFeedBlock('2026-10-12', [it({ title: 'T' })]));
  assert.match(md, /^---\nticker: NVDA/);
  assert.ok(md.indexOf('## Feed') < md.indexOf('### 2026-10-12'));
});

test('[review I3] SEC สองฉบับ title เหมือนกันแต่ URL ต่าง → เก็บทั้งคู่', () => {
  const s = newState();
  const a = it({ source: 'sec', title: '8-K: 8-K', url: 'https://sec.gov/a', meta: { form: '8-K' } });
  const b = it({ source: 'sec', title: '8-K: 8-K', url: 'https://sec.gov/b', meta: { form: '8-K' } });
  assert.equal(dedupe([a, b], s).length, 2);
  s.recent.NVDA = [a];
  assert.equal(dedupe([it({ source: 'sec', title: '8-K: 8-K', url: 'https://sec.gov/c', meta: { form: '8-K' } })], s).length, 1);
});

test('[review I4] property ที่ผู้ใช้เพิ่มใน frontmatter (tags) ไม่หาย', () => {
  let md = upsertStockMd(null, meta, null).replace('last_fetch: 2026-10-12\n', 'last_fetch: 2026-10-12\ntags: [ai, mine]\n');
  md = upsertStockMd(md, { ...meta, lastFetch: '2026-10-13', left: '2026-10-13' }, null);
  assert.match(md, /tags: \[ai, mine\]/);
  assert.match(md, /last_fetch: 2026-10-13/);
  assert.match(md, /left_top20: 2026-10-13/);
  assert.equal(md.match(/last_fetch:/g).length, 1);
});

test('[review I6] state file เสีย → เริ่ม state ใหม่ และย้ายไฟล์เสียไปเป็น .corrupt-*', async () => {
  const { writeFileSync, readdirSync } = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'news-'));
  const p = join(dir, 'state.json');
  writeFileSync(p, '{"v":1,"seen":{"a"');
  assert.deepEqual(loadState(p), newState());
  assert.ok(readdirSync(dir).some((f) => f.startsWith('state.json.corrupt-')));
});
