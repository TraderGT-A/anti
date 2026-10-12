// /api/notes — สรุป "ทำไมติด Top20" + หัวข่าวล่าสุด (เขียนโดย scripts/news/fetch_news.mjs)
//   GET  ?market=america (ค่าเริ่มต้น) | thailand → { data: row[] }  (ยังไม่มีข้อมูล → data: [])
//   POST ?market=america  header x-write-key = env NOTES_WRITE_KEY, body { rows: row[] } → แทนที่ชุดแถว (เก็บ summary เดิมถ้าแถวใหม่ไม่มี)
// เก็บในตาราง snapshots เดิม (dt = "notes|<market>") — ไม่ต้องสร้างตารางใหม่
import { supabase } from "./_lib/supabase.js";
import { mergeNotes, validRows, notesKey } from "./_lib/notes.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", req.method === "GET" ? "public, s-maxage=300, stale-while-revalidate=600" : "no-store");
  if (req.method === "OPTIONS") return res.status(200).end();
  const dt = notesKey(req.query.market);
  const db = supabase();

  if (req.method === "POST") {
    const need = (process.env.NOTES_WRITE_KEY || "").trim();
    if (!need) return res.status(503).json({ error: "NOTES_WRITE_KEY not set on server" });
    if (String(req.headers["x-write-key"] || "").trim() !== need) return res.status(401).json({ error: "unauthorized" });
    try {
      const body = typeof req.body === "object" ? (req.body || {}) : JSON.parse(req.body || "{}");
      if (!validRows(body.rows)) return res.status(400).json({ error: "rows must be an array (≤100) with valid tickers" });
      const prev = await db.from("snapshots").select("payload").eq("dt", dt).maybeSingle();
      const rows = mergeNotes(prev.data && prev.data.payload && prev.data.payload.rows, body.rows);
      const { error } = await db.from("snapshots").upsert({ dt, created_at: new Date().toISOString(), payload: { rows } }, { onConflict: "dt" });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, rows: rows.length });
    } catch (e) {
      return res.status(500).json({ error: String(e.message || e) });
    }
  }

  try {
    const { data, error } = await db.from("snapshots").select("payload").eq("dt", dt).maybeSingle();
    if (error) throw new Error(error.message);
    return res.status(200).json({ data: (data && data.payload && data.payload.rows) || [] });
  } catch (e) {
    return res.status(200).json({ data: [], error: String(e.message || e) });
  }
}
