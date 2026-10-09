// /api/market-brief — Market Brief: บอกการเปลี่ยนแปลง Breadth เทียบวันทำการก่อนหน้า + เทียบ 5 วันทำการ
import { supabase } from "./lib/supabase.js";
import { getLiveBreadth } from "./lib/scan.js";

const mkLabel = { thailand: "ไทย 🇹🇭", america: "อเมริกา 🇺🇸" };

// อ่าน history จาก breadth_history ตรง (เหมือน /api/breadth) — เฉพาะวันทำการ (ตัดเสาร์-อาทิตย์)
async function loadHist(market) {
  try {
    const db = supabase();
    const { data, error } = await db.from("breadth_history")
      .select("date, pct_above_ma50, pct_above_ma200")
      .eq("market", market).order("date", { ascending: false }).limit(60);
    if (error) return [];
    return (data || [])
      .filter((x) => {
        const dd = new Date(String(x.date || "").slice(0, 10) + "T00:00:00Z").getUTCDay();
        return dd !== 0 && dd !== 6;
      })
      .map((x) => ({ date: x.date, pctAboveMA50: x.pct_above_ma50, pctAboveMA200: x.pct_above_ma200 }))
      .reverse();   // เก่า → ใหม่
  } catch (e) { return []; }
}

// Δ จาก history ล้วน: จุดล่าสุดที่บันทึก เทียบจุดก่อนหน้า (1D) และ 5 วันทำการก่อน (5D)
// (ของเดิมเอาค่าสดไปลบจุดล่าสุดใน history ซึ่งคือค่าเดียวกันหลังตลาดปิด → Δ1D เป็น 0 เสมอ,
//  และ Δ5D ใช้ index ผิด 1 ช่อง = 4 วันทำการ; ค่าที่คำนวณไม่ได้ก็กลายเป็น 0 แทนที่จะเป็น null)
function deltas(points, key) {
  const pts = points.filter((x) => x[key] != null);
  const n = pts.length;
  const last = n ? pts[n - 1][key] : null;
  const d = (back) => (n > back && last != null ? Math.round((last - pts[n - 1 - back][key]) * 10) / 10 : null);
  return { d1: d(1), d5: d(5), asOf: n ? pts[n - 1].date : null };
}

// เทรนด์จาก Δ5D เป็นหลัก ถ้าไม่มีใช้ Δ1D
function trend(d1, d5) {
  if (d1 == null && d5 == null) return "";
  if (d5 != null) {
    if (Math.abs(d5) >= 1) return d5 > 0 ? "ดีขึ้น ▲" : "อ่อนลง ▼";
    return "ทรงตัว";
  }
  return d1 > 0 ? "ดีขึ้น ▲" : d1 < 0 ? "อ่อนลง ▼" : "ทรงตัว";
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=240");
  if (req.method === "OPTIONS") return res.status(200).end();
  try {
    const out = { updated_at: new Date().toISOString(), markets: [] };
    const results = await Promise.all(["thailand", "america"].map(async (m) => {
      try {
        const [cur, history] = await Promise.all([getLiveBreadth(m), loadHist(m)]);
        return { m, cur, history };
      } catch (e) { return { m, cur: null, history: [] }; }
    }));
    for (const { m, cur, history } of results) {
      if (!cur || cur.pctAboveMA50 == null) continue;
      const a50 = deltas(history, "pctAboveMA50");
      const a200 = deltas(history, "pctAboveMA200");
      out.markets.push({
        market: m, label: mkLabel[m] || m,
        ma50: cur.pctAboveMA50, ma200: cur.pctAboveMA200,
        a50: cur.aboveMA50, a200: cur.aboveMA200,
        total: cur.total, up: cur.up, down: cur.down,
        d1: { ma50: a50.d1, ma200: a200.d1 },
        d5: { ma50: a50.d5, ma200: a200.d5 },
        deltaAsOf: a50.asOf,
        trend: { ma50: trend(a50.d1, a50.d5), ma200: trend(a200.d1, a200.d5) },
      });
    }
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
