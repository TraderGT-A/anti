// Port Champ — REAL backtest (ข้อมูลราคาจริงรายวัน ไม่มีตัวสุ่ม/noise ในเส้น equity)
//   node scripts/backtest_fetch_data.mjs th|us     # ดึงราคาก่อน (ครั้งเดียว)
//   node scripts/backtest_real.mjs th|us           # รันและพิมพ์ผล + กลุ่มควบคุม
//   node scripts/backtest_real.mjs th --write      # เขียน data/champ_backtest_5y.json (schema เดิมของ Dashboard)
//
// กฎ = เหมือนโค้ดจริงใน scripts/update_champ_snapshot.mjs
//   สัญญาณ ณ ปิดวันทำการสุดท้ายของเดือน → ซื้อที่ "ราคาเปิด" วันทำการแรกของเดือนถัดไป (ไม่มี look-ahead)
//   Score = 0.3·1M + 0.3·3M + 0.2·6M + 0.2·1Y   RS = เปอร์เซ็นไทล์ (1–99) ในจักรวาลเดียวกัน (สูตรเดียวกับ rsdash)
//   ผ่านเกณฑ์: RS ≥ 70, Fresh (1W>0 และ 1M>0), สภาพคล่องเฉลี่ย 20 วัน ≥ เกณฑ์, ราคา ≥ เกณฑ์
//   เลือกจากคะแนนมาก→น้อย: เพดานเซกเตอร์ (2 ตัวใน 10 แรก / 4 ตัวใน 20 แรก) + ตัด corr 126 วัน > 0.55
//   น้ำหนัก = ตามคะแนน × exposure ของ Market Gate (Stage2=100%, Stage1/3=50%, Stage4=0% + ขายทิ้งทันทีเมื่อเข้า Stage4)
//   ถือข้ามเดือน ไม่มี stop-loss  ·  ค่าธรรมเนียม+สลิปเพจต่อข้าง: TH 0.25% / US 0.10%
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MK = (process.argv[2] || "th").toLowerCase(), isTH = MK === "th";
const WRITE = process.argv.includes("--write");
if (process.argv.includes("--readme")) globalThis.__FORMULA = "readme";   // สูตรตามคู่มือ: 0.4·3M + 0.3·6M + 0.3·1Y
const CFG = isTH
  ? { capital: 1_000_000, minPrice: 1, minTurn: 5e6, cost: 0.0025, out: "champ_backtest_5y.json", bench: "TDEX.BK (SET50 ETF)" }
  : { capital: 100_000, minPrice: 2, minTurn: 2e7, cost: 0.001, out: "champ_us_backtest_5y.json", bench: "S&P 500 (^GSPC)" };

const store = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "bt_cache", `${MK}_universe.json`), "utf8"));
const cal = store.index.t, n = cal.length;
const calIdx = new Map(cal.map((d, i) => [d, i]));
const IDX = Float64Array.from(store.index.c);

// ---- จัดแนวข้อมูลทุกตัวเข้ากับปฏิทินดัชนี ----
const T = [];   // {tk, sector, o, c, v}
for (const [tk, d] of Object.entries(store.tickers)) {
  const o = new Float64Array(n).fill(NaN), c = new Float64Array(n).fill(NaN), v = new Float64Array(n).fill(0);
  for (let i = 0; i < d.t.length; i++) { const k = calIdx.get(d.t[i]); if (k !== undefined) { o[k] = d.o[i]; c[k] = d.c[i]; v[k] = d.v[i]; } }
  T.push({ tk, sector: d.sector || "Other", name: d.name, o, c, v });
}
const sma = (a, k, p) => { if (k < p - 1) return NaN; let s = 0; for (let i = k - p + 1; i <= k; i++) s += a[i]; return s / p; };
const stageAt = (k) => { const c = IDX[k], s50 = sma(IDX, k, 50), s200 = sma(IDX, k, 200); if (!(s200 > 0)) return { stage: 0, exp: 0 };
  if (c > s50 && c > s200) return { stage: 2, exp: 1 }; if (c <= s50 && c <= s200) return { stage: 4, exp: 0 }; if (c > s50) return { stage: 1, exp: 0.5 }; return { stage: 3, exp: 0.5 }; };

// ---- ฟีเจอร์ ณ วันสัญญาณ k ----
const OFFS = { w: 5, m: 21, q: 63, h: 126, y: 252 };
function features(k) {
  const rows = [];
  for (const s of T) {
    const c = s.c; const cur = c[k];
    if (!(cur > 0)) continue;
    const r = {}; let ok = true;
    for (const [key, off] of Object.entries(OFFS)) { const p = c[k - off]; if (!(p > 0)) { ok = false; break; } r[key] = (cur / p - 1) * 100; }
    if (!ok) continue;
    let turn = 0, cnt = 0; for (let i = k - 19; i <= k; i++) if (c[i] > 0) { turn += c[i] * s.v[i]; cnt++; }
    rows.push({ s, price: cur, ...r, score: (globalThis.__FORMULA === "readme" ? 0.4 * r.q + 0.3 * r.h + 0.3 * r.y : 0.3 * r.m + 0.3 * r.q + 0.2 * r.h + 0.2 * r.y), turn: cnt ? turn / cnt : 0 });
  }
  rows.sort((a, b) => b.score - a.score);
  rows.forEach((x, i) => { x.rs = Math.max(1, Math.min(99, Math.round(((rows.length - i) / rows.length) * 99))); });
  return rows;
}
function corr126(a, b, k) {
  const xs = [], ys = [];
  for (let i = k - 125; i <= k; i++) { const a0 = a.c[i - 1], a1 = a.c[i], b0 = b.c[i - 1], b1 = b.c[i]; if (a0 > 0 && a1 > 0 && b0 > 0 && b1 > 0) { xs.push(a1 / a0 - 1); ys.push(b1 / b0 - 1); } }
  if (xs.length < 60) return 0;
  const m = (z) => z.reduce((p, q) => p + q, 0) / z.length, mx = m(xs), my = m(ys); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

// ---- เลือกหุ้น (ตามกฎจริง) ----
function eligible(rows, opt) {
  return rows.filter((x) => x.rs >= (opt.rsMin ?? 70) && (opt.fresh === false || (x.w > 0 && x.m > 0)) && x.price >= CFG.minPrice && x.turn >= CFG.minTurn);
}
function pick(rows, k, opt, rng) {
  let cand = eligible(rows, opt);
  if (opt.random) { cand = [...cand]; for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; } }
  const sel = [], secCnt = {};
  for (const c of cand) {
    if (sel.length >= 20) break;
    if (opt.sectorCap !== false) { const cap = sel.length < 10 ? 2 : 4; if ((secCnt[c.s.sector] || 0) >= cap) continue; }
    if (opt.corr !== false && sel.some((p) => corr126(c.s, p.s, k) > 0.55)) continue;
    sel.push(c); secCnt[c.s.sector] = (secCnt[c.s.sector] || 0) + 1;
  }
  return sel;
}

// ---- สร้างปฏิทินรีบาลานซ์ ----
const first = cal.findIndex((d) => d >= "2021-10-01");
const rebal = []; for (let i = Math.max(first, 253); i < n; i++) if (cal[i].slice(0, 7) !== cal[i - 1].slice(0, 7)) rebal.push(i);
const START = rebal[0];

function run(opt = {}) {
  const N = opt.N || 10, cost = opt.cost ?? CFG.cost, useGate = opt.gate !== false;
  const rng = opt.seed != null ? mulberry(opt.seed) : null;
  let cash = CFG.capital, pos = [];   // {s, sh, entryIdx, entryPx}
  const eq = new Float64Array(n).fill(NaN), trades = [], monthly = [], stages = [];
  const rebalSet = new Set(rebal);
  const mark = (i) => { let v = cash; for (const p of pos) { let px = p.s.c[i]; if (!(px > 0)) { let j = i; while (j > 0 && !(p.s.c[j] > 0)) j--; px = p.s.c[j]; } v += p.sh * px; } return v; };
  const sellAll = (i, reason) => {
    for (const p of pos) { let px = p.s.o[i]; if (!(px > 0)) px = p.s.c[i - 1]; if (!(px > 0)) px = p.entryPx; cash += p.sh * px * (1 - cost);
      trades.push({ ticker: p.s.tk, entryDate: cal[p.entryIdx], entryPrice: r2(p.entryPx), exitDate: cal[i], exitPrice: r2(px), reason, profitPct: r2((px / p.entryPx - 1) * 100) }); }
    pos = [];
  };
  let lastMonthEq = CFG.capital, lastMonthBench = null, lastMonthKey = null, benchBase = null;
  for (let i = START; i < n; i++) {
    // ขายทิ้งเมื่อเข้า Stage 4 (ตัดสินจากปิดเมื่อวาน → ขายที่เปิดวันนี้)
    if (useGate && pos.length && !rebalSet.has(i) && stageAt(i - 1).stage === 4) sellAll(i, "Market Gate Stage 4 (Sell All)");
    if (rebalSet.has(i)) {
      const k = i - 1, g = useGate ? stageAt(k) : { stage: 2, exp: 1 };
      stages.push({ month: cal[i].slice(0, 7), stage: g.stage });
      let sel = [];
      if (g.exp > 0) { const rows = features(k); sel = pick(rows, k, opt, rng).slice(0, N); }
      const tot = opt.weight === "equal" ? sel.length : sel.reduce((a, x) => a + x.score, 0), keep = new Set(sel.map((x) => x.s.tk));
      // 1) ขายตัวที่หลุดรอบนี้ทั้งหมด
      const stay = []; const gone = pos.filter((p) => { if (keep.has(p.s.tk)) { stay.push(p); return false; } return true; });
      const pos0 = pos; pos = gone; sellAll(i, "Monthly Rebalance"); pos = stay;
      // 2) มูลค่าพอร์ต ณ ราคาเปิดวันนี้ → เป้าหมายรายตัว แล้วซื้อ/ขายเฉพาะส่วนต่าง (ตัวที่ถืออยู่เดิมไม่เสียค่าธรรมเนียมซ้ำ)
      const openPx = (s) => (s.o[i] > 0 ? s.o[i] : s.c[i - 1]);
      let eqOpen = cash; for (const p of pos) eqOpen += p.sh * openPx(p.s);
      const budget = eqOpen * g.exp;
      for (const x of sel) {
        const px = openPx(x.s); if (!(px > 0)) continue;
        const w = (opt.weight === "equal" ? 1 : x.score) / tot, targetVal = budget * w, ex = pos.find((p) => p.s.tk === x.s.tk);
        if (ex) {
          const curVal = ex.sh * px, delta = targetVal - curVal;
          if (delta > 0) { const sh = delta / px / (1 + cost); cash -= sh * px * (1 + cost); ex.entryPx = (ex.entryPx * ex.sh + px * sh) / (ex.sh + sh); ex.sh += sh; }
          else if (delta < 0) { const sh = Math.min(ex.sh, -delta / px); cash += sh * px * (1 - cost); ex.sh -= sh; }
        } else { const sh = targetVal / px / (1 + cost); cash -= sh * px * (1 + cost); pos.push({ s: x.s, sh, entryIdx: i, entryPx: px }); }
      }
    }    eq[i] = mark(i);
    if (benchBase == null) benchBase = IDX[i];
    const key = cal[i].slice(0, 7), nextKey = i + 1 < n ? cal[i + 1].slice(0, 7) : null;
    if (key !== nextKey) {   // สิ้นเดือน
      const bench = CFG.capital * IDX[i] / benchBase, st = stages.length ? stages[stages.length - 1].stage : 0;
      if (lastMonthBench == null) lastMonthBench = CFG.capital;
      monthly.push({ Month: key, StrategyReturn: r2((eq[i] / lastMonthEq - 1) * 100), BenchmarkReturn: r2((bench / lastMonthBench - 1) * 100), Alpha: 0, StrategyVal: Math.round(eq[i]), BenchmarkVal: Math.round(bench), Stage: st });
      monthly[monthly.length - 1].Alpha = r2(monthly[monthly.length - 1].StrategyReturn - monthly[monthly.length - 1].BenchmarkReturn);
      lastMonthEq = eq[i]; lastMonthBench = bench;
    }
  }
  const lastI = n - 1; if (pos.length) { for (const p of pos) { const px = p.s.c[lastI] > 0 ? p.s.c[lastI] : p.entryPx; trades.push({ ticker: p.s.tk, entryDate: cal[p.entryIdx], entryPrice: r2(p.entryPx), exitDate: cal[lastI], exitPrice: r2(px), reason: "Open Position (mark-to-market)", profitPct: r2((px / p.entryPx - 1) * 100) }); } }
  const dates = [], vals = [], bvals = [];
  for (let i = START; i < n; i++) { dates.push(cal[i]); vals.push(eq[i]); bvals.push(CFG.capital * IDX[i] / IDX[START]); }
  return { dates, vals, bvals, trades, monthly, stages };
}
const r2 = (x) => Math.round(x * 100) / 100;
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function metrics(vals, dates) {
  const yrs = (new Date(dates[dates.length - 1]) - new Date(dates[0])) / (365.25 * 864e5);
  const r = []; for (let i = 1; i < vals.length; i++) r.push(vals[i] / vals[i - 1] - 1);
  const m = r.reduce((a, b) => a + b, 0) / r.length, sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1));
  let pk = vals[0], dd = 0; for (const v of vals) { pk = Math.max(pk, v); dd = Math.min(dd, v / pk - 1); }
  return { cagr: (Math.pow(vals[vals.length - 1] / vals[0], 1 / yrs) - 1) * 100, vol: sd * Math.sqrt(252) * 100, sharpe: sd ? (m / sd) * Math.sqrt(252) : 0, maxDD: dd * 100, total: (vals[vals.length - 1] / vals[0] - 1) * 100, yrs };
}
const fmt = (m) => `CAGR ${m.cagr.toFixed(1).padStart(6)}%  total ${m.total.toFixed(0).padStart(5)}%  vol ${m.vol.toFixed(1).padStart(5)}%  Sharpe ${m.sharpe.toFixed(2).padStart(5)}  MaxDD ${m.maxDD.toFixed(1).padStart(6)}%`;

// =========================== รันหลัก ===========================
const main = {}; for (const N of [10, 15, 20]) main[N] = run({ N });
const bm = metrics(main[10].bvals, main[10].dates);
console.log(`\n=== ${isTH ? "ไทย" : "สหรัฐฯ"} · ${main[10].dates[0]} → ${main[10].dates.at(-1)} (${bm.yrs.toFixed(2)} ปี) · จักรวาล ${T.length} หุ้น · ${rebal.length} รอบรีบาลานซ์ · ค่าธรรมเนียม ${(CFG.cost * 100).toFixed(2)}%/ข้าง ===`);
console.log("Benchmark buy&hold ".padEnd(34), fmt(bm), " ←", CFG.bench);
for (const N of [10, 15, 20]) console.log(`Champion N=${N} (กฎจริง)`.padEnd(34), fmt(metrics(main[N].vals, main[N].dates)));

if (!WRITE) {
  console.log("\n--- ทดลองแยกองค์ประกอบ (N=10) ---");
  const tests = [["ไม่มี Market Gate", { gate: false }], ["น้ำหนักเท่ากัน", { weight: "equal" }], ["ไม่มีค่าธรรมเนียม", { cost: 0 }], ["ไม่มีตัวกรอง corr/sector", { corr: false, sectorCap: false }], ["ไม่ต้อง Fresh (1W,1M>0)", { fresh: false }]];
  for (const [name, o] of tests) console.log(name.padEnd(34), fmt(metrics(run({ N: 10, ...o }).vals, main[10].dates)));
  // ครึ่งแรก/ครึ่งหลัง (out-of-sample)
  const h = Math.floor(main[10].vals.length / 2);
  console.log("\n--- แบ่งช่วงเวลา (N=10) ---");
  console.log(`ครึ่งแรก ${main[10].dates[0]}→${main[10].dates[h]}`.padEnd(34), fmt(metrics(main[10].vals.slice(0, h), main[10].dates.slice(0, h))), "| bench", metrics(main[10].bvals.slice(0, h), main[10].dates.slice(0, h)).cagr.toFixed(1) + "%");
  console.log(`ครึ่งหลัง ${main[10].dates[h]}→${main[10].dates.at(-1)}`.padEnd(34), fmt(metrics(main[10].vals.slice(h), main[10].dates.slice(h))), "| bench", metrics(main[10].bvals.slice(h), main[10].dates.slice(h)).cagr.toFixed(1) + "%");
  // กลุ่มควบคุมสุ่ม: ใช้ gate/ค่าธรรมเนียม/จำนวนหุ้นเดียวกัน แต่สุ่มเลือกจากหุ้นที่ผ่านเกณฑ์ RS≥70+Fresh — ถ้ากลยุทธ์ดีจริงต้องชนะการสุ่มอย่างมีนัย
  const SEEDS = 60, rc = [];
  for (let s = 1; s <= SEEDS; s++) rc.push(metrics(run({ N: 10, random: true, seed: s * 7919 }).vals, main[10].dates).cagr);
  rc.sort((a, b) => a - b); const mine = metrics(main[10].vals, main[10].dates).cagr;
  console.log(`\n--- กลุ่มควบคุมสุ่ม ${SEEDS} ครั้ง (สุ่มเลือก 10 ตัวจากกลุ่มที่ผ่านเกณฑ์เดียวกัน) ---`);
  console.log(`CAGR สุ่ม: min ${rc[0].toFixed(1)}  p25 ${rc[Math.floor(SEEDS * .25)].toFixed(1)}  median ${rc[Math.floor(SEEDS / 2)].toFixed(1)}  p75 ${rc[Math.floor(SEEDS * .75)].toFixed(1)}  max ${rc.at(-1).toFixed(1)}  | Champion ${mine.toFixed(1)} → อยู่เปอร์เซ็นไทล์ ${(rc.filter((x) => x < mine).length / SEEDS * 100).toFixed(0)} ของการสุ่ม`);
  // นัยสำคัญของ alpha รายเดือน
  const al = main[10].monthly.map((m) => m.Alpha), ma = al.reduce((a, b) => a + b, 0) / al.length, sa = Math.sqrt(al.reduce((a, b) => a + (b - ma) ** 2, 0) / (al.length - 1));
  console.log(`Alpha รายเดือนเฉลี่ย ${ma.toFixed(2)}% (sd ${sa.toFixed(2)}%) · t-stat = ${(ma / (sa / Math.sqrt(al.length))).toFixed(2)} (|t|<2 = แยกจากโชคไม่ออก) · เดือนที่ชนะดัชนี ${al.filter((x) => x > 0).length}/${al.length}`);
  const t = main[10].trades.filter((x) => !x.reason.startsWith("Open")), w = t.filter((x) => x.profitPct > 0);
  console.log(`เทรดปิดแล้ว ${t.length} · win rate ${(w.length / t.length * 100).toFixed(1)}% · เฉลี่ย ${(t.reduce((a, x) => a + x.profitPct, 0) / t.length).toFixed(2)}% ต่อเทรด · จำนวนหุ้นที่เคยถือ ${new Set(t.map((x) => x.ticker)).size} ตัว`);
  const stg = {}; for (const s of main[10].stages) stg[s.stage] = (stg[s.stage] || 0) + 1; console.log("เดือนต่อ Stage:", JSON.stringify(stg));
}

if (WRITE) {
  const mkSeries = (N) => { const o = main[N]; const dd = []; let pk = -Infinity; for (const v of o.vals) { pk = Math.max(pk, v); dd.push(r2((v / pk - 1) * 100)); } return { vals: o.vals.map((v) => Math.round(v * 100) / 100), dd }; };
  const s10 = mkSeries(10), s15 = mkSeries(15), s20 = mkSeries(20);
  const bdd = []; { let pk = -Infinity; for (const v of main[10].bvals) { pk = Math.max(pk, v); bdd.push(r2((v / pk - 1) * 100)); } }
  const tr = main[10].trades, closed = tr.filter((t) => !t.reason.startsWith("Open")), wins = closed.filter((t) => t.profitPct > 0), losses = closed.filter((t) => t.profitPct < 0);
  const m10 = metrics(main[10].vals, main[10].dates), by = {};
  for (const t of closed) { (by[t.ticker] = by[t.ticker] || { ticker: t.ticker, trades: 0, sumPct: 0 }); by[t.ticker].trades++; by[t.ticker].sumPct += t.profitPct; }
  const tick = Object.values(by).map((x) => ({ ...x, sumPct: r2(x.sumPct), avgPct: r2(x.sumPct / x.trades) })).sort((a, b) => b.sumPct - a.sumPct);
  const reasons = {}; for (const t of closed) reasons[t.reason] = (reasons[t.reason] || 0) + 1;
  const sumW = wins.reduce((a, t) => a + t.profitPct, 0), sumL = Math.abs(losses.reduce((a, t) => a + t.profitPct, 0));
  const out = {
    meta: { method: "real_daily_backtest", generator: "scripts/backtest_real.mjs", generated_at: new Date().toISOString(), data_source: "Yahoo daily OHLCV + TradingView sectors", universe: `${T.length} tickers (เฉพาะที่ยังซื้อขายอยู่วันนี้ — มี survivorship bias เล็กน้อย)`, benchmark: CFG.bench, cost_per_side_pct: CFG.cost * 100, signal: "ปิดวันสุดท้ายของเดือน → ซื้อที่เปิดวันทำการแรกของเดือนถัดไป", period: [main[10].dates[0], main[10].dates.at(-1)], warning: "ผลในอดีตไม่ใช่การรับประกันอนาคต" },
    dates: main[10].dates, stratVals: s10.vals, stratVals10: s10.vals, stratVals15: s15.vals, stratVals20: s20.vals, benchVals: main[10].bvals.map((v) => Math.round(v * 100) / 100),
    stratDD: s10.dd, stratDD10: s10.dd, stratDD15: s15.dd, stratDD20: s20.dd, benchDD: bdd,
    trades: tr, monthly: main[10].monthly,
    summary: { totalTrades: closed.length, wins: wins.length, losses: losses.length, breakeven: closed.length - wins.length - losses.length, winRate: r2(wins.length / closed.length * 100), profitFactor: r2(sumW / (sumL || 1)),
      avgWin: r2(sumW / (wins.length || 1)), avgLoss: r2(sumL / (losses.length || 1)), winLossRatio: r2((sumW / (wins.length || 1)) / ((sumL / (losses.length || 1)) || 1)),
      bestTrade: closed.reduce((a, t) => (t.profitPct > a.profitPct ? t : a), closed[0]), worstTrade: closed.reduce((a, t) => (t.profitPct < a.profitPct ? t : a), closed[0]),
      reasons: Object.entries(reasons).map(([reason, count]) => ({ reason, count })), topTickers: tick.slice(0, 10), worstTickers: tick.slice(-5).reverse(),
      maxDrawdown: r2(m10.maxDD), endingCapital: Math.round(main[10].vals.at(-1)), totalReturnPct: r2(m10.total), cagr: r2(m10.cagr), sharpe: r2(m10.sharpe), volatility: r2(m10.vol),
      byMode: { 10: sum(main[10]), 15: sum(main[15]), 20: sum(main[20]) }, benchmark: sum({ vals: main[10].bvals, dates: main[10].dates }) },
  };
  function sum(o) { const m = metrics(o.vals, o.dates); return { cagr: r2(m.cagr), maxDrawdown: r2(m.maxDD), sharpe: r2(m.sharpe), totalReturnPct: r2(m.total), volatility: r2(m.vol) }; }
  fs.writeFileSync(path.join(ROOT, "data", CFG.out), JSON.stringify(out));
  console.log("\nwrote data/" + CFG.out, "| summary", JSON.stringify({ cagr: out.summary.cagr, dd: out.summary.maxDrawdown, sharpe: out.summary.sharpe, trades: out.summary.totalTrades }));
}
