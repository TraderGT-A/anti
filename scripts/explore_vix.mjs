// สำรวจ: ผลตอบแทน S&P 500 TR ล่วงหน้า 21 วัน แยกตามระดับ VIX / ระยะห่างจาก SMA200 / drawdown จากจุดสูง — exploratory
import fs from "node:fs";
import path from "node:path";
const DIR = path.join(process.env.HERMES_SCRIPTS || "C:/Users/Tar/AppData/Local/hermes/scripts", "idx_long");
const tr = JSON.parse(fs.readFileSync(path.join(DIR, "_SP500TR.json"), "utf8")), vx = JSON.parse(fs.readFileSync(path.join(DIR, "_VIX.json"), "utf8")), vm = new Map(vx.t.map((t, i) => [t, vx.c[i]]));
const t = tr.t, c = tr.c, n = t.length, H = 21, V = t.map((d) => vm.get(d) ?? NaN);
const sma = (p, i) => { let s = 0; for (let j = i - p + 1; j <= i; j++) s += c[j]; return s / p; };
const rows = [];
for (let i = 252; i < n - H - 1; i++) { let hh = 0; for (let j = i - 251; j <= i; j++) if (c[j] > hh) hh = c[j]; rows.push({ d: t[i], vix: V[i], dist200: c[i] / sma(200, i) - 1, dd: c[i] / hh - 1, fwd: c[i + 1 + H] / c[i + 1] - 1, mom12: c[i] / c[i - 252] - 1 }); }
const ann = (m) => ((1 + m) ** 12 - 1) * 100;
function table(name, key, edges) {
  console.log(`\n${name} — ผลตอบแทน S&P TR 21 วันถัดไป (เฉลี่ย/รอบ, % ที่บวก, จำนวนวัน) แยกยุค`);
  const eras = [["1990-99", "1990", "1999"], ["2000-09", "2000", "2009"], ["2010-26", "2010", "2026"], ["ทั้งหมด", "1990", "2026"]];
  for (let b = 0; b < edges.length - 1; b++) { let line = `[${edges[b]}, ${edges[b + 1]})`.padEnd(18); for (const [en, a, z] of eras) { const r = rows.filter((x) => x.d.slice(0, 4) >= a && x.d.slice(0, 4) <= z && Number.isFinite(x[key]) && x[key] >= edges[b] && x[key] < edges[b + 1]); if (r.length < 60) { line += `${en}: n<60 `.padEnd(34); continue; } const m = r.reduce((s, x) => s + x.fwd, 0) / r.length; line += `${en}: ${(m * 100).toFixed(2)}% pos${(r.filter((x) => x.fwd > 0).length / r.length * 100).toFixed(0)}% n${r.length}`.padEnd(34); } console.log(line); }
  const all = rows.reduce((s, x) => s + x.fwd, 0) / rows.length; console.log(`(ทุกวัน เฉลี่ย ${(all * 100).toFixed(2)}%/21วัน ≈ ${ann(all).toFixed(1)}%/ปี)`);
}
table("ระดับ VIX", "vix", [0, 12, 15, 18, 22, 28, 35, 100]);
table("ระยะห่างจาก SMA200", "dist200", [-1, -0.1, -0.05, 0, 0.05, 0.1, 1]);
table("Drawdown จากจุดสูง 252 วัน", "dd", [-1, -0.2, -0.1, -0.05, -0.02, 0.001]);
table("โมเมนตัม 12 เดือน", "mom12", [-1, -0.1, 0, 0.1, 0.2, 0.4, 3]);
