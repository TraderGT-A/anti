import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSummary, buildRow, pushRows } from '../scripts/news/push.mjs';

const mdWith = (summary) => `---\nticker: NVDA\n---\n# NVDA — NVIDIA\n\n## ทำไมติด Top20\n${summary}\n\n## มุมมองจาก X\n- @a: x\n\n## Feed\n### 2026-10-12\n- [Yahoo] x\n`;

test('extractSummary: เนื้อหาใต้ "ทำไมติด Top20" + วันที่จากบรรทัด _อัปเดต', () => {
  const s = extractSummary(mdWith('_อัปเดต 2026-10-14 · อธิบายย้อนหลัง ไม่ใช่การพิสูจน์สาเหตุ_\n- **ข้อเท็จจริง:** งบดี [แหล่ง](https://x.com)'));
  assert.equal(s.at, '2026-10-14');
  assert.equal(s.text, '_อัปเดต 2026-10-14 · อธิบายย้อนหลัง ไม่ใช่การพิสูจน์สาเหตุ_\n- **ข้อเท็จจริง:** งบดี [แหล่ง](https://x.com)');
  assert.ok(!s.text.includes('มุมมองจาก X'));
});

test('extractSummary: placeholder หรือไม่มีหัวข้อ → null', () => {
  assert.equal(extractSummary(mdWith('_ยังไม่มีสรุป — สั่ง "สรุป Top20 US"_')), null);
  assert.equal(extractSummary('# no sections'), null);
});

test('extractSummary: ตัดที่ 1500 ตัวอักษร', () => {
  const s = extractSummary(mdWith('_อัปเดต 2026-10-14_\n' + 'ก'.repeat(3000)));
  assert.equal(s.text.length, 1500);
});

const items = [
  { ticker: 'NVDA', source: 'yahoo', title: 'A', url: 'https://a/1', published: '2026-10-12' },
  { ticker: 'NVDA', source: 'gnews', title: 'B', url: 'https://a/2', published: '2026-10-11', meta: { publisher: 'Reuters' } },
  { ticker: 'NVDA', source: 'reddit', title: 'R', url: 'https://r/1', published: '2026-10-12', meta: { sub: 'stocks', score: 9 } },
  { ticker: 'NVDA', source: 'sec', title: '8-K: 8-K', url: 'https://s/1', published: '2026-10-10', meta: { form: '8-K' } },
  { ticker: 'NVDA', source: 'yahoo', title: 'C', url: 'https://a/3', published: '2026-10-09' },
  { ticker: 'NVDA', source: 'yahoo', title: 'D', url: 'https://a/4', published: '2026-10-08' },
  { ticker: 'NVDA', source: 'yahoo', title: 'E', url: 'https://a/5', published: '2026-10-07' },
  { ticker: 'NVDA', source: 'yahoo', title: 'OLD', url: 'https://a/6', published: '2026-09-20' },
];
const member = { name: 'NVIDIA', since: '2026-10-01', lists: ['YTD'] };

test('buildRow: นับ 7 วันแยก reddit, หัวข่าว 5 ล่าสุดที่ไม่ใช่ reddit, ไม่ใส่ summary เมื่อ null', () => {
  const r = buildRow('NVDA', member, items, null, '2026-10-12');
  assert.equal(r.ticker, 'NVDA');
  assert.equal(r.market, 'america');
  assert.equal(r.in_top20_since, '2026-10-01');
  assert.equal(r.news_7d, 6);
  assert.equal(r.reddit_7d, 1);
  assert.deepEqual(r.headlines.map((h) => h.title), ['A', 'B', '8-K: 8-K', 'C', 'D']);
  assert.deepEqual(r.headlines[1], { title: 'B', url: 'https://a/2', source: 'Reuters', date: '2026-10-11' });
  assert.ok(!('summary' in r) && !('summary_at' in r));
  assert.ok(r.updated_at);
});

test('buildRow: มี summary → ใส่ summary + summary_at', () => {
  const r = buildRow('NVDA', member, items, { text: 'x', at: '2026-10-14' }, '2026-10-14');
  assert.equal(r.summary, 'x');
  assert.equal(r.summary_at, '2026-10-14');
});

test('pushRows: POST ไป rsdash /api/notes ด้วย x-write-key และส่งทุกแถวใน request เดียว', async () => {
  let req, n = 0;
  const fake = async (url, init) => { n++; req = { url, init }; return { ok: true, status: 200, text: async () => '' }; };
  const rows = [{ ticker: 'A', summary: 's', summary_at: 'd' }, { ticker: 'B' }];
  const out = await pushRows(rows, { base: 'https://rs.example', key: 'K', fetchFn: fake });
  assert.deepEqual(out, { ok: true, status: 200 });
  assert.equal(n, 1);
  assert.equal(req.url, 'https://rs.example/api/notes?market=america');
  assert.equal(req.init.method, 'POST');
  assert.equal(req.init.headers['x-write-key'], 'K');
  assert.deepEqual(JSON.parse(req.init.body), { rows });
  assert.ok(req.init.signal instanceof AbortSignal);
});

test('pushRows: HTTP error → ok:false ไม่ throw', async () => {
  const fake = async () => ({ ok: false, status: 401, text: async () => 'bad key' });
  const out = await pushRows([{ ticker: 'NVDA' }], { base: 'https://p', key: 'K', fetchFn: fake });
  assert.equal(out.ok, false);
  assert.equal(out.status, 401);
});

test('[review I5] network error ตอน push → ok:false ไม่ throw', async () => {
  const fake = async () => { throw new TypeError('fetch failed'); };
  const out = await pushRows([{ ticker: 'A' }], { base: 'https://p', key: 'K', fetchFn: fake });
  assert.equal(out.ok, false);
  assert.equal(out.status, 0);
});
