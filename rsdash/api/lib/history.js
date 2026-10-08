// Shared history/report logic — เทียบ snapshot 2 วัน → รายงานการเปลี่ยนอันดับ Top-N
// ข้อมูลล้วน (ไม่ผูก UI) : อินพุต = แถวหุ้นของ snapshot 2 วัน, เอาต์พุต = JSON พร้อมใช้
//
// เกณฑ์เดียวกับ Dashboard: universe 'rs' = ลิสต์ clean (ผ่าน Val/สภาพคล่องแล้ว) ตัด DR และ rs >= 70

export const RS_TOP_TH = 70;

// metric ที่ใช้ได้ (p2y = 730 วันปฏิทิน สูตรเดียวกับหน้า Top20)
export const METRICS = ["pYTD", "p2y", "p1y", "p6m", "p3m", "p1m", "p1w", "rs", "score", "val", "mcap", "change"];
export const METRIC_LABEL = {
  pYTD: "YTD", p2y: "2 ปี", p1y: "1 ปี", p6m: "6 เดือน", p3m: "3 เดือน", p1m: "1 เดือน", p1w: "1 สัปดาห์",
  rs: "RS", score: "คะแนน", val: "มูลค่าซื้อขาย", mcap: "Market Cap", change: "เปลี่ยนวันนี้",
};

export function pickUniverse(rows, universe = "rs", rsTh = RS_TOP_TH) {
  const arr = Array.isArray(rows) ? rows : [];
  const base = arr.filter((s) => s && s.ticker && !s.isDR);
  if (universe === "rs") return base.filter((s) => (s.rs || 0) >= rsTh);
  return base;
}

// เรียงตาม metric แล้วติดอันดับ (ค่าที่ไม่มี = "ไม่ผ่าน" ตัดออก ตามเกณฑ์เดียวของ Dashboard)
export function rankRows(rows, metric = "pYTD", dir = "desc") {
  const m = METRICS.includes(metric) ? metric : "pYTD";
  const usable = (rows || []).filter((s) => s && Number.isFinite(Number(s[m])));
  const sign = dir === "asc" ? 1 : -1; // asc = น้อย→มาก, desc = มาก→น้อย (ค่าเริ่มต้นเหมือนหน้า Top20)
  usable.sort((a, b) => (Number(a[m]) - Number(b[m])) * sign || String(a.ticker).localeCompare(String(b.ticker)));
  return usable.map((s, i) => ({ ...s, rank: i + 1, _metric: Number(s[m]) }));
}

export function slim(s) {
  return {
    ticker: s.ticker, name: s.name || null, sector: s.sector || null, industry: s.industry || null,
    price: s.price ?? null, change: s.change ?? null, rs: s.rs ?? null,
    val: s.val ?? null, mcap: s.mcap ?? null,
    p1w: s.p1w ?? null, p1m: s.p1m ?? null, p3m: s.p3m ?? null, p6m: s.p6m ?? null,
    p1y: s.p1y ?? null, pYTD: s.pYTD ?? null, score: s.score ?? null,
  };
}

/**
 * เทียบ Top-N ของสองวัน
 * @returns {{counts, entered, exited, movers, stayed, topFrom, topTo}}
 *   เดลต้าอันดับ: delta = rankFrom - rankTo  (บวก = ขึ้นอันดับ, ลบ = ตกอันดับ)
 */
export function buildCompare(rowsFrom, rowsTo, opts = {}) {
  const { metric = "pYTD", n = 20, universe = "rs", dir = "desc", rsTh = RS_TOP_TH } = opts;
  const m = METRICS.includes(metric) ? metric : "pYTD";

  const uFrom = rankRows(pickUniverse(rowsFrom, universe, rsTh), m, dir);
  const uTo = rankRows(pickUniverse(rowsTo, universe, rsTh), m, dir);

  const topFrom = uFrom.slice(0, n);
  const topTo = uTo.slice(0, n);
  const mapFrom = new Map(topFrom.map((s) => [s.ticker, s]));
  const mapTo = new Map(topTo.map((s) => [s.ticker, s]));

  const delta = (a, b) => {
    const dv = (Number(b) - Number(a));
    return Number.isFinite(dv) ? Math.round(dv * 100) / 100 : null;
  };

  const entered = [];
  const exited = [];
  const movers = [];
  const stayed = [];

  for (const s of topTo) {
    const was = mapFrom.get(s.ticker);
    if (!was) {
      entered.push({
        ...slim(s),
        rankFrom: null, rankTo: s.rank, deltaRank: null,
        metricFrom: null, metricTo: Math.round(s._metric * 100) / 100, metricDelta: null,
        rsFrom: null, rsTo: s.rs ?? null, rsDelta: null, isNew: true,
      });
      continue;
    }
    const row = {
      ...slim(s),
      rankFrom: was.rank, rankTo: s.rank, deltaRank: was.rank - s.rank,
      metricFrom: Math.round(was._metric * 100) / 100,
      metricTo: Math.round(s._metric * 100) / 100,
      metricDelta: delta(was._metric, s._metric),
      rsFrom: was.rs ?? null, rsTo: s.rs ?? null,
      rsDelta: (Number.isFinite(Number(was.rs)) && Number.isFinite(Number(s.rs))) ? Number(s.rs) - Number(was.rs) : null,
    };
    if (was.rank !== s.rank) movers.push(row); else stayed.push(row);
  }
  for (const s of topFrom) {
    if (!mapTo.has(s.ticker)) {
      exited.push({
        ...slim(s),
        rankFrom: s.rank, rankTo: null, deltaRank: null,
        metricFrom: Math.round(s._metric * 100) / 100, metricTo: null, metricDelta: null,
        rsFrom: s.rs ?? null, rsTo: null, rsDelta: null, gone: true,
      });
    }
  }

  // เรียงให้อ่านง่าย: ผู้ชนะ (ขึ้นแรงสุด) อยู่บน / ตกแรงสุดอยู่บนของฝั่งลบ
  movers.sort((a, b) => Math.abs(b.deltaRank) - Math.abs(a.deltaRank));
  entered.sort((a, b) => a.rankTo - b.rankTo);
  exited.sort((a, b) => a.rankFrom - b.rankFrom);

  return {
    counts: {
      universeFrom: uFrom.length, universeTo: uTo.length,
      entered: entered.length, exited: exited.length,
      up: movers.filter((r) => r.deltaRank > 0).length,
      down: movers.filter((r) => r.deltaRank < 0).length,
      stayed: stayed.length,
      topN: Math.min(n, topTo.length),
    },
    entered, exited, movers, stayed,
    topFrom: topFrom.map((s) => ({ ...slim(s), rank: s.rank, metricValue: Math.round(s._metric * 100) / 100 })),
    topTo: topTo.map((s) => ({ ...slim(s), rank: s.rank, metricValue: Math.round(s._metric * 100) / 100 })),
  };
}

// อันดับของรายชื่อหุ้นที่สนใจ ณ วันที่กำหนด (สำหรับโหมด track/กราฟอันดับย้อนหลัง)
export function rankOf(rows, tickers, opts = {}) {
  const { metric = "pYTD", universe = "rs", dir = "desc", rsTh = RS_TOP_TH } = opts;
  const m = METRICS.includes(metric) ? metric : "pYTD";
  const ranked = rankRows(pickUniverse(rows, universe, rsTh), m, dir);
  const want = new Set(tickers || []);
  const out = {};
  for (const s of ranked) if (want.has(s.ticker)) out[s.ticker] = { rank: s.rank, value: Math.round(s._metric * 100) / 100, rs: s.rs ?? null, price: s.price ?? null };
  for (const t of tickers || []) if (!out[t]) out[t] = null; // หลุดจาก universe วันนั้น
  return { total: ranked.length, positions: out };
}
