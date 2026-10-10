// ดึงหุ้น US ช่วง 2000–2013 (เฉพาะตัวที่ยังอยู่ในจักรวาลปัจจุบัน = survivorship) เพื่อตรวจ factor ในอดีต — ออก <HERMES>/us_old/chunk_NN.json
import fs from "node:fs";
import path from "node:path";
const HERMES = process.env.HERMES_SCRIPTS || "C:/Users/Tar/AppData/Local/hermes/scripts", OUT = path.join(HERMES, "us_old"); fs.mkdirSync(OUT, { recursive: true });
const U = JSON.parse(fs.readFileSync(path.join(HERMES, "us11", "universe.json"), "utf8")), UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), r4 = (x) => Math.round(x * 10000) / 10000;
const P1 = Math.floor(Date.UTC(1999, 0, 1) / 1000), P2 = Math.floor(Date.UTC(2013, 11, 31) / 1000);
async function yahoo(sym) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&period1=${P1}&period2=${P2}`, { headers: UA });
      if (r.status === 429) { await sleep(2500 * (a + 1)); continue; }
      const q = (await r.json())?.chart?.result?.[0]; if (!q) return null; const ts = q.timestamp || [], z = q.indicators?.quote?.[0] || {}, o = { t: [], o: [], h: [], l: [], c: [], v: [] };
      for (let i = 0; i < ts.length; i++) { if (z.close?.[i] == null || z.high?.[i] == null || z.low?.[i] == null) continue; o.t.push(new Date(ts[i] * 1000).toISOString().slice(0, 10)); o.o.push(r4(z.open?.[i] ?? z.close[i])); o.h.push(r4(z.high[i])); o.l.push(r4(z.low[i])); o.c.push(r4(z.close[i])); o.v.push(Math.round(z.volume?.[i] || 0)); }
      return o;
    } catch (e) { await sleep(800 * (a + 1)); }
  }
  return null;
}
const CH = 250;
for (let c = 0; c * CH < U.length; c++) {
  const file = path.join(OUT, `chunk_${String(c).padStart(2, "0")}.json`); if (fs.existsSync(file)) continue;
  const part = U.slice(c * CH, (c + 1) * CH), res = {}; let i = 0, ok = 0;
  await Promise.all(Array.from({ length: 5 }, async () => { while (i < part.length) { const s = part[i++], d = await yahoo(s.tk.replace(/\./g, "-")); if (d && d.t.length >= 400) { res[s.tk] = d; ok++; } await sleep(60); } }));
  fs.writeFileSync(file, JSON.stringify(res)); console.log("chunk", c, ok + "/" + part.length);
}
console.log("DONE");
