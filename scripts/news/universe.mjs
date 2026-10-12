/* universe.mjs — รายชื่อหุ้น US ที่ต้องอธิบาย: Top20 ตามผลตอบแทน YTD ∪ Top20 ตาม RS (score)
   ข้อมูลจาก rsdash /api/scan (universe=all = หุ้นสามัญทั้งตลาด เหมือนหน้า Top20) */
const fin = (v) => typeof v === 'number' && isFinite(v);

export function pickUniverse(rows, n = 20) {
  const top = (key) => rows.filter((r) => r && r.ticker && fin(r[key])).sort((a, b) => b[key] - a[key]).slice(0, n);
  const out = new Map();
  for (const r of top('pYTD')) out.set(r.ticker, { ticker: r.ticker, name: r.name || r.ticker, lists: ['YTD'] });
  for (const r of top('score')) {
    const e = out.get(r.ticker);
    if (e) e.lists.push('RS'); else out.set(r.ticker, { ticker: r.ticker, name: r.name || r.ticker, lists: ['RS'] });
  }
  return [...out.values()];
}

export async function fetchUniverse(base, fetchFn = fetch, market = 'america') {
  const r = await fetchFn(`${base}/api/scan?market=${market}&universe=all&v=2`, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`scan HTTP ${r.status}`);
  const j = await r.json();
  const data = (j && j.data) || [];
  if (!data.length) throw new Error('scan returned no rows');
  return data;
}
