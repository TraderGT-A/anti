// สำรวจ: เทรนด์ SMA200 + ยกเลิกเมื่อ VIX สูง (ซื้อความกลัว) บน S&P 500 TR 1990–2026 — exploratory (กฎไม่กี่แบบ)
import fs from "node:fs";
import path from "node:path";
const H = process.env.HERMES_SCRIPTS || "C:/Users/Tar/AppData/Local/hermes/scripts", DIR = path.join(H, "idx_long");
const tr = JSON.parse(fs.readFileSync(path.join(DIR, "_SP500TR.json"), "utf8")), vx = JSON.parse(fs.readFileSync(path.join(DIR, "_VIX.json"), "utf8")), vm = new Map(vx.t.map((t, i) => [t, vx.c[i]]));
const tb = new Map(fs.readFileSync(path.join(H, "tbill_long.csv"), "utf8").trim().split(/\r?\n/).slice(1).map((l) => l.split(",")).filter((r) => r[1] && r[1] !== ".").map((r) => [r[0], +r[1]]));
const t = tr.t, c = tr.c, n = t.length, V = t.map((d) => vm.get(d)), r = new Float64Array(n), rf = new Float64Array(n); let last = 0; for (let i = 0; i < n; i++) { if (i) r[i] = c[i] / c[i - 1] - 1; if (tb.has(t[i])) last = tb.get(t[i]); rf[i] = last / 100 / 252; }
const sma = (i, p) => { let s = 0; for (let j = i - p + 1; j <= i; j++) s += c[j]; return s / p; };
const RULES = {
  "ถือตรง (B&H)": () => 1,
  "SMA200": (i) => (c[i] > sma(i, 200) ? 1 : 0),
  "SMA200 หรือ VIX>28": (i) => (c[i] > sma(i, 200) || V[i] > 28 ? 1 : 0),
  "SMA200 หรือ VIX>35": (i) => (c[i] > sma(i, 200) || V[i] > 35 ? 1 : 0),
  "SMA200 หรือ VIX>28 (ครึ่งเดียวตอนต่ำกว่าเส้น)": (i) => (c[i] > sma(i, 200) ? 1 : (V[i] > 28 ? 1 : 0.5)),
  "SMA100 หรือ VIX>28": (i) => (c[i] > sma(i, 100) || V[i] > 28 ? 1 : 0),
  "ลด 50% เมื่อ VIX<13 (ตลาดสบายเกิน)": (i) => (V[i] < 13 ? 0.5 : 1),
};
const ERAS = [["1990-2026", "1990", "2026"], ["1990-99", "1990", "1999"], ["2000-09", "2000", "2009"], ["2010-26", "2010", "2026"]], COST = 0.001, pc = (x) => (x * 100).toFixed(1).padStart(5);
console.log("กฎ".padEnd(48), ERAS.map((e) => e[0].padEnd(30)).join(""));
for (const [name, f] of Object.entries(RULES)) {
  const pos = new Float64Array(n); for (let i = 200; i < n; i++) pos[i] = f(i); const eq = new Float64Array(n).fill(NaN); eq[199] = 1; for (let d = 202; d < n; d++) eq[d] = (isNaN(eq[d - 1]) ? 1 : eq[d - 1]) * (1 + pos[d - 2] * r[d] + (1 - pos[d - 2]) * rf[d] - COST * Math.abs(pos[d - 2] - pos[d - 3]));
  let line = name.padEnd(48);
  for (const [, a, z] of ERAS) { const idx = []; for (let d = 203; d < n; d++) if (t[d].slice(0, 4) >= a && t[d].slice(0, 4) <= z) idx.push(d); if (idx.length < 500) continue; let pk = 0, mdd = 0, m = 0, s2 = 0, exp = 0; for (const d of idx) { const rr = eq[d] / eq[d - 1] - 1 - rf[d]; m += rr; s2 += rr * rr; if (eq[d] > pk) pk = eq[d]; mdd = Math.min(mdd, eq[d] / pk - 1); exp += pos[d - 2]; } const y = idx.length / 252, cagr = (eq[idx.at(-1)] / eq[idx[0] - 1]) ** (1 / y) - 1, mean = m / idx.length, sd = Math.sqrt(s2 / idx.length - mean * mean); line += `CAGR ${pc(cagr)} DD ${pc(mdd)} Sh ${(mean / sd * Math.sqrt(252)).toFixed(2)} exp${(exp / idx.length * 100).toFixed(0)}`.padEnd(30); }
  console.log(line);
}
