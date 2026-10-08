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
  "SMA50", "SMA200", "relative_volume_10d_calc", "average_volume_10d_calc", "type", "logoid"];

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
  "EGCO","ERW","GFPT","GLOBAL","GPSC","GULF","GUNKUL","HANA","HMPRO","ICHI","IRPC","IVL",
  "JMT","JTS","KBANK","KCE","KKP","KTB","KTC","LH","M","MEGA","MINT","MOSHI",
  "MRDIYT","MTC","OR","OSP","PLANB","PR9","PRM","PTG","PTT","PTTEP","PTTGC","QH",
  "RATCH","RCL","SAWAD","SCB","SCC","SCGP","SIRI","SPALI","SPRC","STA","STECON","STGT",
  "TASCO","TCAP","TFG","THAI","THCOM","TIDLOR","TISCO","TLI","TOA","TOP","TRUE","TTB",
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

export function calcScore(p3, p6, p1) {
  return 0.4 * (p3 || 0) + 0.3 * (p6 || 0) + 0.3 * (p1 || 0);
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
  const json = await res.json();
  const rows = json.data || [];
  const total = json.totalCount || rows.length;

  const raw = [];
  for (const r of rows) {
    const d = r.d || [];
    if (d.length < TV_COLS.length) continue;
    const [symbol, name, close, change, volume, val, p1w, p1m, p3, p6, p1, pYTD, mcap, sector, industry,
              sma50, sma200, relVol, avgVol, secType, logoId] = d;
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
      score: calcScore(p3, p6, p1),
      sector: sector || "Other", industry: industry || sector || "Other",
      isDR: _hasDR,
      hasPerf: (p3 != null || p6 != null || p1 != null),   // มีผลตอบแทนให้คำนวณ RS จริงไหม
      sma50: sma50 || null, sma200: sma200 || null,
      relVol: relVol || null, avgVol: avgVol || null,
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

  let clean = raw.filter(s => s.val >= M.min_value && s.price >= M.min_price && s.mcap >= M.min_mcap && s.volume >= M.min_vol);

  if (market === "thailand") {
    clean = clean.filter(s => {
      const gf = M.groupFilters[s.group];
      if (!gf) return true;
      return s.volume >= gf.min_vol && s.val >= gf.min_value && s.mcap >= gf.min_mcap && s.price >= gf.min_price;
    });
  }

  clean.sort((a, b) => b.score - a.score);
  return { rows, total, raw, clean, market };
}

// ==== universe "ทั้งหมด": หุ้นสามัญล้วนทั้งตลาด ====
// ดึงจาก raw ของ scanMarket (RS ฐานเดียวกันกับ Dashboard ทั้งหน้า → เลข RS ตรงกันทุกที่)
// ตัด: DR / NVDR / ใบสำคัญแสดงสิทธิ / กองทุน / REIT และตัวที่ไม่มีผลตอบแทนให้คำนวณ RS
export function toCommonStocks(raw) {
  return (raw || []).filter(s => s && !s.isDR && s.hasPerf !== false && isCommonStock(s.ticker, s.name, s.industry));
}