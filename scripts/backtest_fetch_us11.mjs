// ดึงข้อมูล US สำหรับ backtest ตาม research/PREREG_setups_us_2026-10-10.md
//   node scripts/backtest_fetch_us11.mjs     (รันซ้ำได้ — ข้าม chunk ที่เสร็จแล้ว)
// ออก: <HERMES>/us11/{universe.json, chunk_NN.json, bench.json, tbill.csv, fetch.log}  (นอก git)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HERMES = process.env.HERMES_SCRIPTS || "C:/Users/Tar/AppData/Local/hermes/scripts";
const OUT = path.join(HERMES, "us11"); fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, "fetch.log");
const log = (m) => { const s = new Date().toISOString().slice(11, 19) + " " + m; console.log(s); fs.appendFileSync(LOG, s + "\n"); };
const P1 = Math.floor(Date.UTC(2013, 5, 1) / 1000), P2 = Math.floor(Date.now() / 1000);
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r4 = (x) => Math.round(x * 10000) / 10000;

async function yahoo(sym, adj) {
  for (let a = 0; a < 4; a++) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&period1=${P1}&period2=${P2}&includeAdjustedClose=true`;
      const r = await fetch(url, { headers: UA });
      if (r.status === 429) { await sleep(2000 * (a + 1)); continue; }
      const j = await r.json(); const q = j?.chart?.result?.[0]; if (!q) return null;
      const ts = q.timestamp || [], z = q.indicators?.quote?.[0] || {}, ac = q.indicators?.adjclose?.[0]?.adjclose || [];
      const o = { t: [], o: [], h: [], l: [], c: [], v: [] }; if (adj) o.adj = [];
      for (let i = 0; i < ts.length; i++) {
        if (z.close?.[i] == null || z.high?.[i] == null || z.low?.[i] == null) continue;
        o.t.push(new Date(ts[i] * 1000).toISOString().slice(0, 10)); o.o.push(r4(z.open?.[i] ?? z.close[i])); o.h.push(r4(z.high[i])); o.l.push(r4(z.low[i])); o.c.push(r4(z.close[i])); o.v.push(Math.round(z.volume?.[i] || 0));
        if (adj) o.adj.push(r4(ac[i] ?? z.close[i]));
      }
      return o;
    } catch (e) { await sleep(800 * (a + 1)); }
  }
  return null;
}

// 1) จักรวาล (หุ้นสามัญ US ที่จดทะเบียนอยู่ — จาก TradingView scan เดียวกับ dashboard)
const UF = path.join(OUT, "universe.json");
if (!fs.existsSync(UF)) {
  const { scanMarket } = await import(pathToFileURL(path.join(ROOT, "rsdash/api/lib/scan.js")).href);
  const { raw } = await scanMarket("america");
  const list = raw.filter((s) => !s.isDR && (s.mcap || 0) >= 5e7).map((s) => ({ tk: s.ticker, name: s.name, industry: s.industry, sector: s.sector, mcap: s.mcap }));
  fs.writeFileSync(UF, JSON.stringify(list)); log(`universe ${list.length} (raw ${raw.length})`);
}
const U = JSON.parse(fs.readFileSync(UF, "utf8"));

// 2) ตัวเทียบ + T-Bill
const BF = path.join(OUT, "bench.json");
if (!fs.existsSync(BF)) {
  const b = {}; for (const s of ["^GSPC", "^IXIC", "SPY", "RSP"]) { b[s] = await yahoo(s, true); log(`bench ${s} bars ${b[s]?.t.length}`); }
  fs.writeFileSync(BF, JSON.stringify(b));
}
const TF = path.join(OUT, "tbill.csv");
if (!fs.existsSync(TF)) {
  try { const r = await fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DTB3&cosd=2013-01-01", { headers: UA }); const t = await r.text(); if (!/DTB3/.test(t)) throw new Error("bad csv"); fs.writeFileSync(TF, t); log("tbill rows " + t.split("\n").length); }
  catch (e) { log("TBILL FAILED " + e.message); }
}

// 3) หุ้นรายตัว เป็น chunk ละ 200 (ดึงต่อได้)
const CH = 200, CONC = 5;
for (let c = 0; c * CH < U.length; c++) {
  const file = path.join(OUT, `chunk_${String(c).padStart(2, "0")}.json`);
  if (fs.existsSync(file)) continue;
  const part = U.slice(c * CH, (c + 1) * CH), res = {}; let ok = 0, i = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < part.length) { const s = part[i++]; const d = await yahoo(s.tk.replace(/\./g, "-"), false); if (d && d.t.length >= 300) { res[s.tk] = d; ok++; } await sleep(60); }
  }));
  fs.writeFileSync(file, JSON.stringify(res)); log(`chunk ${c} ${ok}/${part.length} saved`);
}
log("DONE");
