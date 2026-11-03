// /api/flow?kind=surp&mk=th|us — ส่วนต่างงบไตรมาสล่าสุดเทียบประมาณการนักวิเคราะห์ (EPS / รายได้) จาก TradingView scanner
//   ผลลัพธ์: { mk, count, data: { TICKER: [epsSurprise%, revSurprise%, epsจริง, epsคาด, รายได้จริง, รายได้คาด] } } · ใช้แสดงป้าย "เกินคาด/ต่ำกว่าคาด" ข้างป้ายงบ
//   คอลัมน์ *_fq = ไตรมาสล่าสุดที่ประกาศแล้ว · surprise% = (จริง−คาด)/|คาด|×100 · แคช CDN 30 นาที
const COLS = ["name", "eps_surprise_percent_fq", "revenue_surprise_percent_fq", "earnings_per_share_fq", "earnings_per_share_forecast_fq", "revenue_fq", "revenue_forecast_fq"];
const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const mk = req.query.mk === "us" ? "us" : "th";
  try {
    const r = await fetch(`https://scanner.tradingview.com/${mk === "us" ? "america" : "thailand"}/scan`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: { query: { types: [] }, tickers: [] }, columns: COLS, sort: { sortBy: "market_cap_basic", sortOrder: "desc" }, range: [0, 4000] }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error("TradingView HTTP " + r.status);
    const rows = (await r.json()).data || [], data = {};
    for (const x of rows) {
      const d = x.d || [], t = d[0]; if (!t) continue;
      const eps = num(d[1], 1); if (eps == null) continue;   // ไม่มีส่วนต่าง EPS = ไม่เก็บ
      data[t] = [eps, num(d[2], 2), num(d[3], 4), num(d[4], 4), num(d[5], 0), num(d[6], 0)];
    }
    res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=3600");
    return res.status(200).json({ mk, count: Object.keys(data).length, data });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: String((e && e.message) || e).slice(0, 100) });
  }
}
