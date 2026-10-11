// ทดสอบตัวกรองความผันผวนต่ำบน near52wHigh + โมเมนตัม 12-1 ตาม research/PREREG_th_lowvol_filter_2026-10-11.md
//   node --max-old-space-size=8192 scripts/explore_lowvol.mjs <market>     (thailand|indonesia|singapore|india|korea)   env: VOLCUT (ค่าลงทะเบียน 0.30), TAG
// ตรรกะพูล/Gate/ต้นทุนคัดลอกจาก scripts/explore_em_portfolio.mjs — ห้ามเปลี่ยน; B ต้องตรงกับผลเดิม "near52+mom Top20 +Gate"
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HERMES = process.env.HERMES_SCRIPTS || "C:/Users/Tar/AppData/Local/hermes/scripts", MKT = process.argv[2], COST = 0.0035, JUMP = 0.35, LIQ = 0.5, N = 20, VOLCUT = +(process.env.VOLCUT || 0.30);
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
const F = {
  near52: (s, k) => { let m = 0; for (let j = k - 251; j <= k; j++) if (s.h[j] > m) m = s.h[j]; return s.c[k] / m; },
  mom: (s, k) => s.c[k - 21] / s.c[k - 252] - 1,
  vol: (s, k) => { let a = 0, a2 = 0; for (let j = k - 251; j <= k; j++) { a += s.r[j]; a2 += s.r[j] * s.r[j]; } const m = a / 252; return Math.sqrt(Math.max(0, a2 / 252 - m * m) * 252 / 251); },
};
const monthEnds = []; for (let i = 260; i < n - 1; i++) if (cal[i].slice(0, 7) !== cal[i + 1].slice(0, 7)) monthEnds.push(i);
const months = [];
for (let m = 0; m < monthEnds.length - 1; m++) {
  const k = monthEnds[m], k2 = monthEnds[m + 1], rows = [];
  for (const s of S) { if (k - 252 < s.first || k2 + 1 > s.last) continue; let t = 0; for (let j = k - 19; j <= k; j++) t += s.c[j] * s.v[j]; if (!(t > 0)) continue; if (s.bp[k2 + 2] - s.bp[k - 252] > 0) continue; if (!(s.o[k + 1] > 0) || !(s.v[k + 1] > 0) || !(s.o[k2 + 1] > 0)) continue; rows.push({ s, turn: t, ret: s.o[k2 + 1] / s.o[k + 1] - 1 }); }
  if (rows.length < 40) continue; const sorted = rows.map((r) => r.turn).sort((a, b) => a - b), thr = sorted[Math.floor(sorted.length * LIQ)], keep = rows.filter((r) => r.turn >= thr); if (keep.length < 30) continue;
  const mo = { k, date: cal[k], rows: keep, f: {}, raw: {} };
  for (const f of Object.keys(F)) { const v = keep.map((r) => F[f](r.s, k)), mu = v.filter(Number.isFinite), m0 = mu.reduce((p, q) => p + q, 0) / mu.length, s0 = Math.sqrt(mu.reduce((p, q) => p + (q - m0) ** 2, 0) / mu.length) || 1; mo.raw[f] = v; mo.f[f] = v.map((x) => (Number.isFinite(x) ? (x - m0) / s0 : 0)); }
  months.push(mo);
}
function portfolio(variant) {
  let prevW = new Map(); const rets = [], dates = []; let TO = 0;
  for (const mo of months) {
    const nR = mo.rows.length; let allowed = mo.rows.map((_, i) => i);
    if (variant === "A") { const order = mo.raw.vol.map((v, i) => [Number.isFinite(v) ? v : Infinity, i]).sort((a, b) => a[0] - b[0]); allowed = order.slice(0, Math.floor(nR * (1 - VOLCUT))).map((x) => x[1]); }
    const sc = (i) => mo.f.near52[i] + mo.f.mom[i] + (variant === "C" ? -mo.f.vol[i] : 0);
    const sel = allowed.map((i) => [sc(i), i]).sort((a, b) => b[0] - a[0]).slice(0, N).map((x) => x[1]), e = gateAt(mo.k), w = new Map();
    sel.forEach((i) => w.set(mo.rows[i].s.tk, e / sel.length));
    let to = 0; new Set([...w.keys(), ...prevW.keys()]).forEach((t) => (to += Math.abs((w.get(t) || 0) - (prevW.get(t) || 0)))); TO += to; prevW = w;
    rets.push(sel.reduce((a, i) => a + mo.rows[i].ret, 0) / sel.length * e - COST * to); dates.push(mo.date);
  }
  return { rets, dates, to: TO / (months.length / 12) };
}
const stat = (rets, dates, from, to) => { const ix = rets.map((_, i) => i).filter((i) => dates[i] >= from && dates[i] <= to); if (ix.length < 12) return null; const r = ix.map((i) => rets[i]), g = r.reduce((a, x) => a * (1 + x), 1), m = r.reduce((a, b) => a + b, 0) / r.length, s = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1)); let eq = 1, pk = 1, dd = 0; for (const x of r) { eq *= 1 + x; pk = Math.max(pk, eq); dd = Math.min(dd, eq / pk - 1); } return { cagr: g ** (12 / r.length) - 1, sharpe: s ? m / s * Math.sqrt(12) : 0, mdd: dd, n: r.length }; };
const ERAS = [["2006-12", "2006-01-01", "2012-12-31"], ["2013-19", "2013-01-01", "2019-12-31"], ["2020-26", "2020-01-01", "9999"], ["ทั้งหมด", "2006-01-01", "9999"]];
const res = { B: portfolio("B"), A: portfolio("A"), C: portfolio("C") }, out = { market: MKT, volcut: VOLCUT, months: months.length, variants: {} };
const chk = path.join(ROOT, "data", `explore_em_portfolio_${MKT}_2026-10-10.json`);
if (fs.existsSync(chk)) { const ref = JSON.parse(fs.readFileSync(chk, "utf8")).results["near52+mom Top20 +Gate"]; if (ref) { const d = Math.max(...ref.rets.map((x, i) => Math.abs(x - res.B.rets[i]))); console.log(`[ตรวจ] B vs ผลเดิม: max|diff| = ${d.toExponential(2)} ${d < 1e-4 ? "(ตรง)" : "(ไม่ตรง — ห้ามใช้)"}`); if (!(d < 1e-4)) process.exit(2); } } else console.log("[ตรวจ] ไม่พบผลเดิม ข้าม");
console.log(`== ${MKT} · ${months.length} เดือน · VOLCUT ${VOLCUT}`);
for (const [nm, p] of Object.entries(res)) { const st = ERAS.map(([e, a, b]) => stat(p.rets, p.dates, a, b)); out.variants[nm] = { eras: ERAS.map((e, i) => [e[0], st[i]]), to: p.to, rets: p.rets, dates: p.dates }; console.log(nm.padEnd(3) + st.map((s, i) => s ? ` ${ERAS[i][0]}: ${(s.cagr * 100).toFixed(1)}% Sh${s.sharpe.toFixed(2)} DD${(s.mdd * 100).toFixed(0)}` : " -").join(" |") + ` TO${p.to.toFixed(1)}`); }
// bootstrap จับคู่ (seed 11, 5000 ครั้ง) บน Sharpe ต่าง
let seed = 11; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296), nM = res.B.rets.length, B = 5000, sh = (r) => { const m = r.reduce((a, b) => a + b, 0) / r.length, s = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1)); return s ? m / s : 0; };
const idx = Array.from({ length: B }, () => Array.from({ length: nM }, () => Math.floor(rnd() * nM)));
for (const v of ["A", "C"]) {
  const all = out.variants[v].eras[3][1], base = out.variants.B.eras[3][1], eraOk = [0, 1, 2].every((i) => out.variants[v].eras[i][1] && out.variants[v].eras[i][1].sharpe >= out.variants.B.eras[i][1].sharpe);
  let win = 0; for (const ix of idx) if (sh(ix.map((i) => res[v].rets[i])) - sh(ix.map((i) => res.B.rets[i])) > 0) win++;
  const crit = { dSharpe: all.sharpe - base.sharpe, c1: all.sharpe >= base.sharpe + 0.10, c2: eraOk, c3: all.cagr >= base.cagr - 0.01, P: win / B, c4: win / B >= 0.975 }; out.variants[v].criteria = crit;
  console.log(`${v}: ΔSharpe ${(crit.dSharpe >= 0 ? "+" : "") + crit.dSharpe.toFixed(2)}  Sharpe≥B+0.10:${crit.c1 ? "✓" : "✗"}  ทุกช่วง≥B:${crit.c2 ? "✓" : "✗"}  CAGR≥B−1pp:${crit.c3 ? "✓" : "✗"}  P(boot)=${crit.P.toFixed(3)}:${crit.c4 ? "✓" : "✗"}`);
}
fs.writeFileSync(path.join(ROOT, "data", `explore_lowvol_${MKT}${process.env.TAG || ""}_2026-10-11.json`), JSON.stringify(out));
