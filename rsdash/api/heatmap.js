// /api/heatmap?market=thailand|america — สมาชิก SET100 / S&P500 พร้อม มูลค่าตลาด, sector, %วันนี้, %YTD (จาก TradingView scanner)
const CFG = {
  thailand: { ep: "thailand", set: "SYML:SET;SET100", label: "SET100" },
  america:  { ep: "america",  set: "SYML:SP;SPX",      label: "S&P 500" },
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const mk = req.query.market === "america" ? "america" : "thailand";
  const cfg = CFG[mk];
  try {
    const r = await fetch(`https://scanner.tradingview.com/${cfg.ep}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbols: { symbolset: [cfg.set] },
        columns: ["name", "close", "change", "market_cap_basic", "sector", "Perf.YTD", "description"],
        sort: { sortBy: "market_cap_basic", sortOrder: "desc" },
        range: [0, 600],
      }),
    });
    if (!r.ok) throw new Error("scanner " + r.status);
    const j = await r.json();
    const data = (j.data || [])
      .map((x) => {
        const d = x.d || [];
        return { ticker: d[0], price: d[1], change: d[2], mcap: d[3], sector: d[4] || "อื่นๆ", ytd: d[5], name: d[6] };
      })
      .filter((x) => x.ticker && x.mcap > 0 && x.change != null);
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.status(200).json({ market: mk, index: cfg.label, count: data.length, data });
  } catch (e) {
    res.status(502).json({ error: String(e).slice(0, 120) });
  }
}
