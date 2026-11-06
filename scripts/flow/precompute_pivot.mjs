// หา "Pivot Break" 2 แบบ (VDU / VCP) ของหุ้นที่ผ่านเกณฑ์สภาพคล่อง แล้วเขียนเป็นไฟล์เล็กให้เว็บอ่าน
//   VDU  = ย่อมาใกล้เส้น 10/20 วัน ปริมาณแห้ง ≤65% ของเฉลี่ย 50 วัน แล้วเบรกยอดฐานด้วยปริมาณ ≥1.8 เท่า
//   VCP  = ย่อ 3 รอบลึกน้อยลง + จุดต่ำยกขึ้น + ปริมาณรอบท้ายลดลง แล้วเบรกยอดฐานด้วยปริมาณ ≥1.5 เท่า
//   ผลลัพธ์: rsdash/pivot_{th|us}.json + rsdash/api/_lib/pivot_data.js  (เฉพาะตัวที่เข้าเกณฑ์ ไม่กี่สิบแถว)
//   ใช้: node scripts/flow/precompute_pivot.mjs --market th|us|both [--out rsdash] [--conc 8]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { scanMarket } from "../../rsdash/api/_lib/scan.js";
const WebSocket = createRequire(import.meta.url)("../../rsdash/node_modules/ws");

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..", arg("out", "rsdash"));
const CONC = Math.max(1, parseInt(arg("conc", "8"), 10));
const LOG = arg("log", path.join(process.env.LOCALAPPDATA || ".", "rsdash", "precompute.log"));
const log = (...a) => { const line = new Date().toISOString().slice(0, 19) + " [pivot] " + a.join(" "); console.log(line); try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.appendFileSync(LOG, line + "\n"); } catch (e) {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (x) => Math.round(x * 100) / 100;

// แท่งจาก TradingView: [วันที่, เปิด, สูง, ต่ำ, ปิด, ปริมาณ]
function tvBars(tvSym, tz, count = 320, timeout = 12000) {
  return new Promise((resolve) => {
    const ws = new WebSocket("wss://data.tradingview.com/socket.io/websocket", { headers: { Origin: "https://www.tradingview.com", "User-Agent": "Mozilla/5.0" } });
    const frame = (o) => { const s = JSON.stringify(o); return "~m~" + s.length + "~m~" + s; };
    const send = (m, p) => ws.send(frame({ m, p }));
    const cs = "cs_" + Math.random().toString(36).slice(2, 14), bars = []; let done = false;
    const finish = (ok) => {
      if (done) return; done = true; clearTimeout(timer); try { ws.close(); } catch (e) {}
      const seen = new Set();
      const out = ok ? bars.filter((v) => v && v.length >= 6 && v[4] > 0 && v[5] > 0 && !seen.has(v[0]) && seen.add(v[0]))
        .sort((a, b) => a[0] - b[0])
        .map((v) => [new Date((v[0] + tz * 3600) * 1000).toISOString().slice(0, 10), v[1], v[2], v[3], v[4], v[5]]) : null;
      resolve(out && out.length > 120 ? out : null);
    };
    const timer = setTimeout(() => finish(bars.length > 120), timeout);
    ws.on("open", () => { send("set_auth_token", ["unauthorized_user_token"]); send("chart_create_session", [cs, ""]); send("resolve_symbol", [cs, "sds_sym_1", '={"symbol":"' + tvSym + '","adjustment":"splits"}']); send("create_series", [cs, "sds_1", "s1", "sds_sym_1", "D", count, ""]); });
    ws.on("message", (d) => { for (const part of d.toString().split(/~m~\d+~m~/).filter(Boolean)) {
      if (part.startsWith("~h~")) { ws.send("~m~" + part.length + "~m~" + part); continue; }
      let j; try { j = JSON.parse(part); } catch (e) { continue; }
      if (j.m === "symbol_error" || j.m === "critical_error" || j.m === "series_error") return finish(false);
      if (j.m === "timescale_update" || j.m === "du") { const sds = j.p && j.p[1] && j.p[1].sds_1; if (sds && sds.s) sds.s.forEach((x) => bars.push(x.v)); }
      if (j.m === "series_completed") return finish(true); } });
    ws.on("error", () => finish(false));
  });
}
// Yahoo: [วันที่, เปิด, สูง, ต่ำ, ปิด, ปริมาณ]
async function yBars(sym, tz, timeout = 15000) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2y`, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }, signal: AbortSignal.timeout(timeout) });
  const res = (await r.json())?.chart?.result?.[0]; if (!res) return null;
  const q = res.indicators?.quote?.[0] || {}, out = [];
  (res.timestamp || []).forEach((t, i) => {
    if (q.close?.[i] > 0 && q.volume?.[i] > 0) out.push([new Date((t + tz * 3600) * 1000).toISOString().slice(0, 10), q.open?.[i], q.high?.[i], q.low?.[i], q.close[i], q.volume[i]]);
  });
  return out.length > 120 ? out : null;
}
function lastClosedDate(mk, now = new Date()) {
  const tzn = mk === "us" ? "America/New_York" : "Asia/Bangkok", closeBuf = mk === "us" ? 16 * 60 + 15 : 17 * 60 + 5   // US ปิด 16:00 ET (+15 น.) · TH ปิดทำการ 17:00 (SET: ปิดราคา ~16:40, off-hour ถึง 17:00) → ยืนยัน 17:05;
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tzn, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).map((x) => [x.type, x.value]));
  const today = `${p.year}-${p.month}-${p.day}`, mins = +p.hour * 60 + +p.minute;
  if (mins >= closeBuf) return today;
  return new Date(Date.parse(today + "T00:00:00Z") - 864e5).toISOString().slice(0, 10);
}
const sma = (a, n, i) => { let s = 0, c = 0; for (let k = Math.max(0, i - n + 1); k <= i; k++) { s += a[k]; c++; } return c ? s / c : 0; };
const avgVol = (b, i, n = 50) => { let s = 0, c = 0; for (let k = Math.max(0, i - n); k < i; k++) { s += b[k][5]; c++; } return c ? s / c : 0; };

function zigzag(b, pct = 0.045) {
  const piv = []; let trend = 0, ei = 0, ep = b[0][4];
  for (let i = 0; i < b.length; i++) {
    const hi = b[i][2], lo = b[i][3];
    if (trend >= 0) { if (hi > ep) { ei = i; ep = hi; } else if (lo < ep * (1 - pct)) { piv.push([ei, ep, "H"]); trend = -1; ei = i; ep = lo; } }
    if (trend <= 0) { if (lo < ep) { ei = i; ep = lo; } else if (hi > ep * (1 + pct)) { piv.push([ei, ep, "L"]); trend = 1; ei = i; ep = hi; } }
  }
  piv.push([ei, ep, trend >= 0 ? "H" : "L"]);
  return piv;
}

// ── VDU ──────────────────────────────────────────────────────────
function findVDU(b) {
  const n = b.length, c = b.map((x) => x[4]);
  for (let i = n - 3; i >= n - 45; i--) {          // ไล่จากแท่งใหม่สุด → เอาเหตุการณ์ล่าสุด
    if (i < 60) break;
    if (c[n - 1] <= 0) return null;
    const av = avgVol(b, i); if (!av || b[i][5] > 0.65 * av) continue;
    if (c[i] < sma(c, 50, i)) continue;
    const near = Math.min(Math.abs(c[i] / sma(c, 10, i) - 1), Math.abs(c[i] / sma(c, 20, i) - 1));
    if (near > 0.02) continue;
    const seg = b.slice(Math.max(0, i - 30), i);
    const pivot = Math.max(...seg.map((x) => x[2]));
    const pivotDate = seg[seg.findIndex((x) => x[2] === pivot)] ? seg[seg.findIndex((x) => x[2] === pivot)][0] : b[i][0];
    if (c[i] > pivot) continue;
    let brk = null;
    for (let j = i + 1; j < Math.min(n, i + 11); j++) {
      if (c[j] > pivot * 1.001) {
        if (b.slice(i, j).some((x) => x[4] > pivot)) break;
        brk = { j, bv: b[j][5] / avgVol(b, j) };
        break;
      }
    }
    const dry = b[i][5] / av;
    if (brk && brk.bv >= 1.8 && n - 1 - brk.j <= 10 && c[n - 1] >= pivot && c[n - 1] <= pivot * 1.10) return { kind: "VDU", st: "BREAK", pivot: r2(pivot), close: r2(c[n - 1]), dry: r2(dry), vduDate: b[i][0], pivotDate, brkDate: b[brk.j][0], brkVol: r2(brk.bv), days: brk.j - i, toGo: r2((pivot / c[n - 1] - 1) * 100) };
    if (!brk && n - 1 - i <= 15 && c[n - 1] < pivot && pivot / c[n - 1] - 1 <= 0.10) return { kind: "VDU", st: "รอเบรก", pivot: r2(pivot), close: r2(c[n - 1]), dry: r2(dry), vduDate: b[i][0], pivotDate, brkDate: null, brkVol: null, days: n - 1 - i, toGo: r2((pivot / c[n - 1] - 1) * 100) };
    // เบรกแล้วแต่ปริมาณยังไม่ถึง 1.8x → เก็บไว้เป็น "รอ Vol" (กันหุ้นหายจากลิสต์ทั้งที่เบรกแล้ว)
    if (brk && brk.bv < 1.8 && n - 1 - brk.j <= 10 && c[n - 1] >= pivot && c[n - 1] <= pivot * 1.10) return { kind: "VDU", st: "รอ Vol", pivot: r2(pivot), close: r2(c[n - 1]), dry: r2(dry), vduDate: b[i][0], pivotDate, brkDate: b[brk.j][0], brkVol: r2(brk.bv), days: brk.j - i, toGo: r2((pivot / c[n - 1] - 1) * 100) };
  }
  return null;
}

// ประวัติแท่ง VDU ที่ "เบรก pivot ได้" (สำหรับวาดจุดย้อนหลังบนกราฟ) — ไม่เอาแท่งแห้งที่ไม่เคยเบรก
function vduHistory(b, look = 150) {
  const n = b.length, c = b.map((x) => x[4]), hh = b.map((x) => x[2]), out = [];
  for (let i = Math.max(60, n - look); i < n - 11; i++) {
    const av = avgVol(b, i); if (!av || b[i][5] > 0.65 * av) continue;
    if (c[i] < sma(c, 50, i)) continue;
    const near = Math.min(Math.abs(c[i] / sma(c, 10, i) - 1), Math.abs(c[i] / sma(c, 20, i) - 1));
    if (near > 0.02) continue;
    const pivot = Math.max(...hh.slice(Math.max(0, i - 30), i));
    if (c[i] > pivot) continue;
    // ต้องมีแท่งถัดไป (ไม่เกิน 10 แท่ง) ที่ปิดเหนือ pivot
    let broke = false;
    for (let j = i + 1; j < Math.min(n, i + 11); j++) { if (c[j] > pivot * 1.001) { broke = true; break; } }
    if (broke) out.push(b[i][0]);
  }
  return out.slice(-8);
}

// ── VCP ──────────────────────────────────────────────────────────
function findVCP(b) {
  const w = b.slice(-160), c = w.map((x) => x[4]);
  const seq = zigzag(w).filter((p) => p[2] === "H" || p[2] === "L");
  while (seq.length && seq[0][2] !== "H") seq.shift();
  const pairs = [];
  for (let i = 0; i < seq.length - 1; i++) if (seq[i][2] === "H" && seq[i + 1][2] === "L") pairs.push([seq[i], seq[i + 1]]);
  if (pairs.length < 3) return null;
  const t = pairs.slice(-3);
  const dep = t.map(([h, l]) => (h[1] - l[1]) / h[1] * 100);
  if (!(dep[0] >= dep[1] && dep[1] >= dep[2] && dep[2] <= dep[0] * 0.85)) return null;
  const lows = t.map(([, l]) => l[1]);
  if (!(lows[0] <= lows[1] && lows[1] <= lows[2])) return null;
  const segVol = (a, z) => { let s = 0; for (let k = a; k <= z; k++) s += w[k][5]; return s / Math.max(1, z - a + 1); };
  const v1 = segVol(t[0][0][0], t[0][1][0]), v3 = segVol(t[2][0][0], t[2][1][0]);
  if (!(v3 < v1 * 0.9)) return null;
  const pivot = t[2][0][1], pivotDate = w[t[2][0][0]][0], n = w.length;
  let bidx = null, bv = null;
  for (let j = Math.max(0, n - 25); j < n; j++) {
    if (c[j] > pivot * 1.001) { bidx = j; bv = w[j][5] / avgVol(w, j); break; }
  }
  let st;
  if (bidx === null) st = c[n - 1] < pivot && pivot / c[n - 1] - 1 <= 0.10 ? "รอเบรก" : null;
  else if (n - 1 - bidx > 10) st = c[n - 1] < pivot && pivot / c[n - 1] - 1 <= 0.10 ? "รอเบรก" : null;
  else st = bv >= 1.5 && c[n - 1] >= pivot && c[n - 1] <= pivot * 1.10 ? "BREAK" : (bv >= 1.5 ? null : "รอ Vol");
  if (!st) return null;
  const keep = st !== "รอเบรก";
  return { kind: "VCP", st, pivot: r2(pivot), pivotDate, close: r2(c[n - 1]), dry: null, dep: dep.map(r2), brkDate: keep && bidx !== null ? w[bidx][0] : null, brkVol: keep && bv !== null ? r2(bv) : null, toGo: r2((pivot / c[n - 1] - 1) * 100), base: n - t[0][0][0], lows: t.map(([h, l]) => [w[l[0]][0], r2(l[1])]), highs: t.map(([h]) => [w[h[0]][0], r2(h[1])]) };
}

async function run(mk) {
  const t0 = Date.now(), market = mk === "us" ? "america" : "thailand", tz = mk === "us" ? 0 : 7;
  const sm = await scanMarket(market);
  let pool = sm.clean.filter((s) => s.ticker && s.hasPerf).map((s) => ({ tk: s.ticker, tv: s.tv || (mk === "us" ? s.ticker.replace(/\./g, "-") : "SET:" + s.ticker) }));
  const lim = parseInt(arg("limit", "0"), 10); if (lim > 0) pool = pool.slice(0, lim);
  const closed = lastClosedDate(mk);
  log(mk, "หุ้นที่จะสแกน", pool.length, "· แท่งปิดล่าสุด", closed);
  const rows = [], errs = [];
  let idx = 0;
  async function worker() {
    while (idx < pool.length) {
      const { tk, tv } = pool[idx++];
      const sym = mk === "us" ? tk.replace(/\./g, "-") : tk.replace(/\./g, "-") + ".BK";
      let bars = null;
      for (let k = 0; k < 2 && !bars; k++) {
        try {
          // ไทย: ใช้ Yahoo (.BK) ก่อนเพราะมีปริมาณครบทุกแท่ง (TV บางครั้งแท่งล่าสุดปริมาณยังไม่นิ่ง → หุ้นหายจากลิสต์)
          bars = mk === "us" ? await yBars(sym, tz) : ((await yBars(sym, tz)) || (await tvBars(tv, tz)));
        } catch (e) { bars = null; }
        if (!bars) await sleep(600);
      }
      if (!bars) { errs.push(tk); continue; }
      bars = bars.filter((x) => x[0] <= closed && x[4] > 0);
      if (bars.length < 120) { errs.push(tk); continue; }
      // เกณฑ์ผ่าน Wait: แนวโน้มยังขึ้น (ปิด>MA150 และ MA50>MA200) — RS>60 กรองที่ฝั่งเว็บตามฐานที่เลือก
      const cl = bars.map((x) => x[4]);
      const m150 = sma(cl, 150, bars.length - 1), m200 = sma(cl, 200, bars.length - 1), m50 = sma(cl, 50, bars.length - 1);
      if (!(cl[cl.length - 1] > m150 && m50 > m200)) continue;
      const vdus = vduHistory(bars);
      for (const fn of [findVDU, findVCP]) {
        const hit = fn(bars);
        if (hit) rows.push({ tk, ...hit, vdus });
      }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  rows.sort((a, b) => (a.st === b.st ? (a.toGo ?? 0) - (b.toGo ?? 0) : (a.st === "BREAK" ? -1 : 1)));
  const out = { generatedAt: new Date().toISOString().slice(0, 19), market: mk, asOf: closed, total: rows.length, rows };
  fs.writeFileSync(path.join(OUT, `pivot_${mk}.json`), JSON.stringify(out));
  log(mk, `ได้ ${rows.length} แถว (BREAK ${rows.filter((r) => r.st === "BREAK").length}) · ดึงไม่สำเร็จ ${errs.length} · ใช้เวลา ${Math.round((Date.now() - t0) / 1000)} วิ`);
  return out;
}

const want = arg("market", "both");
const markets = want === "both" ? ["th", "us"] : [want];
const results = {};
for (const m of markets) results[m] = await run(m);
// เขียนโมดูลให้ serverless อ่าน (ไฟล์เล็ก)
const rd = (m) => { try { return JSON.parse(fs.readFileSync(path.join(OUT, `pivot_${m}.json`), "utf8")); } catch (e) { return null; } };
const merged = { th: rd("th"), us: rd("us") };
const mod = "// สร้างโดย scripts/flow/precompute_pivot.mjs — ห้ามแก้มือ\nexport default " + JSON.stringify(merged) + ";\n";
fs.writeFileSync(path.join(OUT, "api/_lib/pivot_data.js"), mod);
log("เขียน pivot_data.js เรียบร้อย");
