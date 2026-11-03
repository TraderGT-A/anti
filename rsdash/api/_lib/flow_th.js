// /api/flow?kind=groups&mk=th|us&by=… — ดัชนีกลุ่มหุ้นที่สร้างเอง (เฉลี่ยถ่วงเท่ากันของหุ้นสมาชิก) + ดัชนีเทียบ สำหรับ Rotation Graph
//   mk=th: หุ้นไทยที่ผ่านเกณฑ์ทุกตัว (จาก /api/scan?market=thailand) ราคาบาท เทียบ SET   · by = sector (TradingView) | setind (กลุ่มอุตสาหกรรม SET) | setsec (หมวดธุรกิจ SET) | theme (Theme ของเรา)
//   mk=us: เทียบ SPY · by = sector (TradingView) | theme (Theme ของเรา)
//          ถ้ามีไฟล์คำนวณล่วงหน้าครบทุกตัว (/flowg_us_{by}_{rs}.json จาก scripts/flow/precompute_groups_us.mjs รันบนเครื่อง) และใหม่ไม่เกิน 72 ชม. → ใช้ไฟล์นั้น (source:"full")
//          ไม่งั้นคำนวณสดจากหุ้นสภาพคล่องสูงสุด ~220 ตัว (source:"top220") — กลไกสำรองเดิม
// kind=thgroups = ชื่อเดิม (mk=th, by=sector) เก็บไว้ให้เว็บรุ่นเก่า · Yahoo ราคาปิด 1 ปี · แคช CDN 6 ชม. · ไม่ใช้ LLM
import { SET_MAP, SET_IND, SET_SEC } from "./set_sectors.js";
import { themeLabel } from "./themes.js";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
const MIN_MEMBERS = 3, MIN_THEME = 2;   // Theme: ขั้นต่ำ 2 ตัว (ตรงกับแผง "Themes จาก RS แข็งแกร่ง" ในหน้าภาพรวม)
export const FULL_RS = [0, 70, 80, 90];   // ค่ากรอง RS ที่คำนวณล่วงหน้าไว้ (ค่าอื่นที่ผู้ใช้พิมพ์เอง → คำนวณสด 220 ตัว)
const FULL_MAX_AGE = 72 * 3600e3;          // ไฟล์เก่ากว่านี้ถือว่าไม่ใช้ (ครอบคลุมวันหยุดยาว)

export async function closes(sym, tz, timeout = 7000, range = "1y") {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=${range}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(timeout) });
  const res = (await r.json())?.chart?.result?.[0];
  if (!res) return null;
  const c = res.indicators?.quote?.[0]?.close || [], out = [];
  (res.timestamp || []).forEach((t, i) => { if (c[i] != null) out.push([new Date((t + tz * 3600) * 1000).toISOString().slice(0, 10), c[i]]); });
  return out.length > 100 ? out : null;
}

export function groupKey(mk, by, s) {
  if (/Investment Trusts|Real Estate Investment Trusts/i.test(s.industry || '')) return null;   // กองทุน/REIT ไม่ใช่หุ้นสามัญ
  if (by === "theme") return themeLabel(s.industry);
  if (mk === "th" && by === "setind") { const m = SET_MAP[s.ticker]; return m ? SET_IND[m[0]] : null; }
  if (mk === "th" && by === "setsec") { const m = SET_MAP[s.ticker]; return m ? (m[1] ? SET_SEC[m[1]] : (SET_IND[m[0]] + " (mai)")) : null; }
  return s.sector || "Other";
}

// got = หุ้นที่ดึงราคาได้ · rows = { ticker: [[date, close], ...] } → ดัชนีกลุ่มถ่วงเท่ากัน (ใช้ทั้งในเซิร์ฟเวอร์และสคริปต์คำนวณล่วงหน้า)
export function buildGroups(mk, by, got, rows) {
  const dset = new Set(); got.forEach((s) => rows[s.ticker].forEach(([d]) => dset.add(d)));
  const dates = [...dset].sort();
  const ret = {};
  for (const s of got) {
    const m = new Map(rows[s.ticker]); let prev = null; const r = [];
    for (const d of dates) { const c = m.get(d); r.push(c != null && prev != null ? c / prev - 1 : null); if (c != null) prev = c; }
    ret[s.ticker] = r;
  }
  const groups = {};
  for (const s of got) { const k = groupKey(mk, by, s); if (k) (groups[k] = groups[k] || []).push(s.ticker); }
  const minM = by === "theme" ? MIN_THEME : MIN_MEMBERS;
  const other = []; for (const [g, a] of Object.entries(groups)) if (a.length < minM) { other.push(...a); delete groups[g]; }
  if (by === "sector" && other.length >= MIN_MEMBERS) groups["Other"] = other;   // theme/SET: กลุ่มเล็กเกินไปตัดทิ้ง ไม่รวมเป็น Other
  const idx = (tks) => { let v = 100; const out = [];
    dates.forEach((_, i) => { const xs = tks.map((t) => ret[t][i]).filter((x) => x != null); if (xs.length) v *= 1 + xs.reduce((a, b) => a + b, 0) / xs.length; out.push(Math.round(v * 1e4) / 1e4); });
    return out; };
  const series = {}, members = {};
  for (const [g, a] of Object.entries(groups)) { series[g] = idx(a); members[g] = a; }
  const ew = idx(got.map((s) => s.ticker));
  return { dates, series, members, ew, minM, grouped: Object.values(members).reduce((a, x) => a + x.length, 0) };
}

// ตัวเทียบ (SPY/SET) จัดให้ตรงวันที่ของดัชนีกลุ่ม · ข้อมูลไม่ครบ (<90%) → null
export function alignBench(dates, m) {
  let last = null; const b = dates.map((d) => { if (m.has(d)) last = m.get(d); return last; });
  return b.filter((x) => x != null).length > dates.length * 0.9 ? b : null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const mk = req.query.mk === "us" ? "us" : "th";
  const by = ["sector", "setind", "setsec", "theme"].includes(req.query.by) ? req.query.by : "sector";
  if (mk === "us" && (by === "setind" || by === "setsec")) return res.status(400).json({ error: "SET grouping is TH only" });
  const rsMin = Math.max(0, Math.min(99, parseInt(req.query.rs, 10) || 0));   // กรองหุ้นด้วย RS ขั้นต่ำก่อนรวมกลุ่ม (ตรงกับแผง Themes ในหน้าภาพรวมที่ใช้ RS≥80)
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const TOP = 220, tz = mk === "us" ? 0 : 7;
  // ทางลัด: ไฟล์คำนวณล่วงหน้าครบทุกหุ้นสหรัฐ (ใหม่ไม่เกิน 72 ชม. และมีหุ้นพอ) — ไม่ผ่านเงื่อนไขใด ๆ ก็ตกไปคำนวณสดด้านล่าง
  if (mk === "us" && (by === "sector" || by === "theme") && FULL_RS.includes(rsMin)) {
    try {
      const j = await (await fetch(`https://${host}/flowg_us_${by}_${rsMin}.json`, { signal: AbortSignal.timeout(6000) })).json();
      if (j && j.generatedAt && Date.now() - Date.parse(j.generatedAt) < FULL_MAX_AGE && j.universe >= 100 && j.series && j.dates) {
        res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
        return res.status(200).json({ ...j, source: "full" });
      }
    } catch (e) {}
  }
  try {
    const scan = await (await fetch(`https://${host}/api/scan?market=${mk === "us" ? "america" : "thailand"}`, { signal: AbortSignal.timeout(20000) })).json();
    const pool = (scan.data || []).filter((s) => !s.isDR && s.hasPerf && s.val > 0 && (!rsMin || Number(s.rs) >= rsMin)).sort((a, b) => b.val - a.val).slice(0, TOP);
    const ysym = (t) => (mk === "us" ? t.replace(/\./g, "-") : t.replace(/\./g, "-") + ".BK");
    const rows = {};
    for (let i = 0; i < pool.length; i += 40) await Promise.all(pool.slice(i, i + 40).map(async (s) => { try { rows[s.ticker] = await closes(ysym(s.ticker), tz); } catch (e) {} }));
    const got = pool.filter((s) => rows[s.ticker]);
    if (got.length < pool.length * 0.6) { res.setHeader("Cache-Control", "no-store"); return res.status(502).json({ error: "too few stocks", got: got.length, of: pool.length }); }
    const { dates, series, members, ew, minM, grouped } = buildGroups(mk, by, got, rows);
    let bench = null, benchName = mk === "us" ? "ตลาดสหรัฐ (ถ่วงเท่ากัน)" : "ตลาดไทย (ถ่วงเท่ากัน)";
    try {
      let m;
      if (mk === "th") { const j = await (await fetch(`https://${host}/api/idxchart?symbol=%5ESET.BK&interval=1d&range=2y`, { signal: AbortSignal.timeout(8000) })).json(); m = new Map((j.data || []).map((b) => [String(b.time), b.close])); }
      else m = new Map(await closes("SPY", 0));
      const b = alignBench(dates, m);
      if (b) { bench = b; benchName = mk === "us" ? "SPY" : "SET"; }
    } catch (e) {}
    // ถ้าใช้ตัวเทียบสำรอง (ดึง SET/SPY ไม่ได้) อย่าแคชนาน
    res.setHeader("Cache-Control", bench ? "public, s-maxage=21600, stale-while-revalidate=86400" : "public, s-maxage=60");
    return res.status(200).json({ mk, by, asOf: dates[dates.length - 1], dates, series, members, bench: bench || ew, benchName, ew, universe: got.length, minMembers: minM, rsMin, grouped, source: mk === "us" ? "top220" : "all" });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: String((e && e.message) || e).slice(0, 100) });
  }
}
