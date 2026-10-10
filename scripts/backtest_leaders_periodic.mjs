// Backtest ตามกฎที่ล็อกไว้ใน research/PREREG_leaders_periodic_2026-10-10.md  (ห้ามแก้เกณฑ์หลังเห็นผล)
//   node --max-old-space-size=12288 scripts/backtest_leaders_periodic.mjs th|us
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HERMES = process.env.HERMES_SCRIPTS || "C:/Users/Tar/AppData/Local/hermes/scripts";
const MK = (process.argv[2] || "").toLowerCase(); if (!["th", "us"].includes(MK)) throw new Error("usage: backtest_leaders_periodic.mjs th|us");
const IS_US = MK === "us";
const DATA_FROM = "2013-06-01", START_DATE = "2015-01-01", SPLIT_DATE = "2020-01-01";
const CAP = 1e6, SEEDS = +(process.env.SEEDS || 500), REB_BAND = 0.01;
const CFG = IS_US ? { cost: 0.00207, minPrice: 10, minTurn: 20e6, haircut: 0.03, sens: [0.00107, 0.00357, 0.005] } : { cost: 0.0035, minPrice: 1, minTurn: 5e6, haircut: 0.02, sens: [0.0025, 0.0035, 0.005] };
const EXPO = [0.2, 0.6, 1.0];   // gate แดง/เหลือง/เขียว → สัดส่วนหุ้นรวม

// ---------- โหลดปฏิทิน/ดัชนี/หุ้น ----------
let cal, n, calIdx, IDX, IDXO, RF, B = {}, rawStocks = [];
if (IS_US) {
  const DIR = path.join(HERMES, "us11"), bench = JSON.parse(fs.readFileSync(path.join(DIR, "bench.json"), "utf8"));
  cal = bench["^GSPC"].t.filter((d) => d >= DATA_FROM); n = cal.length; calIdx = new Map(cal.map((d, i) => [d, i]));
  const align = (b, key) => { const a = new Float64Array(n).fill(NaN); b.t.forEach((d, i) => { const k = calIdx.get(d); if (k !== undefined) a[k] = b[key][i]; }); let last = NaN; for (let i = 0; i < n; i++) { if (a[i] > 0) last = a[i]; else a[i] = last; } return a; };
  IDX = align(bench["^GSPC"], "c"); IDXO = align(bench["^GSPC"], "o"); B.raw = { SPX_TR: align(bench.SPY, "adj"), RSP_TR: align(bench.RSP, "adj"), SPX_PX: IDX, RSP_PX: align(bench.RSP, "c") };
  RF = new Float64Array(n); const rows = fs.readFileSync(path.join(DIR, "tbill.csv"), "utf8").trim().split(/\r?\n/).slice(1).map((l) => l.split(",")).filter((r) => r[1] && r[1] !== "."); const m = new Map(rows.map((r) => [r[0], +r[1]])); let last = rows.length ? +rows[0][1] : 0; for (let i = 0; i < n; i++) { if (m.has(cal[i])) last = m.get(cal[i]); RF[i] = last / 100 / 252; }
  for (const f of fs.readdirSync(DIR).filter((x) => /^chunk_\d+\.json$/.test(x)).sort()) { const ch = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); for (const [tk, b] of Object.entries(ch)) rawStocks.push([tk, b.t, b.o, b.h, b.l, b.c, b.v]); }
} else {
  const csv = fs.readFileSync(path.join(HERMES, "idx_SET_daily_full.csv"), "utf8").trim().split(/\r?\n/).slice(1).map((l) => l.split(",")).filter((r) => r[0] >= DATA_FROM);
  cal = csv.map((r) => r[0]); n = cal.length; calIdx = new Map(cal.map((d, i) => [d, i]));
  IDX = Float64Array.from(csv.map((r) => +r[4])); IDXO = Float64Array.from(csv.map((r) => +r[1])); RF = new Float64Array(n); B.raw = { SET_PX: IDX };
  const raw = JSON.parse(fs.readFileSync(path.join(HERMES, "bt_ohlcv_full.json"), "utf8"));
  for (const [tk, bars] of Object.entries(raw)) rawStocks.push([tk, bars.map((b) => b.t), bars.map((b) => b.o), bars.map((b) => b.h), bars.map((b) => b.l), bars.map((b) => b.c), bars.map((b) => b.v)]);
}
const START = cal.findIndex((d) => d >= START_DATE), SPLIT = cal.findIndex((d) => d >= SPLIT_DATE), last = n - 1;
const S = [], excluded = [];
for (const [tk, ts, bo, bh, bl, bc, bv] of rawStocks) {
  const o = new Float32Array(n).fill(NaN), h = new Float32Array(n).fill(NaN), l = new Float32Array(n).fill(NaN), c = new Float32Array(n).fill(NaN), v = new Float32Array(n); let first = -1, lastK = -1, cnt = 0;
  for (let i = 0; i < ts.length; i++) {
    const k = calIdx.get(ts[i]); if (k === undefined || !(bc[i] > 0)) continue;
    const oo = bo[i] > 0 ? bo[i] : bc[i]; o[k] = oo; c[k] = bc[i]; h[k] = Math.max(bh[i] || bc[i], oo, bc[i]); l[k] = Math.min(bl[i] > 0 ? bl[i] : bc[i], oo, bc[i]); v[k] = bv[i] || 0;
    if (first < 0) first = k; lastK = k; cnt++;
  }
  if (cnt < 300) continue;
  for (let i = first + 1; i <= lastK; i++) if (!(c[i] > 0)) { c[i] = c[i - 1]; o[i] = h[i] = l[i] = c[i]; v[i] = 0; }
  let bad = false;
  for (let i = first + 1; i <= lastK && !bad; i++) if (Math.abs(c[i] / c[i - 1] - 1) > 0.5) for (let j = i + 1; j <= Math.min(i + 3, lastK); j++) if (Math.abs(c[j] / c[i - 1] - 1) <= 0.15) { bad = true; break; }
  if (bad) { excluded.push(tk); continue; }
  S.push({ tk, o, c, v, first, last: lastK });
}
const Sn = S.length; console.log(MK, "stocks", Sn, "excluded(spike)", excluded.length, "days", n, "start", cal[START]);

// ---------- ตัวชี้วัด ----------
const pre = (a) => { const p = new Float64Array(n + 1); for (let i = 0; i < n; i++) p[i + 1] = p[i] + (a[i] > 0 || a[i] === 0 ? a[i] : 0); return p; };
for (const s of S) {
  const { c, v, first } = s, pc = pre(c), pcv = pre(c.map((x, i) => (x > 0 ? x * v[i] : 0)));
  s.sma50 = new Float32Array(n).fill(NaN); s.turn20 = new Float32Array(n).fill(NaN); s.rs = new Uint8Array(n);
  for (let k = first; k < n; k++) { if (k - 49 >= first) s.sma50[k] = (pc[k + 1] - pc[k - 49]) / 50; if (k - 19 >= first) s.turn20[k] = (pcv[k + 1] - pcv[k - 19]) / 20; }
}
for (let k = Math.max(START - 5, 260); k < n; k++) {
  const arr = [];
  for (const s of S) { const c = s.c; if (k - 252 < s.first || k > s.last || !(c[k] > 0)) continue; arr.push([s, 0.3 * (c[k] / c[k - 21] - 1) + 0.3 * (c[k] / c[k - 63] - 1) + 0.2 * (c[k] / c[k - 126] - 1) + 0.2 * (c[k] / c[k - 252] - 1)]); }
  arr.sort((a, b) => b[1] - a[1]); const N = arr.length; arr.forEach(([s], i) => { s.rs[k] = Math.max(1, Math.min(99, Math.round(((N - i) / N) * 99))); });
}
S.forEach((s, i) => (s.id = i));
const ip = new Float64Array(n + 1); for (let i = 0; i < n; i++) ip[i + 1] = ip[i] + IDX[i];
const G = new Uint8Array(n); for (let k = 0; k < n; k++) { if (k < 199) { G[k] = 1; continue; } const c = IDX[k], s50 = (ip[k + 1] - ip[k - 49]) / 50, s200 = (ip[k + 1] - ip[k - 199]) / 200; G[k] = (c > s50 && s50 > s200) ? 2 : ((c < s200 || (c < s50 && s50 < s200)) ? 0 : 1); }
const liquid = (s, k) => k - 252 >= s.first && k <= s.last && s.c[k] >= CFG.minPrice && s.turn20[k] >= CFG.minTurn;

// ---------- พูล/อันดับรายวัน (ล่วงหน้า) ----------
const flagA = new Uint8Array(n * Sn), flagB = new Uint8Array(n * Sn), TOP = { r12: new Array(n), r121: new Array(n) };
for (let k = START - 1; k < n; k++) {
  const A = [];
  for (const s of S) { if (!liquid(s, k)) continue; flagB[k * Sn + s.id] = 1; if (s.rs[k] >= 85) { flagA[k * Sn + s.id] = 1; A.push(s); } }
  const r12 = (s) => s.c[k] / s.c[k - 252] - 1, r121 = (s) => s.c[k - 21] / s.c[k - 252] - 1;
  TOP.r12[k] = Int32Array.from([...A].sort((a, b) => r12(b) - r12(a)).slice(0, 40).map((s) => s.id));
  TOP.r121[k] = Int32Array.from([...A].sort((a, b) => r121(b) - r121(a)).slice(0, 40).map((s) => s.id));
}
const closeAt = (s, i) => (i <= s.last ? s.c[i] : s.c[s.last]);
const openAt = (s, i) => (i <= s.last && s.o[i] > 0 ? s.o[i] : closeAt(s, i - 1));
function rngf(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function capWeights(raw, cap) {   // น้ำหนักรวม ≤ 1, ตัวชนเพดานแจกส่วนเกินให้ตัวอื่นตามสัดส่วน
  const w = raw.map((x) => x / raw.reduce((a, b) => a + b, 0)), fixed = new Array(w.length).fill(false);
  for (let it = 0; it < 50; it++) {
    let over = false; for (let i = 0; i < w.length; i++) if (!fixed[i] && w[i] > cap + 1e-12) { w[i] = cap; fixed[i] = true; over = true; }
    if (!over) break;
    const fixedSum = w.reduce((a, x, i) => a + (fixed[i] ? x : 0), 0), freeRaw = raw.reduce((a, x, i) => a + (fixed[i] ? 0 : x), 0), left = 1 - fixedSum;
    if (freeRaw <= 0 || left <= 0) { for (let i = 0; i < w.length; i++) if (!fixed[i]) w[i] = 0; break; }
    for (let i = 0; i < w.length; i++) if (!fixed[i]) w[i] = raw[i] / freeRaw * left;
  }
  return w;
}

// ---------- ตัวจำลอง ----------
const EXPO2 = [0, 0.5, 1.0];   // เขียว 100% / เหลือง 50% / แดง 0%
const isoWeek = (s) => { const d = new Date(s + "T00:00:00Z"), day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3); const y = d.getUTCFullYear(), j = new Date(Date.UTC(y, 0, 4)); return y * 100 + 1 + Math.round(((d - j) / 864e5 - 3 + ((j.getUTCDay() + 6) % 7)) / 7); };
const WK = cal.map(isoWeek);
function simulate(o) {   // o: {N, cap, cost, useGate, wmode, rank, freq:'m'|'w', ctl:{flag,order}|null}
  const { N, cap, cost, useGate, wmode, rank, freq, ctl } = o;
  let cash = CAP, hold = [], traded = 0;
  const eq = new Float64Array(n).fill(NaN), inv = new Float64Array(n).fill(NaN), episodes = [];
  const topFor = (k) => { if (!ctl) return TOP[rank][k].subarray(0, N); const out = [], base = k * Sn; for (let j = 0; j < Sn && out.length < N; j++) { const id = ctl.order[j]; if (ctl.flag[base + id]) out.push(id); } return out; };
  const finish = (h, i) => episodes.push({ tk: h.s.tk, pnl: h.proceeds - h.cost, days: i - h.ei });
  for (let i = START; i < n; i++) {
    const k = i - 1, red = useGate && G[k] === 0, isCheck = freq === "m" ? cal[i].slice(0, 7) !== cal[k].slice(0, 7) : WK[i] !== WK[k];
    let targets = null;
    if (isCheck) {
      const e = useGate ? EXPO2[G[k]] : 1; targets = new Map();
      if (e > 0) { const top = topFor(k); if (top.length) { const raw = Array.from(top, (id) => (wmode === "eq" ? 1 : Math.max(S[id].rs[k] - 80, 1))), w = capWeights(raw, cap); top.forEach((id, j) => targets.set(id, e * w[j])); } }
    } else if (red && hold.length) targets = new Map();   // แดง: ออกหมดทันที (ไม่รอวันเช็ค)
    if (targets) {
      let E = cash; for (const h of hold) E += h.sh * openAt(h.s, i);
      const keep = [];
      for (const h of hold) {
        const t = targets.get(h.s.id) || 0, px = openAt(h.s, i), cur = h.sh * px, diff = t * E - cur;
        if (t === 0) { const v = cur; cash += v * (1 - cost); traded += v; h.proceeds += v * (1 - cost); h.sh = 0; finish(h, i); }
        else { if (diff < 0 && -diff > REB_BAND * E) { const sh = Math.min(h.sh, -diff / px), v = sh * px; cash += v * (1 - cost); traded += v; h.proceeds += v * (1 - cost); h.sh -= sh; } keep.push(h); }
      }
      hold = keep;
      for (const [id, t] of targets) {
        if (t <= 0) continue; const s = S[id], px = openAt(s, i); let h = hold.find((x) => x.s === s);
        const diff = t * E - (h ? h.sh * px : 0); if (h ? diff <= REB_BAND * E : diff <= 0) continue;
        if (!(px > 0) || (i <= s.last && !(s.v[i] > 0))) continue;
        const notional = Math.min(diff, cash / (1 + cost)); if (notional <= 0) continue;
        if (!h) { h = { s, sh: 0, cost: 0, proceeds: 0, ei: i }; hold.push(h); }
        cash -= notional * (1 + cost); traded += notional; h.cost += notional * (1 + cost); h.sh += notional / px;
      }
    }
    cash *= 1 + RF[i];
    let v = cash, iv = 0; for (const h of hold) { const c = h.sh * closeAt(h.s, i); v += c; iv += c; }
    eq[i] = v; inv[i] = iv / v;
  }
  for (const h of hold) { const mark = h.sh * closeAt(h.s, last); episodes.push({ tk: h.s.tk, pnl: h.proceeds + mark - h.cost, days: last - h.ei, open: true }); }
  return { eq, inv, traded, episodes };
}

// ---------- ตัวชี้วัด ----------
const yrs = (a, b) => (new Date(cal[b]) - new Date(cal[a])) / (365.25 * 864e5), cagr = (v0, v1, y) => (v1 / v0) ** (1 / y) - 1, Y = yrs(START, last);
const mkb = (arr, base) => { const e = new Float64Array(n).fill(NaN); for (let i = START - 1; i < n; i++) e[i] = CAP * arr[i] / base; return e; };
const BEQ = {}; for (const [k, a] of Object.entries(B.raw)) BEQ[k] = mkb(a, k === "SET_PX" ? IDXO[START] : a[START - 1]);
const full = (eq) => cagr(CAP, eq[last], Y);
function dd(eq) { let pk = CAP, mdd = 0, pkI = START, longest = 0; for (let i = START; i < n; i++) { if (eq[i] >= pk) { longest = Math.max(longest, i - pkI); pk = eq[i]; pkI = i; } mdd = Math.min(mdd, eq[i] / pk - 1); } longest = Math.max(longest, last - pkI); return { maxDD: mdd, longestDays: longest }; }
function sharpe(eq) { const r = []; for (let i = START + 1; i < n; i++) r.push(eq[i] / eq[i - 1] - 1 - RF[i]); const m = r.reduce((a, b) => a + b, 0) / r.length, sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1)); return sd ? m / sd * Math.sqrt(252) : 0; }
function yearly(eq) { const o = {}; let prev = CAP; for (let i = START; i < n; i++) { const y = cal[i].slice(0, 4); if (i === n - 1 || cal[i + 1].slice(0, 4) !== y) { o[y] = eq[i] / prev - 1; prev = eq[i]; } } return o; }
function exposureYearly(inv) { const o = {}, c = {}; for (let i = START; i < n; i++) { const y = cal[i].slice(0, 4); o[y] = (o[y] || 0) + inv[i]; c[y] = (c[y] || 0) + 1; } Object.keys(o).forEach((y) => (o[y] /= c[y])); return o; }
const halves = (eq, ref) => ({ A: cagr(ref === BEQ ? CAP : CAP, eq[SPLIT - 1], yrs(START, SPLIT - 1)), B: cagr(eq[SPLIT - 1], eq[last], yrs(SPLIT - 1, last)) });
function rolling(eq) {
  const ends = []; for (let i = START + 1; i < n; i++) if (cal[i].slice(0, 7) !== cal[i - 1].slice(0, 7)) ends.push(i - 1); ends.push(last);
  let tot = 0, win = 0; for (const e of ends) { const t = new Date(cal[e]); t.setFullYear(t.getFullYear() - 3); const ts = t.toISOString().slice(0, 10), s0 = cal.findIndex((d) => d >= ts); if (s0 < START) continue; const base = s0 - 1;
    const sc = cagr(eq[base] || CAP, eq[e], 3) - CFG.haircut, b1 = cagr(BEQ.SPX_TR[base], BEQ.SPX_TR[e], 3), b2 = cagr(BEQ.RSP_TR[base], BEQ.RSP_TR[e], 3); tot++; if (sc > b1 && sc > b2) win++; }
  return { windows: tot, wins: win, frac: tot ? win / tot : 0 };
}
function epStats(r) {
  const ep = r.episodes, tot = ep.reduce((a, t) => a + t.pnl, 0), top = [...ep].sort((a, b) => b.pnl - a.pnl).slice(0, 5), topSum = top.reduce((a, t) => a + t.pnl, 0), avgEq = r.eq.slice(START).reduce((a, b) => a + b, 0) / (n - START);
  return { positions: ep.length, avgHoldDays: ep.reduce((a, t) => a + t.days, 0) / (ep.length || 1), turnoverPerYear: r.traded / avgEq / Y, win: ep.filter((t) => t.pnl > 0).length / (ep.length || 1), top5Share: tot > 0 ? topSum / tot : null, cagrWithoutTop5: cagr(CAP, Math.max(CAP + tot - topSum, 1), Y) };
}
const pct = (x) => (x * 100).toFixed(1) + "%";

// ---------- รัน ----------
const out = { generated: new Date().toISOString(), market: MK, prereg: "research/PREREG_leaders_periodic_2026-10-10.md", period: [cal[START], cal[last]], stocks: Sn, bench: {}, results: {} };
for (const [k, eq] of Object.entries(BEQ)) out.bench[k] = { cagr: full(eq), yearly: yearly(eq), ...dd(eq), halves: halves(eq, BEQ) };
console.log("Benchmarks CAGR:", Object.entries(out.bench).map(([k, v]) => k + " " + pct(v.cagr)).join(" · "));
const EXCESS = 0.04, NEED = Math.ceil(SEEDS * 0.998);
for (const freq of ["m", "w"]) for (const N of [10, 20]) {
  const cap = N === 10 ? 0.2 : 0.12, tag = (freq === "m" ? "monthly" : "weekly") + " Top" + N, base = { N, cap, cost: CFG.cost, useGate: true, wmode: "rs", rank: "r12", freq, ctl: null };
  const r = simulate(base), eq = r.eq, c = full(eq), d = dd(eq), es = epStats(r);
  const res = { cagr: c, cagrAfterHaircut: c - CFG.haircut, ...d, sharpe: sharpe(eq), calmar: d.maxDD ? c / Math.abs(d.maxDD) : null, ...es, yearly: yearly(eq), exposure: exposureYearly(r.inv), halves: halves(eq, BEQ), sens: {}, ablation: {}, control: {} };
  for (const cc of CFG.sens) res.sens[cc] = full(simulate({ ...base, cost: cc }).eq);
  for (const [name, ov] of [["noGate", { useGate: false }], ["equalWeight", { wmode: "eq" }], ["rank12_1", { rank: "r121" }]]) { const a = simulate({ ...base, ...ov }); res.ablation[name] = { cagr: full(a.eq), maxDD: dd(a.eq).maxDD }; }
  const beats = {};
  for (const [pool, flag] of [["A", flagA], ["B", flagB]]) {
    const cagrs = []; for (let sd = 1; sd <= SEEDS; sd++) { const rnd = rngf(sd * 7919 + N * 31 + (pool === "B" ? 101 : 0) + (freq === "w" ? 977 : 0)), order = Int32Array.from({ length: Sn }, (_, i) => i); for (let x = Sn - 1; x > 0; x--) { const y = Math.floor(rnd() * (x + 1)); [order[x], order[y]] = [order[y], order[x]]; } cagrs.push(full(simulate({ ...base, ctl: { flag, order } }).eq)); }
    cagrs.sort((a, b) => a - b); beats[pool] = cagrs.filter((x) => c > x).length; res.control[pool] = { seeds: SEEDS, beat: beats[pool], median: cagrs[cagrs.length >> 1], p5: cagrs[Math.floor(SEEDS * 0.05)], p95: cagrs[Math.floor(SEEDS * 0.95)] };
  }
  const adj = c - CFG.haircut, c3 = beats.A >= NEED && beats.B >= NEED;
  if (IS_US) { const exS = adj - out.bench.SPX_TR.cagr, exR = adj - out.bench.RSP_TR.cagr; res.rolling = rolling(eq); res.pass = { c1: exS >= EXCESS && exR >= EXCESS, exS, exR, c2: res.rolling.frac >= 0.6, c3 }; }
  else { const h = res.halves, bh = out.bench.SET_PX.halves, ex = adj - out.bench.SET_PX.cagr; res.pass = { c1: ex >= EXCESS, ex, c2: (h.A - CFG.haircut) > bh.A && (h.B - CFG.haircut) > bh.B, c3 }; }
  res.pass.all = res.pass.c1 && res.pass.c2 && res.pass.c3; out.results[tag] = res;
  console.log(`\n[${MK} ${tag}] CAGR ${pct(c)} (after ${CFG.haircut * 100}pp haircut ${pct(adj)}) | MaxDD ${pct(d.maxDD)} longestDD ${d.longestDays}d Sharpe ${res.sharpe.toFixed(2)} | positions ${es.positions} avgHold ${es.avgHoldDays.toFixed(0)}d turnover ${es.turnoverPerYear.toFixed(1)}x/yr | top5 share ${es.top5Share && pct(es.top5Share)} CAGR w/o top5 ${pct(es.cagrWithoutTop5)}`);
  console.log("  fee sens:", Object.entries(res.sens).map(([k, v]) => (k * 100).toFixed(3) + "% → " + pct(v)).join("  "), "| ablation CAGR:", Object.entries(res.ablation).map(([k, v]) => k + " " + pct(v.cagr)).join(", "));
  console.log(`  controls beat A ${beats.A}/${SEEDS} (median ${pct(res.control.A.median)}, p95 ${pct(res.control.A.p95)}) · B ${beats.B}/${SEEDS} (median ${pct(res.control.B.median)}, p95 ${pct(res.control.B.p95)})` + (res.rolling ? ` | rolling3y ${res.rolling.wins}/${res.rolling.windows}` : ` | halves ${pct(res.halves.A)} / ${pct(res.halves.B)} vs SET ${pct(out.bench.SET_PX.halves.A)} / ${pct(out.bench.SET_PX.halves.B)}`));
  console.log(`  c1 ${res.pass.c1} c2 ${res.pass.c2} c3 ${res.pass.c3} ⇒ ${res.pass.all ? "PASS (this market)" : "NOT PROVEN"}`);
  console.log("  yearly:", Object.entries(res.yearly).map(([y, v]) => y + ":" + (v * 100).toFixed(0)).join(" "), "| exposure:", Object.entries(res.exposure).map(([y, v]) => y + ":" + (v * 100).toFixed(0)).join(" "));
}
console.log("\nbenchmark yearly:", Object.entries(out.bench[IS_US ? "SPX_TR" : "SET_PX"].yearly).map(([y, v]) => y + ":" + (v * 100).toFixed(0)).join(" "));
fs.writeFileSync(path.join(ROOT, "data", `bt_leaders_periodic_${MK}_2026-10-10.json`), JSON.stringify(out, null, 1));
console.log(`wrote data/bt_leaders_periodic_${MK}_2026-10-10.json`);
