// Shared RS Dashboard logic — TradingView scan + RS ranking + filters (multi-market)
// Supports: thailand (SET+mai) and america (NYSE+NASDAQ+AMEX).
// US data is richer (relative_volume, 52wk high/low, broad sectors) — we surface it.

const MARKETS = {
  thailand: {
    endpoint: "https://scanner.tradingview.com/thailand/scan",
    label: "ไทย",
    currency: "THB",
    sortBy: "Value.Traded",
    min_value: 5_000_000,       // บาท
    min_price: 1.0,
    min_mcap: 500_000_000,
    min_vol: 500_000,
    groupBy: "mcap",
    groupCalc: (s) => s.group,
    groupFilters: {
      "SET50":     { min_value: 20_000_000, min_mcap: 5_000_000_000, min_vol: 2_000_000, min_price: 5.0 },
      "SET100":    { min_value: 5_000_000,  min_mcap: 1_000_000_000, min_vol: 500_000,   min_price: 2.0 },
      "mai/Small": { min_value: 1_000_000,  min_mcap: 500_000_000,   min_vol: 100_000,   min_price: 0.5 },
    },
    isJunk: (symbol, name, desc) => {
      const s = (symbol || "").toUpperCase(), n = (name || "").toUpperCase(), d = (desc || "").toUpperCase();
      if (s.endsWith(".R") || n.includes(" NVDR") || d.includes(" NVDR")) return true;
      if (s.includes("-W") && /-W\d/.test(s)) return true;
      if (n.includes("WARRANT") || d.includes("WARRANT") || n.includes("DERIVATIVE")) return true;
      if (d.includes("DEPOSIT") && d.includes("THAILAND")) return true;
      if (!n || !s) return true;
      return false;
    },
  },
  america: {
    endpoint: "https://scanner.tradingview.com/america/scan",
    label: "US",
    currency: "USD",
    sortBy: "Value.Traded",
    min_value: 20_000_000,      // USD turnover
    min_price: 2.0,
    min_mcap: 1_000_000_000,    // $1B ขึ้นไป
    min_vol: 300_000,
    groupBy: "mcap",
    groupCalc: (s) => s.group,
    mcapTiers: [
      { group: "MegaCap" , max: Infinity, min: 5_000_000_000 },
      { group: "MidCap" , max: 5_000_000_000, min: 2_000_000_000 },
      { group: "SmallCap", max: 2_000_000_000, min: 1_000_000_000 },
    ],
    isJunk: (symbol, name, desc) => {
      const n = (name || "").toUpperCase(), d = (desc || "").toUpperCase();
      if (!n || !symbol) return true;
      // ⚠️ ต้องใช้ word-boundary — ของเดิม n.includes("ETF") ไปโดน "N**ETF**lix" → Netflix หายจากตลาด (แก้ 5 ต.ค.)
      if (/\bETF\b/.test(n) || /\bETF\b/.test(d) || /\bTRUST\b/.test(d) || /\bMUTUAL FUND\b/.test(d)) return true;
      if (/\bUNIT\b/.test(d) || /\bFUND\b/.test(d)) return true;
      if (/\bWARRANT\b/.test(n) || /\bPREFERRED\b/.test(n) || /\bPREF\b/.test(n)) return true;
      // หมายเหตุ: ไม่ตัด "Class A" อีกต่อไป — เดิมตัดแล้วทำให้ META/GOOGL/COIN/HOOD หายทั้งบริษัท (หุ้นที่มีคลาสเดียว)
      return false;
    },
  },
};

export const TV_COLS = ["name", "description", "close", "change", "volume", "Value.Traded",
  "Perf.W", "Perf.1M", "Perf.3M", "Perf.6M", "Perf.Y", "Perf.YTD", "market_cap_basic", "sector", "industry",
  "SMA50", "SMA200", "relative_volume_10d_calc", "average_volume_10d_calc", "type", "logoid",
  "open", "high", "low",
  "SMA150", "EMA20", "price_52_week_high", "price_52_week_low", "ATR",
  // วันประกาศงบ + การเติบโตงบไตรมาสล่าสุด (TradingView ช้ากว่าจริง ~1 วัน) — ต่อท้ายเสมอ
  "earnings_release_next_date", "earnings_release_date",
  "net_income_yoy_growth_fq", "total_revenue_yoy_growth_fq", "net_income_qoq_growth_fq", "total_revenue_qoq_growth_fq"];   // ชุดสำหรับ Trend Template / Scanner พักตัวแคบ (ต่อท้ายเสมอ)   // OHLC ของวันล่าสุด — ใช้เติมแท่งสุดท้ายของกราฟเมื่อ Yahoo ล่าช้า (ต่อท้ายเสมอ ห้ามแทรกกลาง เพราะ destructure ตามตำแหน่ง)

// ==== Thai index membership (จริงจาก set.or.th PDF, point-in-time 2026H2) ====
// เดิมใช้ mcap bucket (slice 0,50/0,100) = ผิด (KCE ขึ้น SET50, DR อย่าง MICRON01 ขึ้น SET50) —
// แก้เป็น membership จริง. sync กับ scripts/th_index_members.json เมื่อ membership เปลี่ยน.
const TH_S50 = new Set(["ADVANC","AOT","AWC","BANPU","BBL","BCP","BDMS","BEM","BH","BJC","CCET","COM7",
  "CPALL","CPF","CPN","CRC","DELTA","EGCO","GPSC","GULF","HMPRO","IVL","KBANK","KKP","KTB","KTC","LH",
  "MINT","MRDIYT","MTC","OR","OSP","PTT","PTTEP","PTTGC","RATCH","SCB","SCC","SCGP","TCAP","TFG","THAI",
  "TIDLOR","TISCO","TLI","TOP","TRUE","TTB","TU","WHA"]);
const TH_S100 = new Set([
  "AAV","ADVANC","AEONTS","AMATA","AOT","AP","AURA","AWC","BA","BAM","BANPU","BBL",
  "BCH","BCP","BCPG","BDMS","BEM","BGRIM","BH","BJC","BLA","BTG","BTS","CBG",
  "CCET","CENTEL","CHG","CK","COM7","CPALL","CPF","CPN","CRC","DELTA","DOHOME","EA",
  "EGCO","ERW","GFPT","GLOBAL","GPSC","GST","GULF","GUNKUL","HANA","HMPRO","ICHI","IRPC","IVL",
  "JMART","JMT","KBANK","KCE","KKP","KTB","KTC","LH","M","MEGA","MINT","MOSHI",
  "MRDIYT","MTC","OR","OSP","PLANB","PR9","PRM","PTG","PTT","PTTEP","PTTGC","QH",
  "RATCH","RCL","SAWAD","SCB","SCC","SCGP","SIRI","SPALI","SPRC","STA","STECON","STGT",
  "TASCO","TCAP","TFG","THAI","TIDLOR","TISCO","TLI","TOA","TOP","TRUE","TTB",
  "TU","VGI","WHA","WHAUP",
]);
export function thGroup(ticker) {
  const t = (ticker || "").toUpperCase();
  if (TH_S50.has(t)) return "SET50";
  if (TH_S100.has(t)) return "SET100";
  return "mai/Small";
}

// หุ้นสามัญจริง (ตัด REIT/กองทุน/DR) — ใช้กับ universe "ทั้งหมด"
const FUND_INDUSTRIES = new Set(["Real Estate Investment Trusts", "Investment Trusts/Mutual Funds"]);
export function isCommonStock(sym, name, industry) {
  const n = (name || "").toUpperCase();
  if (FUND_INDUSTRIES.has(industry)) return false;
  if (/\bREIT\b|INVESTMENT TRUST|PROPERTY FUND|FREEHOLD.*LEASEHOLD/i.test(n)) return false;
  if (/(?:\bDR\b|DEPOSITAR|RECEIPT|\[DR\])/i.test((sym || "") + " " + n)) return false;   // DR
  return true;
}

export function calcScore(p1m, p3, p6, p1) {
  return 0.3 * (p1m || 0) + 0.3 * (p3 || 0) + 0.2 * (p6 || 0) + 0.2 * (p1 || 0);
}

export function percentile(ascIdx, total) {
  if (total <= 0) return 1;
  return Math.max(1, Math.min(99, Math.round(((total - ascIdx) / total) * 99)));
}

export function getMarket(market) {
  return MARKETS[market] || MARKETS.thailand;
}

export async function scanMarket(market = "thailand") {
  const M = getMarket(market);
  const res = await fetch(M.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      symbols: { query: { types: [] }, tickers: [] },
      columns: TV_COLS,
      sort: { sortBy: M.sortBy, sortOrder: "desc" },
      range: [0, 4000],
    }),
  });
  if (!res.ok) throw new Error("TradingView scan HTTP " + res.status);
  const json = await res.json();
  const rows = json.data || [];
  const total = json.totalCount || rows.length;

  const raw = [];
  for (const r of rows) {
    const d = r.d || [];
    if (d.length < TV_COLS.length) continue;
    const [symbol, name, close, change, volume, val, p1w, p1m, p3, p6, p1, pYTD, mcap, sector, industry,
              sma50, sma200, relVol, avgVol, secType, logoId, dOpen, dHigh, dLow,
              sma150, ema20, hi52, lo52, atr,
              eNext, eLast, niY, rvY, niQ, rvQ] = d;
    const g1 = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
    // กรองด้วย type ตรง ๆ: เอาเฉพาะหุ้นสามัญ (ตัด ETF/fund/warrant/DR ทั้ง 2 ตลาด) — แม่นกว่าการเดาจากชื่อ
    // (ของเดิม: includes("ETF") ไปโดน "N-ETF-lix" → Netflix หาย; กฎ "CLASS A" → META/GOOGL/COIN หายทั้งบริษัท)
    if (secType && secType !== "stock") continue;
    if (M.isJunk(symbol, name, name)) continue;
    if (close == null || close <= 0) continue;
    const _hasDR = /(?:\bdr\b|depositar|receipt|DR[XY]?\b|\[DR\])/i.test((symbol||"")+" "+(name||""));
    // ตลาดไทย: ตัด DR ออกที่ต้นทางเลย (บอส 5 ต.ค. — ยังไม่ทำหมวด DR) → หายจากทุกหน้า (Top20/หุ้น/Breadth) และไม่ไปปนฐาน RS
    if (market === "thailand" && _hasDR) continue;
    raw.push({
      ticker: symbol, name: name || symbol, price: close, change,
      volume: volume || 0, val: val || 0, mcap: mcap || 0,
      p1w: p1w || 0, p1m: p1m || 0, p3m: p3 || 0, p6m: p6 || 0, p1y: p1 || 0, pYTD: pYTD || 0,
      score: calcScore(p1m, p3, p6, p1),
      sector: sector || "Other", industry: industry || sector || "Other",
      isDR: _hasDR,
      hasPerf: (p1m != null || p3 != null || p6 != null || p1 != null),   // มีผลตอบแทนให้คำนวณ RS จริงไหม
      sma50: sma50 || null, sma200: sma200 || null,
      relVol: relVol || null, avgVol: avgVol || null,
      sma150: sma150 || null, ema20: ema20 || null, hi52: hi52 || null, lo52: lo52 || null,
      atr: atr || null,   // ATR14 (หน่วยราคา) จาก TradingView
      // งบ: eN = วันประกาศครั้งถัดไป, eL = ครั้งล่าสุด (วินาที unix) · niY/rvY = กำไร/รายได้ไตรมาสล่าสุดเทียบปีก่อน (%) · niQ/rvQ = เทียบไตรมาสก่อน (%)
      eN: typeof eNext === "number" ? eNext : null, eL: typeof eLast === "number" ? eLast : null,
      niY: g1(niY), rvY: g1(rvY), niQ: g1(niQ), rvQ: g1(rvQ),
      o: dOpen ?? null, h: dHigh ?? null, l: dLow ?? null,   // OHLC วันนี้จาก TradingView
      tv: r.s || "",               // สัญลักษณ์เต็มของ TradingView (EXCHANGE:SYMBOL) — ใช้ส่งออก Watchlist
      logoId: logoId || "",        // TradingView logoid → ใช้ดึงโลโก้จริงจาก s3-symbol-logo.tradingview.com
    });
  }

  raw.sort((a, b) => b.score - a.score);
  raw.forEach((s, i) => { s.rs = percentile(i, raw.length); s.rT_full = i + 1; });

  const byMcap = [...raw].sort((a, b) => b.mcap - a.mcap);
  raw.forEach(s => {
    if (market === "thailand") {
      // ไทย: SET50/SET100/mai ตาม MEMBERSHIP จริงจาก set.or.th (point-in-time) — ไม่ใช่ mcap bucket
      s.group = thGroup(s.ticker);
    } else {
      // US: ใช้มาตรฐานสากล FINRA market-cap tiers (Ref: FINRA — mega≥$200B / large $10-200B / mid $2-10B / small $250M-2B / micro <$250M)
      const mc = s.mcap || 0;
      s.group = mc >= 200_000_000_000 ? "MegaCap"
        : mc >= 10_000_000_000  ? "LargeCap"
        : mc >= 2_000_000_000   ? "MidCap"
        : mc >= 250_000_000     ? "SmallCap"
        : "MicroCap";
    }
  });

  // สภาพคล่อง — ใช้ "ยอดของวันนี้" หรือ "ค่าเฉลี่ย 10 วัน" ถึงเกณฑ์ก็ผ่าน (A+B)
  // เหตุผล: ระหว่างวันยอดสะสมของวันนี้ยังไม่ครบ (ตอนเช้ามักได้ ~1/3 ของเฉลี่ย)
  // → ถ้าใช้แต่ยอดวันนี้ รายชื่อจะผอมผิดปกติตอนเช้า แล้วค่อยขยายตอนบ่าย
  // ต้องผ่านทั้งปริมาณและมูลค่า "ในชุดเดียวกัน": (วันนี้ผ่านทั้งคู่) หรือ (เฉลี่ย 10 วันผ่านทั้งคู่)
  // ไม่ใช่ผ่านอย่างใดอย่างหนึ่ง — กันหุ้นที่จำนวนหุ้นถึงเกณฑ์แต่มูลค่าซื้อขายเล็กมากหลุดเข้ามา
  const okLiq = (s, minV, minVal) =>
    ((s.volume || 0) >= minV && (s.val || 0) >= minVal) ||
    ((s.avgVol || 0) >= minV && (s.avgVol || 0) * (s.price || 0) >= minVal);

  let clean = raw.filter(s => s.price >= M.min_price && s.mcap >= M.min_mcap && okLiq(s, M.min_vol, M.min_value));

  if (market === "thailand") {
    clean = clean.filter(s => {
      const gf = M.groupFilters[s.group];
      if (!gf) return true;
      return okLiq(s, gf.min_vol, gf.min_value) && s.mcap >= gf.min_mcap && s.price >= gf.min_price;
    });
  }

  clean.sort((a, b) => b.score - a.score);
  return { rows, total, raw, clean, market };
}

// Breadth แท้ทั้งกระดาน (นับจาก raw = ทุกหุ้นที่ผ่าน junk/close ก่อนกรอง RS/สภาพคล่อง)
// ใช้ร่วมกันระหว่าง /api/scan, /api/market-brief, /api/market-breadth เพื่อให้เลขตรงกันทุกหน้า
export function breadthFull(raw) {
  const all = raw || [];
  const up = all.filter(s => (s.change ?? 0) > 0).length;
  const down = all.filter(s => (s.change ?? 0) < 0).length;
  const above50 = all.filter(s => s.sma50 && s.price && s.price > s.sma50).length;
  const above200 = all.filter(s => s.sma200 && s.price && s.price > s.sma200).length;
  const pct = (n) => (all.length ? Math.round(n / all.length * 100) : 0);
  return {
    up, down, total: all.length, upPct: pct(up),
    aboveMA50: above50, aboveMA200: above200,
    pctAboveMA50: pct(above50), pctAboveMA200: pct(above200),
  };
}

// Breadth ปัจจุบันของตลาด — ใช้แคชที่ /api/scan เพิ่งคำนวณไว้ก่อน (5 นาที) ไม่งั้นสแกนเอง
// (แทนการยิง HTTP วนกลับมาที่ /api/scan ของโดเมนตัวเอง)
export async function getLiveBreadth(market = "thailand") {
  const hit = global.__scanCache?.[market];
  const cached = hit && hit.data?.marketSummary?.breadth_full;
  if (cached && Date.now() - hit.ts < 300_000) return cached;
  const mem = global.__breadthCache?.[market];
  if (mem && Date.now() - mem.ts < 300_000) return mem.data;
  const { raw } = await scanMarket(market);
  const data = breadthFull(raw);
  global.__breadthCache = global.__breadthCache || {};
  global.__breadthCache[market] = { ts: Date.now(), data };
  return data;
}

// สมาชิก index สหรัฐฯ จาก TradingView (symbolset) — S&P 500 / Nasdaq-100 / Dow 30 / Russell 2000
// แทนลิสต์ฮาร์ดโค้ดในหน้าเว็บที่เก่า (Russell 2000 มีหุ้นที่เลิกซื้อขายไปแล้วเป็นร้อย)
const INDEX_SETS = {
  sp500: "SYML:SP;SPX", nasdaq100: "SYML:NASDAQ;NDX", dow30: "SYML:DJ;DJI", russell2000: "SYML:TVC;RUT",
};
export async function getIndexMembership() {
  const hit = global.__indexesCache;
  if (hit && Date.now() - hit.ts < 12 * 3600_000) return hit.data;
  const out = {};
  for (const [k, s] of Object.entries(INDEX_SETS)) {
    const r = await fetch("https://scanner.tradingview.com/america/scan", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: { symbolset: [s] }, columns: ["name"], range: [0, 3000] }),
    });
    if (!r.ok) throw new Error(s + " HTTP " + r.status);
    const j = await r.json();
    out[k] = [...new Set((j.data || []).map((x) => String(x.d?.[0] || "").toUpperCase()).filter(Boolean))];
  }
  // กันข้อมูลเพี้ยน: ชุดเล็กผิดปกติ = ไม่ส่งให้หน้าเว็บทับลิสต์สำรอง
  const ok = out.sp500.length >= 450 && out.nasdaq100.length >= 90 && out.dow30.length >= 25 && out.russell2000.length >= 1500;
  if (!ok) throw new Error("index membership incomplete: " + JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length]))));
  const data = { ...out, updated_at: new Date().toISOString(), source: "tradingview_scanner_symbolset" };
  global.__indexesCache = { ts: Date.now(), data };
  return data;
}

// ==== universe "ทั้งหมด": หุ้นสามัญล้วนทั้งตลาด ====
// ดึงจาก raw ของ scanMarket (RS ฐานเดียวกันกับ Dashboard ทั้งหน้า → เลข RS ตรงกันทุกที่)
// ตัด: DR / NVDR / ใบสำคัญแสดงสิทธิ / กองทุน / REIT และตัวที่ไม่มีผลตอบแทนให้คำนวณ RS
export function toCommonStocks(raw) {
  return (raw || []).filter(s => s && !s.isDR && s.hasPerf !== false && isCommonStock(s.ticker, s.name, s.industry));
}