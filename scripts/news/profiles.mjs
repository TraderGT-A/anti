/* profiles.mjs — คำอธิบายธุรกิจจาก Yahoo Finance (quoteSummary assetProfile.longBusinessSummary) */
import '../../rsdash/about.js';
const { shardOf } = globalThis.About;

export const yahooSymbol = (ticker, market) => market === 'thailand' ? `${ticker}.BK` : String(ticker).replace(/\./g, '-');

export function parseAssetProfile(json) {
  const r = json && json.quoteSummary && json.quoteSummary.result;
  const s = r && r[0] && r[0].assetProfile && r[0].assetProfile.longBusinessSummary;
  return s ? String(s).trim() : null;
}

export function buildShards(map) {
  const out = {};
  for (const k of Object.keys(map).sort()) (out[shardOf(k)] ||= {})[k] = map[k];
  return out;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/* Yahoo ต้องมี cookie + crumb: เปิด fc.yahoo.com เพื่อรับ cookie แล้วขอ crumb */
export async function yahooSession(fetchFn = fetch) {
  const r1 = await fetchFn('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, redirect: 'manual', signal: AbortSignal.timeout(20000) });
  const cookie = (r1.headers.getSetCookie ? r1.headers.getSetCookie() : [r1.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
  const r2 = await fetchFn('https://query2.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': UA, Cookie: cookie }, signal: AbortSignal.timeout(20000) });
  const crumb = (await r2.text()).trim();
  if (!r2.ok || !crumb || crumb.length > 40) throw new Error(`yahoo crumb HTTP ${r2.status}`);
  return { cookie, crumb };
}

export async function fetchProfile(sym, { cookie, crumb }, fetchFn = fetch) {
  const r = await fetchFn(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=assetProfile&crumb=${encodeURIComponent(crumb)}`, { headers: { 'User-Agent': UA, Cookie: cookie }, signal: AbortSignal.timeout(20000) });
  if (r.status === 401 || r.status === 403) throw Object.assign(new Error(`HTTP ${r.status}`), { auth: true });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return parseAssetProfile(await r.json());
}
