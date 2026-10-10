// สำรวจ: พอร์ตเทรนด์ข้ามตลาด (ถือเท่ากันทุกดัชนีที่เหนือ SMA L) — ตรวจความทน: ความยาวเส้น, ความถี่, น้ำหนัก, ตัดตลาดออกทีละตัว, รายปี, + SET
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HERMES = process.env.HERMES_SCRIPTS || "C:/Users/Tar/AppData/Local/hermes/scripts", DIR = path.join(HERMES, "idx_long");
const COST = 0.001;
let IDX = ["_GSPC", "_IXIC", "_RUT", "_N225", "_GDAXI", "_FTSE", "_FCHI", "_HSI", "_KS11", "_AXJO", "_BSESN", "_STI", "_JKSE", "_KLSE", "_TWII", "_BVSP", "_GSPTSE", "SET"];
const tb = new Map(fs.readFileSync(path.join(HERMES, "tbill_long.csv"), "utf8").trim().split(/\r?\n/).slice(1).map((l) => l.split(",")).filter((r) => r[1] && r[1] !== ".").map((r) => [r[0], +r[1]]));
const spx = JSON.parse(fs.readFileSync(path.join(DIR, "_GSPC.json"), "utf8")), cal = spx.t.filter((d) => d >= "1987-01-01"), n = cal.length, ci = new Map(cal.map((d, i) => [d, i]));
const P = {}, first = {};
function put(s, ts, cs) { const a = new Float64Array(n).fill(NaN); ts.forEach((t, i) => { const k = ci.get(t); if (k !== undefined) a[k] = cs[i]; }); let last = NaN, f = -1; for (let i = 0; i < n; i++) { if (a[i] > 0) { last = a[i]; if (f < 0) f = i; } else a[i] = last; } P[s] = a; first[s] = f; }
for (const s of IDX) { if (s === "SET") { const rows = fs.readFileSync(path.join(HERMES, "idx_SET_daily_full.csv"), "utf8").trim().split(/\r?\n/).slice(1).map((l) => l.split(",")); put(s, rows.map((r) => r[0]), rows.map((r) => +r[4])); } else { const d = JSON.parse(fs.readFileSync(path.join(DIR, s + ".json"), "utf8")); put(s, d.t, d.c); } }
const rf = new Float64Array(n); { let last = 0; for (let i = 0; i < n; i++) { if (tb.has(cal[i])) last = tb.get(cal[i]); rf[i] = last / 100 / 252; } }
const sched = (kind) => { const r = []; for (let i = 0; i < n - 1; i++) { const a = cal[i], b = cal[i + 1]; if (kind === "M" ? a.slice(0, 7) !== b.slice(0, 7) : isoW(a) !== isoW(b)) r.push(i); } return r; };
const isoW = (s) => { const d = new Date(s + "T00:00:00Z"), day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3); return d.getUTCFullYear() * 100 + Math.floor(((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 4))) / 864e5 + 3) / 7); };
const SM = {};   // cache SMA arrays
const smaArr = (s, L) => { const k = s + L; if (SM[k]) return SM[k]; const a = P[s], o = new Float64Array(n).fill(NaN); let sum = 0; for (let i = 0; i < n; i++) { if (a[i] > 0) sum += a[i]; if (i >= L) sum -= a[i - L]; if (i >= L - 1 && i - L + 1 >= first[s]) o[i] = sum / L; } return (SM[k] = o); };
const vol60 = (s, i) => { let m = 0, v = 0; const r = []; for (let j = i - 59; j <= i; j++) r.push(P[s][j] / P[s][j - 1] - 1); r.forEach((x) => (m += x / 60)); r.forEach((x) => (v += (x - m) ** 2 / 59)); return Math.sqrt(v); };
function run({ L, kind, wmode, excl, hold }, a, b, wantYearly) {
  const uni = IDX.filter((s) => !(excl || []).includes(s)), S = sched(kind); let eq = 1, prev = {}, TO = 0, peak = 1, mdd = 0, y0 = null, days = 0; const eqs = {}, rets = [];
  for (let m = 0; m < S.length - 1; m++) {
    const i = S[m], e = S[m + 1]; if (cal[i] < a || cal[i] > b) continue; if (!y0) y0 = i;
    const av = uni.filter((s) => i - 260 >= first[s] && !isNaN(smaArr(s, L)[i])), w = {};
    if (hold === "EWall") { av.forEach((s) => (w[s] = 1 / av.length)); }
    else { const on = av.filter((s) => P[s][i] > smaArr(s, L)[i]); if (wmode === "iv") { const iv = on.map((s) => 1 / vol60(s, i)), t = av.map((s) => 1 / vol60(s, i)).reduce((p, q) => p + q, 0); on.forEach((s, j) => (w[s] = iv[j] / t)); } else on.forEach((s) => (w[s] = 1 / av.length)); }
    let to = 0; new Set([...Object.keys(w), ...Object.keys(prev)]).forEach((s) => (to += Math.abs((w[s] || 0) - (prev[s] || 0)))); TO += to; prev = w;
    const val = { ...w }; let cash = 1 - Object.values(w).reduce((p, q) => p + q, 0), tot = 1;
    for (let d = i + 2; d <= e + 1 && d < n; d++) { tot = 0; for (const s of Object.keys(val)) { val[s] *= P[s][d] / P[s][d - 1]; tot += val[s]; } cash *= 1 + rf[d]; tot += cash; }
    const r = (1 - COST * to) * tot - 1; rets.push(r); eq *= 1 + r; days += e - i; if (eq > peak) peak = eq; mdd = Math.min(mdd, eq / peak - 1); if (wantYearly) { const y = cal[e].slice(0, 4); eqs[y] = (eqs[y] || 1) * (1 + r); }
  }
  const yrs = days / 252, mean = rets.reduce((p, q) => p + q, 0) / rets.length, sd = Math.sqrt(rets.reduce((p, q) => p + (q - mean) ** 2, 0) / (rets.length - 1)), f12 = kind === "M" ? 12 : 52;
  return { cagr: eq ** (1 / yrs) - 1, mdd, sharpe: sd ? mean / sd * Math.sqrt(f12) : 0, to: TO / yrs, yearly: eqs };
}
const ERAS = [["1992-2026", "1992-01-01", "9999"], ["1992-99", "1992-01-01", "1999-12-31"], ["2000-12", "2000-01-01", "2012-12-31"], ["2013-26", "2013-01-01", "9999"]];
const pc = (x) => (x * 100).toFixed(1).padStart(5), line = (r) => `CAGR ${pc(r.cagr)} DD ${pc(r.mdd)} Sh ${r.sharpe.toFixed(2)} TO${r.to.toFixed(1)}`.padEnd(34);
console.log("— ความยาวเส้น/ความถี่/น้ำหนัก (18 ดัชนีรวม SET)"); console.log("ตั้งค่า".padEnd(28), ERAS.map((e) => e[0].padEnd(34)).join(""));
const cfgs = [{ name: "EW ถือทุกตลาด (benchmark)", L: 200, kind: "M", hold: "EWall" }];
for (const L of [50, 100, 150, 200, 250]) for (const kind of ["M", "W"]) cfgs.push({ name: `SMA${L} ${kind === "M" ? "รายเดือน" : "รายสัปดาห์"} EW`, L, kind });
cfgs.push({ name: "SMA200 รายเดือน น้ำหนัก 1/vol", L: 200, kind: "M", wmode: "iv" });
const out = { cfgs: {} };
for (const c of cfgs) { let s = c.name.padEnd(28); out.cfgs[c.name] = {}; for (const [en, a, b] of ERAS) { const r = run(c, a, b); out.cfgs[c.name][en] = { cagr: r.cagr, mdd: r.mdd, sharpe: r.sharpe, to: r.to }; s += line(r); } console.log(s); }
console.log("\n— ตัดตลาดออกทีละตัว (SMA200 รายเดือน EW) ช่วงเต็ม: ΔSharpe เทียบ benchmark ที่ตัดตลาดเดียวกัน");
const loo = []; for (const x of IDX) { const t = run({ L: 200, kind: "M", excl: [x] }, "1992-01-01", "9999"), bm = run({ L: 200, kind: "M", hold: "EWall", excl: [x] }, "1992-01-01", "9999"); loo.push([x, t.sharpe - bm.sharpe, t.mdd, bm.mdd, t.cagr - bm.cagr]); }
console.log(loo.map((x) => `${x[0]}:${x[1].toFixed(2)}`).join("  "), "\nmin ΔSharpe", Math.min(...loo.map((x) => x[1])).toFixed(2), " max MaxDD", pc(Math.min(...loo.map((x) => x[2]))));
console.log("\n— รายปี SMA200 รายเดือน EW vs EW ถือตรง (%)");
const t200 = run({ L: 200, kind: "M" }, "1992-01-01", "9999", true), bm = run({ L: 200, kind: "M", hold: "EWall" }, "1992-01-01", "9999", true);
console.log(Object.keys(t200.yearly).map((y) => `${y}: ${((t200.yearly[y] - 1) * 100).toFixed(0)}/${((bm.yearly[y] - 1) * 100).toFixed(0)}`).join("  "));
const wins = Object.keys(t200.yearly).filter((y) => t200.yearly[y] > bm.yearly[y]).length; console.log(`ชนะ EW ${wins}/${Object.keys(t200.yearly).length} ปี · ปีที่ EW ติดลบ >10%:`, Object.keys(bm.yearly).filter((y) => bm.yearly[y] < 0.9).map((y) => `${y}(${((t200.yearly[y] - 1) * 100).toFixed(0)} vs ${((bm.yearly[y] - 1) * 100).toFixed(0)})`).join(" "));
fs.writeFileSync(path.join(ROOT, "data", "explore_trendport_2026-10-10.json"), JSON.stringify({ out, loo, yearly: { trend: t200.yearly, ew: bm.yearly } }));
