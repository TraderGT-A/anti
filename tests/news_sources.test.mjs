import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { symbolFor, parseRss, parseSecSubmissions, parseSecTickers, parseReddit, fetchTicker } from '../scripts/news/sources.mjs';

const fx = (f) => readFileSync(new URL('./fixtures/news/' + f, import.meta.url), 'utf8');
const noSleep = async () => {};

test('symbolFor: BRK.B → BRK-B', () => {
  assert.equal(symbolFor('BRK.B'), 'BRK-B');
  assert.equal(symbolFor('NVDA'), 'NVDA');
});

test('parseRss yahoo: title/url/published + decode entity และ CDATA', () => {
  const it = parseRss(fx('yahoo.xml'), { ticker: 'NVDA', source: 'yahoo' });
  assert.equal(it.length, 3);
  assert.deepEqual(it[0], { ticker: 'NVDA', source: 'yahoo', title: 'Nvidia & AMD rally on AI demand', url: 'https://finance.yahoo.com/news/nvidia-amd-rally-143000.html?.tsrc=rss', published: '2026-10-12' });
  assert.equal(it[1].title, 'Morgan Stanley lifts NVDA target to $250');
});

test('parseRss gnews: แยก " - Publisher" ออกจาก title ไป meta.publisher', () => {
  const it = parseRss(fx('gnews.xml'), { ticker: 'NVDA', source: 'gnews' });
  assert.equal(it.length, 2);
  assert.equal(it[0].title, 'Nvidia & AMD rally on AI demand');
  assert.equal(it[0].meta.publisher, 'Reuters');
  assert.equal(it[1].title, 'Why Nvidia stock is soaring this year');
  assert.equal(it[1].meta.publisher, 'The Motley Fool');
});

test('parseRss: หน้า HTML error คืน [] ไม่ throw', () => {
  assert.deepEqual(parseRss(fx('error.html'), { ticker: 'NVDA', source: 'yahoo' }), []);
  assert.deepEqual(parseRss('', { ticker: 'NVDA', source: 'yahoo' }), []);
});

test('parseSecSubmissions: เฉพาะ 8-K/10-Q/10-K/4 ที่ >= since และ url ถูกรูปแบบ', () => {
  const it = parseSecSubmissions(JSON.parse(fx('sec_submissions.json')), { ticker: 'NVDA', cik: '0001045810', sinceISO: '2026-09-01' });
  assert.deepEqual(it.map((x) => x.meta.form), ['8-K', '4']);
  assert.equal(it[0].url, 'https://www.sec.gov/Archives/edgar/data/1045810/000104581026000101/nvda-20261008.htm');
  assert.equal(it[0].title, '8-K: 8-K');
  assert.equal(it[1].title, '4: 4');
  assert.equal(it[0].published, '2026-10-08');
});

test('parseSecSubmissions: JSON เสีย/ไม่มี filings คืน []', () => {
  assert.deepEqual(parseSecSubmissions({}, { ticker: 'NVDA', cik: '1', sinceISO: '2026-01-01' }), []);
  assert.deepEqual(parseSecSubmissions(null, { ticker: 'NVDA', cik: '1', sinceISO: '2026-01-01' }), []);
});

test('parseSecTickers: Map symbol → CIK 10 หลัก', () => {
  const m = parseSecTickers(JSON.parse(fx('sec_tickers.json')));
  assert.equal(m.get('NVDA'), '0001045810');
  assert.equal(m.get('BRK-B'), '0001067983');
});

test('parseReddit: meta.score/sub, url เต็ม; ข้อความไม่ใช่ JSON คืน []', () => {
  const it = parseReddit(fx('reddit.json'), { ticker: 'NVDA', sub: 'stocks' });
  assert.equal(it.length, 2);
  assert.equal(it[0].url, 'https://www.reddit.com/r/stocks/comments/abc123/nvda_earnings_preview/');
  assert.equal(it[0].meta.score, 412);
  assert.equal(it[0].meta.sub, 'stocks');
  assert.equal(it[0].published, '2026-10-12');
  assert.deepEqual(parseReddit('not json', { ticker: 'NVDA', sub: 'stocks' }), []);
  assert.deepEqual(parseReddit(fx('error.html'), { ticker: 'NVDA', sub: 'stocks' }), []);
});

function fakeFetch(map, calls) {
  return async (url) => {
    calls.push(url);
    for (const [k, v] of Object.entries(map)) if (url.includes(k)) return typeof v === 'number' ? { ok: false, status: v, text: async () => fx('error.html') } : { ok: true, status: 200, text: async () => v };
    return { ok: false, status: 404, text: async () => '' };
  };
}

test('fetchTicker: yahoo 429 → แหล่งอื่นยังครบ, errors มี yahoo 1 บรรทัด, กรอง since', async () => {
  const calls = [];
  const f = fakeFetch({ 'feeds.finance.yahoo.com': 429, 'news.google.com': fx('gnews.xml'), 'data.sec.gov': fx('sec_submissions.json'), 'reddit.com/r/': fx('reddit.json') }, calls);
  const out = await fetchTicker('NVDA', { sinceISO: '2026-09-01', cikMap: new Map([['NVDA', '0001045810']]), secUA: 'Test test@example.com', fetchFn: f, sleep: noSleep });
  assert.equal(out.errors.length, 1);
  assert.match(out.errors[0], /yahoo/);
  const bySrc = (s) => out.items.filter((x) => x.source === s).length;
  assert.equal(bySrc('yahoo'), 0);
  assert.equal(bySrc('gnews'), 2);
  assert.equal(bySrc('sec'), 2);
  assert.equal(bySrc('reddit'), 3);   // 3 subreddit × 1 โพสต์ใหม่ (โพสต์เก่าถูกกรอง)
  assert.ok(out.items.every((x) => x.published >= '2026-09-01'));
});

test('fetchTicker: ไม่มี secUA → ไม่เรียก data.sec.gov และบอกเหตุใน errors', async () => {
  const calls = [];
  const f = fakeFetch({ 'feeds.finance.yahoo.com': fx('yahoo.xml'), 'news.google.com': fx('gnews.xml'), 'reddit.com/r/': fx('reddit.json') }, calls);
  const out = await fetchTicker('NVDA', { sinceISO: '2026-09-01', cikMap: new Map([['NVDA', '0001045810']]), secUA: '', fetchFn: f, sleep: noSleep });
  assert.ok(!calls.some((u) => u.includes('data.sec.gov')));
  assert.ok(out.errors.includes('sec: skipped (NEWS_SEC_UA not set)'));
});

test('fetchTicker: BRK.B ใช้สัญลักษณ์ BRK-B ใน URL', async () => {
  const calls = [];
  const f = fakeFetch({}, calls);
  await fetchTicker('BRK.B', { sinceISO: '2026-09-01', cikMap: new Map(), secUA: '', fetchFn: f, sleep: noSleep });
  assert.ok(calls.some((u) => u.includes('s=BRK-B')));
  assert.ok(!calls.some((u) => u.includes('BRK.B')));
});
