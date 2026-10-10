// สำรวจ: โมเมนตัมระดับอุตสาหกรรมใน US (industry จาก TradingView ปัจจุบัน) — อุตสาหกรรมที่แข็งแรงใน 6/12 เดือน ต่อยอดไหม? exploratory
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(process.env.HERMES_SCRIPTS || "C:/Users/Tar/AppData/Local/hermes/scripts", "us11");
const bench = JSON.parse(fs.readFileSync(path.join(DIR, "bench.json"), "utf8")), cal = bench["^GSPC"].t.filter((d) => d >= "2013-06-01"), n = cal.length, ci = new Map(cal.map((d, i) => [d, i]));
const U = new Map(JSON.parse(fs.readFileSync(path.join(DIR, "universe.json"), "utf8")).map((s) => [s.tk, s])), S = [];
for (const f of fs.readdirSync(DIR).filter((x) => /^chunk_\d+\.json$/.test(x)).sort()) { const ch = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); for (const [tk, b] of Object.entries(ch)) { const c = new Float32Array(n).fill(NaN), v = new Float32Array(n), o = new Float32Array(n).fill(NaN); let first = -1, last = -1; b.t.forEach((t, i) => { const k = ci.get(t); if (k === undefined) return; c[k] = b.c[i]; o[k] = b.o[i]; v[k] = b.v[i]; if (first < 0) first = k; last = k; }); for (let i = first + 1; i <= last; i++) if (!(c[i] > 0)) { c[i] = c[i - 1]; o[i] = c[i]; } S.push({ tk, c, o, v, first, last, ind: (U.get(tk) || {}).industry || "?" }); } }
const me = []; for (let i = 260; i < n - 25; i++) if (cal[i].slice(0, 7) !== cal[i + 1].slice(0, 7)) me.push(i);
const rank = (a) => { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = new Float64Array(a.length); idx.forEach((x, j) => (r[x[1]] = j + 1)); return r; };
const corr = (x, y) => { const m = x.length; let mx = 0, my = 0; for (let i = 0; i < m; i++) { mx += x[i]; my += y[i]; } mx /= m; my /= m; let a = 0, b = 0, c = 0; for (let i = 0; i < m; i++) { a += (x[i] - mx) * (y[i] - my); b += (x[i] - mx) ** 2; c += (y[i] - my) ** 2; } return a / Math.sqrt(b * c); };
for (const [lbName, lb, skip] of [["3m", 63, 0], ["6m", 126, 0], ["12-1", 252, 21]]) {
  const ics = [], top = [], all = [];
  for (let m = 0; m < me.length - 1; m++) {
    const k = me[m], k2 = me[m + 1], g = {};
    for (const s of S) { if (k - lb < s.first || k2 + 1 > s.last || !(s.o[k + 1] > 0) || !(s.o[k2 + 1] > 0)) continue; let t = 0; for (let j = k - 19; j <= k; j++) t += s.c[j] * s.v[j]; if (t / 20 < 5e6 || s.c[k] < 5) continue; const past = s.c[k - skip] / s.c[k - lb] - 1, fut = s.o[k2 + 1] / s.o[k + 1] - 1; (g[s.ind] = g[s.ind] || []).push([past, fut]); }
    const keys = Object.keys(g).filter((x) => g[x].length >= 4 && x !== "?"); if (keys.length < 25) continue;
    const pm = keys.map((x) => g[x].reduce((a, r) => a + r[0], 0) / g[x].length), fm = keys.map((x) => g[x].reduce((a, r) => a + r[1], 0) / g[x].length);
    ics.push(corr(rank(pm), rank(fm))); const ord = keys.map((_, i) => i).sort((a, b) => pm[b] - pm[a]), q = Math.ceil(keys.length / 5); top.push(ord.slice(0, q).reduce((a, i) => a + fm[i], 0) / q); all.push(fm.reduce((a, b) => a + b, 0) / fm.length);
  }
  const mu = ics.reduce((a, b) => a + b, 0) / ics.length, sd = Math.sqrt(ics.reduce((a, b) => a + (b - mu) ** 2, 0) / (ics.length - 1)), ex = top.map((x, i) => x - all[i]), me2 = ex.reduce((a, b) => a + b, 0) / ex.length, sd2 = Math.sqrt(ex.reduce((a, b) => a + (b - me2) ** 2, 0) / (ex.length - 1));
  console.log(`US industry momentum ${lbName}: เดือน ${ics.length} · industry IC เฉลี่ย ${mu.toFixed(3)} (t ${(mu / (sd / Math.sqrt(ics.length))).toFixed(1)}) · top-quintile industries เทียบทุก industry ${(me2 * 100).toFixed(2)}%/เดือน (t ${(me2 / (sd2 / Math.sqrt(ex.length))).toFixed(1)})`);
}
