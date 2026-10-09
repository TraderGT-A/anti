// /api/market-breadth — ตาราง Breadth (MA50/MA200) ตลาดที่เรามีจริง (ไทย+US), ไม่มโน HK/JP/KR/CN
import { getLiveBreadth } from "./lib/scan.js";

const mk = { thailand: "TH", america: "US" };

async function currentBreadth(market) {
  const bf = await getLiveBreadth(market);
  if (!bf || bf.pctAboveMA50 == null) return null;
  return {
    market, label: mk[market] || market,
    ma50: bf.pctAboveMA50, ma200: bf.pctAboveMA200,
    a50: bf.aboveMA50, a200: bf.aboveMA200,
    up: bf.up, down: bf.down, total: bf.total,
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  // CDN cache 60s + stale-while-revalidate 240s (ลดการ scan ซ้ำ/ความหน่วง)
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=240");
  if (req.method === "OPTIONS") return res.status(200).end();
  try {
    const all = await Promise.all(["thailand", "america"].map((m) => currentBreadth(m).catch(() => null)));
    return res.status(200).json({ updated_at: new Date().toISOString(), markets: all.filter(Boolean) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
