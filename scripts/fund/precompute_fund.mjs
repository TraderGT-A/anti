#!/usr/bin/env node
/* precompute_fund.mjs — พื้นฐาน (P/E, P/S, GM, ปันผล, รายได้/กำไร 4 ไตรมาส) จาก Yahoo
   เขียน rsdash/fund/<th|us>/<shard>.json  (shard = อักษรแรกของ ticker) — เว็บอ่านเป็นไฟล์ static
   ใช้: node scripts/fund/precompute_fund.mjs --mk th|us|both [--conc 6] [--limit 50] [--force]
*/
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.RSDASH_ROOT || process.cwd();
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const MK = arg("--mk", "both");
const CONC = Number(arg("--conc", 6));
const LIMIT = Number(arg("--limit", 0));
const ONLY = new Set(String(arg("--only", "")).split(",").map(x => x.trim().toUpperCase()).filter(Boolean));
const FORCE = args.includes("--force");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const MODULES = "summaryDetail,defaultKeyStatistics,financialData,incomeStatementHistoryQuarterly,price";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cookieCrumb() {
  const r = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA }, redirect: "manual" });
  const ck = (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get("set-cookie")]).filter(Boolean).map((c) => c.split(";")[0]).join("; ");
  const c = await (await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", { headers: { "User-Agent": UA, Cookie: ck } })).text();
  return { cookie: ck, crumb: c.trim() };
}

const num = (v) => (v && typeof v === "object" ? (v.raw ?? null) : (typeof v === "number" ? v : null));
const pct = (v) => { const n = num(v); return n == null ? null : n; };


// ไตรมาสจาก timeseries (ครบกว่า incomeStatementHistoryQuarterly — ตัวหลังชอบขาดไตรมาส/ให้รายได้ 0)
async function fetchQuartersTimeseries(sym, years = 2) {
  const now = Math.floor(Date.now() / 1000);
  const p1 = now - years * 365 * 86400;
  const types = "quarterlyTotalRevenue,quarterlyNetIncome";
  const url = `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(sym)}?symbol=${encodeURIComponent(sym)}&type=${types}&period1=${p1}&period2=${now}`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return [];
    const j = await r.json();
    const res = j?.timeseries?.result || [];
    const rev = {}, ni = {};
    for (const blk of res) {
      const type = blk?.meta?.type?.[0] || Object.keys(blk).find((k) => k !== "meta");
      for (const x of blk?.[type] || []) {
        const d = (x?.asOfDate || "").slice(0, 10);
        const v = x?.reportedValue?.raw;
        if (!d || typeof v !== "number") continue;
        if (type === "quarterlyTotalRevenue") rev[d] = v;
        if (type === "quarterlyNetIncome") ni[d] = v;
      }
    }
    const dates = [...new Set([...Object.keys(rev), ...Object.keys(ni)])].sort();
    return dates.map((d) => ({ d, rev: rev[d] ?? null, ni: ni[d] ?? null }));
  } catch (e) {
    return [];
  }
}

async function fetchOne(sym, auth) {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=${MODULES}&crumb=${encodeURIComponent(auth.crumb)}`;
  const r = await fetch(url, { headers: { "User-Agent": UA, Cookie: auth.cookie }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  const d = j?.quoteSummary?.result?.[0];
  if (!d) throw new Error("no result");
  const sd = d.summaryDetail || {}, ks = d.defaultKeyStatistics || {}, fd = d.financialData || {}, pr = d.price || {};
  const qh = d.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
  let q = qh.slice(0, 4).map((x) => ({
    d: (x.endDate?.fmt || "").slice(0, 10),
    rev: num(x.totalRevenue),
    ni: num(x.netIncome),
  })).filter((x) => x.d).reverse();

  // เติมช่องว่างด้วย timeseries ถ้าจำนวนไตรมาสไม่ครบ 4 หรือมีรายได้เป็น 0/ว่าง
  const broken = q.length < 4 || q.some((x) => !x.rev || x.rev <= 0 || x.ni == null || x.ni === 0);
  if (broken) {
    const ts = await fetchQuartersTimeseries(sym);
    if (ts.length >= q.length) q = ts.slice(-4);
  }
  return {
    pe: num(sd.trailingPE), fpe: num(sd.forwardPE), ps: num(sd.priceToSalesTrailing12Months) ?? num(ks.priceToSalesTrailing12Months),
    pb: num(ks.priceToBook), gm: pct(fd.grossMargins), nm: pct(fd.profitMargins), om: pct(fd.operatingMargins),
    dy: num(sd.dividendYield), mcap: num(pr.marketCap) ?? num(sd.marketCap),
    revG: pct(fd.revenueGrowth), epsG: pct(fd.earningsGrowth), rev: num(fd.totalRevenue),
    hi: num(sd.fiftyTwoWeekHigh), lo: num(sd.fiftyTwoWeekLow), q,
    t: new Date().toISOString().slice(0, 10),
  };
}

function shardsOf(mk) {
  const d = path.join(ROOT, "rsdash", "desc", mk);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith(".json"));
}
const shardOf = (tk) => { const c = String(tk || "").charAt(0).toUpperCase(); return c >= "A" && c <= "Z" ? c : "0"; };
function load(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return {}; } }

async function runMarket(mk, auth) {
  const outdir = path.join(ROOT, "rsdash", "fund", mk);
  fs.mkdirSync(outdir, { recursive: true });
  let done = 0, fail = 0, total = 0;
  const shards = shardsOf(mk);
  for (const fn of shards) {
    const src = load(path.join(ROOT, "rsdash", "desc", mk, fn));
    const outp = path.join(outdir, fn);
    const dst = load(outp);
    let todo = Object.keys(src).filter((t) => FORCE || !dst[t] || !dst[t].t || dst[t].t < new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10));
    if (ONLY.size) todo = Object.keys(src).filter((t) => ONLY.has(String(t).toUpperCase()));
    total += todo.length;
    if (!todo.length) continue;
    console.log(`[fund] ${mk}/${fn}: ${todo.length} ตัว`);
    for (let i = 0; i < todo.length; i += CONC) {
      if (LIMIT && done >= LIMIT) { console.log(`[fund] ถึง limit ${LIMIT}`); return { done, fail }; }
      const batch = todo.slice(i, i + CONC);
      await Promise.all(batch.map(async (tk) => {
        const sym = mk === "th" ? `${tk}.BK` : tk.replace(/\./g, "-");
        try {
          dst[tk] = await fetchOne(sym, auth);
          done++;
        } catch (e) {
          fail++;
          if (fail <= 8) console.log(`[fund] ${tk} ล้ม: ${String(e.message).slice(0, 60)}`);
        }
      }));
      fs.writeFileSync(outp, JSON.stringify(dst));
      if ((i / CONC) % 5 === 0) console.log(`[fund] ${mk}/${fn} ${Math.min(i + CONC, todo.length)}/${todo.length} (ok ${done} fail ${fail})`);
      await sleep(250);
    }
  }
  console.log(`[fund] ${mk} จบ: ok ${done} fail ${fail} จาก ${total}`);
  return { done, fail };
}

const auth = await cookieCrumb();
if (!auth.crumb || auth.crumb.length > 40) { console.error("ขอ crumb ไม่ได้"); process.exit(1); }
console.log("[fund] crumb ok");
for (const mk of (MK === "both" ? ["th", "us"] : [MK])) {
  await runMarket(mk, auth);
}
console.log("[fund] เสร็จทั้งหมด");
