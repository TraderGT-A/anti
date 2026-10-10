// Backtest ตามกฎที่ล็อกไว้ใน research/PREREG_setups_th_2026-10-10.md  (ห้ามแก้เกณฑ์หลังเห็นผล)
//   node --max-old-space-size=8192 scripts/backtest_setups_th.mjs
// กลยุทธ์ M (Minervini) และ Q (Qullamaggie) · ตัดสินที่ปิดวัน k, ซื้อที่ open วัน k+1 · กลุ่มควบคุมสุ่ม 100 seeds
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HERMES = process.env.HERMES_SCRIPTS || "C:/Users/Tar/AppData/Local/hermes/scripts";
const DATA_FROM = "2013-06-01", START_DATE = "2015-01-01", SPLIT_DATE = "2020-01-01";
const CAP = 1e6, MAXPOS = 8, RISK = 0.01, POSCAP = 0.2, MIN_PRICE = 1, MIN_TURN = 5e6, HAIRCUT = 0.02, SEEDS = +(process.env.SEEDS || 100);
let COST = 0.0035;
const MULT = [0, 0.7, 1];   // gate: 0=แดง 1=เหลือง 2=เขียว

// ---------- โหลดข้อมูล ----------
const csv = fs.readFileSync(path.join(HERMES, "idx_SET_daily_full.csv"), "utf8").trim().split(/\r?\n/).slice(1).map((l) => l.split(",")).filter((r) => r[0] >= DATA_FROM);
const cal = csv.map((r) => r[0]), n = cal.length, calIdx = new Map(cal.map((d, i) => [d, i]));
const IC = Float64Array.from(csv.map((r) => +r[4])), IO = Float64Array.from(csv.map((r) => +r[1]));
const START = cal.findIndex((d) => d >= START_DATE), SPLIT = cal.findIndex((d) => d >= SPLIT_DATE);
const raw = JSON.parse(fs.readFileSync(path.join(HERMES, "bt_ohlcv_full.json"), "utf8"));

const F = () => new Float64Array(n).fill(NaN);
const S = [];
for (const [tk, bars] of Object.entries(raw)) {
  const o = F(), h = F(), l = F(), c = F(), v = new Float64Array(n); let first = -1, last = -1, cnt = 0;
  for (const b of bars) {
    const k = calIdx.get(b.t); if (k === undefined || !(b.c > 0)) continue;
    const oo = b.o > 0 ? b.o : b.c;
    o[k] = oo; c[k] = b.c; h[k] = Math.max(b.h || b.c, oo, b.c); l[k] = Math.min(b.l > 0 ? b.l : b.c, oo, b.c); v[k] = b.v || 0;
    if (first < 0) first = k; last = k; cnt++;
  }
  if (cnt < 300) continue;
  for (let i = first + 1; i <= last; i++) if (!(c[i] > 0)) { c[i] = c[i - 1]; o[i] = h[i] = l[i] = c[i]; v[i] = 0; }   // วันที่ไม่มีแท่ง = ราคาเดิม ปริมาณ 0
  S.push({ tk, o, h, l, c, v, first, last });
}
console.log("stocks", S.length, "days", n, "start", cal[START]);

// ---------- ตัวชี้วัด (ทั้งหมดอิงข้อมูลถึงวัน k เท่านั้น) ----------
const pre = (a) => { const p = new Float64Array(n + 1); for (let i = 0; i < n; i++) p[i + 1] = p[i] + (a[i] > 0 || a[i] === 0 ? a[i] : 0); return p; };
const avgW = (p, k, P, off, first) => (k - off - P + 1 >= first ? (p[k - off + 1] - p[k - off + 1 - P]) / P : NaN);   // เฉลี่ย P ค่า สิ้นสุดที่ k-off
const ema = (a, P, first) => { const o = F(), al = 2 / (P + 1); let e = NaN; for (let i = first; i < n; i++) { if (!(a[i] > 0)) continue; e = i === first ? a[i] : al * a[i] + (1 - al) * e; if (i >= first + 3 * P) o[i] = e; } return o; };
for (const s of S) {
  const { c, h, l, v, first } = s;
  const pc = pre(c), pv = pre(v), pcv = pre(c.map((x, i) => (x > 0 ? x * v[i] : 0)));
  const tr = F(); for (let i = first + 1; i < n; i++) if (c[i] > 0 && c[i - 1] > 0) tr[i] = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
  const ptr = pre(tr);
  s.sma50 = F(); s.sma150 = F(); s.sma200 = F(); s.atrR = F(); s.turn20 = F(); s.pv50 = F(); s.pv20 = F(); s.hh20 = F(); s.hh15 = F(); s.hi252 = F(); s.lo252 = F();
  for (let k = first; k < n; k++) {
    s.sma50[k] = avgW(pc, k, 50, 0, first); s.sma150[k] = avgW(pc, k, 150, 0, first); s.sma200[k] = avgW(pc, k, 200, 0, first);
    s.turn20[k] = avgW(pcv, k, 20, 0, first);
    s.pv50[k] = avgW(pv, k, 50, 1, first); s.pv20[k] = avgW(pv, k, 20, 1, first);   // ค่าเฉลี่ยปริมาณ "ก่อนวัน k"
    const a10 = k - 9 >= first + 1 ? (ptr[k + 1] - ptr[k - 9]) / 10 : NaN, a50 = k - 49 >= first + 1 ? (ptr[k + 1] - ptr[k - 49]) / 50 : NaN;
    s.atrR[k] = a10 / a50;
    if (k - 20 >= first) { let m = 0; for (let j = k - 20; j < k; j++) if (h[j] > m) m = h[j]; s.hh20[k] = m; }
    if (k - 15 >= first) { let m = 0; for (let j = k - 15; j < k; j++) if (h[j] > m) m = h[j]; s.hh15[k] = m; }
    if (k - 251 >= first) { let hi = 0, lo = Infinity; for (let j = k - 251; j <= k; j++) { if (h[j] > hi) hi = h[j]; if (l[j] < lo) lo = l[j]; } s.hi252[k] = hi; s.lo252[k] = lo; }
  }
  s.ema10 = ema(c, 10, first); s.ema20 = ema(c, 20, first);
  s.rs = new Uint8Array(n);
}
// RS เปอร์เซ็นไทล์รายวัน (สูตรเดียวกับ rsdash: 0.3·1M+0.3·3M+0.2·6M+0.2·1Y)
for (let k = Math.max(START - 5, 260); k < n; k++) {
  const arr = [];
  for (const s of S) { const c = s.c; if (k - 252 < s.first || k > s.last || !(c[k] > 0)) continue; arr.push([s, 0.3 * (c[k] / c[k - 21] - 1) + 0.3 * (c[k] / c[k - 63] - 1) + 0.2 * (c[k] / c[k - 126] - 1) + 0.2 * (c[k] / c[k - 252] - 1)]); }
  arr.sort((a, b) => b[1] - a[1]); const N = arr.length;
  arr.forEach(([s], i) => { s.rs[k] = Math.max(1, Math.min(99, Math.round(((N - i) / N) * 99))); });
}
// Market gate จากดัชนี SET
const ipre = (() => { const p = new Float64Array(n + 1); for (let i = 0; i < n; i++) p[i + 1] = p[i] + IC[i]; return p; })();
const G = new Uint8Array(n);
for (let k = 0; k < n; k++) {
  if (k < 199) { G[k] = 1; continue; }
  const c = IC[k], s50 = (ipre[k + 1] - ipre[k - 49]) / 50, s200 = (ipre[k + 1] - ipre[k - 199]) / 200;
  G[k] = (c > s50 && s50 > s200) ? 2 : ((c < s200 || (c < s50 && s50 < s200)) ? 0 : 1);
}

// ---------- สัญญาณ ----------
const liquid = (s, k) => k - 252 >= s.first && k <= s.last && s.c[k] >= MIN_PRICE && s.turn20[k] >= MIN_TURN;
function sigM(s, k) {
  const c = s.c[k]; if (!(s.sma200[k - 21] > 0) || !(s.hi252[k] > 0) || !(s.hh20[k] > 0)) return false;
  return c > s.sma150[k] && c > s.sma200[k] && s.sma150[k] > s.sma200[k] && s.sma200[k] > s.sma200[k - 21] && s.sma50[k] > s.sma150[k] && s.sma50[k] > s.sma200[k]
    && c > s.sma50[k] && c >= 1.3 * s.lo252[k] && c >= 0.75 * s.hi252[k] && s.rs[k] >= 85
    && s.atrR[k - 1] <= 0.85 && c > s.hh20[k] && s.v[k] >= 1.4 * s.pv50[k];
}
function sigQ(s, k) {
  const c = s.c[k]; if (!(s.hh15[k] > 0) || !(s.ema20[k - 1] > 0) || !(s.c[k - 63] > 0)) return false;
  return s.rs[k] >= 85 && c / s.c[k - 63] - 1 >= 0.3 && c > s.sma50[k] && s.c[k - 1] > s.ema20[k - 1] && s.ema10[k - 1] > s.ema20[k - 1]
    && s.atrR[k - 1] <= 0.85 && c > s.hh15[k] && s.v[k] >= 1.2 * s.pv20[k];
}
// ตรวจเงื่อนไขเข้าที่ open วัน i (สัญญาณวัน k=i-1) → {px, stop} หรือ null
function entryFor(kind, s, i) {
  const k = i - 1, o = s.o[i]; if (!(o > 0) || !(s.v[i] > 0) || i > s.last) return null;
  if (kind === "M") { if (o > 1.05 * s.hh20[k]) return null; return { px: o, stop: o * 0.92 }; }
  if (o > 1.05 * s.hh15[k]) return null; const stop = s.l[k], sp = (o - stop) / o; if (!(sp >= 0.005 && sp <= 0.12)) return null; return { px: o, stop };
}
const closeAt = (s, i) => (i <= s.last ? s.c[i] : s.c[s.last]);
const openAt = (s, i) => (i <= s.last && s.o[i] > 0 ? s.o[i] : closeAt(s, i - 1));

// ---------- ตัวจำลอง ----------
function rngf(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function simulate(kind, useGate, ctl) {   // ctl = {counts: Map(i→จำนวนไม้), rnd}
  let cash = CAP; const pos = []; const eq = F(), trades = [], entriesByDay = new Map();
  const sell = (p, px, i, why) => { cash += p.sh * px * (1 - COST); trades.push({ tk: p.s.tk, ei: p.ei, xi: i, ep: p.px, xp: px, R: (px - p.px) / (p.px - p.stop), ret: px / p.px - 1, why }); };
  for (let i = START; i < n; i++) {
    const k = i - 1;
    for (let j = pos.length - 1; j >= 0; j--) if (pos[j].exitNext) { sell(pos[j], openAt(pos[j].s, i), i, "trail"); pos.splice(j, 1); }
    const mult = useGate ? MULT[G[k]] : 1;
    if (pos.length < MAXPOS && mult > 0) {
      let cands = [];
      if (!ctl) { for (const s of S) { if (!liquid(s, k) || pos.some((p) => p.s === s)) continue; if (kind === "M" ? sigM(s, k) : sigQ(s, k)) cands.push(s); }
        cands.sort((a, b) => b.rs[k] - a.rs[k] || (b.c[k] / b.c[k - 63]) - (a.c[k] / a.c[k - 63])); }
      else if (ctl.counts.get(i)) {
        const pool = S.filter((s) => liquid(s, k) && !pos.some((p) => p.s === s)); for (let x = pool.length - 1; x > 0; x--) { const y = Math.floor(ctl.rnd() * (x + 1)); [pool[x], pool[y]] = [pool[y], pool[x]]; }
        cands = pool; }
      let want = ctl ? (ctl.counts.get(i) || 0) : MAXPOS;
      for (const s of cands) {
        if (pos.length >= MAXPOS || want <= 0) break;
        const e = entryFor(kind, s, i); if (!e) continue;
        let E = cash; for (const p of pos) E += p.sh * openAt(p.s, i);
        const sp = (e.px - e.stop) / e.px; let notional = Math.min(RISK * mult * E / sp, POSCAP * E, cash / (1 + COST));
        if (notional < 0.03 * E) continue;
        const sh = notional / (e.px * (1 + COST)); cash -= sh * e.px * (1 + COST); pos.push({ s, sh, px: e.px, stop: e.stop, ei: i, exitNext: false }); want--;
        entriesByDay.set(i, (entriesByDay.get(i) || 0) + 1);
      }
    }
    for (let j = pos.length - 1; j >= 0; j--) { const p = pos[j]; if (i <= p.s.last && p.s.l[i] <= p.stop) { sell(p, Math.min(p.s.o[i] > 0 ? p.s.o[i] : p.stop, p.stop), i, "stop"); pos.splice(j, 1); } }
    let v = cash; for (const p of pos) { const c = closeAt(p.s, i); v += p.sh * c; if (kind === "M" ? c < p.s.sma50[i] : c < p.s.ema20[i]) p.exitNext = true; }
    eq[i] = v;
  }
  for (const p of pos) { /* ค้างตอนจบ: ไม่ปิด — ใช้มูลค่าตามตลาดใน eq แล้ว */ }
  return { eq, trades, entriesByDay, open: pos.length };
}

// ---------- ตัวชี้วัดผล ----------
const yrs = (a, b) => (new Date(cal[b]) - new Date(cal[a])) / (365.25 * 864e5);
const cagr = (v0, v1, y) => (v1 / v0) ** (1 / y) - 1;
function maxDD(eq) { let pk = CAP, dd = 0; for (let i = START; i < n; i++) { if (eq[i] > pk) pk = eq[i]; dd = Math.min(dd, eq[i] / pk - 1); } return dd; }
const setEq = F(); for (let i = START; i < n; i++) setEq[i] = CAP * IC[i] / IO[START];
function stats(eq) {
  const last = n - 1, y = yrs(START, last), yA = yrs(START, SPLIT - 1), yB = yrs(SPLIT - 1, last);
  return { cagr: cagr(CAP, eq[last], y), cagrA: cagr(CAP, eq[SPLIT - 1], yA), cagrB: cagr(eq[SPLIT - 1], eq[last], yB), maxDD: maxDD(eq), end: eq[last] };
}
const SET = stats(setEq);
const pct = (x) => (x * 100).toFixed(1) + "%";
function yearly(eq) { const out = {}; let prev = CAP; for (let i = START; i < n; i++) { const y = cal[i].slice(0, 4); if (i === n - 1 || cal[i + 1].slice(0, 4) !== y) { out[y] = eq[i] / prev - 1; prev = eq[i]; } } return out; }
function tradeStats(tr) {
  if (!tr.length) return { n: 0 }; const w = tr.filter((t) => t.ret > 0), gl = -tr.filter((t) => t.ret <= 0).reduce((a, t) => a + t.ret, 0), gw = w.reduce((a, t) => a + t.ret, 0);
  return { n: tr.length, win: w.length / tr.length, avgR: tr.reduce((a, t) => a + t.R, 0) / tr.length, pf: gl ? gw / gl : null, avgRet: tr.reduce((a, t) => a + t.ret, 0) / tr.length };
}

// ---------- รัน ----------
const out = { generated: new Date().toISOString(), prereg: "research/PREREG_setups_th_2026-10-10.md", period: [cal[START], cal[n - 1]], SET, results: {} };
console.log("\nSET buy&hold: CAGR", pct(SET.cagr), " 2015-19", pct(SET.cagrA), " 2020+", pct(SET.cagrB), " MaxDD", pct(SET.maxDD));
for (const kind of ["M", "Q"]) {
  for (const useGate of [true, false]) {
    COST = 0.0035;
    const r = simulate(kind, useGate), st = stats(r.eq), ts = tradeStats(r.trades), tag = kind + (useGate ? "+gate" : " nogate");
    const res = { stats: st, trades: ts, yearly: yearly(r.eq), openAtEnd: r.open };
    if (useGate) {
      res.sensitivity = {}; for (const c of [0.0025, 0.005]) { COST = c; res.sensitivity[c] = stats(simulate(kind, true).eq).cagr; } COST = 0.0035;
      const cagrs = []; const ctlCounts = r.entriesByDay;
      for (let sd = 1; sd <= SEEDS; sd++) cagrs.push(stats(simulate(kind, true, { counts: ctlCounts, rnd: rngf(sd * 7919) }).eq).cagr);
      cagrs.sort((a, b) => a - b);
      const beat = cagrs.filter((x) => st.cagr > x).length;
      res.control = { seeds: SEEDS, beat, median: cagrs[Math.floor(cagrs.length / 2)], p5: cagrs[Math.floor(cagrs.length * 0.05)], p95: cagrs[Math.floor(cagrs.length * 0.95)] };
      const adj = (x) => x - HAIRCUT;
      res.pass = { c1: adj(st.cagr) - SET.cagr >= 0.03, c2: adj(st.cagrA) > SET.cagrA && adj(st.cagrB) > SET.cagrB, c3: beat >= Math.ceil(SEEDS * 0.95) };
      res.pass.all = res.pass.c1 && res.pass.c2 && res.pass.c3;
    }
    out.results[tag] = res;
    console.log(`\n[${tag}] CAGR ${pct(st.cagr)} (after 2% haircut ${pct(st.cagr - HAIRCUT)}) | 2015-19 ${pct(st.cagrA)} | 2020+ ${pct(st.cagrB)} | MaxDD ${pct(st.maxDD)} | trades ${ts.n} win ${ts.win && pct(ts.win)} avgR ${ts.avgR && ts.avgR.toFixed(2)} PF ${ts.pf && ts.pf.toFixed(2)} | open@end ${r.open}`);
    if (res.sensitivity) console.log("  cost sensitivity CAGR:", Object.entries(res.sensitivity).map(([c, v]) => (c * 100).toFixed(2) + "% → " + pct(v)).join("  "));
    if (res.control) console.log(`  random control (n=${SEEDS}): median ${pct(res.control.median)} p5 ${pct(res.control.p5)} p95 ${pct(res.control.p95)} · strategy beats ${res.control.beat}/${SEEDS}`);
    if (res.pass) console.log(`  PASS c1(excess≥3pp) ${res.pass.c1} · c2(both halves) ${res.pass.c2} · c3(≥95% controls) ${res.pass.c3} ⇒ ${res.pass.all ? "EDGE PROVEN" : "NOT PROVEN"}`);
    console.log("  yearly:", Object.entries(res.yearly).map(([y, v]) => y + ":" + (v * 100).toFixed(0)).join(" "));
  }
}
const setY = {}; { let prev = CAP; for (let i = START; i < n; i++) { const y = cal[i].slice(0, 4); if (i === n - 1 || cal[i + 1].slice(0, 4) !== y) { setY[y] = setEq[i] / prev - 1; prev = setEq[i]; } } }
console.log("  SET yearly:", Object.entries(setY).map(([y, v]) => y + ":" + (v * 100).toFixed(0)).join(" "));
out.SETyearly = setY;
fs.writeFileSync(path.join(ROOT, "data", "bt_setups_th_2026-10-10.json"), JSON.stringify(out, null, 1));
console.log("\nwrote data/bt_setups_th_2026-10-10.json");
