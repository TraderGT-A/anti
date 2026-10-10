// งานสำรวจ (exploratory) — กฎจับจังหวะระดับดัชนี เทียบ buy&hold ข้ามหลายตลาด/หลายยุค  (ไม่ใช่การทดสอบที่ล็อกล่วงหน้า)
//   node scripts/explore_index.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HERMES = process.env.HERMES_SCRIPTS || "C:/Users/Tar/AppData/Local/hermes/scripts", DIR = path.join(HERMES, "idx_long");
const COST = 0.001;   // ต่อหน่วยการเปลี่ยนสัดส่วน (ต่อข้าง) = 10 bps
const INDEXES = ["_GSPC", "_SP500TR", "_IXIC", "_NDX", "_RUT", "_DJI", "_N225", "_GDAXI", "_FTSE", "_FCHI", "_HSI", "_KS11", "_AXJO", "_BSESN", "_STI", "_JKSE", "_KLSE", "_TWII", "_BVSP", "_GSPTSE"];
const ERAS = [["all", "0000", "9999"], ["pre2000", "0000", "1999-12-31"], ["2000-12", "2000-01-01", "2012-12-31"], ["2013+", "2013-01-01", "9999"]];
const tb = new Map(fs.readFileSync(path.join(HERMES, "tbill_long.csv"), "utf8").trim().split(/\r?\n/).slice(1).map((l) => l.split(",")).filter((r) => r[1] && r[1] !== ".").map((r) => [r[0], +r[1]]));
function load(sym) {
  const d = JSON.parse(fs.readFileSync(path.join(DIR, sym + ".json"), "utf8")), n = d.t.length, c = Float64Array.from(d.c), r = new Float64Array(n), rf = new Float64Array(n); let last = 0;
  for (let i = 0; i < n; i++) { if (i) r[i] = c[i] / c[i - 1] - 1; if (tb.has(d.t[i])) last = tb.get(d.t[i]); rf[i] = last / 100 / 252; }
  return { sym, t: d.t, c, o: Float64Array.from(d.o), h: Float64Array.from(d.h), l: Float64Array.from(d.l), r, rf, n };
}
const sma = (a, p) => { const o = new Float64Array(a.length).fill(NaN); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= p) s -= a[i - p]; if (i >= p - 1) o[i] = s / p; } return o; };
const rsiN = (c, p) => { const o = new Float64Array(c.length).fill(NaN); let ag = 0, al = 0; for (let i = 1; i < c.length; i++) { const ch = c[i] - c[i - 1], g = Math.max(ch, 0), l = Math.max(-ch, 0); if (i <= p) { ag += g / p; al += l / p; } else { ag = (ag * (p - 1) + g) / p; al = (al * (p - 1) + l) / p; } if (i >= p) o[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al); } return o; };
const stdev = (r, p) => { const o = new Float64Array(r.length).fill(NaN); for (let i = p; i < r.length; i++) { let m = 0; for (let j = i - p + 1; j <= i; j++) m += r[j]; m /= p; let v = 0; for (let j = i - p + 1; j <= i; j++) v += (r[j] - m) ** 2; o[i] = Math.sqrt(v / (p - 1)); } return o; };
const roll = (a, p, f) => { const o = new Float64Array(a.length).fill(NaN); for (let i = p - 1; i < a.length; i++) { let v = a[i]; for (let j = i - p + 1; j < i; j++) v = f(v, a[j]); o[i] = v; } return o; };

// ---------- กฎ: คืนสัดส่วนหุ้น 0..1 ที่ตัดสินใจจากข้อมูลถึงปิดวัน t ----------
const RULES = {};
for (const p of [20, 50, 100, 150, 200, 250]) RULES["SMA" + p] = (X) => { const m = sma(X.c, p); return (i) => (X.c[i] > m[i] ? 1 : 0); };
for (const p of [21, 63, 126, 252]) RULES["MOM" + p] = (X) => (i) => (i >= p && X.c[i] > X.c[i - p] ? 1 : 0);
RULES["MOM12-1"] = (X) => (i) => (i >= 252 && X.c[i - 21] > X.c[i - 252] ? 1 : 0);
RULES["SMA50>200"] = (X) => { const a = sma(X.c, 50), b = sma(X.c, 200); return (i) => (a[i] > b[i] ? 1 : 0); };
RULES["SMA200+SMA50 half"] = (X) => { const a = sma(X.c, 50), b = sma(X.c, 200); return (i) => (X.c[i] > b[i] ? 0.5 : 0) + (X.c[i] > a[i] ? 0.5 : 0); };
RULES["Gate(1/.5/0)"] = (X) => { const a = sma(X.c, 50), b = sma(X.c, 200); return (i) => (X.c[i] > a[i] && a[i] > b[i] ? 1 : (X.c[i] < b[i] || (X.c[i] < a[i] && a[i] < b[i]) ? 0 : 0.5)); };
for (const tv of [0.08, 0.12, 0.16]) RULES["VolTarget" + tv] = (X) => { const s = stdev(X.r, 21); return (i) => Math.min(1, tv / (s[i] * Math.sqrt(252))); };
for (const dd of [0.1, 0.15, 0.2]) RULES["DD<" + dd + " out"] = (X) => { const hh = roll(X.c, 252, Math.max), m = sma(X.c, 100); let out = false; return (i) => { if (!(hh[i] > 0)) return 1; if (X.c[i] < hh[i] * (1 - dd)) out = true; else if (X.c[i] > m[i]) out = false; return out ? 0 : 1; }; };
RULES["RSI2<10 buy (>SMA200), exit >SMA5"] = (X) => { const r = rsiN(X.c, 2), m200 = sma(X.c, 200), m5 = sma(X.c, 5); let inn = false; return (i) => { if (!inn && r[i] < 10 && X.c[i] > m200[i]) inn = true; else if (inn && X.c[i] > m5[i]) inn = false; return inn ? 1 : 0; }; };
RULES["RSI2<10 buy + trend base 50%"] = (X) => { const r = rsiN(X.c, 2), m200 = sma(X.c, 200), m5 = sma(X.c, 5); let inn = false; return (i) => { if (!inn && r[i] < 10 && X.c[i] > m200[i]) inn = true; else if (inn && X.c[i] > m5[i]) inn = false; return Math.min(1, (X.c[i] > m200[i] ? 0.5 : 0) + (inn ? 0.5 : 0)); }; };
RULES["Turn-of-month (last1+first3)"] = (X) => (i) => { const d = X.t[i], nx = X.t[i + 1] || "9999", mo = (s) => s.slice(0, 7); if (i + 1 < X.n && mo(nx) !== mo(d)) return 1; let k = 0; for (let j = i; j >= 0 && mo(X.t[j]) === mo(d) && k < 3; j--) k++; return k <= 2 || (X.t[i - 1] && mo(X.t[i - 1]) !== mo(d)) ? ((d.slice(8, 10) <= "05") ? 1 : 0) : 0; };
RULES["SellInMay (Nov-Apr in)"] = (X) => (i) => { const m = +X.t[i].slice(5, 7); return m >= 11 || m <= 4 ? 1 : 0; };
RULES["SMA200 & SellInMay combo"] = (X) => { const m = sma(X.c, 200); return (i) => { const mo = +X.t[i].slice(5, 7); return X.c[i] > m[i] || mo >= 11 || mo <= 4 ? 1 : 0; }; };
RULES["Monday-skip"] = (X) => (i) => (new Date(X.t[i + 1] || X.t[i]).getUTCDay() === 1 ? 0 : 1);
RULES["Buy&Hold 50/50 cash (control)"] = () => () => 0.5;
RULES["Random timing p=.7 (control)"] = (() => { let s = 12345; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; return () => { const a = []; return (i) => { if (a[i] === undefined) a[i] = rnd() < 0.7 ? 1 : 0; return a[i]; }; }; })();

function simulate(X, rule, i0) {
  const pos = new Float64Array(X.n).fill(0), f = rule(X);
  for (let i = 0; i < X.n; i++) { const v = f(i); pos[i] = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0; }
  const eq = new Float64Array(X.n).fill(NaN); eq[i0 - 1] = 1; let tr = 0;
  for (let d = i0; d < X.n; d++) { const p = d >= 2 ? pos[d - 2] : 0, p0 = d >= 3 ? pos[d - 3] : 0, c = COST * Math.abs(p - p0); tr += Math.abs(p - p0); eq[d] = eq[d - 1] * (1 + p * X.r[d] + (1 - p) * X.rf[d] - c); }
  return { eq, pos, tr };
}
function stats(X, eq, a, b, pos) {   // ช่วง [a,b] (ดัชนีวัน)
  const y = (new Date(X.t[b]) - new Date(X.t[a - 1])) / (365.25 * 864e5); if (y < 5) return null;
  let pk = eq[a - 1], mdd = 0, s1 = 0, s2 = 0, m = 0, exp = 0; const n = b - a + 1;
  for (let d = a; d <= b; d++) { if (eq[d] > pk) pk = eq[d]; mdd = Math.min(mdd, eq[d] / pk - 1); const r = eq[d] / eq[d - 1] - 1 - X.rf[d]; s1 += r; s2 += r * r; if (pos) exp += d >= 2 ? pos[d - 2] : 0; }
  const mean = s1 / n, sd = Math.sqrt(s2 / n - mean * mean), cagr = (eq[b] / eq[a - 1]) ** (1 / y) - 1;
  return { cagr, mdd, sharpe: sd ? mean / sd * Math.sqrt(252) : 0, calmar: mdd ? cagr / Math.abs(mdd) : 0, exp: pos ? exp / n : 1 };
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
const data = INDEXES.map((s) => load(s));
const ruleNames = Object.keys(RULES), agg = {};
for (const X of data) {
  const i0 = 260, bh = new Float64Array(X.n).fill(NaN); bh[i0 - 1] = 1; for (let d = i0; d < X.n; d++) bh[d] = bh[d - 1] * (1 + X.r[d]);
  const res = {}; for (const rn of ruleNames) res[rn] = simulate(X, RULES[rn], i0);
  for (const [en, from, to] of ERAS) {
    const a = Math.max(i0, X.t.findIndex((x) => x >= from)), bIdx = (() => { let b = X.n - 1; while (b > a && X.t[b] > to) b--; return b; })();
    if (a < 0 || bIdx <= a) continue; const sb = stats(X, bh, a, bIdx, null); if (!sb) continue;
    for (const rn of ruleNames) { const s = stats(X, res[rn].eq, a, bIdx, res[rn].pos); if (!s) continue; const k = rn + "|" + en; (agg[k] = agg[k] || []).push({ idx: X.sym, dSharpe: s.sharpe - sb.sharpe, dCagr: s.cagr - sb.cagr, dMdd: s.mdd - sb.mdd, dCalmar: s.calmar - sb.calmar, exp: s.exp, cagr: s.cagr, bhCagr: sb.cagr, tr: res[rn].tr / ((bIdx - a) / 252) }); }
  }
}
const rows = []; for (const rn of ruleNames) { const r = { rule: rn }; for (const [en] of ERAS) { const c = agg[rn + "|" + en] || []; if (!c.length) continue; r[en] = { n: c.length, medDSharpe: med(c.map((x) => x.dSharpe)), winSharpe: c.filter((x) => x.dSharpe > 0).length / c.length, medDCagr: med(c.map((x) => x.dCagr)), medDMdd: med(c.map((x) => x.dMdd)), winCalmar: c.filter((x) => x.dCalmar > 0).length / c.length, exp: med(c.map((x) => x.exp)), turnoverPerYr: med(c.map((x) => x.tr)) }; } rows.push(r); }
const f = (x) => (x * 100).toFixed(1);
console.log("rule".padEnd(36), "ยุค→ [medΔSharpe | %cells Sharpe↑ | medΔCAGR% | medΔMaxDD(pp) | exp%] ");
for (const r of rows) { let line = r.rule.padEnd(36); for (const [en] of ERAS) { const e = r[en]; line += e ? ` ${en}:[${e.medDSharpe.toFixed(2)}|${f(e.winSharpe)}|${f(e.medDCagr)}|${f(e.medDMdd)}|${f(e.exp)}]` : ""; } console.log(line); }
fs.writeFileSync(path.join(ROOT, "data", "explore_index_2026-10-10.json"), JSON.stringify({ costPerUnit: COST, indexes: INDEXES, rows, cells: agg }, null, 0));
