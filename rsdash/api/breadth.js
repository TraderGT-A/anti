// /api/breadth — Breadth History: %Above MA50/MA200 ย้อนหลัง (จาก snapshot รายวันใน Supabase)
// วิธีการจัดเก็บ: collector (breadth_collector.py) หลังตลาดปิด → POST มาที่นี่ → upsert ลง Supabase
// + GET อ่านย้อนหลัง (เหมือน benchmark ภาพ) — แยก market ได้
import { supabase } from "./lib/supabase.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, x-write-key");
  // CDN cache: ตอบกลับจากขอบเร็ว 60s + ให้ stale ต่ออีก 240s (ลดความหน่วง/load ดราม่ามาก)
  // force=1 (อัปเดตสด) ข้าม cache ได้ผ่าน force param นอก CDN ปกติ
  res.setHeader("Cache-Control", req.method === "GET" ? "public, s-maxage=60, stale-while-revalidate=240" : "no-store");
  if (req.method === "OPTIONS") return res.status(200).end();
  const mkt = (req.query.market === "us" || req.query.market === "america") ? "america" : "thailand";

  // POST: upsert หนึ่งวันของ breadth (collector เรียก)
  if (req.method === "POST") {
    // ถ้าตั้ง env BREADTH_WRITE_KEY ไว้ → collector ต้องส่ง header "x-write-key" ให้ตรง (กันคนนอกยิงเขียนทับ history)
    const needKey = (process.env.BREADTH_WRITE_KEY || "").trim();   // trim: ค่า env ที่ตั้งผ่าน pipe อาจมีขึ้นบรรทัดใหม่ติดมา
    if (needKey && String(req.headers["x-write-key"] || "").trim() !== needKey) return res.status(401).json({ error: "unauthorized" });
    try {
      const body = typeof req.body === "object" ? (req.body || {}) : JSON.parse(req.body || "{}");
      const date = String(body.date || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || body.pct_above_ma50 == null) return res.status(400).json({ error: "Missing/invalid date (YYYY-MM-DD) or pct_above_ma50" });
      const pct = (v) => v == null || (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100);
      if (!pct(body.pct_above_ma50) || !pct(body.pct_above_ma200)) return res.status(400).json({ error: "pct_above_ma50/200 must be 0-100" });
      const rkt = (body.market === "us" || body.market === "america") ? "america" : (body.market ? "thailand" : mkt);
      // ตลาดปิดเสาร์-อาทิตย์ → ไม่บันทึก (เดิมมีแถวเสาร์/อาทิตย์ค่าซ้ำวันศุกร์ ทำให้กราฟ/Δ เพี้ยน)
      const dow = new Date(date + "T00:00:00Z").getUTCDay();
      if (dow === 0 || dow === 6) return res.status(200).json({ ok: true, skipped: "weekend", date, market: rkt });
      const db = supabase();
      const rec = {
        market: rkt, date,
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
    // ดึง "ล่าสุด" N แถว (desc) แล้วกลับเป็นเก่า→ใหม่ — เดิม asc+limit(400) จะตัดแถวใหม่ทิ้งเมื่อข้อมูลเกิน 400 วัน
    const { data: dataDesc, error } = await db
      .from("breadth_history")
      .select("date, market, pct_above_ma50, pct_above_ma200, up_pct, total")
      .eq("market", mkt)
      .order("date", { ascending: false })
      .limit(days);
    if (error) return res.status(500).json({ error: error.message });
    const data = (dataDesc || []).slice().reverse();
    const history = data.map(r => ({
      date: r.date, pctAboveMA50: r.pct_above_ma50, pctAboveMA200: r.pct_above_ma200,
      upPct: r.up_pct, total: r.total,
    }));
    return res.status(200).json({ market: mkt, days: history.length, history });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}