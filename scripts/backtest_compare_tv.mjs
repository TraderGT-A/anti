// เปรียบเทียบกลยุทธ์พื้นฐานบนข้อมูลจริง ด้วย "เกณฑ์ผ่านที่ตั้งไว้ล่วงหน้า" (ไม่ปรับกฎตามผล)
//   node scripts/backtest_compare.mjs th|us
// กลยุทธ์:  A ดัชนี buy&hold · B ดัชนี+Market Gate · C โมเมนตัม 12-1 ถ่วงเท่ากัน 20 ตัว · D = C + Gate · E = Champion เดิม (อ้างอิง)
// เกณฑ์ผ่าน (ตั้งก่อนรัน): (1) CAGR > ดัชนี ทั้งช่วงเต็มและทั้งสองครึ่ง (2) MaxDD ไม่แย่กว่าดัชนีเกิน 10 จุด
//                          (3) CAGR ช่วงเต็ม > เปอร์เซ็นไทล์ 95 ของกลุ่มควบคุมสุ่ม (โครงสร้างเดียวกัน 100 ครั้ง)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MK = "th_tv", isTH = true;
const MKX = "th_tv";
const CFG = { cap: 1e6, minPrice: 1, minTurn: 5e6, cost: 0.0025 };
const IDX_COST = CFG.cost / 2;   // ดัชนี/ETF ต้นทุนต่ำกว่าหุ้นรายตัว
const HERMES = process.env.HERMES_SCRIPTS || "C:/Users/Tar/AppData/Local/hermes/scripts";
const px = JSON.parse(fs.readFileSync(path.join(HERMES, "bt_ohlcv_full.json"), "utf8"));
const csv = fs.readFileSync(path.join(HERMES, "idx_SET_daily_full.csv"), "utf8").trim().split(/\r?\n/).slice(1).map((l) => l.split(","));
const cal = csv.map((r) => r[0]), n = cal.length, calIdx = new Map(cal.map((d, i) => [d, i]));
const IC = Float64Array.from(csv.map((r) => +r[4])), IO = Float64Array.from(csv.map((r) => +r[1]));
const T = [];
for (const [tk, bars] of Object.entries(px)) {
  const o = new Float64Array(n).fill(NaN), c = new Float64Array(n).fill(NaN), v = new Float64Array(n).fill(0); let cnt = 0;
  for (const b of bars) { const k = calIdx.get(b.t); if (k !== undefined && b.c > 0) { o[k] = b.o; c[k] = b.c; v[k] = b.v || 0; cnt++; } }
  if (cnt >= 400) T.push({ tk, o, c, v });
}
const FROM = process.env.FROM || "2015-01-01";const sma = (a, k, p) => { if (k < p - 1) return NaN; let s = 0; for (let i = k - p + 1; i <= k; i++) s += a[i]; return s / p; };
const gateExp = (k) => { const c = IC[k], s50 = sma(IC, k, 50), s200 = sma(IC, k, 200); if (!(s200 > 0)) return 0; if (c > s50 && c > s200) return 1; if (c <= s50 && c <= s200) return 0; return 0.5; };
const first = cal.findIndex((d) => d >= FROM);
const rebal = []; for (let i = Math.max(first, 253); i < n; i++) if (cal[i].slice(0, 7) !== cal[i - 1].slice(0, 7)) rebal.push(i);
const START = rebal[0], rset = new Set(rebal);
const r2 = (x) => Math.round(x * 100) / 100;
function rng(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---- ตัวคัดหุ้น: คืน [{s, w}] (น้ำหนักรวม 1 ก่อนคูณ exposure) ----
function eligibleAt(k) {
  const out = [];
  for (const s of T) {
    const c = s.c, cur = c[k]; if (!(cur >= CFG.minPrice)) continue;
    const p12 = c[k - 252], p1 = c[k - 21]; if (!(p12 > 0) || !(p1 > 0)) continue;
    let turn = 0, cnt = 0; for (let i = k - 19; i <= k; i++) if (c[i] > 0) { turn += c[i] * s.v[i]; cnt++; }
    if (!cnt || turn / cnt < CFG.minTurn) continue;
    out.push({ s, m121: p1 / p12 - 1 });   // โมเมนตัม 12-1: ผลตอบแทน 12 เดือน "ข้ามเดือนล่าสุด"
  }
  return out;
}
const momPick = (k, N) => { const e = eligibleAt(k).sort((a, b) => b.m121 - a.m121).slice(0, N); return e.map((x) => ({ s: x.s, w: 1 / e.length })); };
const randPick = (k, N, r) => { const e = eligibleAt(k); for (let i = e.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [e[i], e[j]] = [e[j], e[i]]; } const p = e.slice(0, N); return p.map((x) => ({ s: x.s, w: 1 / p.length })); };

function corr126(a, b, k) {
  const xs = [], ys = [];
  for (let i = k - 125; i <= k; i++) { const a0 = a.c[i - 1], a1 = a.c[i], b0 = b.c[i - 1], b1 = b.c[i]; if (a0 > 0 && a1 > 0 && b0 > 0 && b1 > 0) { xs.push(a1 / a0 - 1); ys.push(b1 / b0 - 1); } }
  if (xs.length < 60) return 0; const m = (z) => z.reduce((p, q) => p + q, 0) / z.length, mx = m(xs), my = m(ys); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}
function champCands(k) {   // กฎ Champion (ตัวเลขมาตรฐาน 21/63/126/252): RS≥70 + Fresh + สภาพคล่อง
  const rows = [];
  for (const s of T) {
    const c = s.c, cur = c[k]; if (!(cur > 0)) continue; const g = (o) => (c[k - o] > 0 ? cur / c[k - o] - 1 : NaN);
    const r3 = g(63), r6 = g(126), r1 = g(252), w = g(5), m = g(21); if (!(r3 === r3 && r6 === r6 && r1 === r1)) continue;
    let turn = 0, cnt = 0; for (let i = k - 19; i <= k; i++) if (c[i] > 0) { turn += c[i] * s.v[i]; cnt++; }
    rows.push({ s, price: cur, w, m, score: 0.3 * (m || 0) + 0.3 * r3 + 0.2 * r6 + 0.2 * r1, turn: cnt ? turn / cnt : 0 });
  }
  rows.sort((a, b) => b.score - a.score); rows.forEach((x, i) => { x.rs = Math.max(1, Math.min(99, Math.round(((rows.length - i) / rows.length) * 99))); });
  return rows.filter((x) => x.rs >= 70 && x.w > 0 && x.m > 0 && x.price >= CFG.minPrice && x.turn >= CFG.minTurn);
}
const champPick = (k) => { const cand = champCands(k), sel = []; for (const c of cand) { if (sel.length >= 10) break; if (sel.some((p) => corr126(c.s, p.s, k) > 0.55)) continue; sel.push(c); } return sel.map((x) => ({ s: x.s, w: 1 / sel.length })); };
const champRand = (k, r) => { const e = champCands(k); for (let i = e.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [e[i], e[j]] = [e[j], e[i]]; } const p = e.slice(0, 10); return p.map((x) => ({ s: x.s, w: 1 / p.length })); };
// ---- ตัวจำลองกลางของทุกกลยุทธ์ ----
function simulate({ picker, useGate, indexOnly }) {
  let cash = CFG.cap; const pos = new Map();   // key → {sh, px(sym)}; 'IDX' = ดัชนี
  const eq = new Float64Array(n).fill(NaN);
  const openOf = (key, i) => key === "IDX" ? IO[i] : (pos.get(key).s.o[i] > 0 ? pos.get(key).s.o[i] : pos.get(key).s.c[i - 1]);
  const closeOf = (key, i) => { if (key === "IDX") return IC[i]; const s = pos.get(key).s; let j = i; while (j > 0 && !(s.c[j] > 0)) j--; return s.c[j]; };
  const mark = (i) => { let v = cash; for (const [k, p] of pos) v += p.sh * closeOf(k, i); return v; };
  const liquidate = (i) => { for (const [k, p] of pos) { const c = k === "IDX" ? IDX_COST : CFG.cost; cash += p.sh * openOf(k, i) * (1 - c); } pos.clear(); };
  for (let i = START; i < n; i++) {
    if (useGate && pos.size && !rset.has(i) && gateExp(i - 1) === 0) liquidate(i);
    if (rset.has(i)) {
      const k = i - 1, exp = useGate ? gateExp(k) : 1;
      let targets = new Map();   // key → {s, w}
      if (exp > 0) { if (indexOnly) targets.set("IDX", { w: 1 }); else for (const x of picker(k)) targets.set(x.s.tk, { s: x.s, w: x.w }); }
      let eqOpen = cash; for (const [kk, p] of pos) eqOpen += p.sh * openOf(kk, i);
      for (const [kk, p] of [...pos]) if (!targets.has(kk)) { const c = kk === "IDX" ? IDX_COST : CFG.cost; cash += p.sh * openOf(kk, i) * (1 - c); pos.delete(kk); }
      for (const [kk, t] of targets) {
        const px = kk === "IDX" ? IO[i] : (t.s.o[i] > 0 ? t.s.o[i] : t.s.c[i - 1]); if (!(px > 0)) continue;
        const c = kk === "IDX" ? IDX_COST : CFG.cost, tv = eqOpen * exp * t.w, ex = pos.get(kk);
        if (ex) { const cv = ex.sh * px, d = tv - cv; if (d > 0) { const sh = d / px / (1 + c); cash -= sh * px * (1 + c); ex.sh += sh; } else if (d < 0) { const sh = Math.min(ex.sh, -d / px); cash += sh * px * (1 - c); ex.sh -= sh; } }
        else { const sh = tv / px / (1 + c); cash -= sh * px * (1 + c); pos.set(kk, { sh, s: t.s }); }
      }
    }
    eq[i] = mark(i);
  }
  return eq;
}
function metrics(eq, a = START, b = n - 1) {
  const v = []; for (let i = a; i <= b; i++) v.push(eq[i]);
  const yrs = (new Date(cal[b]) - new Date(cal[a])) / (365.25 * 864e5);
  const r = []; for (let i = 1; i < v.length; i++) r.push(v[i] / v[i - 1] - 1);
  const m = r.reduce((x, y) => x + y, 0) / r.length, sd = Math.sqrt(r.reduce((x, y) => x + (y - m) ** 2, 0) / (r.length - 1));
  let pk = v[0], dd = 0; for (const x of v) { pk = Math.max(pk, x); dd = Math.min(dd, x / pk - 1); }
  return { cagr: (Math.pow(v[v.length - 1] / v[0], 1 / yrs) - 1) * 100, dd: dd * 100, sharpe: sd ? (m / sd) * Math.sqrt(252) : 0, vol: sd * Math.sqrt(252) * 100 };
}
const MID = START + Math.floor((n - 1 - START) / 2);
const fmt = (m) => `CAGR ${m.cagr.toFixed(1).padStart(6)}%  MaxDD ${m.dd.toFixed(1).padStart(6)}%  Sharpe ${m.sharpe.toFixed(2).padStart(5)}  vol ${m.vol.toFixed(0).padStart(3)}%`;

const S = {
  A: { name: "A ดัชนี buy&hold", eq: Float64Array.from({ length: n }, (_, i) => (i >= START ? CFG.cap * IC[i] / IC[START] : NaN)) },
  B: { name: "B ดัชนี + Market Gate", eq: simulate({ indexOnly: true, useGate: true }) },
  C: { name: "C โมเมนตัม 12-1 ถ่วงเท่ากัน 20 ตัว", eq: simulate({ picker: (k) => momPick(k, 20), useGate: false }) },
  D: { name: "D = C + Market Gate", eq: simulate({ picker: (k) => momPick(k, 20), useGate: true }) },
  E: { name: "E Champion (กฎจริง, ถ่วงเท่ากัน 10 ตัว, gate ปิดเมื่อวาน, ซื้อที่เปิด)", eq: simulate({ picker: champPick, useGate: true }) },
};
// กลุ่มควบคุมสุ่ม (โครงสร้างเดียวกับ C และ D): สุ่ม 20 ตัวจากหุ้นที่ผ่านสภาพคล่อง น้ำหนักเท่ากัน
const SEEDS = Number(process.env.SEEDS || 40), ctrl = { C: [], D: [], E: [] };
for (let s = 1; s <= SEEDS; s++) { const r1 = rng(s * 7919), r2_ = rng(s * 7919); ctrl.C.push(metrics(simulate({ picker: (k) => randPick(k, 20, r1), useGate: false })).cagr); ctrl.D.push(metrics(simulate({ picker: (k) => randPick(k, 20, r2_), useGate: true })).cagr); { const r3_ = rng(s * 104729); ctrl.E.push(metrics(simulate({ picker: (k) => champRand(k, r3_), useGate: true })).cagr); } }
for (const k of ["C", "D", "E"]) ctrl[k].sort((a, b) => a - b);
const pctile = (arr, x) => arr.filter((v) => v < x).length / arr.length * 100;

console.log(`\n=== ${isTH ? "ไทย" : "สหรัฐฯ"} · ${cal[START]} → ${cal[n - 1]} · จักรวาล ${T.length} หุ้น · ค่าธรรมเนียมหุ้น ${(CFG.cost * 100).toFixed(2)}%/ข้าง ===`);
const bF = metrics(S.A.eq), b1 = metrics(S.A.eq, START, MID), b2 = metrics(S.A.eq, MID, n - 1), result = {};
for (const k of ["A", "B", "C", "D", "E"]) {
  const f = metrics(S[k].eq), h1 = metrics(S[k].eq, START, MID), h2 = metrics(S[k].eq, MID, n - 1);
  console.log(S[k].name.padEnd(36), "เต็ม:", fmt(f)); console.log("".padEnd(36), `ครึ่ง1: CAGR ${h1.cagr.toFixed(1).padStart(6)}%  ครึ่ง2: CAGR ${h2.cagr.toFixed(1).padStart(6)}%`);
  if (k !== "A") {
    const c1 = f.cagr > bF.cagr && h1.cagr > b1.cagr && h2.cagr > b2.cagr, c2 = f.dd >= bF.dd - 10;
    const base = k === "C" ? ctrl.C : k === "D" ? ctrl.D : k === "E" ? ctrl.E : null, pc = base ? pctile(base, f.cagr) : null, c3 = base ? pc >= 95 : null;
    const pass = c1 && c2 && (c3 ?? true);
    result[k] = { full: f, h1, h2, c1, c2, c3, pctile: pc, pass };
    console.log("".padEnd(36), `เกณฑ์: (1)ชนะดัชนีทั้ง3ช่วง ${c1 ? "ผ่าน" : "ไม่ผ่าน"} · (2)DD ${c2 ? "ผ่าน" : "ไม่ผ่าน"}` + (base ? ` · (3)เหนือสุ่ม p95 ${c3 ? "ผ่าน" : "ไม่ผ่าน"} (อยู่ p${pc.toFixed(0)}, สุ่ม median ${base[Math.floor(base.length*0.5)].toFixed(1)}%, p95 ${base[Math.floor(base.length*0.95)].toFixed(1)}%)` : "") + `  ⇒ ${pass ? "✅ ผ่านทั้งหมด" : "❌ ไม่ผ่าน"}`);
  }
}
fs.writeFileSync(path.join(ROOT, "data", `bt_compare_${MK}_${FROM.slice(0,4)}.json`), JSON.stringify({ generated_at: new Date().toISOString(), period: [cal[START], cal[n - 1]], halves: [cal[START], cal[MID], cal[n - 1]], benchmark: bF, results: result, control_cagr_percentiles: Object.fromEntries(["C", "D", "E"].map((k) => [k, { p5: ctrl[k][Math.floor(ctrl[k].length*0.05)], p50: ctrl[k][Math.floor(ctrl[k].length*0.5)], p95: ctrl[k][Math.floor(ctrl[k].length*0.95)] }])) }, null, 1));

// dump เส้น equity สำหรับวิเคราะห์เพิ่ม (รายปี/ช่วงที่กระจุก)
fs.writeFileSync(path.join(ROOT, "data", `bt_eq_${MK}_${FROM.slice(0, 4)}.json`), JSON.stringify({ dates: cal.slice(START), A: Array.from(S.A.eq.slice(START)), B: Array.from(S.B.eq.slice(START)), D: Array.from(S.D.eq.slice(START)), E: Array.from(S.E.eq.slice(START)) }));