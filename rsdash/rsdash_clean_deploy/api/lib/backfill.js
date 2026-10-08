// ตัวอ่านข้อมูลย้อนหลังที่สร้างเอง (hist/<market>/<date>.json) — เสิร์ฟเป็นไฟล์ static ในเว็บ
// ใช้เมื่อวันนั้นไม่มี snapshot ใน Supabase (ระบบเก็บ snapshot รายหุ้นได้แค่ 6 วันแรก)
// โครงไฟล์: {date, market, source:"ohlc_backfill", count, universe, rows:[...]}
// index: hist/<market>/index.json = {days:[{date,count}], first, last, generated_at, note}

const DIR = { thailand: "th", america: "us" };

export function backfillBase(req) {
  const host = (req && req.headers && (req.headers["x-forwarded-host"] || req.headers.host)) || "rsdashclean.vercel.app";
  return "https://" + String(host).split(",")[0].trim();
}

export async function loadBackfillIndex(base, market = "thailand") {
  const dir = DIR[market] || "th";
  try {
    const r = await fetch(`${base}/hist/${dir}/index.json`, { headers: { "cache-control": "no-cache" } });
    if (!r.ok) return { days: [], error: `HTTP ${r.status}` };
    const j = await r.json();
    return { days: (j.days || []).filter((d) => d && d.date), meta: { source: j.source, generated_at: j.generated_at, note: j.note }, error: null };
  } catch (e) {
    return { days: [], error: String((e && e.message) || e) };
  }
}

export async function loadBackfillDay(base, market, date) {
  const dir = DIR[market] || "th";
  try {
    const r = await fetch(`${base}/hist/${dir}/${date}.json`);
    if (!r.ok) return { date: null, rows: [], source: null, note: `HTTP ${r.status}` };
    const j = await r.json();
    return { date: j.date || date, rows: j.rows || [], source: j.source || "ohlc_backfill", note: j.note || null };
  } catch (e) {
    return { date: null, rows: [], source: null, note: String((e && e.message) || e) };
  }
}
