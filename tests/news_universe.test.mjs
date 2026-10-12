import test from 'node:test';
import assert from 'node:assert/strict';
import { pickUniverse, fetchUniverse } from '../scripts/news/universe.mjs';

// 50 แถว: pYTD สูงสุดคือ T49..T30, score สูงสุดคือ T44..T25 → ทับกัน 15 ตัว (T30..T44)
const rows = Array.from({ length: 50 }, (_, i) => ({ ticker: 'T' + i, name: 'N' + i, pYTD: i * 10, score: i + 5 > 49 ? -1 : i + 5 }));

test('pickUniverse = Top20 YTD ∪ Top20 RS, ตัวทับมีทั้งสอง list', () => {
  const u = pickUniverse(rows, 20);
  assert.equal(u.length, 25);
  assert.deepEqual(u.find((x) => x.ticker === 'T35').lists, ['YTD', 'RS']);
  assert.deepEqual(u.find((x) => x.ticker === 'T49').lists, ['YTD']);
  assert.deepEqual(u.find((x) => x.ticker === 'T25').lists, ['RS']);
  assert.equal(u[0].ticker, 'T49');            // YTD rank 1 มาก่อน
  assert.equal(u[u.length - 1].lists[0], 'RS'); // ตัวที่อยู่เฉพาะ RS อยู่ท้าย
});

test('แถวที่ pYTD/score ไม่ใช่ตัวเลขจำกัด ถูกข้ามใน list นั้น', () => {
  const bad = [{ ticker: 'X', name: 'X', pYTD: NaN, score: 999 }, { ticker: 'Y', name: 'Y', pYTD: 999, score: null }, ...rows];
  const u = pickUniverse(bad, 20);
  assert.deepEqual(u.find((x) => x.ticker === 'X').lists, ['RS']);
  assert.deepEqual(u.find((x) => x.ticker === 'Y').lists, ['YTD']);
});

test('fetchUniverse reject เมื่อ HTTP ไม่ ok', async () => {
  const fake = async () => ({ ok: false, status: 500, json: async () => ({}) });
  await assert.rejects(fetchUniverse('https://x', fake), /500/);
});

test('fetchUniverse เรียก URL universe=all ของ america และคืน data', async () => {
  let called = '';
  const fake = async (u) => { called = u; return { ok: true, status: 200, json: async () => ({ data: rows }) }; };
  const out = await fetchUniverse('https://x', fake);
  assert.equal(called, 'https://x/api/scan?market=america&universe=all&v=2');
  assert.equal(out.length, 50);
});

test('fetchUniverse reject เมื่อ data ว่าง', async () => {
  const fake = async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) });
  await assert.rejects(fetchUniverse('https://x', fake));
});

test('[TH] fetchUniverse market=thailand', async () => {
  let called = '';
  await fetchUniverse('https://x', async (u) => { called = u; return { ok: true, status: 200, json: async () => ({ data: rows }) }; }, 'thailand');
  assert.equal(called, 'https://x/api/scan?market=thailand&universe=all&v=2');
});
