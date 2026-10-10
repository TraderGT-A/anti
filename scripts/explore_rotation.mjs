// สำรวจ: หมุนระหว่างดัชนีหลายประเทศตามโมเมนตัม/ความผันผวน (สกุลเงินท้องถิ่น ไม่รวม FX) เทียบถือเท่าๆ กันทุกตลาด — exploratory
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HERMES = process.env.HERMES_SCRIPTS || "C:/Users/Tar/AppData/Local/hermes/scripts", DIR = path.join(HERMES, "idx_long");
const COST = 0.001, IDX = ["_GSPC", "_IXIC", "_RUT", "_N225", "_GDAXI", "_FTSE", "_FCHI", "_HSI", "_KS11", "_AXJO", "_BSESN", "_STI", "_JKSE", "_KLSE", "_TWII", "_BVSP", "_GSPTSE"];
const tb = new Map(fs.readFileSync(path.join(HERMES, "tbill_long.csv"), "utf8").trim().split(/\r?\n/).slice(1).map((l) => l.split(",")).filter((r) => r[1] && r[1] !== ".").map((r) => [r[0], +r[1]]));
// ปฏิทินรวม = วันของ ^GSPC; ดัชนีอื่น forward-fill (ตลาดหยุดต่างวัน)
const spx = JSON.parse(fs.readFileSync(path.join(DIR, "_GSPC.json"), "utf8")), cal = spx.t.filter((d) => d >= "1987-01-01"), n = cal.length, ci = new Map(cal.map((d, i) => [d, i]));
const P = {}, first = {};
for (const s of IDX) { const d = JSON.parse(fs.readFileSync(path.join(DIR, s + ".json"), "utf8")), a = new Float64Array(n).fill(NaN); d.t.forEach((t, i) => { const k = ci.get(t); if (k !== undefined) a[k] = d.c[i]; }); let last = NaN, f = -1; for (let i = 0; i < n; i++) { if (a[i] > 0) { last = a[i]; if (f < 0) f = i; } else a[i] = last; } P[s] = a; first[s] = f; }
const rf = new Float64Array(n); { let last = 0; for (let i = 0; i < n; i++) { if (tb.has(cal[i])) last = tb.get(cal[i]); rf[i] = last / 100 / 252; } }
const monthEnds = []; for (let i = 0; i < n - 1; i++) if (cal[i].slice(0, 7) !== cal[i + 1].slice(0, 7)) monthEnds.push(i);
const mom = (s, i, a, b) => P[s][i - b] > 0 && !isNaN(P[s][i - a]) ? P[s][i - a] / P[s][i - b] - 1 : NaN;   // ผลตอบแทนจาก i-b ถึง i-a
const vol = (s, i, p) => { let m = 0, v = 0; const r = []; for (let j = i - p + 1; j <= i; j++) r.push(P[s][j] / P[s][j - 1] - 1); r.forEach((x) => (m += x / p)); r.forEach((x) => (v += (x - m) ** 2 / (p - 1))); return Math.sqrt(v); };
const avail = (s, i) => first[s] >= 0 && i - 260 >= first[s];
// กลยุทธ์: คืนน้ำหนัก {sym: w} ณ ปิดวัน i (รวม ≤ 1; ที่เหลือ = เงินสด)
const STRATS = {
  "EW ทุกตลาด (benchmark)": (i) => { const a = IDX.filter((s) => avail(s, i)); const w = {}; a.forEach((s) => (w[s] = 1 / a.length)); return w; },
  "Top3 โมเมนตัม 12-1": (i) => top(i, 3, (s) => mom(s, i, 21, 252), false),
  "Top5 โมเมนตัม 12-1": (i) => top(i, 5, (s) => mom(s, i, 21, 252), false),
  "Top3 โมเมนตัม 6m": (i) => top(i, 3, (s) => mom(s, i, 0, 126), false),
  "Top3 โมเมนตัม 3m": (i) => top(i, 3, (s) => mom(s, i, 0, 63), false),
  "Top3 12-1 + ต้องบวก (ไม่งั้นเงินสด)": (i) => top(i, 3, (s) => mom(s, i, 21, 252), true),
  "Top5 12-1 + ต้องบวก": (i) => top(i, 5, (s) => mom(s, i, 21, 252), true),
  "ครึ่งบน 12-1 (EW ของตลาดที่โมเมนตัมสูงกว่ามัธยฐาน)": (i) => { const a = IDX.filter((s) => avail(s, i)).sort((x, y) => mom(y, i, 21, 252) - mom(x, i, 21, 252)); const h = a.slice(0, Math.ceil(a.length / 2)), w = {}; h.forEach((s) => (w[s] = 1 / h.length)); return w; },
  "EW ที่เหนือ SMA200 (ไม่งั้นเงินสด)": (i) => { const a = IDX.filter((s) => avail(s, i)), w = {}; a.forEach((s) => { let m = 0; for (let j = i - 199; j <= i; j++) m += P[s][j]; if (P[s][i] > m / 200) w[s] = 1 / a.length; }); return w; },
  "Bottom3 ความผันผวนต่ำสุด 60d": (i) => { const a = IDX.filter((s) => avail(s, i)).sort((x, y) => vol(x, i, 60) - vol(y, i, 60)).slice(0, 3), w = {}; a.forEach((s) => (w[s] = 1 / 3)); return w; },
  "Top3 12-1 ถ่วงด้วย 1/vol": (i) => { const a = IDX.filter((s) => avail(s, i)).sort((x, y) => mom(y, i, 21, 252) - mom(x, i, 21, 252)).slice(0, 3), iv = a.map((s) => 1 / vol(s, i, 60)), t = iv.reduce((p, q) => p + q, 0), w = {}; a.forEach((s, j) => (w[s] = iv[j] / t)); return w; },
};
function top(i, k, f, needPos) { const a = IDX.filter((s) => avail(s, i)).map((s) => [s, f(s)]).filter((x) => !isNaN(x[1])).sort((x, y) => y[1] - x[1]).slice(0, k), w = {}; a.forEach(([s, m]) => { if (!needPos || m > 0) w[s] = 1 / k; }); return w; }
function run(fn, a, b) {   // เดือนที่ตัดสินใจที่ปิดเดือน m ถือเดือนถัดไป (ซื้อที่ปิดวันถัดไปจากสัญญาณ = ล่าช้า 1 วัน)
  let eq = 1, prev = {}, sumTO = 0, mo = 0; const rets = []; let peak = 1, mdd = 0, y0 = null;
  for (let m = 0; m < monthEnds.length - 1; m++) {
    const i = monthEnds[m], e = monthEnds[m + 1]; if (cal[i] < a || cal[i] > b) continue; if (!y0) y0 = i;
    const w = fn(i), keys = new Set([...Object.keys(w), ...Object.keys(prev)]); let to = 0; keys.forEach((s) => (to += Math.abs((w[s] || 0) - (prev[s] || 0)))); sumTO += to; prev = w;
    const start = i + 1; let g = 1 - COST * to;   // ซื้อที่ปิดวัน i+1
    let cash = 1 - Object.values(w).reduce((p, q) => p + q, 0), val = {}; Object.keys(w).forEach((s) => (val[s] = w[s]));
    let cashV = cash, tot = 1;
    for (let d = start + 1; d <= e + 1 && d < n; d++) { tot = 0; for (const s of Object.keys(val)) { val[s] *= P[s][d] / P[s][d - 1]; tot += val[s]; } cashV *= 1 + rf[d]; tot += cashV; }
    const r = g * tot - 1; rets.push(r); eq *= 1 + r; if (eq > peak) peak = eq; mdd = Math.min(mdd, eq / peak - 1); mo++;
  }
  const yrs = mo / 12, mean = rets.reduce((p, q) => p + q, 0) / rets.length, sd = Math.sqrt(rets.reduce((p, q) => p + (q - mean) ** 2, 0) / (rets.length - 1));
  return { cagr: eq ** (1 / yrs) - 1, mdd, sharpe: sd ? mean / sd * Math.sqrt(12) : 0, to: sumTO / yrs, yrs };
}
const ERAS = [["1990-2026", "1990-01-01", "9999"], ["1990-99", "1990-01-01", "1999-12-31"], ["2000-12", "2000-01-01", "2012-12-31"], ["2013-26", "2013-01-01", "9999"]];
const pc = (x) => (x * 100).toFixed(1).padStart(5);
console.log("กลยุทธ์".padEnd(52), ERAS.map((e) => e[0].padEnd(34)).join(""));
const out = {};
for (const [name, fn] of Object.entries(STRATS)) { let line = name.padEnd(52); out[name] = {}; for (const [en, a, b] of ERAS) { const r = run(fn, a, b); out[name][en] = r; line += `CAGR ${pc(r.cagr)} DD ${pc(r.mdd)} Sh ${r.sharpe.toFixed(2)} TO${r.to.toFixed(1)}   `.padEnd(34); } console.log(line); }
fs.writeFileSync(path.join(ROOT, "data", "explore_rotation_2026-10-10.json"), JSON.stringify(out));
