// สำรวจรอบ 2: พอร์ตหุ้นไทย near-52w-high ที่ซื้อขายได้จริงขึ้น — ปฏิทิน 2001+, สภาพคล่องหลายระดับ, กรอบกว้างลดการหมุน, Gate จากดัชนีเฉลี่ยทั้งกระดาน
//   MIN_TURN=20000000 node --max-old-space-size=12288 scripts/explore_th_portfolio2.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HERMES = process.env.HERMES_SCRIPTS || "C:/Users/Tar/AppData/Local/hermes/scripts";
const COST = +(process.env.COST || 0.0035), MIN_PRICE = 1, MIN_TURN = +(process.env.MIN_TURN || 5e6), JUMP = 0.35, TAG = process.env.TAG || "";
const raw = JSON.parse(fs.readFileSync(path.join(HERMES, "bt_ohlcv_full.json"), "utf8"));
const ds = new Set(); for (const bars of Object.values(raw)) for (const b of bars) if (b.t >= "2000-06-01") ds.add(b.t);
const cal = [...ds].sort(), n = cal.length, calIdx = new Map(cal.map((d, i) => [d, i])), S = [];
for (const [tk, bars] of Object.entries(raw)) {
  const o = new Float32Array(n).fill(NaN), h = new Float32Array(n).fill(NaN), l = new Float32Array(n).fill(NaN), c = new Float32Array(n).fill(NaN), v = new Float32Array(n); let first = -1, lastK = -1, cnt = 0;
  for (const b of bars) { const k = calIdx.get(b.t); if (k === undefined || !(b.c > 0)) continue; const oo = b.o > 0 ? b.o : b.c; o[k] = oo; c[k] = b.c; h[k] = Math.max(b.h || b.c, oo, b.c); l[k] = Math.min(b.l > 0 ? b.l : b.c, oo, b.c); v[k] = b.v || 0; if (first < 0) first = k; lastK = k; cnt++; }
  if (cnt < 300) continue; for (let i = first + 1; i <= lastK; i++) if (!(c[i] > 0)) { c[i] = c[i - 1]; o[i] = h[i] = l[i] = c[i]; v[i] = 0; }
  const bp = new Int32Array(n + 1), r = new Float32Array(n); for (let i = 0; i < n; i++) { if (i > first && i <= lastK) r[i] = c[i] / c[i - 1] - 1; bp[i + 1] = bp[i] + (Math.abs(r[i]) > JUMP ? 1 : 0); }
  S.push({ tk, o, h, l, c, v, r, first, last: lastK, bp });
}
// ดัชนีเฉลี่ยเท่ากันของหุ้นที่มีการซื้อขายจริง (ใช้เป็นตัวแทน SET ก่อนปี 2006) → Gate
const PX = new Float64Array(n); PX[0] = 100; for (let i = 1; i < n; i++) { let t = 0, c = 0; for (const s of S) if (i > s.first && i <= s.last && s.v[i] > 0 && s.c[i - 1] >= 1 && Math.abs(s.r[i]) < JUMP) { t += s.r[i]; c++; } PX[i] = PX[i - 1] * (1 + (c ? t / c : 0)); }
const ip = new Float64Array(n + 1); for (let i = 0; i < n; i++) ip[i + 1] = ip[i] + PX[i];
const gateAt = (k) => { if (k < 200) return 1; const c = PX[k], s50 = (ip[k + 1] - ip[k - 49]) / 50, s200 = (ip[k + 1] - ip[k - 199]) / 200; return c > s50 && s50 > s200 ? 1 : (c < s200 || (c < s50 && s50 < s200) ? 0 : 0.5); };
const sd = (r, k, p) => { let m = 0; for (let j = k - p + 1; j <= k; j++) m += r[j]; m /= p; let v = 0; for (let j = k - p + 1; j <= k; j++) v += (r[j] - m) ** 2; return Math.sqrt(v / (p - 1)); };
const F = { near52: (s, k) => { let m = 0; for (let j = k - 251; j <= k; j++) if (s.h[j] > m) m = s.h[j]; return s.c[k] / m; }, intraday: (s, k) => { let t = 0; for (let j = k - 59; j <= k; j++) t += s.c[j] / s.o[j] - 1; return t / 60; }, lowvol: (s, k) => -sd(s.r, k, 250) };
const monthEnds = []; for (let i = 260; i < n - 1; i++) if (cal[i].slice(0, 7) !== cal[i + 1].slice(0, 7)) monthEnds.push(i);
const months = [];
for (let m = 0; m < monthEnds.length - 1; m++) {
  const k = monthEnds[m], k2 = monthEnds[m + 1], rows = [];
  for (const s of S) { if (k - 252 < s.first || k2 + 1 > s.last || !(s.c[k] >= MIN_PRICE)) continue; let t = 0; for (let j = k - 19; j <= k; j++) t += s.c[j] * s.v[j]; if (t / 20 < MIN_TURN) continue; if (s.bp[k2 + 2] - s.bp[k - 252] > 0) continue; if (!(s.o[k + 1] > 0) || !(s.v[k + 1] > 0) || !(s.o[k2 + 1] > 0)) continue; rows.push({ s, ret: s.o[k2 + 1] / s.o[k + 1] - 1 }); }
  if (rows.length < 30) continue;
  const mo = { k, k2, date: cal[k], rows, f: {} }; for (const f of Object.keys(F)) { const v = rows.map((r) => F[f](r.s, k)), mu = v.filter(Number.isFinite), m0 = mu.reduce((p, q) => p + q, 0) / mu.length, s0 = Math.sqrt(mu.reduce((p, q) => p + (q - m0) ** 2, 0) / mu.length) || 1; mo.f[f] = v.map((x) => (Number.isFinite(x) ? (x - m0) / s0 : 0)); } months.push(mo);
}
function portfolio(wts, N, useGate, buffer) {
  let prev = new Set(), prevW = new Map(), eq = 1, peak = 1, mdd = 0; const rets = [], dates = [], tos = [];
  for (const mo of months) {
    const sc = mo.rows.map((_, i) => Object.entries(wts).reduce((a, [f, w]) => a + w * mo.f[f][i], 0)), order = sc.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).map((x) => x[1]), top = new Set(order.slice(0, N)), keep = buffer ? new Set(order.slice(0, N * 2)) : top;
    const sel = []; mo.rows.forEach((r, i) => { if (prev.has(r.s.tk) && keep.has(i)) sel.push(i); }); for (const i of order.slice(0, N)) { if (sel.length >= N) break; if (!sel.includes(i)) sel.push(i); }
    const e = useGate ? gateAt(mo.k) : 1, w = new Map(); sel.forEach((i) => w.set(mo.rows[i].s.tk, e / sel.length)); let to = 0; new Set([...w.keys(), ...prevW.keys()]).forEach((t) => (to += Math.abs((w.get(t) || 0) - (prevW.get(t) || 0))));
    prev = new Set(sel.map((i) => mo.rows[i].s.tk)); prevW = w; const r = sel.reduce((a, i) => a + mo.rows[i].ret, 0) / (sel.length || 1) * e - COST * to; rets.push(r); dates.push(mo.date); tos.push(to); eq *= 1 + r; if (eq > peak) peak = eq; mdd = Math.min(mdd, eq / peak - 1);
  }
  return { rets, dates, mdd, to: tos.reduce((a, b) => a + b, 0) / tos.length * 12 };
}
const stat = (rets, dates, from, to) => { const r = rets.filter((_, i) => dates[i] >= from && dates[i] <= to); if (r.length < 12) return null; const g = r.reduce((a, x) => a * (1 + x), 1), m = r.reduce((a, b) => a + b, 0) / r.length, s = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1)); return { cagr: g ** (12 / r.length) - 1, sharpe: s ? m / s * Math.sqrt(12) : 0, n: r.length }; };
const ERAS = [["2001-07", "2001-01-01", "2007-12-31"], ["2008-14", "2008-01-01", "2014-12-31"], ["2015-20", "2015-01-01", "2020-12-31"], ["2021-26", "2021-01-01", "9999"], ["ทั้งหมด", "2001-01-01", "9999"]];
const pc = (x) => (x * 100).toFixed(1).padStart(5);
const ew = (() => { let prevW = new Map(); const rets = [], dates = []; for (const mo of months) { const w = new Map(); mo.rows.forEach((r) => w.set(r.s.tk, 1 / mo.rows.length)); let to = 0; new Set([...w.keys(), ...prevW.keys()]).forEach((t) => (to += Math.abs((w.get(t) || 0) - (prevW.get(t) || 0)))); prevW = w; rets.push(mo.rows.reduce((a, r) => a + r.ret, 0) / mo.rows.length - COST * to); dates.push(mo.date); } return { rets, dates, mdd: 0, to: 0 }; })();
const line = (name, p) => { let s = name.padEnd(36); for (const [, a, b] of ERAS) { const st = stat(p.rets, p.dates, a, b), se = stat(ew.rets, ew.dates, a, b); s += st ? ` ${pc(st.cagr)}(Δ${pc(st.cagr - se.cagr)}) Sh${st.sharpe.toFixed(2)}|` : " -|"; } return s + ` DD${pc(p.mdd)} TO${p.to.toFixed(1)}`; };
console.log(`หุ้นผ่านสภาพคล่อง ≥ ${MIN_TURN / 1e6} ล้านบาท/วัน · ต้นทุน ${(COST * 100).toFixed(2)}%/ข้าง · เฉลี่ยหุ้นในพูล ${(months.reduce((a, m) => a + m.rows.length, 0) / months.length).toFixed(0)} ตัว/เดือน`);
console.log("พอร์ต".padEnd(36), ERAS.map((e) => e[0].padEnd(22)).join(""));
console.log(line("EW ทั้งพูล (benchmark)", ew));
const out = {};
for (const [sn, wts] of Object.entries({ near52: { near52: 1 }, "near52+intraday": { near52: 1, intraday: 1 } })) for (const N of [10, 20, 30]) for (const buffer of [false, true]) for (const gate of [false, true]) { const name = `${sn} Top${N}${buffer ? " buffer" : ""}${gate ? " +Gate" : ""}`; const p = portfolio(wts, N, gate, buffer); console.log(line(name, p)); out[name] = { rets: p.rets, dates: p.dates, all: stat(p.rets, p.dates, "2001-01-01", "9999"), mdd: p.mdd, to: p.to, eras: ERAS.map(([e, a, b]) => [e, stat(p.rets, p.dates, a, b)]) }; }
out.__ew = { rets: ew.rets, dates: ew.dates }; out.__px = { dates: months.map((m) => m.date), ret: months.map((m) => PX[m.k2] / PX[m.k] - 1) };
fs.writeFileSync(path.join(ROOT, "data", `explore_th_portfolio2${TAG}_2026-10-10.json`), JSON.stringify(out));
