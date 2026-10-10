// สำรวจ: พอร์ตเทรนด์ข้ามสินทรัพย์ด้วย ETF รวมปันผล (SPY, QQQ, EFA, EEM, TLT, GLD) — exploratory
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HERMES = process.env.HERMES_SCRIPTS || "C:/Users/Tar/AppData/Local/hermes/scripts", DIR = path.join(HERMES, "idx_long");
const COST = 0.001, SETS = { "หุ้น+พันธบัตร+ทอง 5 ตัว (SPY,EFA,EEM,TLT,GLD)": ["SPY", "EFA", "EEM", "TLT", "GLD"], "หุ้นล้วน 3 ตัว (SPY,EFA,EEM)": ["SPY", "EFA", "EEM"], "6 ตัว (+QQQ)": ["SPY", "QQQ", "EFA", "EEM", "TLT", "GLD"], "SPY ตัวเดียว": ["SPY"] };
const tb = new Map(fs.readFileSync(path.join(HERMES, "tbill_long.csv"), "utf8").trim().split(/\r?\n/).slice(1).map((l) => l.split(",")).filter((r) => r[1] && r[1] !== ".").map((r) => [r[0], +r[1]]));
const spy = JSON.parse(fs.readFileSync(path.join(DIR, "SPY.json"), "utf8")), cal = spy.t.filter((d) => d >= "2004-12-01"), n = cal.length, ci = new Map(cal.map((d, i) => [d, i]));
const P = {}; for (const s of ["SPY", "QQQ", "EFA", "EEM", "TLT", "GLD"]) { const d = JSON.parse(fs.readFileSync(path.join(DIR, s + ".json"), "utf8")), a = new Float64Array(n).fill(NaN); d.t.forEach((t, i) => { const k = ci.get(t); if (k !== undefined) a[k] = d.adj[i]; }); let last = NaN; for (let i = 0; i < n; i++) { if (a[i] > 0) last = a[i]; else a[i] = last; } P[s] = a; }
const rf = new Float64Array(n); { let last = 0; for (let i = 0; i < n; i++) { if (tb.has(cal[i])) last = tb.get(cal[i]); rf[i] = last / 100 / 252; } }
const me = []; for (let i = 0; i < n - 1; i++) if (cal[i].slice(0, 7) !== cal[i + 1].slice(0, 7)) me.push(i);
const smaAt = (s, i, L) => { let m = 0; for (let j = i - L + 1; j <= i; j++) m += P[s][j]; return m / L; };
function run(syms, mode, L, a, b) {
  let eq = 1, peak = 1, mdd = 0, prev = {}, TO = 0, mo = 0; const rets = [];
  for (let m = 0; m < me.length - 1; m++) {
    const i = me[m], e = me[m + 1]; if (cal[i] < a || cal[i] > b || i < 260 || syms.some((s) => isNaN(P[s][i - 260]))) continue;
    const w = {}; for (const s of syms) { if (mode === "bh" || P[s][i] > smaAt(s, i, L)) w[s] = 1 / syms.length; }
    let to = 0; new Set([...Object.keys(w), ...Object.keys(prev)]).forEach((s) => (to += Math.abs((w[s] || 0) - (prev[s] || 0)))); TO += to; prev = w;
    const val = { ...w }; let cash = 1 - Object.values(w).reduce((p, q) => p + q, 0), tot = 1; for (let d = i + 2; d <= e + 1 && d < n; d++) { tot = 0; for (const s of Object.keys(val)) { val[s] *= P[s][d] / P[s][d - 1]; tot += val[s]; } cash *= 1 + rf[d]; tot += cash; }
    const r = (1 - COST * to) * tot - 1; rets.push(r); eq *= 1 + r; if (eq > peak) peak = eq; mdd = Math.min(mdd, eq / peak - 1); mo++;
  }
  const mean = rets.reduce((p, q) => p + q, 0) / rets.length, sd = Math.sqrt(rets.reduce((p, q) => p + (q - mean) ** 2, 0) / (rets.length - 1));
  return { cagr: eq ** (12 / mo) - 1, mdd, sharpe: sd ? mean / sd * Math.sqrt(12) : 0, to: TO / (mo / 12), yrs: mo / 12 };
}
const pc = (x) => (x * 100).toFixed(1).padStart(5), ERAS = [["2006-2026", "2005-06-01", "9999"], ["2006-12", "2005-06-01", "2012-12-31"], ["2013-19", "2013-01-01", "2019-12-31"], ["2020-26", "2020-01-01", "9999"]];
console.log("ชุดสินทรัพย์/กฎ".padEnd(54), ERAS.map((e) => e[0].padEnd(32)).join(""));
for (const [name, syms] of Object.entries(SETS)) for (const [mode, L, label] of [["bh", 0, "ถือเท่ากัน"], ["tr", 200, "เหนือ SMA200"], ["tr", 150, "เหนือ SMA150"], ["tr", 100, "เหนือ SMA100"]]) { let s = (name + " " + label).padEnd(54); for (const [, a, b] of ERAS) { const r = run(syms, mode, L, a, b); s += `CAGR ${pc(r.cagr)} DD ${pc(r.mdd)} Sh ${r.sharpe.toFixed(2)} TO${r.to.toFixed(1)}`.padEnd(32); } console.log(s); }
