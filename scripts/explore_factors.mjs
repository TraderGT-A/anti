// สำรวจ: คุณสมบัติรายหุ้น (features จาก OHLCV) ทำนายผลตอบแทน 21 วันถัดไปไหม — IC แบบ rank, ควินไทล์ ข้ามยุค  (exploratory)
//   node --max-old-space-size=12288 scripts/explore_factors.mjs th|us
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HERMES = process.env.HERMES_SCRIPTS || "C:/Users/Tar/AppData/Local/hermes/scripts";
const MK = (process.argv[2] || "th").toLowerCase(), IS_US = MK === "us", IS_EM = MK.startsWith("em:");
const H = 21, DATA_FROM = IS_US ? "2013-06-01" : (IS_EM ? "2005-06-01" : "2000-06-01"), MIN_PRICE = +(process.env.MIN_PRICE || (IS_US ? 10 : (IS_EM ? 0 : 1))), MIN_TURN = +(process.env.MIN_TURN || (IS_US ? 20e6 : (IS_EM ? 0 : 5e6))), JUMP = 0.35, TAG = process.env.TAG || "";
let cal, n, calIdx, rawStocks = [];
if (IS_EM) {
  const emd = JSON.parse(fs.readFileSync(path.join(HERMES, "em", MK.slice(3) + ".json"), "utf8")), ds = new Set();
  for (const d of Object.values(emd)) for (const x of d.t) if (x >= DATA_FROM) ds.add(x);
  cal = [...ds].sort(); n = cal.length; calIdx = new Map(cal.map((d, i) => [d, i]));
  for (const [tk, d] of Object.entries(emd)) rawStocks.push([tk, d.t, d.o, d.h, d.l, d.c, d.v]);
} else if (IS_US) {
  const DIR = path.join(HERMES, "us11"), bench = JSON.parse(fs.readFileSync(path.join(DIR, "bench.json"), "utf8"));
  cal = bench["^GSPC"].t.filter((d) => d >= DATA_FROM); n = cal.length; calIdx = new Map(cal.map((d, i) => [d, i]));
  for (const f of fs.readdirSync(DIR).filter((x) => /^chunk_\d+\.json$/.test(x)).sort()) { const ch = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); for (const [tk, b] of Object.entries(ch)) rawStocks.push([tk, b.t, b.o, b.h, b.l, b.c, b.v]); }
} else {
  const raw = JSON.parse(fs.readFileSync(path.join(HERMES, "bt_ohlcv_full.json"), "utf8"));
  const ds = new Set(); for (const bars of Object.values(raw)) for (const b of bars) if (b.t >= DATA_FROM) ds.add(b.t);   // ปฏิทิน = วันที่มีการซื้อขายของหุ้นในไฟล์ (ไฟล์ดัชนี SET เริ่ม 2006 เท่านั้น)
  cal = [...ds].sort(); n = cal.length; calIdx = new Map(cal.map((d, i) => [d, i]));
  for (const [tk, bars] of Object.entries(raw)) rawStocks.push([tk, bars.map((b) => b.t), bars.map((b) => b.o), bars.map((b) => b.h), bars.map((b) => b.l), bars.map((b) => b.c), bars.map((b) => b.v)]);
}
const S = [];
for (const [tk, ts, bo, bh, bl, bc, bv] of rawStocks) {
  const o = new Float32Array(n).fill(NaN), h = new Float32Array(n).fill(NaN), l = new Float32Array(n).fill(NaN), c = new Float32Array(n).fill(NaN), v = new Float32Array(n); let first = -1, lastK = -1, cnt = 0;
  for (let i = 0; i < ts.length; i++) { const k = calIdx.get(ts[i]); if (k === undefined || !(bc[i] > 0)) continue; const oo = bo[i] > 0 ? bo[i] : bc[i]; o[k] = oo; c[k] = bc[i]; h[k] = Math.max(bh[i] || bc[i], oo, bc[i]); l[k] = Math.min(bl[i] > 0 ? bl[i] : bc[i], oo, bc[i]); v[k] = bv[i] || 0; if (first < 0) first = k; lastK = k; cnt++; }
  if (cnt < 300) continue;
  for (let i = first + 1; i <= lastK; i++) if (!(c[i] > 0)) { c[i] = c[i - 1]; o[i] = h[i] = l[i] = c[i]; v[i] = 0; }
  const badPre = new Int32Array(n + 1); for (let i = 0; i < n; i++) badPre[i + 1] = badPre[i] + (i > first && i <= lastK && Math.abs(c[i] / c[i - 1] - 1) > JUMP ? 1 : 0);
  S.push({ tk, o, h, l, c, v, first, last: lastK, badPre });
}
console.log(MK, "stocks", S.length, "days", n, cal[0], "→", cal.at(-1));
const rets = (s) => { const r = new Float32Array(n); for (let i = s.first + 1; i <= s.last; i++) r[i] = s.c[i] / s.c[i - 1] - 1; return r; };
for (const s of S) s.r = rets(s);
const FEATS = {
  "r1w": (s, k) => s.c[k] / s.c[k - 5] - 1, "r1m": (s, k) => s.c[k] / s.c[k - 21] - 1, "r3m": (s, k) => s.c[k] / s.c[k - 63] - 1, "r6m": (s, k) => s.c[k] / s.c[k - 126] - 1, "r12m": (s, k) => s.c[k] / s.c[k - 252] - 1,
  "r12-1": (s, k) => s.c[k - 21] / s.c[k - 252] - 1, "r6-1": (s, k) => s.c[k - 21] / s.c[k - 126] - 1,
  "near52wHigh": (s, k) => { let m = 0; for (let j = k - 251; j <= k; j++) if (s.h[j] > m) m = s.h[j]; return s.c[k] / m; },
  "far52wLow": (s, k) => { let m = Infinity; for (let j = k - 251; j <= k; j++) if (s.l[j] < m) m = s.l[j]; return s.c[k] / m; },
  "distSMA50": (s, k) => { let m = 0; for (let j = k - 49; j <= k; j++) m += s.c[j]; return s.c[k] / (m / 50) - 1; },
  "distSMA200": (s, k) => { let m = 0; for (let j = k - 199; j <= k; j++) m += s.c[j]; return s.c[k] / (m / 200) - 1; },
  "vol20": (s, k) => sd(s.r, k, 20), "vol60": (s, k) => sd(s.r, k, 60), "vol250": (s, k) => sd(s.r, k, 250),
  "maxRet21(MAX)": (s, k) => { let m = -1; for (let j = k - 20; j <= k; j++) if (s.r[j] > m) m = s.r[j]; return m; },
  "minRet21": (s, k) => { let m = 1; for (let j = k - 20; j <= k; j++) if (s.r[j] < m) m = s.r[j]; return m; },
  "skew60": (s, k) => { const m = mean(s.r, k, 60), q = sd(s.r, k, 60); if (!q) return NaN; let t = 0; for (let j = k - 59; j <= k; j++) t += ((s.r[j] - m) / q) ** 3; return t / 60; },
  "atrPct14": (s, k) => { let t = 0; for (let j = k - 13; j <= k; j++) t += Math.max(s.h[j] - s.l[j], Math.abs(s.h[j] - s.c[j - 1]), Math.abs(s.l[j] - s.c[j - 1])); return t / 14 / s.c[k]; },
  "tight10": (s, k) => { let hi = 0, lo = Infinity; for (let j = k - 9; j <= k; j++) { if (s.h[j] > hi) hi = s.h[j]; if (s.l[j] < lo) lo = s.l[j]; } return (hi - lo) / s.c[k]; },
  "logDollarVol": (s, k) => { let t = 0; for (let j = k - 19; j <= k; j++) t += s.c[j] * s.v[j]; return Math.log(t / 20 + 1); },
  "volTrend": (s, k) => { let a = 0, b = 0; for (let j = k - 19; j <= k; j++) a += s.v[j]; for (let j = k - 119; j <= k; j++) b += s.v[j]; return b ? (a / 20) / (b / 120) : NaN; },
  "amihud60": (s, k) => { let t = 0, c = 0; for (let j = k - 59; j <= k; j++) { const dv = s.c[j] * s.v[j]; if (dv > 0) { t += Math.abs(s.r[j]) / dv; c++; } } return c ? Math.log(t / c * 1e6 + 1e-9) : NaN; },
  "posDays60": (s, k) => { let p = 0; for (let j = k - 59; j <= k; j++) if (s.r[j] > 0) p++; return p / 60; },
  "overnight60": (s, k) => { let t = 0; for (let j = k - 59; j <= k; j++) t += s.o[j] / s.c[j - 1] - 1; return t / 60; },
  "intraday60": (s, k) => { let t = 0; for (let j = k - 59; j <= k; j++) t += s.c[j] / s.o[j] - 1; return t / 60; },
  "price(log)": (s, k) => Math.log(s.c[k]),
  "r1m×dollarVolRank": null,
};
delete FEATS["r1m×dollarVolRank"];
function mean(r, k, p) { let m = 0; for (let j = k - p + 1; j <= k; j++) m += r[j]; return m / p; }
function sd(r, k, p) { const m = mean(r, k, p); let v = 0; for (let j = k - p + 1; j <= k; j++) v += (r[j] - m) ** 2; return Math.sqrt(v / (p - 1)); }
const names = Object.keys(FEATS);
const monthEnds = []; for (let i = 260; i < n - H - 2; i++) if (cal[i].slice(0, 7) !== cal[i + 1].slice(0, 7)) monthEnds.push(i);
const rank = (a) => { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = new Float64Array(a.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const rv = (i + j) / 2 + 1; for (let q = i; q <= j; q++) r[idx[q][1]] = rv; i = j + 1; } return r; };
const corr = (x, y) => { const m = x.length; let mx = 0, my = 0; for (let i = 0; i < m; i++) { mx += x[i]; my += y[i]; } mx /= m; my /= m; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < m; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN; };
const eras = IS_EM ? [["2006-12", "2006-01-01", "2012-12-31"], ["2013-19", "2013-01-01", "2019-12-31"], ["2020-26", "2020-01-01", "9999"]] : IS_US ? [["2014-19", "2014-01-01", "2019-12-31"], ["2020-26", "2020-01-01", "9999"]] : [["2001-07", "2001-01-01", "2007-12-31"], ["2008-14", "2008-01-01", "2014-12-31"], ["2015-20", "2015-01-01", "2020-12-31"], ["2021-26", "2021-01-01", "9999"]];
const rec = {}; names.forEach((f) => (rec[f] = { ic: [], q: [], date: [] }));
const ewAll = [];
for (const k of monthEnds) {
  const rows = [];
  for (const s of S) {
    if (k - 252 < s.first || k + H + 1 > s.last || !(s.c[k] >= MIN_PRICE)) continue;
    let t = 0; for (let j = k - 19; j <= k; j++) t += s.c[j] * s.v[j]; if (t / 20 < MIN_TURN) continue;
    if (s.badPre[k + H + 2] - s.badPre[k - 252] > 0) continue;   // มีแท่งกระโดด >35% ในหน้าต่าง → ข้าม (กันข้อมูลที่ไม่ได้ปรับ split)
    const o1 = s.o[k + 1]; if (!(o1 > 0) || !(s.v[k + 1] > 0)) continue;
    rows.push([s, s.o[k + 1 + H] > 0 ? s.o[k + 1 + H] / o1 - 1 : s.c[k + H + 1] / o1 - 1]);
  }
  if (rows.length < 40) continue; ewAll.push([cal[k], rows.reduce((a, r) => a + r[1], 0) / rows.length]);
  const fr = rows.map((r) => r[1]), rfr = rank(fr);
  for (const f of names) { const vals = rows.map((r) => FEATS[f](r[0], k)), ok = vals.map((v) => Number.isFinite(v)); const idx = ok.map((x, i) => (x ? i : -1)).filter((i) => i >= 0); if (idx.length < 40) continue;
    const v = idx.map((i) => vals[i]), y = idx.map((i) => fr[i]), ic = corr(rank(v), rank(y));
    const order = idx.map((_, i) => i).sort((a, b) => v[a] - v[b]), qn = Math.floor(order.length / 5), q = [0, 1, 2, 3, 4].map((g) => { const sl = order.slice(g * qn, g === 4 ? order.length : (g + 1) * qn); return sl.reduce((a, i) => a + y[i], 0) / sl.length; });
    rec[f].ic.push(ic); rec[f].q.push(q); rec[f].date.push(cal[k]); }
}
const msd = (a) => { const m = a.reduce((p, q) => p + q, 0) / a.length; return [m, Math.sqrt(a.reduce((p, q) => p + (q - m) ** 2, 0) / (a.length - 1))]; };
const eraStat = (f, from, to) => { const idx = rec[f].date.map((d, i) => (d >= from && d <= to ? i : -1)).filter((i) => i >= 0); if (idx.length < 12) return null; const ic = idx.map((i) => rec[f].ic[i]).filter((x) => Number.isFinite(x)), [m, s] = msd(ic), spread = idx.map((i) => rec[f].q[i][4] - rec[f].q[i][0]), ew = idx.map((i) => rec[f].q[i].reduce((p, q) => p + q, 0) / 5), top = idx.map((i, j) => rec[f].q[i][4] - ew[j]), bot = idx.map((i, j) => rec[f].q[i][0] - ew[j]); return { botExM: bot.reduce((p, q) => p + q, 0) / bot.length, n: ic.length, ic: m, t: m / (s / Math.sqrt(ic.length)), spreadM: spread.reduce((p, q) => p + q, 0) / spread.length, topExM: top.reduce((p, q) => p + q, 0) / top.length, pos: ic.filter((x) => x > 0).length / ic.length }; };
console.log(`\nIC = rank-IC เฉลี่ย (feature ↔ ผลตอบแทน ${H} วันถัดไป) · t · Q5−Q1 = ส่วนต่างเดือนละ % ควินไทล์สูง-ต่ำ · Q5−EW = ควินไทล์สูงสุดเทียบเฉลี่ยทั้งกระดาน`);
console.log("feature".padEnd(16), "ทั้งช่วง".padEnd(46), eras.map((e) => e[0].padEnd(30)).join(""));
const table = [];
for (const f of names) { const all = eraStat(f, "0", "9999"); if (!all) continue; const es = eras.map((e) => eraStat(f, e[1], e[2])); table.push({ f, all, es }); }
table.sort((a, b) => Math.abs(b.all.t) - Math.abs(a.all.t));
const fm = (x) => (x * 100).toFixed(2);
for (const r of table) console.log(r.f.padEnd(16), `IC ${r.all.ic.toFixed(3)} t ${r.all.t.toFixed(1)} Q5-EW ${fm(r.all.topExM)} Q1-EW ${fm(r.all.botExM)}`.padEnd(46), r.es.map((e) => (e ? `${e.ic.toFixed(3)} t${e.t.toFixed(1)} Q5 ${fm(e.topExM)} Q1 ${fm(e.botExM)}`.padEnd(30) : "-".padEnd(24))).join(""));
const ewm = ewAll.reduce((a, r) => a + r[1], 0) / ewAll.length; console.log(`\nEW ทั้งกระดาน ${H} วัน เฉลี่ย ${fm(ewm)}%/รอบ · เดือนที่ใช้ ${ewAll.length}`);
fs.writeFileSync(path.join(ROOT, "data", `explore_factors_${MK.replace(":", "_")}${TAG}_2026-10-10.json`), JSON.stringify({ H, eras, table, ew: ewAll }));
