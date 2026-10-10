// ทำซ้ำงานวิจัยเดิม (hermes rs_daily.py "Champion TH") บนข้อมูล TradingView 835 หุ้น แล้วเปลี่ยนทีละข้อสมมติเป็นแบบที่ทำได้จริง
//   node --max-old-space-size=8192 scripts/backtest_replicate_tv.mjs
// ข้อมูล: C:/Users/Tar/AppData/Local/hermes/scripts/bt_ohlcv_full.json + idx_SET_daily_full.csv (ดัชนี SET จริง)
// ใช้ SET index จริงเป็น Market Gate (SMA50/200) และเป็น benchmark (ราคา, ไม่รวมปันผล)
import fs from "node:fs";
import path from "node:path";

const H = process.env.HERMES_SCRIPTS || "C:/Users/Tar/AppData/Local/hermes/scripts";
const px = JSON.parse(fs.readFileSync(path.join(H, "bt_ohlcv_full.json"), "utf8"));
const csv = fs.readFileSync(path.join(H, "idx_SET_daily_full.csv"), "utf8").trim().split(/\r?\n/).slice(1).map((l) => l.split(","));
const cal = csv.map((r) => r[0]), n = cal.length, calIdx = new Map(cal.map((d, i) => [d, i]));
const IC = Float64Array.from(csv.map((r) => +r[4])), IO = Float64Array.from(csv.map((r) => +r[1]));
const T = [];
for (const [tk, bars] of Object.entries(px)) {
  const o = new Float64Array(n).fill(NaN), c = new Float64Array(n).fill(NaN), v = new Float64Array(n).fill(0); let cnt = 0;
  for (const b of bars) { const k = calIdx.get(b.t); if (k !== undefined && b.c > 0) { o[k] = b.o; c[k] = b.c; v[k] = b.v || 0; cnt++; } }
  if (cnt >= 400) T.push({ tk, o, c, v });
}
console.log(`หุ้น ${T.length} ตัว · ปฏิทิน SET ${cal[0]} → ${cal[n - 1]} (${n} วัน)`);
const sma = (a, k, p) => { if (k < p - 1) return NaN; let s = 0; for (let i = k - p + 1; i <= k; i++) s += a[i]; return s / p; };
const gate = (k) => { const c = IC[k], a = sma(IC, k, 50), b = sma(IC, k, 200); if (!(b > 0)) return 0; if (c > a && c > b) return 1; if (c <= a && c <= b) return 0; return 0.5; };

// ---- ฟีเจอร์ ณ วัน k ----
function features(k, LB) {
  const rows = [];
  for (const s of T) {
    const c = s.c, cur = c[k]; if (!(cur > 0)) continue;
    // ต้องมีข้อมูลเดิน >= 365 แท่ง (เหมือนเงื่อนไขต้นฉบับ: idx>=365) นับเฉพาะวันที่หุ้นมีราคา
    let have = 0; for (let i = Math.max(0, k - 400); i <= k; i++) if (c[i] > 0) have++;
    if (have < 366 && LB.minHist) continue;
    const g = (off) => { const p = c[k - off]; return p > 0 ? cur / p - 1 : NaN; };
    const r3 = g(LB.q), r6 = g(LB.h), r1 = g(LB.y), w = g(5), m = g(21);
    if (!(r3 === r3 && r6 === r6 && r1 === r1)) continue;
    let turn = 0, cnt = 0; for (let i = k - 4; i <= k; i++) if (c[i] > 0) { turn += c[i] * s.v[i]; cnt++; }
    rows.push({ s, price: cur, w, m, score: 0.3 * (m || 0) + 0.3 * r3 + 0.2 * r6 + 0.2 * r1, turn: cnt ? turn / cnt : 0 });
  }
  rows.sort((a, b) => b.score - a.score);
  rows.forEach((x, i) => { x.rs = Math.max(1, Math.min(99, Math.round(((rows.length - i) / rows.length) * 99))); });
  return rows;
}
function corr126(a, b, k) {
  const xs = [], ys = [];
  for (let i = k - 125; i <= k; i++) { const a0 = a.c[i - 1], a1 = a.c[i], b0 = b.c[i - 1], b1 = b.c[i]; if (a0 > 0 && a1 > 0 && b0 > 0 && b1 > 0) { xs.push(a1 / a0 - 1); ys.push(b1 / b0 - 1); } }
  if (xs.length < 60) return 0; const m = (z) => z.reduce((p, q) => p + q, 0) / z.length, mx = m(xs), my = m(ys); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}
const cache = new Map();   // features cache ต่อ (k, lookback)
function pick(k, V) {
  const key = k + V.lbName; let rows = cache.get(key); if (!rows) { rows = features(k, V.LB); cache.set(key, rows); }
  let cand = rows.filter((x) => x.rs >= 70 && x.w > 0 && x.m > 0 && x.price >= 1 && x.turn >= 5e6);
  cand.sort((a, b) => b.rs - a.rs);   // ต้นฉบับ: เรียงตาม RS มาก→น้อย (เสมอกันเรียงตามคะแนน)
  const sel = []; for (const c of cand) { if (sel.length >= 10) break; if (sel.some((p) => corr126(c.s, p.s, k) > 0.55)) continue; sel.push(c); }
  return sel;
}

function run(V) {
  const from = cal.findIndex((d) => d >= V.from);
  const rb = []; for (let i = Math.max(from, 366); i < n; i++) if (cal[i].slice(0, 7) !== cal[i - 1].slice(0, 7)) rb.push(i);
  const rset = new Set(rb), S = rb[0];
  let cash = 1e6, pos = [];
  const eq = new Float64Array(n).fill(NaN);
  const val = (i) => { let v = cash; for (const p of pos) { let q = p.s.c[i]; if (!(q > 0)) { let j = i; while (j > 0 && !(p.s.c[j] > 0)) j--; q = p.s.c[j]; } v += p.sh * q; } return v; };
  let pending = null;
  for (let i = S; i < n; i++) {
    const doTrade = (at, price) => {   // ปิดทุกตัวแล้วเข้าชุดใหม่ที่ราคา price(s)
      for (const p of pos) cash += p.sh * price(p.s, at) * (1 - V.cost); pos = [];
      const g = gate(pending.k), sel = g > 0 ? pending.sel : [];
      if (sel.length) {
        const wts = V.weight === "equal" ? sel.map(() => 1) : sel.map((x) => x.rs), tot = wts.reduce((a, b) => a + b, 0), budget = cash * g;
        sel.forEach((x, j) => { const p = price(x.s, at); if (!(p > 0)) return; const v = budget * wts[j] / tot, sh = v / p / (1 + V.cost); cash -= sh * p * (1 + V.cost); pos.push({ s: x.s, sh }); });
      }
      pending = null;
    };
    if (V.exec === "close") {
      if (rset.has(i)) { pending = { k: i, sel: pick(i, V) }; doTrade(i, (s) => (s.c[i] > 0 ? s.c[i] : NaN)); }
    } else {   // next_open: สัญญาณจากปิดวันแรกของเดือน → ซื้อ/ขายที่ราคาเปิดวันถัดไป
      if (pending) doTrade(i, (s, at) => (s.o[at] > 0 ? s.o[at] : s.c[at - 1]));
      if (rset.has(i)) pending = { k: i, sel: pick(i, V) };
    }
    eq[i] = val(i);
  }
  return { eq, S, cal0: cal[S] };
}
function metrics(eq, S, monthlyOnly = false) {
  let pts = []; for (let i = S; i < n; i++) if (eq[i] === eq[i]) pts.push([i, eq[i]]);
  if (monthlyOnly) pts = pts.filter(([i], j, a) => j === 0 || j === a.length - 1 || cal[i].slice(0, 7) !== cal[a[j + 1] ? a[j + 1][0] : i].slice(0, 7));
  const v = pts.map((p) => p[1]), yrs = (new Date(cal[pts.at(-1)[0]]) - new Date(cal[pts[0][0]])) / (365.25 * 864e5);
  const r = []; for (let i = 1; i < v.length; i++) r.push(v[i] / v[i - 1] - 1);
  const m = r.reduce((a, b) => a + b, 0) / r.length, sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1)), ann = monthlyOnly ? 12 : 252;
  let pk = v[0], dd = 0; for (const x of v) { pk = Math.max(pk, x); dd = Math.min(dd, x / pk - 1); }
  return { cagr: (Math.pow(v.at(-1) / v[0], 1 / yrs) - 1) * 100, dd: dd * 100, sharpe: (m / sd) * Math.sqrt(ann), end: v.at(-1), yrs };
}
const THEIRS = { y: 365, h: 182, q: 91, minHist: true }, STD = { y: 252, h: 126, q: 63, minHist: true };
const base = { LB: THEIRS, lbName: "t", exec: "close", cost: 0.0005, weight: "rs" };
const VARIANTS = [
  ["V0 ต้นฉบับ (ปิดวันสัญญาณ, lookback 91/182/365, ค่าธรรมเนียม 0.05%)", { ...base }],
  ["V1 + ค่าธรรมเนียมจริง 0.25%/ข้าง", { ...base, cost: 0.0025 }],
  ["V2 + ซื้อที่ราคาเปิดวันถัดไป (ไม่ซื้อที่ปิดวันสัญญาณ)", { ...base, cost: 0.0025, exec: "next_open" }],
  ["V3 + lookback มาตรฐาน 63/126/252", { ...base, cost: 0.0025, exec: "next_open", LB: STD, lbName: "s" }],
  ["V4 = V3 แต่ถ่วงเท่ากัน", { ...base, cost: 0.0025, exec: "next_open", LB: STD, lbName: "s", weight: "equal" }],
];
for (const [from, label] of [["2015-01-01", "11.7 ปี (ม.ค.2015→)"], ["2021-10-01", "5 ปี (ต.ค.2021→)"]]) {
  console.log(`\n=== ${label} ===`);
  const idxEq = new Float64Array(n).fill(NaN); const s0 = cal.findIndex((d) => d >= from) ; const first = (() => { let i = Math.max(s0, 366); while (cal[i].slice(0, 7) === cal[i - 1].slice(0, 7)) i++; return i; })();
  for (let i = first; i < n; i++) idxEq[i] = 1e6 * IC[i] / IC[first];
  const bm = metrics(idxEq, first); console.log("ดัชนี SET buy&hold (ราคา)".padEnd(72), `CAGR ${bm.cagr.toFixed(1).padStart(6)}%  MaxDD(รายวัน) ${bm.dd.toFixed(1).padStart(6)}%  ปลายทาง ${Math.round(bm.end).toLocaleString()}`);
  for (const [name, V] of VARIANTS) {
    const r = run({ ...V, from }), d = metrics(r.eq, r.S), mo = metrics(r.eq, r.S, true);
    console.log(name.padEnd(72), `CAGR ${d.cagr.toFixed(1).padStart(6)}%  MaxDD(รายวัน) ${d.dd.toFixed(1).padStart(6)}%  MaxDD(รายเดือน) ${mo.dd.toFixed(1).padStart(6)}%  Sharpe(เดือน) ${mo.sharpe.toFixed(2)}  ปลายทาง ${Math.round(d.end).toLocaleString()}`);
  }
}

// ======================= โหมด "รายวัน" เหมือนต้นฉบับ rs_daily.py (daily gate + น้ำหนักคงที่รายวัน) =======================
function runDaily(V) {
  const from = cal.findIndex((d) => d >= V.from);
  const rb = []; for (let i = Math.max(from, 366); i < n; i++) if (cal[i].slice(0, 7) !== cal[i - 1].slice(0, 7)) rb.push(i);
  const eq = new Float64Array(n).fill(NaN); let nav = 1e6; eq[rb[0]] = nav;
  for (let m = 0; m < rb.length - 1; m++) {
    const a = rb[m], b = rb[m + 1], sel = pick(a, V);
    if (!sel.length) { for (let d = a + 1; d <= b; d++) eq[d] = nav; continue; }
    const wts = V.weight === "equal" ? sel.map(() => 1) : sel.map((x) => x.rs), tot = wts.reduce((p, q) => p + q, 0), w = wts.map((x) => x / tot);
    let expSum = 0, basketPrev = 1; const entry = sel.map((x) => x.s.c[a]);
    for (let d = a + 1; d <= b; d++) {
      const ex = gate(d - V.gateLag);   // gateLag=0 : ใช้ราคาปิดดัชนีของ "วัน d เอง" (ต้นฉบับ) · 1 : ใช้ปิดเมื่อวาน (ทำได้จริง)
      expSum += ex;
      let g;
      if (V.drift) {   // ถือเฉยๆ ในเดือน: น้ำหนักลอยตามราคา
        let bsk = 0; for (let j = 0; j < sel.length; j++) { let q = sel[j].s.c[d]; if (!(q > 0)) { let k = d; while (k > a && !(sel[j].s.c[k] > 0)) k--; q = sel[j].s.c[k]; } bsk += w[j] * q / entry[j]; }
        g = bsk / basketPrev - 1; basketPrev = bsk;
      } else {         // ต้นฉบับ: rebalance กลับเป็นน้ำหนักเดิมทุกวัน
        g = 0; for (let j = 0; j < sel.length; j++) { const p0 = sel[j].s.c[d - 1], p1 = sel[j].s.c[d]; if (p0 > 0 && p1 > 0) g += w[j] * (p1 / p0 - 1); }
      }
      nav *= 1 + ex * g; eq[d] = nav;
    }
    if (expSum > 0) { nav *= 1 - 2 * V.cost; eq[b] = nav; }
  }
  return { eq, S: rb[0] };
}
console.log("\n\n######## โหมดรายวันเหมือนต้นฉบับ (daily gate) · 11.7 ปี ########");
const DV = [
  ["T0 เหมือนต้นฉบับทุกอย่าง: gate ใช้ปิดของวัน d เอง + rebalance รายวัน + ค่าธรรมเนียม 0.05%", { ...base, gateLag: 0, drift: false }],
  ["T1 แก้เฉพาะ look-ahead ของ gate (ใช้ปิดเมื่อวาน)", { ...base, gateLag: 1, drift: false }],
  ["T2 + ถือเฉยๆ ไม่ rebalance รายวัน (น้ำหนักลอย)", { ...base, gateLag: 1, drift: true }],
  ["T3 + ค่าธรรมเนียมจริง 0.25%/ข้าง", { ...base, gateLag: 1, drift: true, cost: 0.0025 }],
];
for (const [from, label] of [["2015-01-01", "11.7 ปี"], ["2021-10-01", "5 ปี"]]) {
  console.log(`--- ${label} ---`);
  for (const [name, V] of DV) { const r = runDaily({ ...V, from }), d = metrics(r.eq, r.S); console.log(name.padEnd(82), `CAGR ${d.cagr.toFixed(1).padStart(6)}%  MaxDD ${d.dd.toFixed(1).padStart(6)}%  Sharpe ${d.sharpe.toFixed(2)}  ปลายทาง ${Math.round(d.end).toLocaleString()}`); }
}