import test from 'node:test';
import assert from 'node:assert/strict';
import { yahooSymbol, parseAssetProfile, buildShards } from '../scripts/news/profiles.mjs';
import '../rsdash/about.js';
const A = globalThis.About;

test('yahooSymbol: ไทยเติม .BK, US จุดเป็นขีด', () => {
  assert.equal(yahooSymbol('PTT', 'thailand'), 'PTT.BK');
  assert.equal(yahooSymbol('BRK.B', 'america'), 'BRK-B');
  assert.equal(yahooSymbol('MRNA', 'america'), 'MRNA');
});

test('parseAssetProfile: ได้ longBusinessSummary, ไม่มี/เสีย → null', () => {
  const ok = { quoteSummary: { result: [{ assetProfile: { longBusinessSummary: '  Moderna, Inc. provides mRNA medicines.  ' } }] } };
  assert.equal(parseAssetProfile(ok), 'Moderna, Inc. provides mRNA medicines.');
  assert.equal(parseAssetProfile({ quoteSummary: { result: [{ assetProfile: {} }] } }), null);
  assert.equal(parseAssetProfile({ quoteSummary: { result: null, error: { code: 'Not Found' } } }), null);
  assert.equal(parseAssetProfile(null), null);
});

test('About.shardOf: ตัวอักษรแรก A-Z, ขึ้นต้นด้วยตัวเลข/อื่น → "0"', () => {
  assert.equal(A.shardOf('MRNA'), 'M');
  assert.equal(A.shardOf('bbl'), 'B');
  assert.equal(A.shardOf('3K-BAT'), '0');
});

test('buildShards: แยกไฟล์ตาม shard และเรียง key', () => {
  const s = buildShards({ MRNA: 'a', MU: 'b', AAPL: 'c', '7UP': 'd' });
  assert.deepEqual(Object.keys(s).sort(), ['0', 'A', 'M']);
  assert.deepEqual(s.M, { MRNA: 'a', MU: 'b' });
});

test('About.aboutHtml: escape HTML, ยาวเกินพับไว้ด้วย <details>, ไม่มีข้อมูล → ""', () => {
  assert.equal(A.aboutHtml(undefined), '');
  const short = A.aboutHtml('Makes <b>chips</b>.');
  assert.ok(!short.includes('<b>chips'));
  assert.match(short, /เกี่ยวกับบริษัท/);
  const long = A.aboutHtml('x'.repeat(50) + '. ' + 'y'.repeat(600));
  assert.match(long, /<details/);
});
