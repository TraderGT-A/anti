// สำรวจ: พอร์ตหุ้นไทยเลือกด้วย factor (ใกล้จุดสูง 52w ฯลฯ) รายเดือน พร้อมต้นทุน/กลุ่มควบคุมสุ่ม/Gate — exploratory
//   node --max-old-space-size=12288 scripts/explore_th_portfolio.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HERMES = process.env.HERMES_SCRIPTS || "C:/Users/Tar/AppData/Local/hermes/scripts";
const COST = +(process.env.COST || 0.0035), MIN_PRICE = 1, MIN_TURN = 5e6, JUMP = 0.35, SEEDS = 200;
const csv = fs.readFileSync(path.join(HERMES, "idx_SET_daily_full.csv"), "utf8").trim().split(/\r?\n/).slice(1).map((l) => l.split(",")).filter((r) => r[0] >= "2006-01-01");
const cal = csv.map((r) => r[0]), n = cal.length, calIdx = new Map(cal.map((d, i) => [d, i])), IC = Float64Array.from(csv.map((r) => +r[4]));
const raw = JSON.parse(fs.readFileSync(path.join(HERMES, "bt_ohlcv_full.json"), "utf8")), S = [];
for (const [tk, bars] of Object.entries(raw)) {
  const o = new Float32Array(n).fill(NaN), h = new Float32Array(n).fill(NaN), l = new Float32Array(n).fill(NaN), c = new Float32Array(n).fill(NaN), v = new Float32Array(n); let first = -1, lastK = -1, cnt = 0;
  for (const b of bars) { const k = calIdx.get(b.t); if (k === undefined || !(b.c > 0)) continue; const oo = b.o > 0 ? b.o : b.c; o[k] = oo; c[k] = b.c; h[k] = Math.max(b.h || b.c, oo, b.c); l[k] = Math.min(b.l > 0 ? b.l : b.c, oo, b.c); v[k] = b.v || 0; if (first < 0) first = k; lastK = k; cnt++; }
  if (cnt < 300) continue; for (let i = first + 1; i <= lastK; i++) if (!(c[i] > 0)) { c[i] = c[i - 1]; o[i] = h[i] = l[i] = c[i]; v[i] = 0; }
  const bp = new Int32Array(n + 1), r = new Float32Array(n); for (let i = 0; i < n; i++) { if (i > first && i <= lastK) r[i] = c[i] / c[i - 1] - 1; bp[i + 1] = bp[i] + (Math.abs(r[i]) > JUMP ? 1 : 0); }
  S.push({ tk, o, h, l, c, v, r, first, last: lastK, bp });
}
const mean = (r, k, p) => { let m = 0; for (let j = k - p + 1; j <= k; j++) m += r[j]; return m / p; }, sd = (r, k, p) => { const m = mean(r, k, p); let v = 0; for (let j = k - p + 1; j <= k; j++) v += (r[j] - m) ** 2; return Math.sqrt(v / (p - 1)); };
const F = {
  near52: (s, k) => { let m = 0; for (let j = k - 251; j <= k; j++) if (s.h[j] > m) m = s.h[j]; return s.c[k] / m; },
  intraday: (s, k) => { let t = 0; for (let j = k - 59; j <= k; j++) t += s.c[j] / s.o[j] - 1; return t / 60; },
  lowvol: (s, k) => -sd(s.r, k, 250), noMax: (s, k) => { let m = -1; for (let j = k - 20; j <= k; j++) if (s.r[j] > m) m = s.r[j]; return -m; },
  liquid: (s, k) => { let t = 0, c = 0; for (let j = k - 59; j <= k; j++) { const dv = s.c[j] * s.v[j]; if (dv > 0) { t += Math.abs(s.r[j]) / dv; c++; } } return c ? -Math.log(t / c * 1e6 + 1e-9) : NaN; },
  mom12: (s, k) => s.c[k] / s.c[k - 252] - 1, mom12_1: (s, k) => s.c[k - 21] / s.c[k - 252] - 1,
};
const SCORES = { "near52wHigh": { near52: 1 }, "near52+intraday": { near52: 1, intraday: 1 }, "near52+lowvol": { near52: 1, lowvol: 1 }, "near52+intraday+lowvol": { near52: 1, intraday: 1, lowvol: 1 }, "near52+intra+lowvol+noMax+liquid": { near52: 1, intraday: 1, lowvol: 1, noMax: 1, liquid: 1 }, "momentum12-1 (reference)": { mom12_1: 1 }, "lowvol only": { lowvol: 1 } };
const monthEnds = []; for (let i = 260; i < n - 1; i++) if (cal[i].slice(0, 7) !== cal[i + 1].slice(0, 7)) monthEnds.push(i);
// ตัวเลือกพื้นฐานรายเดือน: หุ้นผ่านสภาพคล่อง + ซื้อ/ขายได้ + ไม่มีแท่งกระโดด
const months = [];
for (let m = 0; m < monthEnds.length - 1; m++) {
  const k = monthEnds[m], k2 = monthEnds[m + 1], rows = [];
  for (const s of S) {
    if (k - 252 < s.first || k2 + 1 > s.last || !(s.c[k] >= MIN_PRICE)) continue; let t = 0; for (let j = k - 19; j <= k; j++) t += s.c[j] * s.v[j]; if (t / 20 < MIN_TURN) continue;
    if (s.bp[k2 + 2] - s.bp[k - 252] > 0) continue; if (!(s.o[k + 1] > 0) || !(s.v[k + 1] > 0) || !(s.o[k2 + 1] > 0)) continue;
    rows.push({ s, ret: s.o[k2 + 1] / s.o[k + 1] - 1 });
  }
  months.push({ k, k2, date: cal[k], rows });
}
const z = (a) => { const m = a.reduce((p, q) => p + q, 0) / a.length, v = Math.sqrt(a.reduce((p, q) => p + (q - m) ** 2, 0) / a.length) || 1; return a.map((x) => (x - m) / v); };
for (const mo of months) { mo.f = {}; for (const f of Object.keys(F)) { const v = mo.rows.map((r) => F[f](r.s, mo.k)), ok = v.map(Number.isFinite), mu = v.filter(Number.isFinite), m = mu.reduce((p, q) => p + q, 0) / mu.length, sdv = Math.sqrt(mu.reduce((p, q) => p + (q - m) ** 2, 0) / mu.length) || 1; mo.f[f] = v.map((x, i) => (ok[i] ? (x - m) / sdv : 0)); } }
const ip = new Float64Array(n + 1); for (let i = 0; i < n; i++) ip[i + 1] = ip[i] + IC[i];
const gateAt = (k) => { if (k < 200) return 1; const c = IC[k], s50 = (ip[k + 1] - ip[k - 49]) / 50, s200 = (ip[k + 1] - ip[k - 199]) / 200; return c > s50 && s50 > s200 ? 1 : (c < s200 || (c < s50 && s50 < s200) ? 0 : 0.5); };
function portfolio(pick, useGate) {   // pick(mo) → ดัชนีแถวที่เลือก (weights เท่ากัน)
  let prev = new Map(), eq = 1, peak = 1, mdd = 0; const rets = [], dates = [], tos = [];
  for (const mo of months) {
    const sel = pick(mo), e = useGate ? gateAt(mo.k) : 1, w = new Map(); sel.forEach((i) => w.set(mo.rows[i].s.tk, e / sel.length)); let to = 0; new Set([...w.keys(), ...prev.keys()]).forEach((t) => (to += Math.abs((w.get(t) || 0) - (prev.get(t) || 0)))); prev = w;
    const gr = sel.reduce((a, i) => a + mo.rows[i].ret, 0) / (sel.length || 1) * e, r = gr - COST * to; rets.push(r); dates.push(mo.date); tos.push(to); eq *= 1 + r; if (eq > peak) peak = eq; mdd = Math.min(mdd, eq / peak - 1);
  }
  return { rets, dates, eq, mdd, to: tos.reduce((a, b) => a + b, 0) / tos.length * 12 };
}
const stat = (rets, dates, from, to) => { const r = rets.filter((_, i) => dates[i] >= from && dates[i] <= to); if (r.length < 12) return null; const g = r.reduce((a, x) => a * (1 + x), 1), y = r.length / 12, m = r.reduce((a, b) => a + b, 0) / r.length, s = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1)); return { cagr: g ** (1 / y) - 1, sharpe: s ? m / s * Math.sqrt(12) : 0, n: r.length }; };
const ERAS = [["2008-14", "2008-01-01", "2014-12-31"], ["2015-20", "2015-01-01", "2020-12-31"], ["2021-26", "2021-01-01", "9999"], ["ทั้งหมด 2007-26", "2007-01-01", "9999"]];
const pc = (x) => (x * 100).toFixed(1).padStart(6);
const ew = portfolio((mo) => mo.rows.map((_, i) => i), false);
const setRets = months.map((mo) => IC[mo.k2] / IC[mo.k] - 1);
const line = (name, p) => { let s = name.padEnd(40); for (const [, a, b] of ERAS) { const st = stat(p.rets, p.dates, a, b), se = stat(ew.rets, ew.dates, a, b); s += st ? ` ${pc(st.cagr)}% (Δ${pc(st.cagr - se.cagr)}) Sh${st.sharpe.toFixed(2)} |` : " - |"; } return s + ` DD${pc(p.mdd)} TO${p.to.toFixed(1)}`; };
console.log(`ต้นทุน ${COST * 100}%/ข้าง · ผลรายเดือนต่อเนื่อง (Δ = CAGR ลบ EW ทุกหุ้นผ่านสภาพคล่อง ที่มีต้นทุนหมุนพอร์ตเท่ากัน)`);
console.log("พอร์ต".padEnd(40), ERAS.map((e) => e[0].padEnd(26)).join(""));
console.log(line("EW ทุกหุ้นผ่านสภาพคล่อง (benchmark)", ew));
{ let s = "SET ถือเฉยๆ".padEnd(40); for (const [, a, b] of ERAS) { const st = stat(setRets, months.map((m) => m.date), a, b); s += st ? ` ${pc(st.cagr)}%             Sh${st.sharpe.toFixed(2)} |` : " - |"; } console.log(s); }
const out = { cost: COST, results: {} };
for (const [sn, wts] of Object.entries(SCORES)) for (const N of [20, 40]) for (const gate of [false, true]) {
  const pick = (mo) => { const sc = mo.rows.map((_, i) => Object.entries(wts).reduce((a, [f, w]) => a + w * mo.f[f][i], 0)); return sc.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, N).map((x) => x[1]); };
  const p = portfolio(pick, gate), name = `${sn} Top${N}${gate ? " +Gate" : ""}`; console.log(line(name, p)); out.results[name] = { all: stat(p.rets, p.dates, "2007-01-01", "9999"), mdd: p.mdd, to: p.to, eras: ERAS.map(([e, a, b]) => [e, stat(p.rets, p.dates, a, b)]) };
}
// กลุ่มควบคุมสุ่ม: เลือก N ตัวสุ่มจากพูลสภาพคล่อง (ต้นทุนเท่ากัน) — เทียบ near52wHigh Top20
{
  const N = 20, rng = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const cagrs = []; for (let sd = 1; sd <= SEEDS; sd++) { const r = rng(sd * 7919); const p = portfolio((mo) => { const idx = mo.rows.map((_, i) => i); for (let x = idx.length - 1; x > 0; x--) { const y = Math.floor(r() * (x + 1)); [idx[x], idx[y]] = [idx[y], idx[x]]; } return idx.slice(0, N); }, false); cagrs.push(stat(p.rets, p.dates, "2007-01-01", "9999").cagr); }
  cagrs.sort((a, b) => a - b); const real = out.results["near52wHigh Top20"].all.cagr; console.log(`\nสุ่ม ${N} ตัว/เดือน (${SEEDS} seeds): median ${pc(cagrs[SEEDS >> 1])}% p95 ${pc(cagrs[Math.floor(SEEDS * 0.95)])}% p99 ${pc(cagrs[Math.floor(SEEDS * 0.99)])}% · near52wHigh Top20 ${pc(real)}% ชนะ ${cagrs.filter((x) => real > x).length}/${SEEDS}`);
  out.random = { median: cagrs[SEEDS >> 1], p95: cagrs[Math.floor(SEEDS * 0.95)], real, beat: cagrs.filter((x) => real > x).length };
}
fs.writeFileSync(path.join(ROOT, "data", "explore_th_portfolio_2026-10-10.json"), JSON.stringify(out));
