// คำนวณ "RS ย้อนหลังรายวัน" ของหุ้นทุกตัว (ไทย + สหรัฐ) เพื่อใช้ในเครื่องหมาย Buy บนกราฟ (เงื่อนไข RS>60 ย้อนหลัง)
//   สูตรเดียวกับ RS ของระบบ (api/_lib/scan.js): score = 0.3·ผลตอบแทน1M + 0.3·3M + 0.2·6M + 0.2·1Y → เปอร์เซ็นไทล์ 1–99 เทียบหุ้นทั้งชุดในวันนั้น
//   ผลตอบแทนใช้ช่วงปฏิทิน 1/3/6/12 เดือนเหมือน TradingView (ราคา ณ วันทำการล่าสุดที่ไม่เกินวันนี้−n เดือน) · ชุดหุ้น = ชุดที่ผ่านเกณฑ์ ณ วันนี้ (ไม่รวมหุ้นที่หลุดเกณฑ์/เพิกถอนไปแล้ว)
//   ผลลัพธ์: rsdash/rshist_{us|th}.json = { generatedAt, mk, dates:[…], rs:{ticker:[…]} } (0 = ไม่มีข้อมูลวันนั้น) · ข้อมูล 3 ปี → RS ย้อนหลังได้ ~2 ปี (ปีแรกใช้เป็นฐานคำนวณ)
//   เรียกจาก precompute_groups_us.mjs (งานตั้งเวลารายวัน) หรือรันเดี่ยว: node scripts/flow/precompute_rshist.mjs [--host …] [--out rsdash]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { closes } from "../../rsdash/api/_lib/flow_th.js";
import { scanMarket } from "../../rsdash/api/_lib/scan.js";
const WebSocket = createRequire(import.meta.url)("../../rsdash/node_modules/ws");   // ws อยู่ในโฟลเดอร์ rsdash (dependency ของเว็บอยู่แล้ว)

// ราคาปิดรายวันจาก TradingView ผ่าน websocket (แหล่งเดียวกับที่ระบบใช้คิดผลตอบแทน/RS ของหุ้นไทย · ปรับ split) — รูปแบบเดียวกับ closes(): [[YYYY-MM-DD, close], …]
function tvCloses(tvSym, tz, count = 780, timeout = 12000) {
  return new Promise((resolve) => {
    const ws = new WebSocket("wss://data.tradingview.com/socket.io/websocket", { headers: { Origin: "https://www.tradingview.com", "User-Agent": "Mozilla/5.0" } });
    const frame = (o) => { const s = JSON.stringify(o); return "~m~" + s.length + "~m~" + s; };
    const send = (m, p) => ws.send(frame({ m, p }));
    const cs = "cs_" + Math.random().toString(36).slice(2, 14), bars = []; let done = false;
    const finish = (ok) => { if (done) return; done = true; clearTimeout(timer); try { ws.close(); } catch (e) {} const seen = new Set();
      const out = ok ? bars.filter((v) => v && v.length >= 5 && !seen.has(v[0]) && seen.add(v[0])).sort((a, b) => a[0] - b[0]).map((v) => [new Date((v[0] + tz * 3600) * 1000).toISOString().slice(0, 10), v[4], v[1], v[5]]) : null;   // [วันที่, ปิด, เปิด, ปริมาณ]
      resolve(out && out.length > 100 ? out : null); };
    const timer = setTimeout(() => finish(bars.length > 100), timeout);
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

// Yahoo รายวัน 3 ปี → [[วันที่, ปิด, เปิด, ปริมาณ], …] (สหรัฐ)
async function yRows(sym, tz, timeout = 15000) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=3y`, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }, signal: AbortSignal.timeout(timeout) });
  const res = (await r.json())?.chart?.result?.[0]; if (!res) return null;
  const q = res.indicators?.quote?.[0] || {}, out = [];
  (res.timestamp || []).forEach((t, i) => { if (q.close?.[i] != null) out.push([new Date((t + tz * 3600) * 1000).toISOString().slice(0, 10), q.close[i], q.open?.[i] ?? null, q.volume?.[i] ?? null]); });
  return out.length > 100 ? out : null;
}
// แท่งรายวัน "ที่ปิดแล้ว" เท่านั้น: วันที่ล่าสุดที่ถือว่าปิดแล้วของตลาด (ถ้ายังไม่เลยเวลาปิด+30 นาที ตัดแท่งของวันนี้ออก) — สัญญาณ Buy/Wait/Sell เปลี่ยนเมื่อแท่ง Day ปิดแล้วเท่านั้น
function lastClosedDate(mk, now = new Date()) {
  const tzn = mk === "us" ? "America/New_York" : "Asia/Bangkok", closeBuf = mk === "us" ? 16 * 60 + 30 : 17 * 60;
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tzn, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).map((x) => [x.type, x.value]));
  const today = `${p.year}-${p.month}-${p.day}`, mins = +p.hour * 60 + +p.minute;
  if (mins >= closeBuf) return today;
  return new Date(Date.parse(today + "T00:00:00Z") - 864e5).toISOString().slice(0, 10);   // เมื่อวาน (วันนี้ยังไม่ปิด)
}

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const HOST = arg("host", "https://rsdashclean.vercel.app").replace(/\/$/, "");
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..", arg("out", "rsdash"));
const CONC = Math.max(1, parseInt(arg("conc", "20"), 10));
const LOG = arg("log", path.join(process.env.LOCALAPPDATA || ".", "rsdash", "precompute.log"));
const log = (...a) => { const line = new Date().toISOString().slice(0, 19) + " [rshist] " + a.join(" "); console.log(line); try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.appendFileSync(LOG, line + "\n"); } catch (e) {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withRetry(fn, tries = 3) { for (let i = 0; i < tries; i++) { try { const v = await fn(); if (v) return v; } catch (e) {} await sleep(400 * (i + 1) ** 2); } return null; }
const pctile = (i, total) => Math.max(1, Math.min(99, Math.round(((total - i) / total) * 99)));   // เหมือน percentile() ใน scan.js

export async function computeMarket(mk) {
  const t0 = Date.now(), market = mk === "us" ? "america" : "thailand", tz = mk === "us" ? 0 : 7;
  // RS ของระบบจัดอันดับเทียบ "หุ้นทั้งตลาด" (raw: ไทย ~876 / สหรัฐ ~2,500 ตัว) ไม่ใช่เฉพาะชุดที่แสดง (clean) → ใช้ scanMarket() ตัวเดียวกับที่เว็บใช้
  const sm = await scanMarket(market);
  const pool = sm.raw.filter((s) => s.ticker && s.hasPerf);
  const shown = new Set(sm.clean.map((s) => s.ticker));   // เก็บผลเฉพาะหุ้นที่แสดงในแดชบอร์ด (ลดขนาดไฟล์)
  if (pool.length < (mk === "us" ? 1000 : 300)) throw new Error(mk + ": scan ได้หุ้นน้อยผิดปกติ " + pool.length);
  const ysym = (t) => (mk === "us" ? t.replace(/\./g, "-") : t.replace(/\./g, "-") + ".BK");
  const rows = {}; let done = 0;
  // ไทย: ราคาจาก TradingView (ให้ตรงกับที่ระบบใช้) · สหรัฐ: Yahoo
  const conc = mk === "th" ? Math.min(CONC, 8) : CONC;
  const getRows = mk === "th" ? (s) => tvCloses(s.tv || "SET:" + s.ticker, tz) : (s) => yRows(ysym(s.ticker), tz);
  const cut = lastClosedDate(mk);   // ตัดแท่งที่ยังไม่ปิด (วันนี้ก่อนเวลาปิดตลาด) ออก
  const parts = Array.from({ length: conc }, (_, i) => pool.filter((_, j) => j % conc === i));
  await Promise.all(parts.map(async (list) => { for (const s of list) { const r = await withRetry(() => getRows(s)); rows[s.ticker] = r ? r.filter((x) => x[0] <= cut) : null; if (rows[s.ticker] && rows[s.ticker].length < 100) rows[s.ticker] = null; if (++done % 400 === 0) log(mk, "ดึงราคา", done, "/", pool.length); } }));
  log(mk, "ใช้แท่งที่ปิดแล้วถึง", cut);
  const got = pool.filter((s) => rows[s.ticker]);
  log(mk, "ได้ราคา", got.length, "จาก", pool.length);
  if (got.length < pool.length * 0.85) throw new Error(mk + ": ได้หุ้นไม่ถึง 85% — ไม่เขียนทับไฟล์เดิม");
  // วันที่ที่ใช้: วันที่มีหุ้นอย่างน้อยครึ่งหนึ่ง (กันวันแปลก ๆ)
  const cnt = new Map(); got.forEach((s) => rows[s.ticker].forEach(([d]) => cnt.set(d, (cnt.get(d) || 0) + 1)));
  const dates = [...cnt.keys()].filter((d) => cnt.get(d) >= got.length * 0.5).sort();
  const T = dates.length, tk = got.map((s) => s.ticker), N = tk.length;
  const C = tk.map((t) => { const m = new Map(rows[t]); let last = null; return dates.map((d) => { const v = m.get(d); if (v != null) last = v; return last; }); });   // เติมค่าล่าสุดข้ามวันที่ไม่มีราคา
  // ช่วงผลตอบแทนแบบปฏิทิน (1/3/6/12 เดือน) เหมือน TradingView: ราคา ณ วันทำการล่าสุดที่ไม่เกิน (วันนี้ − n เดือน)
  const monthsBack = (d, n) => { const [y, m, dd] = d.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1 - n, 1)); const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); t.setUTCDate(Math.min(dd, last)); return t.toISOString().slice(0, 10); };
  const idxLE = (d) => { let lo = 0, hi = T - 1, r = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (dates[mid] <= d) { r = mid; lo = mid + 1; } else hi = mid - 1; } return r; };
  const LBM = [[1, 0.3], [3, 0.3], [6, 0.2], [12, 0.2]];   // [เดือนย้อนหลัง, น้ำหนัก]
  const back = dates.map((d) => LBM.map(([mm]) => (monthsBack(d, mm) >= dates[0] ? idxLE(monthsBack(d, mm)) : -1)));
  const start = back.findIndex((b) => b.every((i) => i >= 0));
  if (start < 0) throw new Error(mk + ": ประวัติราคาสั้นเกินไป");
  const outDates = dates.slice(start), rs = {}; tk.forEach((t) => (rs[t] = new Array(outDates.length).fill(0)));
  // RS แยกฐาน 3M/6M/1Y (บอส 3 พ.ย. 26: "เลือก RS ค่าไหนทุกสูตรเปลี่ยนหมดตามค่า" — สัญญาณ Buy RS>60 ต้องเป็น RS ของฐานที่เลือก)
  const rsB = { rs3: {}, rs6: {}, rs1: {} }; tk.forEach((t) => { rsB.rs3[t] = new Array(outDates.length).fill(0); rsB.rs6[t] = new Array(outDates.length).fill(0); rsB.rs1[t] = new Array(outDates.length).fill(0); });
  for (let t = start; t < T; t++) {
    const sc = [], scB = { rs3: [], rs6: [], rs1: [] };
    for (let k = 0; k < N; k++) {
      const c = C[k]; if (c[t] == null) continue; let s = 0, ok = true;
      const pr = [0, 0, 0];
      for (let q = 0; q < LBM.length; q++) {
        const p = c[back[t][q]]; if (p == null || !(p > 0)) { ok = false; break; }
        const r = (c[t] / p - 1) * 100; s += LBM[q][1] * r;
        if (q > 0) pr[q - 1] = r;   // q=1 → 3M · q=2 → 6M · q=3 → 12M
      }
      if (ok) { sc.push([k, s]); scB.rs3.push([k, pr[0]]); scB.rs6.push([k, pr[1]]); scB.rs1.push([k, pr[2]]); }
    }
    sc.sort((a, b) => b[1] - a[1]);
    sc.forEach(([k], i) => { rs[tk[k]][t - start] = pctile(i, sc.length); });
    for (const bk of ['rs3', 'rs6', 'rs1']) { const arr = scB[bk]; arr.sort((a, b) => b[1] - a[1]); arr.forEach(([k], i) => { rsB[bk][tk[k]][t - start] = pctile(i, arr.length); }); }
  }
  // ตรวจเทียบกับ RS ปัจจุบันจากระบบ (ต่างได้เล็กน้อยเพราะนิยามช่วงเวลา)
  const cur = new Map(got.filter((s) => shown.has(s.ticker)).map((s) => [s.ticker, Number(s.rs)])); let n = 0, abs = 0, within5 = 0, same70 = 0;
  for (const t of tk) { if (!shown.has(t)) continue; const a = rs[t][outDates.length - 1], b = cur.get(t); if (a > 0 && b > 0) { n++; abs += Math.abs(a - b); if (Math.abs(a - b) <= 5) within5++; if ((a > 70) === (b > 70)) same70++; } }
  log(mk, "ตรวจเทียบ RS ล่าสุดกับระบบ: หุ้น", n, "· ต่างเฉลี่ย", (abs / n).toFixed(2), "· ต่าง≤5:", (100 * within5 / n).toFixed(0) + "%", "· ตัดสิน RS>70 ตรงกัน:", (100 * same70 / n).toFixed(0) + "%");
  if (!(n > 0) || abs / n > 8) throw new Error(mk + ": RS ที่คำนวณต่างจากระบบมากผิดปกติ — ไม่เขียนไฟล์");
  // สัญญาณ Buy/Wait/Sell ณ แท่งที่ปิดล่าสุด — กฎเดียวกับ bsEval ใน index.html: [รหัส 0=Sell(บิต 2,4) 1=Wait(บิต 1,8,16,32) 2=Buy, flags, RS]
  //   flags: 1=3M ไม่บวก (ปิด ≤ ปิด 63 แท่งก่อน) · 2=SMA50≤SMA200 · 4=ปิด ≤ SMA150 · 8=RS ≤ 60 · 16=ไม่ย่อ (ไม่ใช่ ปิด<SMA20 และปิดเขียว) · 32=ปริมาณไม่เพิ่มจากแท่งก่อน
  const sig = {}, sigB = { rs3: {}, rs6: {}, rs1: {} }, Li = outDates.length - 1;
  for (const t of tk) {
    if (!shown.has(t)) continue; const b = rows[t], n = b.length, L = n - 1;
    if (n < 200 || b[L][0] !== outDates[Li]) continue;
    const cs = [0]; b.forEach((x, i) => cs.push(cs[i] + x[1])); const avg = (k) => (cs[n] - cs[n - k]) / k;
    const px = b[L][1], s20 = avg(20), s50 = avg(50), s150 = avg(150), s200 = avg(200);
    let f0 = 0;
    if (!(px > b[L - 63][1])) f0 |= 1;
    if (!(s50 > s200)) f0 |= 2;
    if (!(px > s150)) f0 |= 4;
    if (!(px < s20 && b[L][2] != null && px > b[L][2])) f0 |= 16;
    if (!(b[L][3] != null && b[L - 1][3] != null && b[L][3] > b[L - 1][3])) f0 |= 32;
    // สัญญาณครบทุกฐาน RS: rs = สูตรรวมเดิม · rs3/rs6/rs1 = RS ของฐานนั้น (เกณฑ์ RS>60 เปลี่ยนตามฐานที่ผู้ใช้เลือก)
    for (const bk of ['rs', 'rs3', 'rs6', 'rs1']) {
      const rsv = bk === 'rs' ? rs[t][Li] : rsB[bk][t][Li];
      const f = f0 | ((!(rsv > 60)) ? 8 : 0);
      (bk === 'rs' ? sig : sigB[bk])[t] = [(f & 6) ? 0 : (f & 57) ? 1 : 2, f, rsv, +px.toFixed(4)];
    }   // [รหัส, flags, RS, ราคาปิดแท่งล่าสุดที่ปิดแล้ว — ใช้คิดระยะห่างจากจุดสูง 52 สัปดาห์]
  }
  // ประวัติสัญญาณ Buy 8 แท่งล่าสุด (7 แท่งก่อนหน้า + แท่งล่าสุดที่หน้า TODAY ไม่นับเป็นย้อนหลัง) (ทุกตัวที่มีราคา): วันที่ที่ผ่านเงื่อนไข Buy ครบ (กฎเดียวกับ bsEval/bsMarks) → bh[ticker] = [วันที่, …] — ใช้ในหน้า TODAY "Buy ย้อนหลัง 7 วัน"
  const buy7s = { rs: {}, rs3: {}, rs6: {}, rs1: {} };
  for (const t of tk) {
    const b = rows[t]; if (!b || b.length < 230) continue;
    const bm = new Map(b.map((x, i) => [x[0], i])), cs2 = [0]; b.forEach((x, i) => cs2.push(cs2[i] + x[1]));
    for (const bk of ['rs', 'rs3', 'rs6', 'rs1']) {
    const RQ = bk === 'rs' ? rs[t] : rsB[bk][t];
    const days = [];
    for (let q = Math.max(0, Li - 7); q <= Li; q++) {
      const j = bm.get(outDates[q]); if (j == null || j < 199) continue;
      const px = b[j][1], r = RQ[q]; if (!(r > 60)) continue;
      const a = (k) => (cs2[j + 1] - cs2[j + 1 - k]) / k, s20 = a(20), s150 = a(150);
      if (!(px > b[j - 63][1] && a(50) > a(200) && px > s150)) continue;
      if (!(px < s20 && b[j][2] != null && px > b[j][2])) continue;
      if (!(b[j][3] != null && b[j - 1][3] != null && b[j][3] > b[j - 1][3])) continue;
      days.push(outDates[q]);
    }
    if (days.length) buy7s[bk][t] = days;
    }
  }
  const buy7 = buy7s.rs;
  log(mk, "Buy ย้อนหลัง 8 แท่ง:", Object.keys(buy7).length, "ตัว · ฐาน 3M", Object.keys(buy7s.rs3).length, "/ 6M", Object.keys(buy7s.rs6).length, "/ 1Y", Object.keys(buy7s.rs1).length);
  const cnt3 = [0, 0, 0]; Object.values(sig).forEach((x) => cnt3[x[0]]++); log(mk, "สัญญาณ ณ", outDates[Li], "· Sell", cnt3[0], "Wait", cnt3[1], "Buy", cnt3[2]);
  const rsOut = {}; for (const t of tk) if (shown.has(t)) rsOut[t] = rs[t];   // เก็บเฉพาะหุ้นที่แสดงในแดชบอร์ด (จัดอันดับใช้ทั้งตลาด)
  const rsBOut = {}; for (const bk of ['rs3', 'rs6', 'rs1']) { rsBOut[bk] = {}; for (const t of tk) if (shown.has(t)) rsBOut[bk][t] = rsB[bk][t]; }
  const j = { generatedAt: new Date().toISOString(), mk, dates: outDates, rs: rsOut, rs3: rsBOut.rs3, rs6: rsBOut.rs6, rs1: rsBOut.rs1, sig3: sigB.rs3, sig6: sigB.rs6, sig1: sigB.rs1, bh3: buy7s.rs3, bh6: buy7s.rs6, bh1: buy7s.rs1, sig, bh: buy7, sigAsOf: outDates[Li], universe: N, shown: Object.keys(rsOut).length, check: { n, meanAbsDiff: +(abs / n).toFixed(2), within5: +(within5 / n).toFixed(3), same70: +(same70 / n).toFixed(3) } };
  const f = path.join(OUT, `rshist_${mk}.json`); fs.writeFileSync(f + ".tmp", JSON.stringify(j)); fs.renameSync(f + ".tmp", f);
  // พ่น data.js ให้ Vercel serverless (/api/scan) import ได้แน่นอน (บอส 3 พ.ย.: CNT เกิดสัญญาณเมื่อวาน วันนี้หาย — ให้หุ้นข้อสถานะอยู่ครบไม่หายกลางวัน)
  const fData = path.resolve(OUT, "api", "_lib", `rshist_${mk}_data.js`);
  fs.writeFileSync(fData + ".tmp", "// สร้างอัตโนมัติจาก rshist_" + mk + ".json (precompute) — ห้ามแก้มือ\nexport default " + JSON.stringify(j) + ";\n");
  fs.renameSync(fData + ".tmp", fData);
  log(mk, "เขียน", path.basename(f), "หุ้น", N, "วัน", outDates.length, (fs.statSync(f).size / 1024).toFixed(0) + "KB", "ใช้เวลา", Math.round((Date.now() - t0) / 1000), "วินาที");
}

export async function main() {
  let okAny = false;
  // ด่านตรวจเทียบ: ถ้า RS ที่คำนวณต่างจาก RS จริงของระบบเกิน 8 คะแนน (เฉลี่ย) จะไม่เขียนไฟล์ของตลาดนั้น (เว็บจะวาดเครื่องหมายแบบไม่รวม RS)
  //   บทเรียน 2 พ.ย. 2026: RS ของระบบจัดอันดับเทียบหุ้นทั้งตลาด (ไทย ~876 ตัว) ไม่ใช่เฉพาะชุดที่แสดง — จัดอันดับเทียบ 182 ตัวจะต่างเฉลี่ย ~15
  const only = arg("only", ""), mks = only ? [only] : ["th", "us"];   // --only th|us (งานตั้งเวลารอบเย็นรันเฉพาะไทยหลังปิดตลาด)
  for (const mk of mks) { try { await computeMarket(mk); okAny = true; } catch (e) { log("ERROR", String((e && e.message) || e)); } }
  return okAny;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { const ok = await main(); process.exit(ok ? 0 : 1); }
