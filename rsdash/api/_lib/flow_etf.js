// /api/etfhist?set=cross|sector|country — ราคาปิดรายวัน (Yahoo) ของชุดสินทรัพย์ สำหรับหน้า "เงินไหล" (Cross-Asset, Rotation US, Cross Market ประเทศ)
// ตอบ { dates:[YYYY-MM-DD...], series:{ตัวย่อ:[ปิด...]}, meta:[{k,n,g,...}] } — ทุกชุดจัดแนวตามวันที่เดียวกัน (ตัดเสาร์-อาทิตย์, เติมค่าล่าสุดข้ามวันหยุด)
// ไม่มี key/ไม่ใช้ LLM · ชุดรายชื่อ ETF ประเทศมาจาก research/etf/candidates.json (กฎ: สภาพคล่อง → ค่าธรรมเนียมต่ำสุด) — แก้ที่นี่เมื่อรายชื่อเปลี่ยน
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

// g = กลุ่มที่โชว์ในแท่ง Cross-Asset
const CROSS = [
  ["ES=F", "S&P 500 (หุ้นใหญ่สหรัฐ)", "Equity"], ["NQ=F", "Nasdaq 100 (หุ้นเทคสหรัฐ)", "Equity"], ["RTY=F", "Russell 2000 (หุ้นเล็กสหรัฐ)", "Equity"], ["YM=F", "Dow 30 (ดาวโจนส์)", "Equity"],
  ["^N225", "Nikkei 225 (ญี่ปุ่น)", "Equity"], ["^GDAXI", "DAX (เยอรมนี)", "Equity"], ["^FTSE", "FTSE 100 (อังกฤษ)", "Equity"], ["^HSI", "Hang Seng (ฮ่องกง)", "Equity"], ["^KS11", "KOSPI (เกาหลีใต้)", "Equity"], ["^NSEI", "Nifty 50 (อินเดีย)", "Equity"], ["^SET.BK", "SET (ไทย)", "Equity"],
  ["^TNX", "10Y Treasury Yield (ผลตอบแทนพันธบัตร 10 ปี)", "Rates"], ["DX-Y.NYB", "US Dollar Index (ดัชนีดอลลาร์ DXY)", "FX"], ["EURUSD=X", "EUR/USD (ยูโร)", "FX"], ["JPY=X", "USD/JPY (เยน)", "FX"], ["GBPUSD=X", "GBP/USD (ปอนด์)", "FX"], ["AUDUSD=X", "AUD/USD (ดอลลาร์ออสเตรเลีย)", "FX"], ["THB=X", "USD/THB (บาท)", "FX"],
  ["CL=F", "Crude Oil WTI (น้ำมันดิบ WTI)", "Energy"], ["BZ=F", "Brent Crude (น้ำมันเบรนท์)", "Energy"], ["NG=F", "Natural Gas (ก๊าซธรรมชาติ)", "Energy"], ["RB=F", "Gasoline RBOB (น้ำมันเบนซิน)", "Energy"], ["HO=F", "Heating Oil (น้ำมันฮีตติ้ง)", "Energy"],
  ["GC=F", "Gold (ทองคำ)", "Metals"], ["SI=F", "Silver (เงิน)", "Metals"], ["PL=F", "Platinum (แพลทินัม)", "Metals"], ["PA=F", "Palladium (แพลเลเดียม)", "Metals"], ["HG=F", "Copper (ทองแดง)", "Metals"],
  ["ZC=F", "Corn (ข้าวโพด)", "Agri"], ["ZW=F", "Wheat (ข้าวสาลี)", "Agri"], ["ZS=F", "Soybeans (ถั่วเหลือง)", "Agri"], ["KC=F", "Coffee (กาแฟ)", "Agri"], ["CC=F", "Cocoa (โกโก้)", "Agri"], ["SB=F", "Sugar (น้ำตาล)", "Agri"], ["CT=F", "Cotton (ฝ้าย)", "Agri"],
  ["BTC-USD", "Bitcoin (บิตคอยน์)", "Crypto"], ["ETH-USD", "Ethereum (อีเธอเรียม)", "Crypto"], ["^VIX", "VIX (ดัชนีความกลัว)", "Volatility"],
].map(([k, n, g]) => ({ k, n, g }));

const SECTORS = [["XLK", "Technology"], ["XLF", "Financials"], ["XLV", "Health Care"], ["XLY", "Consumer Discretionary"], ["XLP", "Consumer Staples"], ["XLE", "Energy"], ["XLI", "Industrials"], ["XLB", "Materials"], ["XLU", "Utilities"], ["XLRE", "Real Estate"], ["XLC", "Communication Services"]]
  .map(([k, n]) => ({ k, n }));
const SECTOR_BENCH = { k: "SPY", n: "S&P 500 (SPY)" };

// ETF ตัวแทน: [ตัวแทน, กลุ่ม, ชนิด, สกุลเงินท้องถิ่น = [คู่ Yahoo, ผกผันไหม(true = คู่คือ USD ต่อ 1 หน่วยท้องถิ่น)]]
const J = ["JPY=X", false], K = ["KRW=X", false], T = ["TWD=X", false], C = ["CNY=X", false], H = ["HKD=X", false], I = ["INR=X", false], S = ["SGD=X", false], E = ["EURUSD=X", true], G = ["GBPUSD=X", true], A = ["AUDUSD=X", true], CA = ["CAD=X", false], CH = ["CHF=X", false], B = ["BRL=X", false], M = ["MXN=X", false];
const COUNTRY = [
  ["VOO", "US · S&P 500 (หุ้นใหญ่สหรัฐ)", "index"], ["QQQM", "US · Nasdaq 100 (หุ้นเทคสหรัฐ)", "index"], ["DIA", "US · Dow 30 (ดาวโจนส์)", "index"], ["VTWO", "US · Russell 2000 (หุ้นเล็ก)", "index"], ["VO", "US · Mid cap (หุ้นขนาดกลาง)", "index"], ["RSP", "US · S&P 500 Equal-weight (ถ่วงเท่ากัน)", "index"],
  ["FLJP", "Japan (ญี่ปุ่น)", "country", J], ["MCHI", "China MSCI (จีน)", "country", C], ["FXI", "China · FTSE 50 (จีนหุ้นใหญ่)", "index", C], ["ASHR", "China · CSI 300 (จีนแผ่นดินใหญ่)", "index", C], ["KWEB", "China · Internet (เน็ตจีน)", "index", C], ["EWH", "Hong Kong (ฮ่องกง)", "country", H],
  ["INDA", "India (อินเดีย)", "country", I], ["FLKR", "South Korea (เกาหลีใต้)", "country", K], ["FLTW", "Taiwan (ไต้หวัน)", "country", T], ["EWS", "Singapore (สิงคโปร์)", "country", S],
  ["EWG", "Germany (เยอรมนี)", "country", E], ["EWU", "United Kingdom (อังกฤษ)", "country", G], ["EWL", "Switzerland (สวิตเซอร์แลนด์)", "country", CH], ["FEZ", "Eurozone · Euro Stoxx 50 (ยูโรโซน)", "index", E], ["VGK", "Europe (ยุโรป · ใช้แทนฝรั่งเศส)", "region", E],
  ["EWC", "Canada (แคนาดา)", "country", CA], ["EWA", "Australia (ออสเตรเลีย)", "country", A], ["EWZ", "Brazil (บราซิล)", "country", B], ["EWW", "Mexico (เม็กซิโก)", "country", M],
  ["AAXJ", "Asia ex-Japan (เอเชียนอกญี่ปุ่น · ใช้แทน TH/VN/ID/MY/PH)", "region"], ["VPL", "Asia Pacific (เอเชียแปซิฟิก)", "region"], ["VWO", "Emerging Markets (ตลาดเกิดใหม่ · ใช้แทน SA/ZA/TR)", "region"], ["ILF", "Latin America (ละตินอเมริกา)", "region"],
  ["VEA", "Developed ex-US (พัฒนาแล้วนอกสหรัฐ)", "region"], ["VXUS", "All-World ex-US (ทั่วโลกนอกสหรัฐ)", "region"],
  ["VGLT", "US Treasuries Long (พันธบัตรสหรัฐระยะยาว)", "asset"], ["IEF", "US Treasuries Mid (พันธบัตรสหรัฐระยะกลาง)", "asset"], ["AGG", "US Aggregate Bond (พันธบัตรรวม)", "asset"], ["JNK", "High Yield Bonds (หุ้นกู้ผลตอบแทนสูง)", "asset"],
  ["GLDM", "Gold (ทองคำ)", "asset"], ["SLV", "Silver (เงิน)", "asset"], ["PDBC", "Commodities (สินค้าโภคภัณฑ์รวม)", "asset"], ["URA", "Uranium (ยูเรเนียม)", "asset"], ["IBIT", "Bitcoin (บิตคอยน์)", "asset"],
].map(([k, n, t, fx]) => ({ k, n, t, fx: fx ? fx[0] : null, inv: fx ? fx[1] : false }));
const COUNTRY_BENCH = { k: "VT", n: "World VT (ตลาดโลก)" };

let CR = null;
async function crumb() {
  if (CR) return CR;
  const r = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA }, redirect: "manual" });
  const cookie = (r.headers.getSetCookie?.() || []).map((x) => x.split(";")[0]).join("; ");
  const c = await (await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", { headers: { "User-Agent": UA, Cookie: cookie }, signal: AbortSignal.timeout(6000) })).text();
  if (!c || c.length > 40) throw new Error("no crumb");
  return (CR = { cookie, crumb: c });
}
// หุ้นใหญ่สุดของ ETF (Yahoo topHoldings — ได้เฉพาะ ~10 ตัวแรก)
async function holdings(sym) {
  const { cookie, crumb: c } = await crumb();
  const j = await (await fetch(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=topHoldings&crumb=${encodeURIComponent(c)}`, { headers: { "User-Agent": UA, Cookie: cookie }, signal: AbortSignal.timeout(6000) })).json();
  return (j.quoteSummary?.result?.[0]?.topHoldings?.holdings || []).map((h) => ({ s: h.symbol, w: h.holdingPercent?.raw ?? null }));
}

async function yahoo(sym, range) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=${range}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(7000) });
  const res = (await r.json())?.chart?.result?.[0];
  if (!res) return null;
  const c = res.indicators?.quote?.[0]?.close || [];
  const out = [];
  (res.timestamp || []).forEach((t, i) => { if (c[i] != null) out.push([new Date(t * 1000).toISOString().slice(0, 10), c[i]]); });
  return out;
}

// SET: Yahoo ให้ดัชนีไทยแค่ 1 แท่ง → ใช้ /api/idxchart (TradingView) ของเว็บเดียวกัน
async function setIndex(host) {
  const j = await (await fetch(`https://${host}/api/idxchart?symbol=%5ESET.BK&interval=1d&range=2y`, { signal: AbortSignal.timeout(8000) })).json();
  return (j.data || []).map((b) => [String(b.time), b.close]);
}

function align(rows) {   // rows: {k: [[date,close],...]} → {dates, series}
  const all = new Set();
  Object.values(rows).forEach((a) => a && a.forEach(([d]) => { const w = new Date(d + "T00:00:00Z").getUTCDay(); if (w !== 0 && w !== 6) all.add(d); }));
  const dates = [...all].sort();
  const series = {};
  for (const [k, a] of Object.entries(rows)) {
    if (!a || a.length < 20) continue;
    const m = new Map(a); const raw = [...m.keys()].sort();
    let j = 0, last = null; const out = [];
    for (const d of dates) { while (j < raw.length && raw[j] <= d) { last = m.get(raw[j]); j++; } out.push(last == null ? null : Math.round(last * 1e4) / 1e4); }
    series[k] = out;
  }
  return { dates, series };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const set = String(req.query.set || "");
  let meta, bench = null, extra = [], range = "2y";
  if (set === "cross") { meta = CROSS; range = "1y"; }
  else if (set === "sector") { meta = SECTORS; bench = SECTOR_BENCH; }
  else if (set === "country") { meta = COUNTRY; bench = COUNTRY_BENCH; extra = [...new Set(COUNTRY.map((c) => c.fx).filter(Boolean)), "THB=X"]; }
  else return res.status(400).json({ error: "set must be cross|sector|country" });
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const keys = [...new Set([...meta.map((m) => m.k), ...(bench ? [bench.k] : []), ...extra])];
  try {
    const rows = {};
    for (let i = 0; i < keys.length; i += 24) {
      await Promise.all(keys.slice(i, i + 24).map(async (k) => { try { rows[k] = k === "^SET.BK" ? await setIndex(host) : await yahoo(k, range); } catch (e) { rows[k] = null; } }));
    }
    const { dates: d0, series: s0 } = align(rows);
    // ตัดให้เหลือ ~1 ปี+ (ชุด cross ไม่ต้องใช้ย้อนหลังไกล; SET จาก idxchart มา 2 ปี)
    const cut = set === "cross" ? Math.max(0, d0.length - 275) : 0, dates = d0.slice(cut), series = Object.fromEntries(Object.entries(s0).map(([k, v]) => [k, v.slice(cut)]));
    const have = meta.filter((m) => series[m.k]).length;
    if (have < meta.length * 0.6) { res.setHeader("Cache-Control", "no-store"); return res.status(502).json({ error: "too few symbols", have, of: meta.length }); }
    let hold = null;
    if (set === "sector") { hold = {}; try { await Promise.all(SECTORS.map(async (s) => { try { hold[s.k] = await holdings(s.k); } catch (e) {} })); } catch (e) {} }
    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600");
    return res.status(200).json({ set, asOf: dates[dates.length - 1], dates, series, meta: meta.filter((m) => series[m.k]), missing: meta.filter((m) => !series[m.k]).map((m) => m.k), bench, holdings: hold });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: String((e && e.message) || e).slice(0, 100) });
  }
}
