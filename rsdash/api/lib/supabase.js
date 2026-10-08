// Supabase storage helper — replaces local SQLite rs_daily.db
// Table: snapshots (dt TEXT PK, created_at TEXT, payload JSONB)

import { createClient } from "@supabase/supabase-js";

let client = null;
export function supabase() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY env");
    client = createClient(url, key);
  }
  return client;
}

// Return the most recent snapshot STRICTLY before today (for Rank Change), for a given market.
export async function loadPreviousSnapshot(market = "thailand") {
  const date = new Date().toISOString().slice(0, 10);
  const prefix = market + "|";
  const db = supabase();
  const { data, error } = await db
    .from("snapshots")
    .select("dt, created_at, payload")
    .like("dt", prefix + "%")
    .lt("dt", prefix + date)
    .order("dt", { ascending: false })
    .limit(1);
  if (error) return { snapshot: null, error: error.message };
  if (!data || data.length === 0) return { snapshot: null, error: null };
  return { snapshot: data[0], error: null };
}

// Upsert today's snapshot (dt = market|date กัน ไทย/US ทับกัน).
export async function saveSnapshot(payload) {
  const date = new Date().toISOString().slice(0, 10);
  const market = payload.market || "thailand";
  const db = supabase();
  const { error } = await db
    .from("snapshots")
    .upsert({ dt: market + "|" + date, created_at: new Date().toISOString(), payload }, { onConflict: "dt" });
  if (error) return { error: error.message };
  return { error: null };
}

// === History / Report helpers (สำหรับหน้า Report: เทียบสองวัน) ===
// รายชื่อวันที่ที่มี snapshot จริง (สำหรับให้ UI ทำ dropdown เลือกช่วงวัน)
export async function loadSnapshotDates(market = "thailand") {
  const db = supabase();
  const { data, error } = await db
    .from("snapshots")
    .select("dt,n:payload->count")
    .like("dt", market + "|%")
    .order("dt", { ascending: true })
    .limit(1000);
  if (error) return { dates: [], rows: [], error: error.message };
  const rows = (data || [])
    .map((r) => ({ date: (r.dt || "").split("|")[1], count: Number(r.n) || 0 }))
    .filter((r) => r.date);
  return { dates: rows.map((r) => r.date), rows, error: null };
}

// แถวหุ้นของ snapshot วันเดียว (ดิบ) — ใช้ตรวจ schema / debug เท่านั้น
export async function loadSnapshotRaw(market = "thailand", date = "") {
  const db = supabase();
  const { data, error } = await db
    .from("snapshots")
    .select("dt,created_at,payload")
    .eq("dt", market + "|" + date)
    .limit(1);
  if (error) return { error: error.message };
  if (!data || !data.length) return { error: null, found: false };
  const rows = data[0].payload?.data;
  return {
    error: null, found: true, dt: data[0].dt, created_at: data[0].created_at,
    dataType: Array.isArray(rows) ? "array" : typeof rows,
    count: Array.isArray(rows) ? rows.length : (rows && typeof rows === "object" ? Object.keys(rows).length : 0),
    keys: (Array.isArray(rows) && rows[0] && typeof rows[0] === "object") ? Object.keys(rows[0]) : null,
    first: (Array.isArray(rows) ? rows[0] : (rows && typeof rows === "object" ? Object.values(rows)[0] : null)) || null,
    payloadKeys: data[0].payload ? Object.keys(data[0].payload) : null,
  };
}

// อ่าน snapshot ของวันเดียว (เจาะจง dt) — คืน payload.data (แถวหุ้น) เท่านั้น เพื่อลดขนาด
export async function loadSnapshotRows(market = "thailand", date = "") {
  const db = supabase();
  const { data, error } = await db
    .from("snapshots")
    .select("dt,created_at,rows:payload->data")
    .eq("dt", market + "|" + date)
    .limit(1);
  if (error) return { date: null, rows: [], error: error.message };
  if (!data || data.length === 0) return { date: null, rows: [], error: null };
  let rows = data[0].rows || [];
  if (!Array.isArray(rows)) rows = Object.values(rows || {});   // กันกรณีเก็บเป็น object (schema เก่า)
  return { date: (data[0].dt || "").split("|")[1], created_at: data[0].created_at, rows, error: null };
}

// อ่านหลายวัน (ช่วง from..to) — ใช้เฉพาะโหมด track (จำกัดจำนวนวันเพื่อกัน timeout)
export async function loadSnapshotsRange(market = "thailand", from = "", to = "", limit = 400) {
  const db = supabase();
  const { data, error } = await db
    .from("snapshots")
    .select("dt,rows:payload->data")
    .like("dt", market + "|%")
    .gte("dt", market + "|" + from)
    .lte("dt", market + "|" + to)
    .order("dt", { ascending: true })
    .limit(limit);
  if (error) return { days: [], error: error.message };
  const days = (data || []).map((r) => ({
    date: (r.dt || "").split("|")[1],
    rows: r.rows || [],
  }));
  return { days, error: null };
}

// History breadth: ส่ง %Above MA50/MA200 ย้อนหลัง (สำหรับกราฟ Breadth History เหมือนตัว benchmark)
export async function loadBreadthHistory(market = "thailand", days = 90) {
  const db = supabase();
  const { data, error } = await db
    .from("snapshots")
    .select("dt, payload")
    .like("dt", market + "|%")
    .order("dt", { ascending: true })
    .limit(200);
  if (error) return { history: [], error: error.message };
  const out = [];
  for (const s of data || []) {
    const p = s.payload || {};
    const bf = p.marketSummary?.breadth_full || p.breadth_full;
    if (!bf || bf.pctAboveMA50 == null) continue;
    out.push({
      date: (s.dt || "").split("|")[1] || (p.created_at || s.dt || "").slice(0, 10),
      pctAboveMA50: bf.pctAboveMA50,
      pctAboveMA200: bf.pctAboveMA200,
      upPct: bf.upPct,
      total: bf.total,
    });
  }
  return { history: out.slice(-days), error: null };
}