// ดึงดัชนีรายวันยาวๆ หลายตลาด + T-Bill สำหรับงานสำรวจหา edge (ออก: <HERMES>/idx_long/*.json, ดอกเบี้ย tbill_long.csv)
import fs from "node:fs";
import path from "node:path";
const HERMES = process.env.HERMES_SCRIPTS || "C:/Users/Tar/AppData/Local/hermes/scripts", OUT = path.join(HERMES, "idx_long"); fs.mkdirSync(OUT, { recursive: true });
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SYMS = ["^GSPC", "^SP500TR", "^IXIC", "^NDX", "^RUT", "^DJI", "^N225", "^GDAXI", "^FTSE", "^FCHI", "^HSI", "^KS11", "^AXJO", "^BSESN", "^STI", "^JKSE", "^KLSE", "^TWII", "^BVSP", "^GSPTSE", "^VIX", "GLD", "TLT", "SPY", "QQQ", "EEM", "EFA"];
async function get(sym) {
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&period1=-631152000&period2=${Math.floor(Date.now() / 1000)}&includeAdjustedClose=true`, { headers: UA });
      if (r.status === 429) { await sleep(2500 * (a + 1)); continue; }
      const q = (await r.json())?.chart?.result?.[0]; if (!q) return null;
      const ts = q.timestamp || [], z = q.indicators?.quote?.[0] || {}, ac = q.indicators?.adjclose?.[0]?.adjclose || [], o = { t: [], o: [], h: [], l: [], c: [], adj: [], v: [] };
      for (let i = 0; i < ts.length; i++) { if (z.close?.[i] == null) continue; o.t.push(new Date(ts[i] * 1000).toISOString().slice(0, 10)); o.o.push(z.open?.[i] ?? z.close[i]); o.h.push(z.high?.[i] ?? z.close[i]); o.l.push(z.low?.[i] ?? z.close[i]); o.c.push(z.close[i]); o.adj.push(ac[i] ?? z.close[i]); o.v.push(z.volume?.[i] || 0); }
      return o;
    } catch (e) { await sleep(900 * (a + 1)); }
  }
  return null;
}
for (const s of SYMS) { const f = path.join(OUT, s.replace("^", "_") + ".json"); if (fs.existsSync(f)) continue; const d = await get(s); if (d && d.t.length > 200) { fs.writeFileSync(f, JSON.stringify(d)); console.log(s, d.t.length, d.t[0], "→", d.t.at(-1)); } else console.log(s, "FAILED"); await sleep(300); }
const tf = path.join(HERMES, "tbill_long.csv");
if (!fs.existsSync(tf)) { try { const r = await fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DTB3&cosd=1954-01-01", { headers: UA }); const t = await r.text(); if (/DTB3/.test(t)) { fs.writeFileSync(tf, t); console.log("tbill rows", t.split("\n").length); } } catch (e) { console.log("tbill failed", e.message); } }
console.log("DONE");
