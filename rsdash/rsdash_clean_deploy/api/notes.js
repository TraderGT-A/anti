// /api/notes — สรุป "ทำไมติด Top20" + หัวข่าวล่าสุด จากตาราง stock_notes (เขียนโดย scripts/news/fetch_news.mjs)
//   market = america (ค่าเริ่มต้น) | thailand
// ตารางยังไม่มี/อ่านไม่ได้ → { data: [] } สถานะ 200 (หน้าเว็บแค่ไม่แสดงปุ่ม 📰)
import { supabase } from "./lib/supabase.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  if (req.method === "OPTIONS") return res.status(200).end();
  const market = req.query.market === "thailand" ? "thailand" : "america";
  try {
    const { data, error } = await supabase()
      .from("stock_notes")
      .select("ticker,market,in_top20_since,news_7d,reddit_7d,headlines,summary,summary_at,updated_at")
      .eq("market", market);
    if (error) throw new Error(error.message);
    return res.status(200).json({ data: data || [] });
  } catch (e) {
    return res.status(200).json({ data: [], error: String(e.message || e) });
  }
}
