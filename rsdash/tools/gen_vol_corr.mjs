// สร้าง vol_<mk>.json (ความผันผวน 21 วันทำการ annualized + bucket เงียบ/ปกติ/แกว่ง + ทิศ)
// และ corr_<mk>.json (คู่ที่วิ่งพร้อมกัน corr 126 วันทำการ > 0.70) — สูตรเดียวกับ gen_vol.py / gen_corr.py ของไทยทุกประการ
//
// ใช้:  node tools/gen_vol_corr.mjs us            (ดึงแท่ง 1Y ของ S&P 500 จาก /api/chart แล้วคำนวณ)
//       node tools/gen_vol_corr.mjs us <ไฟล์.json> (ใช้ daily json รูปแบบ {TK:{dates,close}} แทนการดึง)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.OUT_DIR || path.join(HERE, "..");
const BASE = process.env.RS_BASE || "https://rsdashclean.vercel.app";
const [, , mkArg = "us", srcFile] = process.argv;
const MK = mkArg === "th" ? "thailand" : "america";
const SUFFIX = mkArg === "th" ? "th" : "us";
const TAU = 21, ANNUAL = Math.sqrt(252), LOOKBACK = 126, TH = 0.70;

function std(a) { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); }

async function loadStore() {
  if (srcFile) return JSON.parse(fs.readFileSync(srcFile, "utf8"));
  // รายชื่อ: ใช้สมาชิก S&P 500 สดจาก API (เฉพาะ US) — ไทยให้ใช้ gen_vol.py/gen_corr.py เดิม หรือส่งไฟล์เอง
  const ix = await (await fetch(BASE + "/api/scan?universe=indexes")).json();
  const syms = ix.sp500;
  console.log("tickers:", syms.length);
  const store = {};
  let i = 0, fail = 0;
  async function worker() {
    while (i < syms.length) {
      const tk = syms[i++];
      for (let a = 0; a < 3; a++) {
        try {
          const j = await (await fetch(`${BASE}/api/chart?market=${MK}&symbol=${encodeURIComponent(tk)}&interval=1d&range=1y`)).json();
          const b = j.data || [];
          if (b.length >= TAU * 2 + 2) store[tk] = { dates: b.map((x) => x.time), close: b.map((x) => x.close) };
          else fail++;
          break;
        } catch (e) { await new Promise((r) => setTimeout(r, 500 * (a + 1))); }
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  console.log("loaded:", Object.keys(store).length, "failed/short:", fail);
  return store;
}

const store = await loadStore();

// ---- volatility ----
const tick = {};
for (const [tk, v] of Object.entries(store)) {
  const cl = v.close;
  if (!cl || cl.length < TAU * 2 + 2) continue;
  const vol = (end) => {
    const w = [];
    for (let i = end - TAU + 1; i <= end; i++) if (i >= 1 && cl[i - 1]) w.push(cl[i] / cl[i - 1] - 1);
    return w.length < Math.floor(TAU / 2) ? null : std(w) * ANNUAL * 100;
  };
  const now = vol(cl.length - 1), prev = vol(cl.length - 1 - TAU);
  if (now == null) continue;
  tick[tk] = { v: Math.round(now * 10) / 10, vs: prev != null ? Math.round(prev * 10) / 10 : null };
}
const vs = Object.values(tick).map((o) => o.v).sort((a, b) => a - b);
const q33 = vs[Math.floor(vs.length / 3)], q66 = vs[Math.floor((2 * vs.length) / 3)];
for (const o of Object.values(tick)) {
  o.b = o.v <= q33 ? "riom" : o.v <= q66 ? "norm" : "wild";
  o.d = o.vs != null && o.v > o.vs * 1.05 ? "up" : o.vs != null && o.v < o.vs * 0.95 ? "down" : "flat";
}
const asOf = Object.values(store).map((v) => v.dates?.[v.dates.length - 1]).filter(Boolean).sort().pop();
fs.writeFileSync(path.join(ROOT, `vol_${SUFFIX}.json`), JSON.stringify({ generated: SUFFIX, as_of: asOf, window_days: TAU, tick, q: { low: Math.round(q33 * 10) / 10, hi: Math.round(q66 * 10) / 10 } }));
console.log("vol:", Object.keys(tick).length, "q33/q66", q33.toFixed(1), q66.toFixed(1), "as_of", asOf);

// ---- correlation (pairwise บนวันที่ซ้อนกันของ 126 วันล่าสุด) ----
const allDates = [...new Set(Object.values(store).flatMap((v) => v.dates || []))].sort().slice(-LOOKBACK - 1);
const idx = new Map(allDates.map((d, i) => [d, i]));
const rets = {};
for (const [tk, v] of Object.entries(store)) {
  if (!v.close || v.close.length < LOOKBACK + 20) continue;
  const r = new Array(allDates.length).fill(null);
  for (let i = 1; i < v.dates.length; i++) {
    const k = idx.get(v.dates[i]);
    if (k !== undefined && v.close[i - 1]) r[k] = v.close[i] / v.close[i - 1] - 1;
  }
  rets[tk] = r.slice(1);   // ตัดแท่งแรก (ไม่มี return) = 126 วัน
}
const syms = Object.keys(rets), pairs = [], best = {};
for (let a = 0; a < syms.length; a++) {
  const x = rets[syms[a]];
  for (let b = a + 1; b < syms.length; b++) {
    const y = rets[syms[b]];
    let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (let k = 0; k < x.length; k++) { const p = x[k], q = y[k]; if (p == null || q == null) continue; n++; sx += p; sy += q; sxx += p * p; syy += q * q; sxy += p * q; }
    if (n < 60) continue;
    const den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
    if (!den) continue;
    const c = (n * sxy - sx * sy) / den;
    if (c > TH) {
      const A = syms[a], B = syms[b], cc = Math.round(c * 1000) / 1000;
      pairs.push([A, B, cc]);
      if (!best[A] || c > best[A][1]) best[A] = [B, cc];
      if (!best[B] || c > best[B][1]) best[B] = [A, cc];
    }
  }
}
pairs.sort((p, q) => q[2] - p[2]);
fs.writeFileSync(path.join(ROOT, `corr_${SUFFIX}.json`), JSON.stringify({ generated: SUFFIX, as_of: asOf, window_days: LOOKBACK, thr: TH, pairs, best }));
console.log("corr pairs >", TH, ":", pairs.length, "| top:", pairs.slice(0, 3).map((p) => p.join("-")).join(", "));
