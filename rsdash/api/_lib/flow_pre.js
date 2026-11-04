// /api/flow?kind=pre — ราคา Pre-market ของหุ้นสหรัฐ (OHLC + ปริมาณ + %เปลี่ยน) จาก TradingView scanner (คอลัมน์ premarket_*)
//   ผลลัพธ์: { mk:"us", t, count, data:{ TICKER:[open, high, low, close, volume, change%] } } · เฉพาะตัวที่มีราคา pre-market ครบ
//   หมายเหตุ: คอลัมน์ premarket_* ยังค้างค่าหลังตลาดเปิดจนถึงรอบถัดไป → ฝั่งเว็บต้องใช้เฉพาะช่วง 04:00–09:30 น. เวลานิวยอร์ก (เว็บเช็กเอง) · ข้อมูลดีเลย์ ~15 นาที · แคช CDN 45 วินาที
const COLS = ["name", "premarket_open", "premarket_high", "premarket_low", "premarket_close", "premarket_volume", "premarket_change"];
const r2 = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : null);
// ── สรุปบรรยากาศก่อนตลาดสหรัฐเปิด (ใช้ผ่าน /api/flow?kind=preopen) ──
//   ต่อยอดจากข้อมูล pre-market ด้านบน + sector/market cap เพื่อจัดอันดับและสรุปตามกลุ่ม
const VAL_MIN = 1e6;    // มูลค่าซื้อขาย pre-market ขั้นต่ำ (USD)
function etNow() {
  const now = new Date(), y = now.getUTCFullYear();
  const nthSun = (m, n) => { const d = new Date(Date.UTC(y, m, 1)); const first = (7 - d.getUTCDay()) % 7; return 1 + first + (n - 1) * 7; };
  const dstStart = Date.UTC(y, 2, nthSun(2, 2), 7), dstEnd = Date.UTC(y, 10, nthSun(10, 1), 6);
  const off = (now.getTime() >= dstStart && now.getTime() < dstEnd) ? -4 : -5;
  const et = new Date(now.getTime() + off * 3600e3);
  const mins = et.getUTCHours() * 60 + et.getUTCMinutes(), dow = et.getUTCDay();
  const session = (dow === 0 || dow === 6) ? "closed" : mins >= 240 && mins < 750 ? "pre" : mins >= 750 && mins < 960 ? "open" : "closed";   // เปิด 09:30 ET
  return { off, session, label: String(et.getUTCHours()).padStart(2, "0") + ":" + String(et.getUTCMinutes()).padStart(2, "0") };
}
export async function preopenSummary() {
  const COLS = ["name","premarket_close","premarket_volume","premarket_change","sector","market_cap_basic","close","volume"];
  const r = await fetch("https://scanner.tradingview.com/america/scan", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbols: { query: { types: [] }, tickers: [] }, columns: COLS, sort: { sortBy: "market_cap_basic", sortOrder: "desc" }, range: [0, 4500] }),
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) throw new Error("TradingView HTTP " + r.status);
  const rows = (await r.json()).data || [];
  let n = 0, up = 0, down = 0, valAll = 0; const items = [];
  for (const x of rows) {
    const d = x.d || [], t = d[0], c = r2(d[1]), v = Math.round(Number(d[2]) || 0), chg = r2(d[3]);
    if (!t || !(c > 0) || !(v > 0) || chg == null) continue;
    const val = c * v; n++; valAll += val; if (chg > 0) up++; else if (chg < 0) down++;
    if (val < VAL_MIN) continue;
    items.push({ t, chg, px: c, val: Math.round(val), vol: v, sec: d[4] || "-", mc: Math.round(Number(d[5]) || 0), prev: r2(d[6]) || null });
  }
  items.sort((a, b) => b.chg - a.chg);
  const sm = {};
  for (const it of items) {
    const s = (sm[it.sec] = sm[it.sec] || { sec: it.sec, n: 0, val: 0, wsum: 0, up: 0, dn: 0 });
    s.n++; s.val += it.val; s.wsum += it.chg * it.val; if (it.chg > 0) s.up++; else if (it.chg < 0) s.dn++;
  }
  const sectors = Object.values(sm).map(s => ({ ...s, chg: s.val ? Math.round((s.wsum / s.val) * 100) / 100 : 0 }))
    .filter(s => s.n >= 3).sort((a, b) => b.chg - a.chg);
  const et = etNow();
  return { t: Date.now(), asOfET: et.label, session: et.session, tzOff: et.off, n, up, down, val: Math.round(valAll), valMin: VAL_MIN,
           top: items.slice(0, 15), bottom: items.slice(-15).reverse(), sectors };
}


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
