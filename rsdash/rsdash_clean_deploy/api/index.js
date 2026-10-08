// /api/index — ดึงข้อมูล Index ไทย (SET / SET50 / SET100 / mai) + ราคาเปิด-ปิด-เปลี่ยน
// market=america → S&P500 / NASDAQ / DOW / Russell2000
const INDEXES = {
  thailand: [
    { key: "SET",   label: "SET",        symbol: "^SET.BK" },
    { key: "SET50", label: "SET50",      symbol: "^SET50.BK" },
    { key: "SET100",label: "SET100",     symbol: "^SET100.BK" },
    { key: "mai",   label: "mai",        symbol: "^MAI.BK" },
  ],
  america: [
    { key: "SPX",   label: "S&P500",       symbol: "^GSPC" },
    { key: "NAS",   label: "Nasdaq-100",   symbol: "^NDX" },
    { key: "DOW",   label: "Dow Jones",    symbol: "^DJI" },
    { key: "RUT",   label: "Russell",      symbol: "^RUT" },
  ],
};

async function fetchOne(entry) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(entry.symbol)}?interval=1d&range=1mo`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
  const data = await r.json();
  const res = data?.chart?.result?.[0];
  if (!res) return null;
  const meta = res.meta || {};
  const ts = res.timestamp || [];
  const q = res.indicators?.quote?.[0] || {};
  const close = q.close || [];
  // สุดท้าย (วันนี้) / วันก่อน (index -1)
  let last = null, prev = null, open = null;
  for (let i = close.length - 1; i >= 0; i--) {
    if (last === null && close[i] != null) { last = close[i]; open = q.open?.[i] ?? last; if (i > 0) prev = close[i-1] ?? meta.chartPreviousClose ?? last; break; }
  }
  if (last === null) return null;
  prev = prev ?? meta.chartPreviousClose ?? last;
  const change = last - prev;
  const changePct = prev ? (change / prev) * 100 : 0;
  // สถานะตลาดเปิด-ปิด: ถ้า meta.regularMarketPrice ไม่เท่า close ล่าสุด → กำลัง live
  const lastTs = ts[ts.length-1]; const now = Math.floor(Date.now()/1000);
  const barIsToday = lastTs && now - lastTs < 3*3600;  // bar ล่าสุดอายุ < 3 ชม = still trading
  return {
    key: entry.key, label: entry.label, symbol: entry.symbol,
    name: meta.shortName || entry.label,
    price: Math.round(last * 100) / 100,
    open: open != null ? Math.round(open * 100) / 100 : null,
    close: Math.round(last * 100) / 100,
    change: Math.round(change * 100) / 100,
    changePct: Math.round(changePct * 100) / 100,
    prevClose: Math.round(prev * 100) / 100,
    live: !!barIsToday,           // true = กำลังซื้อขาย (bar วันนี้), false = ปิด (ใกล้ close วาน)
    updated_at: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  const force = req.query.force === "1";
  const market = (req.query.market === "us" || req.query.market === "america") ? "america" : "thailand";
  const list = INDEXES[market] || INDEXES.thailand;
  const ck = global.__indexCache?.[market];
  const now = Date.now();
  if (!force && ck && now - ck.ts < 300_000) return res.status(200).json(ck.data);
  try {
    const results = [];
    for (const e of list) {
      try { const d = await fetchOne(e); if (d) results.push(d); } catch (err) { /* skip one */ }
    }
    const payload = { market, count: results.length, indexes: results, updated_at: new Date().toISOString() };
    if (!global.__indexCache) global.__indexCache = {};
    global.__indexCache[market] = { data: payload, ts: Date.now() };
    return res.status(200).json(payload);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}