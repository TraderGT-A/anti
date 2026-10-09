// Port Champ — audit test suite (ไม่ต้องติดตั้งอะไร ใช้ node:test ในตัว)
//   รัน:  node --test tests/champ_audit.test.mjs
// ทดสอบ "ความสอดคล้อง/ความสมเหตุผล/การเชื่อมโยงข้อมูลจริง" ของข้อมูล + Dashboard โดยไม่แก้ระบบจริง
// เทสต์ที่ FAIL = ปัญหาที่ตรวจพบในระบบตอนนี้ (ดูรายงานประกอบ) — แก้แล้วต้องกลับมาเขียวเอง
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const MARKETS = [
  { name: "TH", bt: "data/champ_backtest_5y.json", pf: "data/champ_portfolio.json" },
  { name: "US", bt: "data/champ_us_backtest_5y.json", pf: "data/champ_us_portfolio.json" },
];

// ---------- ตัวช่วยคำนวณจากเส้น equity ----------
function stats(a, dates) {
  const yrs = (new Date(dates[dates.length - 1]) - new Date(dates[0])) / (365.25 * 864e5);
  const r = []; for (let i = 1; i < a.length; i++) r.push(a[i] / a[i - 1] - 1);
  const m = r.reduce((x, y) => x + y, 0) / r.length;
  const sd = Math.sqrt(r.reduce((x, y) => x + (y - m) ** 2, 0) / (r.length - 1));
  let pk = a[0], dd = 0; for (const v of a) { pk = Math.max(pk, v); dd = Math.min(dd, v / pk - 1); }
  return { cagr: (Math.pow(a[a.length - 1] / a[0], 1 / yrs) - 1) * 100, vol: sd * Math.sqrt(252) * 100, sharpe: (m / sd) * Math.sqrt(252), maxDD: dd * 100, ret: r };
}
const corr = (x, y) => { const n = x.length, mx = x.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); };

for (const M of MARKETS) {
  const bt = read(M.bt);

  test(`[${M.name}] summary ตรงกับที่คำนวณจาก trades ที่ปิดแล้ว (จำนวน/win rate)`, () => {
    const closed = bt.trades.filter((t) => !String(t.reason).startsWith("Open"));
    const wins = closed.filter((t) => t.profitPct > 0).length;
    assert.equal(bt.summary.totalTrades, closed.length);
    assert.ok(Math.abs(bt.summary.winRate - (wins / closed.length) * 100) < 0.2);
  });
  test(`[${M.name}] summary CAGR/MaxDD ตรงกับเส้น equity (ไม่เกิน 0.6 จุด)`, () => {
    const s = stats(bt.stratVals, bt.dates);
    assert.ok(Math.abs(s.cagr - bt.summary.cagr) < 0.6, `CAGR เส้น=${s.cagr.toFixed(2)} summary=${bt.summary.cagr}`);
    assert.ok(Math.abs(s.maxDD - bt.summary.maxDrawdown) < 0.6, `MaxDD เส้น=${s.maxDD.toFixed(2)} summary=${bt.summary.maxDrawdown}`);
  });

  test(`[${M.name}] โหมด 10/15/20 หุ้นต้องเป็นผลทดสอบแยกกันจริง (ไม่ใช่เส้นเดียวกันคูณค่าคงที่)`, () => {
    const a = stats(bt.stratVals10, bt.dates), b = stats(bt.stratVals15, bt.dates), c = stats(bt.stratVals20, bt.dates);
    const same = Math.abs(a.cagr - b.cagr) < 0.01 && Math.abs(b.cagr - c.cagr) < 0.01 && Math.abs(a.maxDD - c.maxDD) < 0.01;
    assert.ok(!same, `CAGR ${a.cagr.toFixed(2)}/${b.cagr.toFixed(2)}/${c.cagr.toFixed(2)} MaxDD ${a.maxDD.toFixed(2)}/${b.maxDD.toFixed(2)}/${c.maxDD.toFixed(2)} → เหมือนกันทุกตัว`);
    assert.ok(corr(a.ret, c.ret) < 0.9999, "ผลตอบแทนรายวัน N=10 กับ N=20 สัมพันธ์ 100% = copy คูณค่าคงที่");
  });

  test(`[${M.name}] ดัชนีเทียบ (benchmark) มีความผันผวนรายวันสมเหตุผล (หุ้น index จริง ≥ 8%/ปี)`, () => {
    const s = stats(bt.benchVals, bt.dates);
    assert.ok(s.vol >= 8, `benchmark vol = ${s.vol.toFixed(1)}%/ปี (SET/S&P จริงอยู่ราว 12–20%) → เส้นนี้ไม่ใช่ราคารายวันจริง`);
  });

  test(`[${M.name}] Sharpe ของกลยุทธ์ไม่สูงเกินจริง (≤ 3)`, () => {
    const s = stats(bt.stratVals, bt.dates);
    assert.ok(s.sharpe <= 3, `Sharpe รายวัน = ${s.sharpe.toFixed(2)} (vol ${s.vol.toFixed(1)}%/ปี แต่ MaxDD ${s.maxDD.toFixed(1)}%) → เส้นเรียบเกินจริง`);
  });

  test(`[${M.name}] ราคาเข้า/ออกใน trades เป็นราคาที่เกิดขึ้นจริงในข้อมูลราคารายวัน (ช่วงที่ถือ ±2%)`, () => {
    const cache = path.join(ROOT, "data", "bt_cache", `${M.name === "TH" ? "th" : "us"}_universe.json`);
    if (!fs.existsSync(cache)) return;   // ยังไม่ได้ดึงข้อมูล (node scripts/backtest_fetch_data.mjs) = ข้าม
    const u = JSON.parse(fs.readFileSync(cache, "utf8")).tickers; let tested = 0, ok = 0;
    for (const t of bt.trades) {
      const d = u[t.ticker]; if (!d) continue;
      const idx = d.t.map((x, i) => [x, i]).filter(([x]) => x >= t.entryDate && x <= t.exitDate).map(([, i]) => i);
      if (!idx.length) continue;
      const px = idx.flatMap((i) => [d.o[i], d.c[i]]), lo = Math.min(...px) * 0.98, hi = Math.max(...px) * 1.02;
      tested++; if (t.entryPrice >= lo && t.entryPrice <= hi && t.exitPrice >= lo && t.exitPrice <= hi) ok++;
    }
    assert.ok(tested > 0 && ok / tested > 0.98, `ตรง ${ok}/${tested}`);
  });
  test(`[${M.name}] จักรวาลหุ้นที่ถูกเทรดใน 5 ปีกว้างพอ (≥ 100 ตัว) — ไม่ใช่ลิสต์ผู้ชนะปัจจุบัน`, () => {
    const n = new Set(bt.trades.map((t) => t.ticker)).size;
    assert.ok(n >= 100, `เทรดแค่ ${n} ตัวตลอด 5 ปี (คู่มือบอก universe ~835 ตัว) → เสี่ยง survivorship/look-ahead สูง`);
  });
}

test("KPI 5 ปีบน Dashboard ต้องมาจากไฟล์ผลทดสอบ (summary.byMode) ไม่ใช่ตัวเลขที่ฝังในโค้ด", () => {
  const src = fs.readFileSync(path.join(ROOT, "scripts", "update_champ_snapshot.mjs"), "utf8");
  assert.ok(!/CAGR \+\d/.test(src) && !/Max Drawdown: -\d/.test(src), "พบตัวเลข CAGR/MaxDD ฝังตายในสคริปต์");
  assert.ok(/summary\.byMode/.test(src), "สคริปต์ต้องอ่าน KPI จาก summary.byMode");
  for (const M of MARKETS) { const bm = read(M.bt).summary.byMode; assert.ok(bm && bm[10] && bm[15] && bm[20], `[${M.name}] ไฟล์ผลทดสอบต้องมี byMode 10/15/20`); }
});

test("ไม่ฝังวันที่ตายตัว (2026-xx-xx) ในสคริปต์สร้าง Dashboard", () => {
  const src = fs.readFileSync(path.join(ROOT, "scripts", "update_champ_snapshot.mjs"), "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  assert.ok(!/'2026-\d\d-\d\d'/.test(src), "พบวันที่ฝังในโค้ด: " + (src.match(/'2026-\d\d-\d\d'/) || [""])[0]);
});

test("ผลทดสอบมาจากข้อมูลจริง: ไฟล์ backtest ระบุ method และไม่ได้สร้างจากตัวสุ่ม", () => {
  for (const M of MARKETS) { const m = read(M.bt).meta || {}; assert.equal(m.method, "real_daily_backtest", `[${M.name}] ไฟล์ผลทดสอบไม่มี meta.method = real_daily_backtest (ยังเป็นข้อมูลสังเคราะห์เดิม?)`); }
});
test("ไม่มีการสร้างแท่งเทียนปลอม (Math.random) ในเส้นทางที่แสดงบน Dashboard", () => {
  const src = fs.readFileSync(path.join(ROOT, "scripts", "update_champ_snapshot.mjs"), "utf8");
  assert.ok(!/Math\.random\(/.test(src), "พบ Math.random ใน update_champ_snapshot.mjs (generateFallbackCandles) → กราฟปลอมแสดงเหมือนจริง");
});

for (const M of MARKETS) {
  const pf = read(M.pf);
  test(`[${M.name}] บัญชีพอร์ต: เงินสด + มูลค่าถือครอง = มูลค่ารวม และ P&L = ส่วนต่างจากทุน`, () => {
    assert.ok(Math.abs(pf.cash_balance + pf.invested_value - pf.total_equity) < 1);
    assert.ok(Math.abs(pf.total_equity - pf.capital_base - pf.portfolio_pnl) < 1);
    assert.ok(Math.abs((pf.portfolio_pnl / pf.capital_base) * 100 - pf.portfolio_pnl_pct) < 0.02);
  });
}

test("[TH] Market Gate: stage/exposure ตรงกับกฎ SMA50/SMA200 ในคู่มือ", () => {
  const g = read("data/champ_portfolio.json").market_gate;
  const stage = g.close > g.sma50 && g.close > g.sma200 ? 2 : g.close < g.sma50 && g.close > g.sma200 ? 3 : g.close > g.sma50 && g.close < g.sma200 ? 1 : 4;
  const exp = { 2: 1, 1: 0.5, 3: 0.5, 4: 0 }[stage];   // exposure เก็บเป็นสัดส่วน 0–1
  assert.equal(g.stage, stage, `ควรเป็น Stage ${stage}`);
  assert.equal(g.exposure, exp);
});

test("[TH] ป้ายวันที่ของ snapshot ตรงกับวันของข้อมูลราคา (SET close ล่าสุด)", async () => {
  const pf = read("data/champ_portfolio.json");
  let idx; try { idx = await (await fetch("https://rsdashclean.vercel.app/api/index?market=thailand")).json(); } catch { return; /* ออฟไลน์ = ข้าม */ }
  const set = idx.indexes?.find((i) => i.key === "SET"); if (!set) return;
  const same = Math.abs(set.close - pf.market_gate.close) < 0.01;
  if (same) {   // ถ้าราคาปิดตรงกับ SET ล่าสุด วันที่ใน snapshot ต้องเป็นวันล่าสุดของดัชนีนั้น (ไม่ใช่วันก่อนหน้า)
    const d = new Date(set.updated_at); const lastTradingDay = (x) => { while ([0, 6].includes(x.getUTCDay())) x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };
    const bkk = new Date(d.getTime() + 7 * 3600e3); bkk.setUTCHours(0, 0, 0, 0);
    assert.equal(pf.last_updated, lastTradingDay(bkk), `snapshot ระบุ ${pf.last_updated} แต่ราคา SET ${set.close} เป็นของวันทำการล่าสุด`);
  }
});
