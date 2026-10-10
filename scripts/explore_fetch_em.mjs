// ดึงหุ้นรายตัวของตลาดอื่น (อินโด/มาเลย์/สิงคโปร์/อินเดีย/เกาหลี/ไต้หวัน/ฮ่องกง/ออสเตรเลีย) เพื่อตรวจว่า factor ที่เจอในไทยมีในตลาดอื่นไหม
// ออก: <HERMES>/em/<market>.json  {tk:{t,o,h,l,c,v}} (ตั้งแต่ 2005-01-01)  — ดึงต่อได้ (ข้ามตลาดที่เสร็จแล้ว)
import fs from "node:fs";
import path from "node:path";
const HERMES = process.env.HERMES_SCRIPTS || "C:/Users/Tar/AppData/Local/hermes/scripts", OUT = path.join(HERMES, "em"); fs.mkdirSync(OUT, { recursive: true });
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MARKETS = { indonesia: { scan: "indonesia", suf: { IDX: ".JK" } }, singapore: { scan: "singapore", suf: { SGX: ".SI" } }, india: { scan: "india", suf: { NSE: ".NS" } }, korea: { scan: "korea", suf: { KRX: ".KS", KOSDAQ: ".KQ" } }, taiwan: { scan: "taiwan", suf: { TWSE: ".TW", TPEX: ".TWO" } }, hongkong: { scan: "hongkong", suf: { HKEX: ".HK" } }, australia: { scan: "australia", suf: { ASX: ".AX" } },
  japan: { scan: "japan", suf: { TSE: ".T" } }, germany: { scan: "germany", suf: { XETR: ".DE" } }, uk: { scan: "uk", suf: { LSE: ".L" } }, france: { scan: "france", suf: { EURONEXT: ".PA" } }, canada: { scan: "canada", suf: { TSX: ".TO" } }, brazil: { scan: "brazil", suf: { BMFBOVESPA: ".SA" } }, mexico: { scan: "mexico", suf: { BMV: ".MX" } }, turkey: { scan: "turkey", suf: { BIST: ".IS" } }, southafrica: { scan: "rsa", suf: { JSE: ".JO" } } };
const TOP = +(process.env.TOP || 400), P1 = Math.floor(Date.UTC(2005, 0, 1) / 1000), P2 = Math.floor(Date.now() / 1000), r4 = (x) => Math.round(x * 10000) / 10000;
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
for (const [name, m] of Object.entries(MARKETS)) {
  const file = path.join(OUT, name + ".json"); if (fs.existsSync(file)) { console.log(name, "exists"); continue; }
  const r = await fetch(`https://scanner.tradingview.com/${m.scan}/scan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: { query: { types: [] }, tickers: [] }, columns: ["name", "type", "Value.Traded", "close"], sort: { sortBy: "Value.Traded", sortOrder: "desc" }, range: [0, TOP * 2] }) });
  const rows = ((await r.json()).data || []).map((x) => ({ s: x.s, d: x.d })).filter((x) => x.d[1] === "stock"), list = [];
  for (const x of rows) { const [ex, sym] = x.s.split(":"); const suf = m.suf[ex]; if (!suf) continue; let t = sym; if (ex === "HKEX") t = sym.padStart(4, "0"); list.push([x.s, t + suf]); if (list.length >= TOP) break; }
  console.log(name, "tickers", list.length); const res = {}; let ok = 0, i = 0;
  await Promise.all(Array.from({ length: 5 }, async () => { while (i < list.length) { const [key, y] = list[i++]; const d = await yahoo(y); if (d && d.t.length >= 400) { res[key] = d; ok++; } await sleep(60); } }));
  fs.writeFileSync(file, JSON.stringify(res)); console.log(name, "saved", ok);
}
console.log("DONE");
