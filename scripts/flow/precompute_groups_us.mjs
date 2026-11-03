// คำนวณดัชนีกลุ่มหุ้นสหรัฐ "ครบทุกตัว" ล่วงหน้า สำหรับหน้าเงินไหล (Flow) — รันบนเครื่อง ไม่ติดเพดาน 30 วินาทีของ Vercel
//   node scripts/flow/precompute_groups_us.mjs [--host https://rsdashclean.vercel.app] [--out rsdash] [--conc 20]
// ผลลัพธ์: rsdash/flowg_us_{sector|theme}_{0|70|80|90}.json (8 ไฟล์) → ขึ้นเว็บพร้อมการ deploy ตามปกติ
// api/_lib/flow_th.js อ่านไฟล์เหล่านี้ก่อน (ต้องใหม่ไม่เกิน 72 ชม.) ถ้าไม่มี/เก่า/หุ้นน้อย → คำนวณสด ~220 ตัวเหมือนเดิม
// ความปลอดภัยของไฟล์เดิม: ดึงหุ้นได้น้อยกว่า 85% ของทั้งหมด → ไม่เขียนทับอะไรเลย (ออกด้วยรหัส 1)
// ใช้ตรรกะเดียวกับเซิร์ฟเวอร์ (buildGroups/alignBench/closes จาก flow_th.js) · ไม่ใช้ key/token ใด ๆ
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closes, buildGroups, alignBench, FULL_RS } from "../../rsdash/api/_lib/flow_th.js";

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const HOST = arg("host", "https://rsdashclean.vercel.app").replace(/\/$/, "");
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..", arg("out", "rsdash"));
const CONC = Math.max(1, parseInt(arg("conc", "20"), 10));
const MIN_OK = 0.85;
// log ลงไฟล์ด้วย (งานตั้งเวลารันแบบไม่มีหน้าต่าง) · ที่อยู่ปรับได้ด้วย --log
const LOG = arg("log", path.join(process.env.LOCALAPPDATA || ".", "rsdash", "precompute.log"));
fs.mkdirSync(path.dirname(LOG), { recursive: true });
const log = (...a) => { const line = new Date().toISOString().slice(0, 19) + " " + a.join(" "); console.log(line); try { fs.appendFileSync(LOG, line + "\n"); } catch (e) {} };
process.on("uncaughtException", (e) => { log("ERROR", String((e && e.message) || e)); process.exit(1); });
process.on("unhandledRejection", (e) => { log("ERROR", String((e && e.message) || e)); process.exit(1); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, tries = 3) {
  for (let i = 0; i < tries; i++) { try { const v = await fn(); if (v) return v; } catch (e) {} await sleep(400 * (i + 1) ** 2); }
  return null;
}

const t0 = Date.now();
const scan = await (await fetch(`${HOST}/api/scan?market=america`, { signal: AbortSignal.timeout(30000) })).json();
const pool = (scan.data || []).filter((s) => !s.isDR && s.hasPerf && s.val > 0);
log("scan", pool.length, "หุ้นที่ผ่านเกณฑ์");
if (pool.length < 500) { log("ERROR scan ได้หุ้นน้อยผิดปกติ — ยกเลิก (ไม่แตะไฟล์เดิม)"); process.exit(1); }

const rows = {}; let done = 0;
async function worker(list) { for (const s of list) { rows[s.ticker] = await withRetry(() => closes(s.ticker.replace(/\./g, "-"), 0, 15000)); if (++done % 200 === 0) log("ดึงราคา", done, "/", pool.length); } }
const parts = Array.from({ length: CONC }, (_, i) => pool.filter((_, j) => j % CONC === i));
await Promise.all(parts.map(worker));
const got = pool.filter((s) => rows[s.ticker]);
log("ได้ราคา", got.length, "จาก", pool.length);
if (got.length < pool.length * MIN_OK) { log(`ERROR ได้หุ้นไม่ถึง ${MIN_OK * 100}% — ไม่เขียนทับไฟล์เดิม`); process.exit(1); }

const spy = await withRetry(() => closes("SPY", 0, 15000));
const spyMap = spy ? new Map(spy) : null;
const generatedAt = new Date().toISOString();
let written = 0;
for (const by of ["sector", "theme"]) for (const rsMin of FULL_RS) {
  const sub = got.filter((s) => !rsMin || Number(s.rs) >= rsMin);
  if (sub.length < 30) { log("ข้าม", by, rsMin, "หุ้นน้อยเกินไป", sub.length); continue; }
  const g = buildGroups("us", by, sub, rows);
  let bench = null, benchName = "ตลาดสหรัฐ (ถ่วงเท่ากัน)";
  if (spyMap) { const b = alignBench(g.dates, spyMap); if (b) { bench = b; benchName = "SPY"; } }
  if (!bench) { log("ไม่มี SPY ที่ตรงวัน — ข้าม", by, rsMin); continue; }   // ไม่เขียนชุดที่ตัวเทียบไม่ครบ (ให้เซิร์ฟเวอร์คำนวณสดแทน)
  const j = { generatedAt, mk: "us", by, asOf: g.dates[g.dates.length - 1], dates: g.dates, series: g.series, members: g.members, bench, benchName, ew: g.ew, universe: sub.length, minMembers: g.minM, rsMin, grouped: g.grouped, full: true };
  const f = path.join(OUT, `flowg_us_${by}_${rsMin}.json`);
  fs.writeFileSync(f + ".tmp", JSON.stringify(j)); fs.renameSync(f + ".tmp", f); written++;
  log("เขียน", path.basename(f), "หุ้น", sub.length, "กลุ่ม", Object.keys(g.series).length, "ตามหลัง", g.dates.length, "วัน", (fs.statSync(f).size / 1024).toFixed(0) + "KB");
}
try { const { main } = await import("./precompute_rshist.mjs"); await main(); } catch (e) { log("rshist ERROR", String((e && e.message) || e)); }   // RS ย้อนหลังสำหรับเครื่องหมาย Buy (ล้มเหลวไม่กระทบไฟล์กลุ่ม)
log("เสร็จ", written, "ไฟล์ ใช้เวลา", Math.round((Date.now() - t0) / 1000), "วินาที · asOf", got.length ? "ok" : "");
if (!written) process.exit(1);
