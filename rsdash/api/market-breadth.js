// /api/market-breadth — ตาราง Breadth (MA50/MA200) ตลาดที่เรามีจริง (ไทย+US), ไม่มโน HK/JP/KR/CN
const mk = { thailand: "TH", america: "US" };

async function currentBreadth(market) {
  const r = await fetch(`https://rsdashclean.vercel.app/api/scan?market=${market}`, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) return null;
  const d = await r.json();
  const bf = d?.marketSummary?.breadth_full || {};
  if (bf.pctAboveMA50 == null) return null;
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
    const markets = [];
    for (const m of ["thailand", "america"]) {
      const c = await currentBreadth(m);
      if (c) { markets.push(c); }
    }
    return res.status(200).json({ updated_at: new Date().toISOString(), markets });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}