// /api/history — รายงานเทียบอันดับย้อนหลัง (ข้อมูลล้วน ไม่มี UI)
//
// แหล่งข้อมูล 2 ทาง (เลือกอัตโนมัติเป็นรายวัน):
//   1) snapshot ใน Supabase (ข้อมูลจริงจาก scan รายวัน — แม่นสุด แต่มีแค่ตั้งแต่ 2026-09-30)
//   2) hist/<th|us>/<date>.json — สร้างย้อนหลังจาก OHLC (250 วันเทรด ≈ 1 ปี) เป็น "ข้อมูลประมาณการ"
//   → ทุกผลลัพธ์ระบุ `source` ของแต่ละวันเสมอ (snapshot | backfill)
//
// โหมด:
//   mode=dates   → รายชื่อวันที่ใช้ได้ทั้งหมด + แหล่งข้อมูล + จำนวนหุ้น (ให้ UI ทำ dropdown)
//   mode=compare → เทียบ Top-N ระหว่าง 2 วัน (ค่าเริ่มต้น) : ใครเข้าใหม่/หลุด/ขึ้น-ลงอันดับ
//   mode=track   → ลำดับอันดับของหุ้นที่ระบุ ข้ามหลายวัน (ทำกราฟอันดับย้อนหลัง)
//   mode=sample  → ตรวจโครงสร้างข้อมูลของวันนั้น (debug)
//
// พารามิเตอร์:
//   market  = thailand (ค่าเริ่มต้น) | america
//   metric  = pYTD | p1y | p6m | p3m | p1m | p1w | rs | score | val | mcap | change   (ค่าเริ่มต้น pYTD)
//   n       = จำนวน Top-N (ค่าเริ่มต้น 20, สูงสุด 200)
//   dir     = desc (มาก→น้อย, ค่าเริ่มต้น) | asc
//   universe= rs (ผ่านเกณฑ์ RS: ตัด DR + rs>=70, ค่าเริ่มต้น) | clean (ลิสต์ที่ผ่านการกรองสภาพคล่อง)
//   from,to = YYYY-MM-DD (ปรับไปหาวันที่มีข้อมูลจริงให้เอง และรายงานกลับใน resolved)
//   tickers = (โหมด track) รายชื่อคั่นด้วย , เช่น PTT,SMT,KCE
//   max_days= (โหมด track) จำกัดจำนวนวันย้อนหลัง (ค่าเริ่มต้น 120, สูงสุด 250)
//
// กติกาเดียวกับ Dashboard: หุ้นที่ไม่มีค่า metric = ไม่ผ่าน → ตัดออกจากการจัดอันดับ
import { buildCompare, rankOf, METRICS, METRIC_LABEL, RS_TOP_TH } from "./lib/history.js";
import { loadSnapshotDates, loadSnapshotRows, loadSnapshotRaw } from "./lib/supabase.js";
import { backfillBase, loadBackfillIndex, loadBackfillDay } from "./lib/backfill.js";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function resolveDate(dates, want, side) {
  // side: 'from' = เริ่มช่วง (วันแรกที่ >= ที่ขอ), 'to' = จบช่วง (วันสุดท้ายที่ <= ที่ขอ)
  if (!dates.length) return null;
  if (!want || !YMD.test(want)) return side === "from" ? dates[0] : dates[dates.length - 1];
  if (side === "from") {
    const up = dates.find((d) => d >= want);
    if (up) return up;
  } else {
    for (let i = dates.length - 1; i >= 0; i--) if (dates[i] <= want) return dates[i];
  }
  let best = dates[0];
  for (const d of dates) if (Math.abs(new Date(d) - new Date(want)) < Math.abs(new Date(best) - new Date(want))) best = d;
  return best;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=900");
  if (req.method === "OPTIONS") return res.status(200).end();

  const q = req.query || {};
  const market = (q.market === "us" || q.market === "america") ? "america" : "thailand";
  const mode = ["dates", "compare", "track", "sample"].includes(String(q.mode)) ? String(q.mode) : "compare";
  const metric = String(q.metric || "pYTD");
  const dir = String(q.dir || "desc") === "asc" ? "asc" : "desc";
  const universe = String(q.universe || "rs") === "clean" ? "clean" : "rs";
  const n = Math.max(1, Math.min(200, parseInt(q.n, 10) || 20));

  if (!METRICS.includes(metric)) {
    return res.status(400).json({ error: `metric ไม่ถูกต้อง: ${metric}`, supported_metrics: METRICS, labels: METRIC_LABEL });
  }

  try {
    const base = backfillBase(req);
    const [{ dates: snapDates, error: dErr }, bfIdx] = await Promise.all([
      loadSnapshotDates(market),
      loadBackfillIndex(base, market),
    ]);
    if (dErr) return res.status(500).json({ error: "อ่านรายชื่อวันที่ (snapshot) ไม่ได้: " + dErr });

    const snapSet = new Set(snapDates);
    const bfCount = new Map((bfIdx.days || []).map((d) => [d.date, d.count]));
    const allDates = [...new Set([...snapDates, ...bfCount.keys()])].sort();
    if (!allDates.length) return res.status(404).json({ error: `ยังไม่มีข้อมูลย้อนหลังของตลาด ${market}`, market });
    const srcOf = (date) => (snapSet.has(date) ? "snapshot" : (bfCount.has(date) ? "backfill" : null));

    // แถวของวันหนึ่ง: ใช้ snapshot ก่อน — แต่ถ้า snapshot ไม่มีค่าของ metric ที่ขอ (เช่น 2 ปี/YTD ในวันเก่า)
    // → ใช้ไฟล์ข้อมูลย้อนหลังของวันเดียวกันแทน แล้วระบุที่มาให้ชัด
    const hasMetric = (rows, m) => (rows || []).some((r) => r && Number.isFinite(Number(r[m])));
    async function loadBackfill(date) {
      const b = await loadBackfillDay(base, market, date);
      return { date: b.date || date, rows: b.rows || [], source: b.source || "backfill", created_at: null, note: b.note || null };
    }
    async function loadDay(date) {
      if (snapSet.has(date)) {
        const s = await loadSnapshotRows(market, date);
        if (s.rows && s.rows.length) {
          if (hasMetric(s.rows, metric)) return { date: s.date || date, rows: s.rows, source: "snapshot", created_at: s.created_at || null };
          const bf = await loadBackfill(date);
          if (hasMetric(bf.rows, metric)) {
            return { ...bf, note: `snapshot ของ ${date} ไม่มีค่า ${metric} → ใช้ข้อมูลย้อนหลัง (ประมาณการ) ของวันเดียวกันแทน` };
          }
          return { date: s.date || date, rows: s.rows, source: "snapshot", created_at: s.created_at || null };
        }
      }
      return loadBackfill(date);
    }

    if (mode === "dates") {
      const days = allDates.map((d) => ({ date: d, source: srcOf(d), count: snapSet.has(d) ? null : (bfCount.get(d) || 0) }));
      return res.status(200).json({
        market, mode, count: days.length, first: days[0].date, last: days[days.length - 1].date,
        days, dates: allDates,
        sources: {
          snapshot: { days: snapDates.length, note: "ข้อมูลจริงจาก scan รายวัน (Supabase) — แม่นสุด" },
          backfill: { days: bfCount.size, note: (bfIdx.meta && bfIdx.meta.note) || "สร้างย้อนหลังจาก OHLC (ประมาณการ) — ไม่มี mcap" },
        },
        metrics: METRICS, labels: METRIC_LABEL, rs_threshold: RS_TOP_TH,
      });
    }

    if (mode === "sample") {
      const date = q.date ? resolveDate(allDates, q.date, "to") : allDates[allDates.length - 1];
      if (snapSet.has(date)) {
        const raw = await loadSnapshotRaw(market, date);
        if (raw && raw.found) return res.status(200).json({ market, mode, date, source: "snapshot", ...raw, metrics: METRICS });
      }
      const day = await loadDay(date);
      const first = day.rows[0] || null;
      return res.status(200).json({
        market, mode, date: day.date, source: day.source, found: day.rows.length > 0,
        count: day.rows.length, keys: first ? Object.keys(first) : null, first,
        metrics: METRICS, note: day.note || null,
      });
    }

    if (mode === "track") {
      const tickers = String(q.tickers || "").split(",").map((t) => t.trim().toUpperCase()).filter(Boolean).slice(0, 60);
      if (!tickers.length) return res.status(400).json({ error: "โหมด track ต้องระบุ tickers= เช่น tickers=PTT,SMT" });
      const from = resolveDate(allDates, q.from, "from");
      const to = resolveDate(allDates, q.to, "to");
      const cap = Math.max(1, Math.min(250, parseInt(q.max_days, 10) || 120));
      const inRange = allDates.filter((d) => d >= from && d <= to);
      const range = inRange.slice(-cap);
      const series = [];
      for (let i = 0; i < range.length; i += 20) {          // ยิงพร้อมกันทีละ 20 วัน (เร็ว + ไม่ล้น timeout)
        const loaded = await Promise.all(range.slice(i, i + 20).map((d) => loadDay(d)));
        for (const day of loaded) series.push({ date: day.date, source: day.source, ...rankOf(day.rows, tickers, { metric, universe, dir }) });
      }
      return res.status(200).json({
        market, mode, metric, dir, universe, n, tickers,
        days: series.length, truncated: inRange.length > range.length,
        resolved: { from, to, requested: { from: q.from || null, to: q.to || null } },
        series,
      });
    }

    // mode = compare
    const from = resolveDate(allDates, q.from, "from");
    const to = resolveDate(allDates, q.to, "to");
    let [A, B] = await Promise.all([loadDay(from), loadDay(to)]);
    if (!A.rows.length || !B.rows.length) {
      return res.status(404).json({ error: "ไม่พบข้อมูลของวันที่เลือก", resolved: { from, to } });
    }
    const avail = (rows) => METRICS.filter((m) => rows.some((s) => s && Number.isFinite(Number(s[m]))));
    const available_metrics = { from: avail(A.rows), to: avail(B.rows) };
    const warnings = [];
    if (!available_metrics.from.includes(metric)) {
      warnings.push({ code: "metric_missing", day: "from", date: A.date, metric,
        message: `ข้อมูลวันที่ ${A.date} ไม่มีค่า ${metric} — วันนั้นจะไม่มีหุ้นเข้าเกณฑ์ (ผลจะกลายเป็น "เข้าใหม่ทั้งหมด" ซึ่งไม่ใช่ความจริง)`,
        available_metrics: available_metrics.from });
    }
    if (!available_metrics.to.includes(metric)) {
      warnings.push({ code: "metric_missing", day: "to", date: B.date, metric, available_metrics: available_metrics.to,
        message: `ข้อมูลวันที่ ${B.date} ไม่มีค่า ${metric}` });
    }
    if (A.source === "backfill" || B.source === "backfill") {
      warnings.push({ code: "approximate_data",
        days: [A.source === "backfill" ? A.date : null, B.source === "backfill" ? B.date : null].filter(Boolean),
        message: "บางวันเป็นข้อมูล 'ประมาณการ' ที่สร้างย้อนหลังจาก OHLC (ไม่มี mcap; ผลตอบแทนอาจต่างจาก TradingView ~1-2% ที่ตัวขอบๆ) — ใช้ดูการเปลี่ยนอันดับ/หลุดพ้น Top20 ได้ แต่ไม่ใช่เลขเป๊ะระดับวัน" });
    }
    const out = buildCompare(A.rows, B.rows, { metric, n, universe, dir });
    return res.status(200).json({
      market, mode, metric, dir, universe, n,
      resolved: {
        from: A.date, to: B.date, from_source: A.source, to_source: B.source,
        requested: { from: q.from || null, to: q.to || null },
        snapped: (q.from && A.date !== q.from) || (q.to && B.date !== q.to) || false,
        available: { count: allDates.length, first: allDates[0], last: allDates[allDates.length - 1] },
      },
      label: METRIC_LABEL[metric] || metric,
      rs_threshold: RS_TOP_TH,
      available_metrics, warnings,
      ...out,
    });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
