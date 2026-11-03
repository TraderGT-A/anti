// /api/flow?kind=pre — ราคา Pre-market ของหุ้นสหรัฐ (OHLC + ปริมาณ + %เปลี่ยน) จาก TradingView scanner (คอลัมน์ premarket_*)
//   ผลลัพธ์: { mk:"us", t, count, data:{ TICKER:[open, high, low, close, volume, change%] } } · เฉพาะตัวที่มีราคา pre-market ครบ
//   หมายเหตุ: คอลัมน์ premarket_* ยังค้างค่าหลังตลาดเปิดจนถึงรอบถัดไป → ฝั่งเว็บต้องใช้เฉพาะช่วง 04:00–09:30 น. เวลานิวยอร์ก (เว็บเช็กเอง) · ข้อมูลดีเลย์ ~15 นาที · แคช CDN 45 วินาที
const COLS = ["name", "premarket_open", "premarket_high", "premarket_low", "premarket_close", "premarket_volume", "premarket_change"];
const r2 = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : null);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const r = await fetch("https://scanner.tradingview.com/america/scan", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: { query: { types: [] }, tickers: [] }, columns: COLS, sort: { sortBy: "market_cap_basic", sortOrder: "desc" }, range: [0, 4500] }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error("TradingView HTTP " + r.status);
    const rows = (await r.json()).data || [], data = {};
    for (const x of rows) {
      const d = x.d || [], t = d[0]; if (!t) continue;
      const o = r2(d[1]), h = r2(d[2]), l = r2(d[3]), c = r2(d[4]);
      if (!(o > 0 && h > 0 && l > 0 && c > 0)) continue;
      data[t] = [o, h, l, c, Math.round(Number(d[5]) || 0), r2(d[6])];
    }
    res.setHeader("Cache-Control", "public, s-maxage=45, stale-while-revalidate=120");
    return res.status(200).json({ mk: "us", t: Date.now(), count: Object.keys(data).length, data });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: String((e && e.message) || e).slice(0, 100) });
  }
}
