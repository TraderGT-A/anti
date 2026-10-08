// /api/breadth — Breadth History: %Above MA50/MA200 ย้อนหลัง (จาก snapshot รายวันใน Supabase)
// วิธีการจัดเก็บ: collector (breadth_collector.py) หลังตลาดปิด → POST มาที่นี่ → upsert ลง Supabase
// + GET อ่านย้อนหลัง (เหมือน benchmark ภาพ) — แยก market ได้
import { supabase } from "./lib/supabase.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  // CDN cache: ตอบกลับจากขอบเร็ว 60s + ให้ stale ต่ออีก 240s (ลดความหน่วง/load ดราม่ามาก)
  // force=1 (อัปเดตสด) ข้าม cache ได้ผ่าน force param นอก CDN ปกติ
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=240");
  if (req.method === "OPTIONS") return res.status(200).end();
  const mkt = (req.query.market === "us" || req.query.market === "america") ? "america" : "thailand";

  // POST: upsert หนึ่งวันของ breadth (collector เรียก)
  if (req.method === "POST") {
    try {
      const body = typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
      const date = body.date;
      if (!date || body.pct_above_ma50 == null) return res.status(400).json({ error: "Missing date or pct_above_ma50" });
      const db = supabase();
      const rec = {
        market: body.market || mkt, date,
        up: body.up ?? null, down: body.down ?? null, total: body.total ?? null, up_pct: body.up_pct ?? null,
        pct_above_ma50: body.pct_above_ma50, pct_above_ma200: body.pct_above_ma200 ?? null,
        above_ma50: body.above_ma50 ?? null, above_ma200: body.above_ma200 ?? null,
        created_at: body.created_at || new Date().toISOString(),
      };
      const { error } = await db.from("breadth_history").upsert(rec, { onConflict: "market,date" });
      if (error) {
        return res.status(500).json({ error: error.message, hint: "สร้าง table breadth_history: market,date,pct_above_ma50,pct_above_ma200,up,down,total,up_pct,above_ma50,above_ma200,created_at (PK market+date)" });
      }
      return res.status(200).json({ ok: true, saved: date, market: rec.market });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // GET: อ่าน history ย้อนหลัง
  const days = Math.min(400, Math.max(5, Number(req.query.days) || 90));
  try {
    const db = supabase();
    const { data, error } = await db
      .from("breadth_history")
      .select("date, market, pct_above_ma50, pct_above_ma200, up_pct, total")
      .eq("market", mkt)
      .order("date", { ascending: true })
      .limit(400);
    if (error) return res.status(500).json({ error: error.message });
    const history = (data || []).slice(-days).map(r => ({
      date: r.date, pctAboveMA50: r.pct_above_ma50, pctAboveMA200: r.pct_above_ma200,
      upPct: r.up_pct, total: r.total,
    }));
    return res.status(200).json({ market: mkt, days: history.length, history });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}