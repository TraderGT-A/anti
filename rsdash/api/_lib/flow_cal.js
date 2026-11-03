// /api/flow?kind=cal&mk=th|us — ปฏิทินเศรษฐกิจของสัปดาห์นี้ (จันทร์–อาทิตย์ ตามเวลาไทย) จาก TradingView economic calendar
//   US: เฉพาะความสำคัญสูง (importance=1: ตัวเลขใหญ่ เช่น NFP, CPI, FOMC, ISM) · TH: มีเหตุการณ์น้อย เอาทุกระดับ
//   ผลลัพธ์: { mk, from, to, count, events:[{id,t,title,period,actual,forecast,previous,unit,imp,cur}] } เรียงตามเวลา · แคช CDN 10 นาที
const ICT = 7 * 3600e3;
const nz = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const mk = req.query.mk === "us" ? "us" : "th";
  try {
    const now = Date.now(), ict = new Date(now + ICT), dow = (ict.getUTCDay() + 6) % 7;   // 0 = จันทร์
    const mon = Date.UTC(ict.getUTCFullYear(), ict.getUTCMonth(), ict.getUTCDate() - dow) - ICT;   // จันทร์ 00:00 เวลาไทย (เป็น UTC ms)
    const end = mon + 7 * 864e5;
    const url = `https://economic-calendar.tradingview.com/events?from=${new Date(mon).toISOString()}&to=${new Date(end).toISOString()}&countries=${mk === "us" ? "US" : "TH"}&minImportance=${mk === "us" ? 1 : -1}`;
    const r = await fetch(url, { headers: { Origin: "https://www.tradingview.com", "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error("TradingView HTTP " + r.status);
    const j = await r.json();
    const events = (j.result || []).map((e) => ({
      id: e.id, t: e.date, title: e.title, period: e.period || "", actual: nz(e.actual), forecast: nz(e.forecast), previous: nz(e.previous),
      unit: e.unit || "", scale: e.scale || "", imp: e.importance, cur: e.currency || "",
    })).sort((a, b) => a.t.localeCompare(b.t));
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1800");
    return res.status(200).json({ mk, from: new Date(mon).toISOString(), to: new Date(end).toISOString(), count: events.length, events });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: String((e && e.message) || e).slice(0, 100) });
  }
}
