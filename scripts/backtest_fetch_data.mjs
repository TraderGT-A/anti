// ดึงราคารายวันย้อนหลัง ~6 ปี (open/close/volume) ของ "ทั้งตลาด" สำหรับ backtest จริง
//   node scripts/backtest_fetch_data.mjs th|us
// แหล่งข้อมูล: รายชื่อ+sector จาก rsdashclean /api/scan?universe=all (TradingView) · ราคาจาก Yahoo chart API
// เขียนลง data/bt_cache/<mk>_universe.json  (อยู่ใน .gitignore — สร้างใหม่ได้เสมอ)
// ข้อจำกัดที่ต้องรู้: ได้เฉพาะหุ้นที่ "ยังซื้อขายอยู่วันนี้" (หุ้นที่เลิก/ถูกถอนไม่มีข้อมูล) → ผลมี survivorship bias เหลือเล็กน้อย
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "data", "bt_cache");
fs.mkdirSync(OUT_DIR, { recursive: true });
const MK = (process.argv[2] || "th").toLowerCase();
const isTH = MK === "th";
const BASE = process.env.RS_BASE || "https://rsdashclean.vercel.app";
const NOW = Math.floor(Date.now() / 1000), P1 = NOW - 6.2 * 365 * 86400;
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" };

async function yahoo(sym) {
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&period1=${Math.floor(P1)}&period2=${NOW}`, { headers: UA });
      if (r.status === 429) { await new Promise((x) => setTimeout(x, 1500 * (a + 1))); continue; }
      const j = await r.json(); const x = j.chart?.result?.[0]; if (!x) return null;
      const q = x.indicators.quote[0], t = x.timestamp || [];
      const out = { t: [], o: [], c: [], v: [] };
      for (let i = 0; i < t.length; i++) {
        if (q.close[i] == null || q.open[i] == null) continue;
        out.t.push(new Date(t[i] * 1000 + (isTH ? 7 : -4) * 3600e3).toISOString().slice(0, 10));   // วันที่ตามเขตเวลาตลาด
        out.o.push(Math.round(q.open[i] * 10000) / 10000); out.c.push(Math.round(q.close[i] * 10000) / 10000); out.v.push(q.volume[i] || 0);
      }
      return out.t.length > 300 ? out : null;
    } catch (e) { await new Promise((x) => setTimeout(x, 800 * (a + 1))); }
  }
  return null;
}

const scan = await (await fetch(`${BASE}/api/scan?market=${isTH ? "thailand" : "america"}&universe=all`)).json();
let rows = scan.data.filter((s) => s.price > 0 && !s.isDR);
// กรองให้เหลือหุ้นที่เป็นไปได้ว่าผ่านสภาพคล่องช่วงใดช่วงหนึ่ง (ลดจำนวนยิง) — เกณฑ์ตัดสินจริงทำใน backtest ณ แต่ละวัน
rows = rows.filter((s) => (isTH ? s.val >= 1e5 : s.val >= 1e6 && s.mcap >= 2e8));
console.log(MK, "universe from scan:", scan.data.length, "-> to fetch:", rows.length);

const store = { market: MK, fetched_at: new Date().toISOString(), index: null, tickers: {} };
store.index = await yahoo(isTH ? "TDEX.BK" : "^GSPC");
store.index_symbol = isTH ? "TDEX.BK (SET50 ETF — ตัวแทน SET เพราะ Yahoo ไม่มีประวัติ ^SET)" : "^GSPC";
console.log("index bars:", store.index?.t.length);
let i = 0, ok = 0;
async function worker() {
  while (i < rows.length) {
    const s = rows[i++];
    const sym = isTH ? s.ticker + ".BK" : s.ticker.replace(/\./g, "-");
    const d = await yahoo(sym);
    if (d) { store.tickers[s.ticker] = { name: s.name, sector: s.sector || "Other", industry: s.industry || "Other", ...d }; ok++; }
    if (i % 100 === 0) console.log(i, "/", rows.length, "ok", ok);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
fs.writeFileSync(path.join(OUT_DIR, `${MK}_universe.json`), JSON.stringify(store));
console.log("saved", ok, "tickers →", path.join(OUT_DIR, `${MK}_universe.json`));
