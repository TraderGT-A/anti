// /api/db — list daily snapshots stored in Supabase (proves persistence)
import { supabase } from "./lib/supabase.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  if (req.method === "OPTIONS") return res.status(200).end();
  try {
    const { data, error } = await supabase()
      .from("snapshots")
      .select("dt, created_at, n:payload->count")   // ดึงเฉพาะ count — เดิมดึง payload เต็ม 30 วัน (หลาย MB) มาแค่นับ
      .order("dt", { ascending: false })
      .limit(30);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({
      database: "supabase: snapshots",
      daily_snapshots: (data || []).map(s => ({
        date: s.dt, created_at: s.created_at,
        count: Number(s.n) || 0,
      })),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}