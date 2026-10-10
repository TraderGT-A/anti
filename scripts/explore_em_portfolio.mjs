// สำรวจ: พอร์ต factor (near52wHigh / โมเมนตัม 12-1 / รวม) รายเดือนในตลาดอื่น เทียบ EW ของพูลเดียวกัน — exploratory
//   node --max-old-space-size=8192 scripts/explore_em_portfolio.mjs <market>     (market = indonesia|singapore|india|korea|taiwan|hongkong|australia)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HERMES = process.env.HERMES_SCRIPTS || "C:/Users/Tar/AppData/Local/hermes/scripts", MKT = process.argv[2];
const DROP = +(process.env.DROP || 0), DSEED = +(process.env.DSEED || 1), hsh = (s) => { let h = 2166136261 ^ DSEED; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; }, LAGD = +(process.env.LAGD || 0), COST = +(process.env.COST || 0.0035), JUMP = 0.35, LIQ = +(process.env.LIQ || 0.5);   // LIQ = เก็บหุ้นที่มูลค่าซื้อขาย 20 วันสูงกว่าเปอร์เซ็นไทล์นี้ของแต่ละเดือน
const emd = JSON.parse(fs.readFileSync(path.join(HERMES, "em", MKT + ".json"), "utf8")), ds = new Set();
for (const d of Object.values(emd)) for (const x of d.t) if (x >= "2005-06-01") ds.add(x);
const cal = [...ds].sort(), n = cal.length, calIdx = new Map(cal.map((d, i) => [d, i])), S = [];
for (const [tk, d] of Object.entries(emd)) {
  const o = new Float32Array(n).fill(NaN), h = new Float32Array(n).fill(NaN), l = new Float32Array(n).fill(NaN), c = new Float32Array(n).fill(NaN), v = new Float32Array(n); let first = -1, lastK = -1, cnt = 0;
  for (let i = 0; i < d.t.length; i++) { const k = calIdx.get(d.t[i]); if (k === undefined || !(d.c[i] > 0)) continue; const oo = d.o[i] > 0 ? d.o[i] : d.c[i]; o[k] = oo; c[k] = d.c[i]; h[k] = Math.max(d.h[i] || d.c[i], oo, d.c[i]); l[k] = Math.min(d.l[i] > 0 ? d.l[i] : d.c[i], oo, d.c[i]); v[k] = d.v[i] || 0; if (first < 0) first = k; lastK = k; cnt++; }
  if (cnt < 400) continue; for (let i = first + 1; i <= lastK; i++) if (!(c[i] > 0)) { c[i] = c[i - 1]; o[i] = h[i] = l[i] = c[i]; v[i] = 0; }
  const bp = new Int32Array(n + 1), r = new Float32Array(n); for (let i = 0; i < n; i++) { if (i > first && i <= lastK) r[i] = c[i] / c[i - 1] - 1; bp[i + 1] = bp[i] + (Math.abs(r[i]) > JUMP ? 1 : 0); }
  S.push({ tk, o, h, l, c, v, r, first, last: lastK, bp });
}
const PX = new Float64Array(n); PX[0] = 100; for (let i = 1; i < n; i++) { let t = 0, c = 0; for (const s of S) if (i > s.first && i <= s.last && s.v[i] > 0 && Math.abs(s.r[i]) < JUMP) { t += s.r[i]; c++; } PX[i] = PX[i - 1] * (1 + (c ? t / c : 0)); }
const ip = new Float64Array(n + 1); for (let i = 0; i < n; i++) ip[i + 1] = ip[i] + PX[i];
const gateAt = (k) => { if (k < 200) return 1; const c = PX[k], s50 = (ip[k + 1] - ip[k - 49]) / 50, s200 = (ip[k + 1] - ip[k - 199]) / 200; return c > s50 && s50 > s200 ? 1 : (c < s200 || (c < s50 && s50 < s200) ? 0 : 0.5); };
const F = { near52: (s, k) => { let m = 0; for (let j = k - 251; j <= k; j++) if (s.h[j] > m) m = s.h[j]; return s.c[k] / m; }, mom: (s, k) => s.c[k - 21] / s.c[k - 252] - 1 };
const monthEnds = []; for (let i = 260; i < n - 1; i++) if (cal[i].slice(0, 7) !== cal[i + 1].slice(0, 7)) monthEnds.push(i);
const months = [];
for (let m = 0; m < monthEnds.length - 1; m++) {
  const k = monthEnds[m], k2 = monthEnds[m + 1], rows = [];
  for (const s of S) { if (DROP > 0 && hsh(s.tk) < DROP) continue; if (k - 252 < s.first || k2 + 1 > s.last) continue; let t = 0; for (let j = k - 19; j <= k; j++) t += s.c[j] * s.v[j]; if (!(t > 0)) continue; if (s.bp[k2 + 2] - s.bp[k - 252] > 0) continue; if (!(s.o[k + 1 + LAGD] > 0) || !(s.v[k + 1 + LAGD] > 0) || !(s.o[k2 + 1 + LAGD] > 0)) continue; rows.push({ s, turn: t, ret: s.o[k2 + 1 + LAGD] / s.o[k + 1 + LAGD] - 1 }); }
  if (rows.length < 40) continue; const sorted = rows.map((r) => r.turn).sort((a, b) => a - b), thr = sorted[Math.floor(sorted.length * LIQ)], keep = rows.filter((r) => r.turn >= thr); if (keep.length < 30) continue;
  const mo = { k, date: cal[k], rows: keep, f: {} }; for (const f of Object.keys(F)) { const v = keep.map((r) => F[f](r.s, k)), mu = v.filter(Number.isFinite), m0 = mu.reduce((p, q) => p + q, 0) / mu.length, s0 = Math.sqrt(mu.reduce((p, q) => p + (q - m0) ** 2, 0) / mu.length) || 1; mo.f[f] = v.map((x) => (Number.isFinite(x) ? (x - m0) / s0 : 0)); } months.push(mo);
}
function portfolio(wts, N, useGate) {
  let prevW = new Map(); const rets = [], dates = []; let eq = 1, peak = 1, mdd = 0, TO = 0;
  for (const mo of months) { const sc = mo.rows.map((_, i) => Object.entries(wts).reduce((a, [f, w]) => a + w * mo.f[f][i], 0)), sel = sc.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, N).map((x) => x[1]), e = useGate ? gateAt(mo.k) : 1, w = new Map(); sel.forEach((i) => w.set(mo.rows[i].s.tk, e / sel.length)); let to = 0; new Set([...w.keys(), ...prevW.keys()]).forEach((t) => (to += Math.abs((w.get(t) || 0) - (prevW.get(t) || 0)))); TO += to; prevW = w; const r = sel.reduce((a, i) => a + mo.rows[i].ret, 0) / sel.length * e - COST * to; rets.push(r); dates.push(mo.date); eq *= 1 + r; if (eq > peak) peak = eq; mdd = Math.min(mdd, eq / peak - 1); }
  return { rets, dates, mdd, to: TO / (months.length / 12) };
}
const stat = (rets, dates, from, to) => { const r = rets.filter((_, i) => dates[i] >= from && dates[i] <= to); if (r.length < 12) return null; const g = r.reduce((a, x) => a * (1 + x), 1), m = r.reduce((a, b) => a + b, 0) / r.length, s = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1)); return { cagr: g ** (12 / r.length) - 1, sharpe: s ? m / s * Math.sqrt(12) : 0, n: r.length }; };
const ERAS = [["2006-12", "2006-01-01", "2012-12-31"], ["2013-19", "2013-01-01", "2019-12-31"], ["2020-26", "2020-01-01", "9999"], ["ทั้งหมด", "2006-01-01", "9999"]];
const pc = (x) => (x * 100).toFixed(1).padStart(5);
const ewp = (() => { let prevW = new Map(); const rets = [], dates = []; for (const mo of months) { const w = new Map(); mo.rows.forEach((r) => w.set(r.s.tk, 1 / mo.rows.length)); let to = 0; new Set([...w.keys(), ...prevW.keys()]).forEach((t) => (to += Math.abs((w.get(t) || 0) - (prevW.get(t) || 0)))); prevW = w; rets.push(mo.rows.reduce((a, r) => a + r.ret, 0) / mo.rows.length - COST * to); dates.push(mo.date); } return { rets, dates, mdd: 0, to: 0 }; })();
const line = (name, p) => { let s = name.padEnd(28); for (const [, a, b] of ERAS) { const st = stat(p.rets, p.dates, a, b), se = stat(ewp.rets, ewp.dates, a, b); s += st ? ` ${pc(st.cagr)}(Δ${pc(st.cagr - se.cagr)}) Sh${st.sharpe.toFixed(2)}|` : " -|"; } return s + ` DD${pc(p.mdd)} TO${p.to.toFixed(1)}`; };
console.log(`== ${MKT}: หุ้นในพูล ~${(months.reduce((a, m) => a + m.rows.length, 0) / months.length).toFixed(0)} ตัว/เดือน (สภาพคล่องบน ${((1 - LIQ) * 100).toFixed(0)}%) · ต้นทุน ${(COST * 100).toFixed(2)}%/ข้าง`);
console.log("พอร์ต".padEnd(28), ERAS.map((e) => e[0].padEnd(22)).join(""));
console.log(line("EW ทั้งพูล", ewp));
const out = { market: MKT, results: {}, ew: { rets: ewp.rets, dates: ewp.dates } };
for (const [sn, wts] of Object.entries({ near52wHigh: { near52: 1 }, "momentum12-1": { mom: 1 }, "near52+mom": { near52: 1, mom: 1 } })) for (const N of [20]) for (const gate of [false, true]) { const nm = `${sn} Top${N}${gate ? " +Gate" : ""}`, p = portfolio(wts, N, gate); console.log(line(nm, p)); out.results[nm] = { rets: p.rets, dates: p.dates, eras: ERAS.map(([e, a, b]) => [e, stat(p.rets, p.dates, a, b)]), mdd: p.mdd, to: p.to }; }
fs.writeFileSync(path.join(ROOT, "data", `explore_em_portfolio_${MKT}${process.env.TAG || ""}_2026-10-10.json`), JSON.stringify(out));
