// Backtest VCP Screener (tradermonty/claude-trading-skills) บนหุ้น US ตามกฎที่ล็อกไว้ใน research/PREREG_vcp_us_2026-10-11.md  (ห้ามแก้เกณฑ์หลังเห็นผล)
//   node --max-old-space-size=12288 scripts/backtest_vcp_us.mjs      env: SEEDS (ค่าลงทะเบียน 500), RATING_MIN (3=Good), TAG
// โครงข้อมูล/ตัวชี้วัด/Gate/ตัวเทียบ/เมตริกคัดลอกจาก scripts/backtest_setups_us.mjs (ชุดเดียวกัน) · ตรรกะ VCP อยู่ใน scripts/lib/vcp.mjs
import * as VCP from "./lib/vcp.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HERMES = process.env.HERMES_SCRIPTS || "C:/Users/Tar/AppData/Local/hermes/scripts", DIR = path.join(HERMES, "us11");
const DATA_FROM = "2013-06-01", START_DATE = "2015-01-01";
const CAP = 1e6, MAXPOS = 10, RISK = 0.01, POSCAP = 0.15, IND_CAP = 3, MIN_PRICE = 10, MIN_TURN = 20e6, HAIRCUT = 0.03, SEEDS = +(process.env.SEEDS || 500);
const BASE_COST = 0.00207;
let COST = BASE_COST;
const MULT = [0, 0.7, 1];
const F32 = () => new Float32Array(0);

// ---------- ตัวเทียบ / ดอกเบี้ย ----------
const bench = JSON.parse(fs.readFileSync(path.join(DIR, "bench.json"), "utf8"));
const cal = bench["^GSPC"].t.filter((d) => d >= DATA_FROM), n = cal.length, calIdx = new Map(cal.map((d, i) => [d, i]));
const START = cal.findIndex((d) => d >= START_DATE);
const align = (b, key) => { const a = new Float64Array(n).fill(NaN); b.t.forEach((d, i) => { const k = calIdx.get(d); if (k !== undefined) a[k] = b[key][i]; }); let last = NaN; for (let i = 0; i < n; i++) { if (a[i] > 0) last = a[i]; else a[i] = last; } return a; };
const SPX = align(bench["^GSPC"], "c"), SPXO = align(bench["^GSPC"], "o"), IXIC = align(bench["^IXIC"], "c"), SPYTR = align(bench.SPY, "adj"), RSPPX = align(bench.RSP, "c"), RSPTR = align(bench.RSP, "adj");
const RF = new Float64Array(n);   // อัตราดอกเบี้ยรายวัน
{ const rows = fs.readFileSync(path.join(DIR, "tbill.csv"), "utf8").trim().split(/\r?\n/).slice(1).map((l) => l.split(",")).filter((r) => r[1] && r[1] !== "."); const m = new Map(rows.map((r) => [r[0], +r[1]])); let last = rows.length ? +rows[0][1] : 0; for (let i = 0; i < n; i++) { if (m.has(cal[i])) last = m.get(cal[i]); RF[i] = last / 100 / 252; } }

// ---------- โหลดหุ้น ----------
const U = new Map(JSON.parse(fs.readFileSync(path.join(DIR, "universe.json"), "utf8")).map((s) => [s.tk, s]));
const S = [], excluded = [], bigJumps = [];
for (const f of fs.readdirSync(DIR).filter((x) => /^chunk_\d+\.json$/.test(x)).sort()) {
  const ch = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  for (const [tk, b] of Object.entries(ch)) {
    const o = new Float32Array(n).fill(NaN), h = new Float32Array(n).fill(NaN), l = new Float32Array(n).fill(NaN), c = new Float32Array(n).fill(NaN), v = new Float32Array(n);
    let first = -1, last = -1, cnt = 0;
    for (let i = 0; i < b.t.length; i++) {
      const k = calIdx.get(b.t[i]); if (k === undefined || !(b.c[i] > 0)) continue;
      const oo = b.o[i] > 0 ? b.o[i] : b.c[i]; o[k] = oo; c[k] = b.c[i]; h[k] = Math.max(b.h[i], oo, b.c[i]); l[k] = Math.min(b.l[i] > 0 ? b.l[i] : b.c[i], oo, b.c[i]); v[k] = b.v[i] || 0;
      if (first < 0) first = k; last = k; cnt++;
    }
    if (cnt < 300) continue;
    for (let i = first + 1; i <= last; i++) if (!(c[i] > 0)) { c[i] = c[i - 1]; o[i] = h[i] = l[i] = c[i]; v[i] = 0; }
    // ตัดหุ้น spike&revert (ข้อมูลผิด): |r|>50% แล้วภายใน 3 วันกลับมาอยู่ภายใน 15% ของราคาก่อนวันนั้น
    let bad = false;
    for (let i = first + 1; i <= last && !bad; i++) {
      const r = c[i] / c[i - 1] - 1;
      if (Math.abs(r) > 0.5) { let rev = false; for (let j = i + 1; j <= Math.min(i + 3, last); j++) if (Math.abs(c[j] / c[i - 1] - 1) <= 0.15) rev = true; if (rev) bad = true; else bigJumps.push(tk + ":" + cal[i] + ":" + Math.round(r * 100)); }
    }
    if (bad) { excluded.push(tk); continue; }
    const u = U.get(tk) || {};
    S.push({ tk, ind: u.industry || tk, o, h, l, c, v, first, last });
  }
}
console.log("stocks", S.length, "excluded(spike)", excluded.length, "days", n, "start", cal[START]);

// ---------- ตัวชี้วัด ----------
const pre = (a) => { const p = new Float64Array(n + 1); for (let i = 0; i < n; i++) p[i + 1] = p[i] + (a[i] > 0 || a[i] === 0 ? a[i] : 0); return p; };
const avgW = (p, k, P, off, first) => (k - off - P + 1 >= first ? (p[k - off + 1] - p[k - off + 1 - P]) / P : NaN);
const ema = (a, P, first) => { const o = new Float32Array(n).fill(NaN), al = 2 / (P + 1); let e = NaN; for (let i = first; i < n; i++) { if (!(a[i] > 0)) continue; e = i === first ? a[i] : al * a[i] + (1 - al) * e; if (i >= first + 3 * P) o[i] = e; } return o; };
for (const s of S) {
  const { c, h, l, v, first } = s;
  const pc = pre(c), pv = pre(v), pcv = pre(c.map((x, i) => (x > 0 ? x * v[i] : 0)));
  const tr = new Float64Array(n).fill(NaN); for (let i = first + 1; i < n; i++) if (c[i] > 0 && c[i - 1] > 0) tr[i] = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
  const ptr = pre(tr);
  for (const k of ["sma50", "sma150", "sma200", "atrR", "turn20", "pv50", "pv20", "hh20", "hh15", "hi252", "lo252"]) s[k] = new Float32Array(n).fill(NaN);
  for (let k = first; k < n; k++) {
    s.sma50[k] = avgW(pc, k, 50, 0, first); s.sma150[k] = avgW(pc, k, 150, 0, first); s.sma200[k] = avgW(pc, k, 200, 0, first);
    s.turn20[k] = avgW(pcv, k, 20, 0, first); s.pv50[k] = avgW(pv, k, 50, 1, first); s.pv20[k] = avgW(pv, k, 20, 1, first);
    const a10 = k - 9 >= first + 1 ? (ptr[k + 1] - ptr[k - 9]) / 10 : NaN, a50 = k - 49 >= first + 1 ? (ptr[k + 1] - ptr[k - 49]) / 50 : NaN; s.atrR[k] = a10 / a50;
    if (k - 20 >= first) { let m = 0; for (let j = k - 20; j < k; j++) if (h[j] > m) m = h[j]; s.hh20[k] = m; }
    if (k - 15 >= first) { let m = 0; for (let j = k - 15; j < k; j++) if (h[j] > m) m = h[j]; s.hh15[k] = m; }
    if (k - 251 >= first) { let hi = 0, lo = Infinity; for (let j = k - 251; j <= k; j++) { if (h[j] > hi) hi = h[j]; if (l[j] < lo) lo = l[j]; } s.hi252[k] = hi; s.lo252[k] = lo; }
  }
  s.ema10 = ema(c, 10, first); s.ema20 = ema(c, 20, first); s.rs = new Uint8Array(n);
}
for (let k = Math.max(START - 5, 260); k < n; k++) {
  const arr = [];
  for (const s of S) { const c = s.c; if (k - 252 < s.first || k > s.last || !(c[k] > 0)) continue; arr.push([s, 0.3 * (c[k] / c[k - 21] - 1) + 0.3 * (c[k] / c[k - 63] - 1) + 0.2 * (c[k] / c[k - 126] - 1) + 0.2 * (c[k] / c[k - 252] - 1)]); }
  arr.sort((a, b) => b[1] - a[1]); const N = arr.length; arr.forEach(([s], i) => { s.rs[k] = Math.max(1, Math.min(99, Math.round(((N - i) / N) * 99))); });
}
function gateOf(IDX) {
  const ip = new Float64Array(n + 1); for (let i = 0; i < n; i++) ip[i + 1] = ip[i] + IDX[i]; const G = new Uint8Array(n);
  for (let k = 0; k < n; k++) { if (k < 199) { G[k] = 1; continue; } const c = IDX[k], s50 = (ip[k + 1] - ip[k - 49]) / 50, s200 = (ip[k + 1] - ip[k - 199]) / 200; G[k] = (c > s50 && s50 > s200) ? 2 : ((c < s200 || (c < s50 && s50 < s200)) ? 0 : 1); }
  return G;
}
const GATES = { SPX: gateOf(SPX), IXIC: gateOf(IXIC) };
const liquid = (s, k) => k - 252 >= s.first && k <= s.last && s.c[k] >= MIN_PRICE && s.turn20[k] >= MIN_TURN;
const closeAt = (s, i) => (i <= s.last ? s.c[i] : s.c[s.last]);
const openAt = (s, i) => (i <= s.last && s.o[i] > 0 ? s.o[i] : closeAt(s, i - 1));
const liqCache = new Map(); const liquidList = (k) => { let a = liqCache.get(k); if (!a) { a = S.filter((s) => liquid(s, k)); liqCache.set(k, a); } return a; };
function rngf(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const yrs = (a, b) => (new Date(cal[b]) - new Date(cal[a])) / (365.25 * 864e5);
const cagr = (v0, v1, y) => (v1 / v0) ** (1 / y) - 1;
const last = n - 1, Y = yrs(START, last);
const mk = (arr, base) => { const e = new Float64Array(n).fill(NaN); for (let i = START - 1; i < n; i++) e[i] = CAP * arr[i] / base; return e; };
const B = { SPX_TR: mk(SPYTR, SPYTR[START - 1]), RSP_TR: mk(RSPTR, RSPTR[START - 1]), SPX_PX: mk(SPX, SPX[START - 1]), RSP_PX: mk(RSPPX, RSPPX[START - 1]) };
const full = (eq) => cagr(CAP, eq[last], Y);
function dd(eq) { let pk = CAP, mdd = 0, pkI = START, longest = 0; for (let i = START; i < n; i++) { if (eq[i] >= pk) { longest = Math.max(longest, i - pkI); pk = eq[i]; pkI = i; } mdd = Math.min(mdd, eq[i] / pk - 1); } longest = Math.max(longest, last - pkI); return { maxDD: mdd, longestDays: longest }; }
function sharpe(eq) { const r = []; for (let i = START + 1; i < n; i++) r.push(eq[i] / eq[i - 1] - 1 - RF[i]); const m = r.reduce((a, b) => a + b, 0) / r.length, sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1)); return sd ? m / sd * Math.sqrt(252) : 0; }
function yearly(eq) { const o = {}; let prev = CAP; for (let i = START; i < n; i++) { const y = cal[i].slice(0, 4); if (i === n - 1 || cal[i + 1].slice(0, 4) !== y) { o[y] = eq[i] / prev - 1; prev = eq[i]; } } return o; }
function exposureYearly(inv) { const o = {}, c = {}; for (let i = START; i < n; i++) { const y = cal[i].slice(0, 4); o[y] = (o[y] || 0) + inv[i]; c[y] = (c[y] || 0) + 1; } Object.keys(o).forEach((y) => (o[y] /= c[y])); return o; }
// หน้าต่างเลื่อน 3 ปี (ก้าวทีละเดือน)
function rolling(eq) {
  const ends = []; for (let i = START + 1; i < n; i++) if (cal[i].slice(0, 7) !== cal[i - 1].slice(0, 7)) ends.push(i - 1); ends.push(last);
  let tot = 0, win = 0; const startOf = (e) => { const t = new Date(cal[e]); t.setFullYear(t.getFullYear() - 3); const ts = t.toISOString().slice(0, 10); let j = cal.findIndex((d) => d >= ts); return j; };
  for (const e of ends) { const s0 = startOf(e); if (s0 < START) continue; const base = s0 - 1 >= START - 1 ? s0 - 1 : s0; const sc = cagr(eq[base] || CAP, eq[e], 3) - HAIRCUT, b1 = cagr(B.SPX_TR[base], B.SPX_TR[e], 3), b2 = cagr(B.RSP_TR[base], B.RSP_TR[e], 3); tot++; if (sc > b1 && sc > b2) win++; }
  return { windows: tot, wins: win, frac: tot ? win / tot : 0 };
}
function tradeStats(tr) {
  if (!tr.length) return { n: 0 }; const w = tr.filter((t) => t.ret > 0), gl = -tr.filter((t) => t.ret <= 0).reduce((a, t) => a + t.ret, 0), gw = w.reduce((a, t) => a + t.ret, 0);
  const tot = tr.reduce((a, t) => a + t.pnl, 0), top = [...tr].sort((a, b) => b.pnl - a.pnl).slice(0, 5), topSum = top.reduce((a, t) => a + t.pnl, 0);
  return { n: tr.length, win: w.length / tr.length, avgR: tr.reduce((a, t) => a + t.R, 0) / tr.length, pf: gl ? gw / gl : null, totalPnl: tot, top5Pnl: topSum, top5Share: tot > 0 ? topSum / tot : null, top5: top.map((t) => t.tk + ":" + cal[t.ei]), cagrWithoutTop5: cagr(CAP, CAP + tot - topSum, Y) };
}
const pct = (x) => (x * 100).toFixed(1) + "%";

// ---------- VCP: วิเคราะห์รายวัน (ตามนิยามใน PREREG_vcp_us_2026-10-11) ----------
const RET_P = [63, 126, 189, 252], MINRATING = +(process.env.RATING_MIN || 3);   // 3 = Good (ค่าลงทะเบียน)
function analyze(s, k) {
  const c = s.c;
  if (!liquid(s, k) || k - 119 < s.first) return null;
  const price = c[k]; if (!(s.pv50[k] >= 200000)) return null;
  const lo = s.lo252[k], hi = s.hi252[k]; if (!(lo > 0 && hi > 0)) return null;
  if ((price - lo) / lo < 0.20 || (hi - price) / hi > 0.30) return null;
  let st = 0; for (let j = k - 9; j <= k; j++) st += (s.h[j] - s.l[j]) / c[j]; if (st / 10 < 0.01) return null;   // ราคาตรึง
  const rets = [], srets = []; for (const p of RET_P) { rets.push((price / c[k - p] - 1) * 100); srets.push((SPX[k] / SPX[k - p] - 1) * 100); }
  const wrs = VCP.weightedRS(rets, srets);
  const sma200 = s.sma200[k], ago = s.sma200[k - 22]; if (!(sma200 > 0) || !(s.sma150[k] > 0) || !(s.sma50[k] > 0)) return null;
  const tt = VCP.trendTemplate({ price, sma50: s.sma50[k], sma150: s.sma150[k], sma200, sma200ago22: ago > 0 ? ago : null, lo52: lo, hi52: hi, rsRank: VCP.rsRankEstimate(wrs) });
  if (!tt.passed) return null;
  const a = k - 119, Hw = Array.from(s.h.subarray(a, k + 1)), Lw = Array.from(s.l.subarray(a, k + 1)), Cw = Array.from(s.c.subarray(a, k + 1)), Vw = Array.from(s.v.subarray(a, k + 1));
  const vcp = VCP.detectVCP(Hw, Lw, Cw); if (!vcp || !vcp.valid || vcp.pivot == null) return null;   // ไม่ valid → เรตติ้งไม่ถึง Good อยู่แล้ว
  const vol = VCP.volumePattern(Vw, Cw, vcp.pivot, vcp.contractions, 0), pp = VCP.pivotProximity(price, vcp.pivot, vcp.lastLow, vol.breakout);
  const state = VCP.executionState({ dist: pp.dist, price, sma50: s.sma50[k], sma200, sma200Dist: (price - sma200) / sma200 * 100, lastLow: vcp.lastLow, breakoutVol: vol.breakout });
  const r = VCP.rate({ tt: tt.score, contraction: vcp.score, volume: vol.score, pivot: pp.score, rs: VCP.rsScore(wrs), valid: vcp.valid, state, wideAndLoose: vcp.wideAndLoose });
  return { s, state, rating: r.rating, composite: r.composite, pivot: vcp.pivot, stop: pp.stop, risk: pp.risk, dist: pp.dist, dry: vol.dryUp, wrs, rm: VCP.ratingMult(r.composite) };
}
const DAY = new Array(n), DAYMAP = new Array(n);
{
  const t0 = Date.now(); let tot = 0;
  for (let k = START - 1; k < n - 1; k++) { const list = []; const m = new Map(); for (const s of S) { const a = analyze(s, k); if (a) { list.push(a); m.set(s.tk, a); } } DAY[k] = list; DAYMAP[k] = m; tot += list.length; }
  console.log(`วิเคราะห์ VCP รายวันเสร็จ: ${tot} รายการ (เฉลี่ย ${(tot / (n - START)).toFixed(0)}/วัน) ใช้เวลา ${((Date.now() - t0) / 1000).toFixed(0)} วินาที`);
}
const brkCands = (k) => DAY[k].filter((a) => a.state === "Breakout" && a.rating >= MINRATING && a.risk > 0 && a.risk <= 15);
const placeOK = (a) => a.state === "Pre-breakout" && a.rating >= MINRATING && a.dist >= -8 && a.dist < 0 && a.dry != null && a.dry <= 1 && a.risk > 0 && a.risk <= 15;
const byScore = (x, y) => y.composite - x.composite || y.wrs - x.wrs;

// ---------- ตัวจำลอง ----------
function simulate(mode, G, ctl) {
  let cash = CAP; const pos = [], eq = new Float64Array(n).fill(NaN), inv = new Float64Array(n).fill(NaN), trades = [], entriesByDay = new Map(); let orders = []; const ost = { placed: 0, filled: 0, cancelled: 0, expired: 0 };
  const sell = (p, px, i, why) => { cash += p.sh * px * (1 - COST); trades.push({ tk: p.s.tk, ei: p.ei, xi: i, ep: p.px, xp: px, R: (px - p.px) / (p.px - p.stop), ret: px / p.px - 1, pnl: p.sh * (px * (1 - COST) - p.px * (1 + COST)), why, sp: (p.px - p.stop) / p.px, rm: p.rm }); };
  const open = (s, px, stop, rm, i, mult, pivotFill) => {
    let E = cash; for (const p of pos) E += p.sh * openAt(p.s, i);
    const sp = (px - stop) / px, notional = Math.min(RISK * mult * rm * E / sp, POSCAP * E, cash / (1 + COST)); if (notional < 0.03 * E) return false;
    const sh = notional / (px * (1 + COST)); cash -= sh * px * (1 + COST); pos.push({ s, sh, px, stop, ei: i, exitNext: false, rm, pivotFill: !!pivotFill }); entriesByDay.set(i, (entriesByDay.get(i) || 0) + 1); return true;
  };
  for (let i = START; i < n; i++) {
    const k = i - 1;
    for (let j = pos.length - 1; j >= 0; j--) if (pos[j].exitNext) { sell(pos[j], openAt(pos[j].s, i), i, "trail"); pos.splice(j, 1); }
    const mult = G ? MULT[G[k]] : 1;
    if (ctl) {   // กลุ่มควบคุมสุ่ม: หุ้นสุ่มที่ผ่านจักรวาล เข้า open วันเดียวกัน ใช้ (ระยะ stop, ตัวคูณเรตติ้ง) สุ่มจากไม้จริง
      if (pos.length < MAXPOS && mult > 0 && ctl.counts.get(i)) {
        const pool = liquidList(k).filter((s) => !pos.some((p) => p.s === s)); for (let x = pool.length - 1; x > 0; x--) { const y = Math.floor(ctl.rnd() * (x + 1)); [pool[x], pool[y]] = [pool[y], pool[x]]; }
        let want = ctl.counts.get(i);
        for (const s of pool) { if (pos.length >= MAXPOS || want <= 0) break; if (pos.filter((p) => p.s.ind === s.ind).length >= IND_CAP) continue; const o = s.o[i]; if (!(o > 0) || !(s.v[i] > 0) || i > s.last) continue; const pr = ctl.pairs[Math.floor(ctl.rnd() * ctl.pairs.length)]; if (open(s, o, o * (1 - pr.sp), pr.rm, i, mult)) want--; }
      }
    } else if (mode === "VB") {
      if (pos.length < MAXPOS && mult > 0) {
        for (const a of brkCands(k).sort(byScore)) {
          if (pos.length >= MAXPOS) break; const s = a.s; if (pos.some((p) => p.s === s) || pos.filter((p) => p.s.ind === s.ind).length >= IND_CAP) continue;
          const o = s.o[i]; if (!(o > 0) || !(s.v[i] > 0) || i > s.last || o > 1.05 * a.pivot) continue; const risk = (o - a.stop) / o; if (!(risk > 0 && risk <= 0.15)) continue;
          open(s, o, a.stop, a.rm, i, mult, false);
        }
      }
    } else {   // VS: buy-stop ที่ pivot อายุ 5 วันทำการ
      const map = DAYMAP[k];
      for (let j = orders.length - 1; j >= 0; j--) { const od = orders[j], a = map.get(od.s.tk); if (i > od.last) { orders.splice(j, 1); ost.expired++; } else if (!a || a.state !== "Pre-breakout" || a.pivot !== od.pivot) { orders.splice(j, 1); ost.cancelled++; } }
      for (const a of DAY[k]) if (placeOK(a) && !orders.some((od) => od.s === a.s) && !pos.some((p) => p.s === a.s)) { orders.push({ s: a.s, pivot: a.pivot, stop: a.stop, rm: a.rm, last: k + 5, composite: a.composite, wrs: a.wrs }); ost.placed++; }
      if (pos.length < MAXPOS && mult > 0) {
        orders.sort(byScore);
        for (let j = 0; j < orders.length && pos.length < MAXPOS; ) {
          const od = orders[j], s = od.s; if (pos.some((p) => p.s === s)) { orders.splice(j, 1); continue; }
          if (!liquid(s, k) || pos.filter((p) => p.s.ind === s.ind).length >= IND_CAP) { j++; continue; }
          const o = s.o[i]; if (!(o > 0) || !(s.v[i] > 0) || i > s.last) { j++; continue; }
          let px = null, pf = false; if (o >= od.pivot) { if (o > 1.05 * od.pivot) { orders.splice(j, 1); ost.cancelled++; continue; } px = o; } else if (s.h[i] >= od.pivot) { px = od.pivot; pf = true; }
          if (px == null) { j++; continue; }
          const risk = (px - od.stop) / px; if (!(risk > 0 && risk <= 0.15)) { orders.splice(j, 1); ost.cancelled++; continue; }
          if (open(s, px, od.stop, od.rm, i, mult, pf)) { ost.filled++; orders.splice(j, 1); } else j++;
        }
      }
    }
    for (let j = pos.length - 1; j >= 0; j--) { const p = pos[j]; if (i <= p.s.last && p.s.l[i] <= p.stop) { const xp = (p.ei === i && p.pivotFill) ? p.stop : Math.min(p.s.o[i] > 0 ? p.s.o[i] : p.stop, p.stop); sell(p, xp, i, "stop"); pos.splice(j, 1); } }
    cash *= 1 + RF[i];
    let v = cash, iv = 0; for (const p of pos) { const c = closeAt(p.s, i); v += p.sh * c; iv += p.sh * c; if (c < p.s.sma50[i]) p.exitNext = true; }
    eq[i] = v; inv[i] = iv / v;
  }
  return { eq, inv, trades, entriesByDay, open: pos.length, ost };
}

// ---------- เพิ่มเติม ----------
function rollingFn(eq) {
  const ends = []; for (let i = START + 1; i < n; i++) if (cal[i].slice(0, 7) !== cal[i - 1].slice(0, 7)) ends.push(i - 1); ends.push(last);
  let tot = 0, win = 0; const startOf = (e) => { const t = new Date(cal[e]); t.setFullYear(t.getFullYear() - 3); const ts = t.toISOString().slice(0, 10); return cal.findIndex((d) => d >= ts); };
  for (const e of ends) { const s0 = startOf(e); if (s0 < START) continue; const base = s0 - 1 >= START - 1 ? s0 - 1 : s0; const sc = cagr(eq[base] || CAP, eq[e], 3) - HAIRCUT, b1 = cagr(B.SPX_TR[base], B.SPX_TR[e], 3), b2 = cagr(B.RSP_TR[base], B.RSP_TR[e], 3); tot++; if (sc > b1 && sc > b2) win++; }
  return { windows: tot, wins: win, frac: tot ? win / tot : 0 };
}
const byRm = (tr) => { const o = {}; for (const rm of [0.75, 1, 1.5]) { const t = tr.filter((x) => x.rm === rm); if (t.length) o[rm] = { n: t.length, win: t.filter((x) => x.ret > 0).length / t.length, avgR: t.reduce((a, x) => a + x.R, 0) / t.length }; } return o; };

// ---------- รัน ----------
const TAG = process.env.TAG || "";
const out = { generated: new Date().toISOString(), prereg: "research/PREREG_vcp_us_2026-10-11.md", minRating: MINRATING, period: [cal[START], cal[last]], stocks: S.length, excludedSpike: excluded, bench: {}, results: {} };
for (const [k, eq] of Object.entries(B)) out.bench[k] = { cagr: full(eq), yearly: yearly(eq), ...dd(eq), sharpe: sharpe(eq) };
console.log("\nBenchmarks CAGR:", Object.entries(out.bench).map(([k, v]) => k + " " + pct(v.cagr)).join(" · "));
for (const [mode, gname] of [["VB", "SPX"], ["VB", "IXIC"], ["VS", "SPX"], ["VS", "IXIC"]]) {
  const tag = mode + "-" + gname; COST = BASE_COST;
  const r = simulate(mode, GATES[gname]), eq = r.eq, c = full(eq), d = dd(eq), ts = tradeStats(r.trades);
  const res = { cagr: c, cagrAfterHaircut: c - HAIRCUT, ...d, sharpe: sharpe(eq), calmar: d.maxDD ? c / Math.abs(d.maxDD) : null, trades: ts, byRating: byRm(r.trades), orders: r.ost, yearly: yearly(eq), exposure: exposureYearly(r.inv), openAtEnd: r.open, sens: {} };
  for (const cc of [0.00107, 0.00357, 0.005]) { COST = cc; res.sens[cc] = full(simulate(mode, GATES[gname]).eq); } COST = BASE_COST;
  res.rolling = rollingFn(eq);
  const pairs = r.trades.map((t) => ({ sp: t.sp, rm: t.rm })), cagrs = [];
  if (pairs.length) for (let sd = 1; sd <= SEEDS; sd++) cagrs.push(full(simulate(mode, GATES[gname], { counts: r.entriesByDay, pairs, rnd: rngf(sd * 7919 + (mode === "VS" ? 17 : 0)) }).eq)); cagrs.sort((a, b) => a - b);
  const beat = cagrs.filter((x) => c > x).length; res.control = { seeds: SEEDS, beat, median: cagrs[cagrs.length >> 1], p5: cagrs[Math.floor(SEEDS * 0.05)], p95: cagrs[Math.floor(SEEDS * 0.95)] };
  const adj = c - HAIRCUT, exS = adj - out.bench.SPX_TR.cagr, exR = adj - out.bench.RSP_TR.cagr;
  res.pass = { c1: exS >= 0.03 && exR >= 0.03, exS, exR, c2: res.rolling.frac >= 0.6, c3: beat >= Math.ceil(SEEDS * 0.99) }; res.pass.all = res.pass.c1 && res.pass.c2 && res.pass.c3;
  out.results[tag] = res;
  console.log(`\n[${tag}] CAGR ${pct(c)} (after 3pp haircut ${pct(adj)}) | MaxDD ${pct(d.maxDD)} longestDD ${d.longestDays}d Sharpe ${res.sharpe.toFixed(2)} | trades ${ts.n} win ${ts.win && pct(ts.win)} avgR ${ts.avgR && ts.avgR.toFixed(2)} PF ${ts.pf && ts.pf.toFixed(2)} | top5 share ${ts.top5Share && pct(ts.top5Share)} CAGR w/o top5 ${pct(ts.cagrWithoutTop5)}`);
  console.log("  orders:", JSON.stringify(r.ost), "| by rating mult:", JSON.stringify(res.byRating, (k, v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v)));
  console.log("  fee sensitivity:", Object.entries(res.sens).map(([k, v]) => (k * 100).toFixed(3) + "% → " + pct(v)).join("  "));
  console.log(`  control (n=${SEEDS}): median ${pct(res.control.median)} p95 ${pct(res.control.p95)} · beats ${beat}/${SEEDS} | rolling-3y wins ${res.rolling.wins}/${res.rolling.windows} (${pct(res.rolling.frac)})`);
  console.log(`  excess vs S&P TR ${pct(exS)}, vs RSP TR ${pct(exR)}  ⇒ c1 ${res.pass.c1} · c2 ${res.pass.c2} · c3 ${res.pass.c3} ⇒ ${res.pass.all ? "EDGE PROVEN" : "NOT PROVEN"}`);
  console.log("  yearly:", Object.entries(res.yearly).map(([y, v]) => y + ":" + (v * 100).toFixed(0)).join(" "), "| exposure:", Object.entries(res.exposure).map(([y, v]) => y + ":" + (v * 100).toFixed(0)).join(" "));
}
out.nogate = {}; for (const mode of ["VB", "VS"]) { COST = BASE_COST; const eq = simulate(mode, null).eq; out.nogate[mode] = { cagr: full(eq), ...dd(eq), yearly: yearly(eq) }; console.log(`\n[${mode} no-gate] CAGR ${pct(out.nogate[mode].cagr)} MaxDD ${pct(out.nogate[mode].maxDD)}`); }

// ตรวจสัญญาณ (ไม่ใช้ตัดสิน): VB — ผลตอบแทน 20 วันหลังสัญญาณ (open k+1 → close k+21) เทียบหุ้นที่ผ่านจักรวาลวันเดียวกัน
{
  const H = 20, sig = [], base = [];
  for (let k = START - 1; k + H + 1 < n; k++) {
    const liq = liquidList(k); let sum = 0, cnt = 0; const fwd = (s) => { const o = s.o[k + 1]; return (o > 0 && s.v[k + 1] > 0) ? s.c[k + H + 1] / o - 1 : NaN; };
    for (const s of liq) { const r = fwd(s); if (r === r) { sum += r; cnt++; } } if (!cnt) continue; const mean = sum / cnt; base.push(mean);
    for (const a of brkCands(k)) { const r = fwd(a.s); if (r === r) sig.push([r, r - mean, cal[k]]); }
  }
  const avg = (a, i) => a.reduce((x, y) => x + y[i], 0) / (a.length || 1), ex = (arr) => (arr.length ? avg(arr, 1) : null);
  out.diag = { horizonDays: H, baseMeanFwd: base.reduce((a, b) => a + b, 0) / base.length, VB: { signals: sig.length, meanFwd: avg(sig, 0), meanExcess: avg(sig, 1), winRateVsMkt: sig.filter((x) => x[1] > 0).length / (sig.length || 1), excess2015_19: ex(sig.filter((x) => x[2] < "2020")), excess2020_22: ex(sig.filter((x) => x[2] >= "2020" && x[2] < "2023")), excess2023p: ex(sig.filter((x) => x[2] >= "2023")) } };
  console.log("\n[diag] VB 20-day forward vs average liquid stock same day:", JSON.stringify(out.diag, (k, v) => (typeof v === "number" ? Math.round(v * 10000) / 10000 : v)));
}
console.log("\nBenchmark yearly (S&P TR):", Object.entries(out.bench.SPX_TR.yearly).map(([y, v]) => y + ":" + (v * 100).toFixed(0)).join(" "));
fs.writeFileSync(path.join(ROOT, "data", `bt_vcp_us${TAG}_2026-10-11.json`), JSON.stringify(out, null, 1));
console.log(`\nwrote data/bt_vcp_us${TAG}_2026-10-11.json`);
