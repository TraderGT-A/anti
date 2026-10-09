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
  // LIVE = เวลาปัจจุบันอยู่ในช่วงซื้อขายปกติของ Yahoo (currentTradingPeriod.regular)
  // (ของเดิมดูอายุ bar < 3 ชม. แต่ timestamp ของ bar รายวัน = เวลาเปิดตลาด → ขึ้น LIVE แค่ 3 ชม.แรกของวัน)
  const now = Math.floor(Date.now()/1000);
  const reg = meta.currentTradingPeriod?.regular;
  const barIsToday = reg && reg.start && reg.end ? (now >= reg.start && now <= reg.end) : false;
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

// ค่าเฉลี่ยเคลื่อนที่ของดัชนี (SMA20/50/200) จาก TradingView — ใช้ได้ทั้งไทยและสหรัฐฯ
// (Yahoo ให้ประวัติดัชนีไทยมาแค่ 1 แท่ง คำนวณ SMA เองไม่ได้ → "โหมดตลาด" ของไทยเคยหายเงียบๆ)
const TV_INDEX = {
  thailand: { ep: "thailand", map: { SET: "SET:SET", SET50: "SET:SET50", SET100: "SET:SET100", mai: "SET:MAI" } },
  america: { ep: "america", map: { SPX: "SP:SPX", NAS: "NASDAQ:NDX", DOW: "DJ:DJI", RUT: "TVC:RUT" } },
};
async function fetchSMAs(market) {
  const cfg = TV_INDEX[market]; if (!cfg) return {};
  try {
    const r = await fetch(`https://scanner.tradingview.com/${cfg.ep}/scan`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: { tickers: Object.values(cfg.map) }, columns: ["close", "SMA20", "SMA50", "SMA200"] }),
    });
    if (!r.ok) return {};
    const j = await r.json();
    const byTv = Object.fromEntries((j.data || []).map((x) => [x.s, x.d]));
    const out = {};
    for (const [key, tv] of Object.entries(cfg.map)) {
      const d = byTv[tv]; if (!d) continue;
      const rd = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
      out[key] = { tvClose: rd(d[0]), sma20: rd(d[1]), sma50: rd(d[2]), sma200: rd(d[3]) };
    }
    return out;
  } catch (e) { return {}; }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  const force = req.query.force === "1";
  if (force) {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  } else {
    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
  }
  const market = (req.query.market === "us" || req.query.market === "america") ? "america" : "thailand";
  const list = INDEXES[market] || INDEXES.thailand;
  const ck = global.__indexCache?.[market];
  const now = Date.now();
  // force ข้ามแคชได้ แต่ไม่ยิง Yahoo ถี่กว่า 20 วิ (หน้าเว็บเรียก force ทุก auto-refresh)
  if (ck && now - ck.ts < (force ? 20_000 : 300_000)) return res.status(200).json(ck.data);
  try {
    const [settled, smas] = await Promise.all([Promise.allSettled(list.map((e) => fetchOne(e))), fetchSMAs(market)]);
    const results = settled.filter((s) => s.status === "fulfilled" && s.value).map((s) => ({ ...s.value, ...(smas[s.value.key] || {}) }));
    const payload = { market, count: results.length, indexes: results, updated_at: new Date().toISOString() };
    if (!global.__indexCache) global.__indexCache = {};
    global.__indexCache[market] = { data: payload, ts: Date.now() };
    return res.status(200).json(payload);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}