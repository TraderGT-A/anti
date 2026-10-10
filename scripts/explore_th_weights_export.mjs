// ส่งออก Top20 รายเดือน (near52+mom + Gate) ของหุ้นไทย + ผลตอบแทนรายวันย้อนหลังของหุ้นที่เลือก เพื่อให้ Python/Riskfolio คำนวณน้ำหนัก
// ตามกฎใน research/PREREG_th_weighting_riskfolio_2026-10-10.md — ตรรกะเลือกหุ้นคัดลอกจาก scripts/explore_em_portfolio.mjs (ห้ามเปลี่ยน)
//   node --max-old-space-size=8192 scripts/explore_th_weights_export.mjs     → <HERMES>/em/th_weights_export.json (ไม่เก็บใน git: ใหญ่)
import fs from "node:fs";
import path from "node:path";
const HERMES = process.env.HERMES_SCRIPTS || "C:/Users/Tar/AppData/Local/hermes/scripts", LIQ = 0.5, JUMP = 0.35, N = 20, LB = 504;
const emd = JSON.parse(fs.readFileSync(path.join(HERMES, "em", "thailand.json"), "utf8")), ds = new Set();
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
const r5 = (x) => Math.round(x * 1e5) / 1e5, out = { cost: 0.0035, N, lookback: LB, months: [] };
for (let m = 0; m < monthEnds.length - 1; m++) {
  const k = monthEnds[m], k2 = monthEnds[m + 1], rows = [];
  for (const s of S) { if (k - 252 < s.first || k2 + 1 > s.last) continue; let t = 0; for (let j = k - 19; j <= k; j++) t += s.c[j] * s.v[j]; if (!(t > 0)) continue; if (s.bp[k2 + 2] - s.bp[k - 252] > 0) continue; if (!(s.o[k + 1] > 0) || !(s.v[k + 1] > 0) || !(s.o[k2 + 1] > 0)) continue; rows.push({ s, turn: t, ret: s.o[k2 + 1] / s.o[k + 1] - 1 }); }
  if (rows.length < 40) continue; const sorted = rows.map((r) => r.turn).sort((a, b) => a - b), thr = sorted[Math.floor(sorted.length * LIQ)], keep = rows.filter((r) => r.turn >= thr); if (keep.length < 30) continue;
  const z = {}; for (const f of Object.keys(F)) { const v = keep.map((r) => F[f](r.s, k)), mu = v.filter(Number.isFinite), m0 = mu.reduce((p, q) => p + q, 0) / mu.length, s0 = Math.sqrt(mu.reduce((p, q) => p + (q - m0) ** 2, 0) / mu.length) || 1; z[f] = v.map((x) => (Number.isFinite(x) ? (x - m0) / s0 : 0)); }
  const sc = keep.map((_, i) => z.near52[i] + z.mom[i]), sel = sc.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, N).map((x) => x[1]);
  out.months.push({ date: cal[k], gate: gateAt(k), poolRet: r5(keep.reduce((a, r) => a + r.ret, 0) / keep.length), poolN: keep.length,
    picks: sel.map((i) => { const r = keep[i], s = r.s, hist = []; for (let j = k - LB + 1; j <= k; j++) hist.push(j > s.first ? r5(s.r[j]) : null); return { tk: s.tk, ret: r5(r.ret), r: hist }; }) });
}
fs.writeFileSync(path.join(HERMES, "em", "th_weights_export.json"), JSON.stringify(out));
console.log("months", out.months.length, "first", out.months[0].date, "last", out.months.at(-1).date);
