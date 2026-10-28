// /api/chart — Yahoo Finance OHLCV candles for a symbol
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const symbol0 = String(req.query.symbol || "");
  const interval = String(req.query.interval || "1d");
  const rng = String(req.query.range || "1y");
  const market = req.query.market || "thailand";
  if (!symbol0) return res.status(400).json({ error: "Missing symbol" });
  // allowlist — interval/range ถูกต่อเข้า URL ของ Yahoo ตรงๆ (กัน query injection / ยิงพารามิเตอร์แปลก)
  if (!/^[A-Za-z0-9.^=&_\-]{1,20}$/.test(symbol0)) return res.status(400).json({ error: "Invalid symbol" });
  if (!["1m", "5m", "15m", "30m", "60m", "1d", "1wk", "1mo"].includes(interval)) return res.status(400).json({ error: "Invalid interval" });
  if (!["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "3y", "5y", "10y", "ytd", "max"].includes(rng)) return res.status(400).json({ error: "Invalid range" });
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");

  // Thai stocks: append .BK automatically (Yahoo needs SET suffix). US = ไม่เติม (ใช้ symbol ตรงๆ)
  let symbol = symbol0;
  if (market === "america" || market === "us") {
    // US: ไม่เติม suffix — Yahoo ใช้ ticker เปล่าแล้ว (เช่น NVDA); หุ้นหลายคลาสใช้ "-" แทน "." (BRK.B → BRK-B)
    symbol = symbol0.replace(/\./g, "-");
  } else if (!/(\.BK|\.[A-Z]{2,3})$/.test(symbol0)) {
    symbol = symbol0 + ".BK";
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${rng}`;
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
    const data = await r.json();
    const result = data?.chart?.result?.[0];
    if (!result) { res.setHeader("Cache-Control", "no-store"); return res.status(404).json({ error: `Cannot fetch chart for ${symbol}` }); }

    const ts = result.timestamp || [];
    const q = result.indicators?.quote?.[0] || {};
    const { open: o, high: h, low: l, close: c, volume: v } = q;
    const candles = [];
    const intraday = ["30m", "15m", "5m", "1m", "60m"].includes(interval);

    for (let i = 0; i < ts.length; i++) {
      if (c && c[i] != null) {
        candles.push({
          time: intraday ? ts[i] : new Date(ts[i] * 1000).toISOString().slice(0, 10),
          open: round(o?.[i] ?? c[i]), high: round(h?.[i] ?? c[i]),
          low: round(l?.[i] ?? c[i]), close: round(c[i]),
          volume: v?.[i] ? Math.round(v[i]) : 0,
        });
      }
    }
    // firstTradeDate = วันแรกที่มีการซื้อขาย (Yahoo meta) — ใช้คำนวณ "IPO มาแล้วกี่ปี"
    const ftd = result.meta?.firstTradeDate;
    return res.status(200).json({
      symbol, interval, range: rng, count: candles.length,
      firstTradeDate: ftd ? new Date(ftd * 1000).toISOString().slice(0, 10) : null,
      data: candles
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
function round(n) { return Math.round(n * 10000) / 10000; }