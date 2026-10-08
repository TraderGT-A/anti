// /api/chart — Yahoo Finance OHLCV candles for a symbol
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const symbol0 = req.query.symbol || "";
  const interval = req.query.interval || "1d";
  const rng = req.query.range || "1y";
  const market = req.query.market || "thailand";
  if (!symbol0) return res.status(400).json({ error: "Missing symbol" });

  // Thai stocks: append .BK automatically (Yahoo needs SET suffix). US = ไม่เติม (ใช้ symbol ตรงๆ)
  let symbol = symbol0;
  if (market === "america" || market === "us") {
    // US: ไม่เติม suffix — Yahoo ใช้ ticker เปล่าแล้ว (เช่น NVDA)
  } else if (!/(\.BK|\.[A-Z]{2,3})$/.test(symbol0)) {
    symbol = symbol0 + ".BK";
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${rng}`;
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
    const data = await r.json();
    const result = data?.chart?.result?.[0];
    if (!result) return res.status(404).json({ error: `Cannot fetch chart for ${symbol}` });

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
    return res.status(200).json({ symbol, interval, range: rng, count: candles.length, data: candles });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
function round(n) { return Math.round(n * 10000) / 10000; }