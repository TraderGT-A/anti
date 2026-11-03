// /api/idxchart?symbol=^SET.BK&interval=1d&range=3y — กราฟดัชนีไทย (SET/SET50/SET100/mai) จาก TradingView
// เหตุผล: Yahoo ส่งประวัติดัชนีไทยมาแค่ 1 แท่ง และวิดเจ็ตของ TradingView ไม่รองรับสัญลักษณ์ไทย → ดึงแท่งเทียนผ่าน websocket ของ TradingView ตรง ๆ
import WebSocket from "ws";

const SYMS = { "^SET.BK": "SET:SET", "^SET50.BK": "SET:SET50", "^SET100.BK": "SET:SET100", "^MAI.BK": "SET:MAI" };
// (interval,range) ที่หน้าเว็บใช้ → ความละเอียดของ TradingView + จำนวนแท่ง
const RES = {
  "1d|3y": ["D", 780], "1d|2y": ["D", 520], "1d|1y": ["D", 260], "1d|5y": ["D", 1300],
  "1wk|2y": ["W", 110], "1wk|5y": ["W", 265], "1mo|5y": ["M", 62], "1mo|10y": ["M", 125],
  "30m|1mo": ["30", 420],
};

function fetchBars(tvSym, res, count) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket("wss://data.tradingview.com/socket.io/websocket", { headers: { Origin: "https://www.tradingview.com", "User-Agent": "Mozilla/5.0" } });
    const frame = (o) => { const s = JSON.stringify(o); return "~m~" + s.length + "~m~" + s; };
    const send = (m, p) => ws.send(frame({ m, p }));
    const cs = "cs_" + Math.random().toString(36).slice(2, 14);
    const bars = [];
    let done = false;
    const finish = (err) => { if (done) return; done = true; clearTimeout(timer); try { ws.close(); } catch (e) {} err ? reject(err) : resolve(bars); };
    const timer = setTimeout(() => finish(bars.length ? null : new Error("timeout")), 8000);
    ws.on("open", () => {
      send("set_auth_token", ["unauthorized_user_token"]);
      send("chart_create_session", [cs, ""]);
      send("resolve_symbol", [cs, "sds_sym_1", '={"symbol":"' + tvSym + '","adjustment":"splits"}']);
      send("create_series", [cs, "sds_1", "s1", "sds_sym_1", res, count, ""]);
    });
    ws.on("message", (d) => {
      for (const part of d.toString().split(/~m~\d+~m~/).filter(Boolean)) {
        if (part.startsWith("~h~")) { ws.send("~m~" + part.length + "~m~" + part); continue; }
        let j; try { j = JSON.parse(part); } catch (e) { continue; }
        if (j.m === "symbol_error" || j.m === "critical_error" || j.m === "series_error") return finish(new Error(j.m));
        if (j.m === "timescale_update" || j.m === "du") {
          const sds = j.p && j.p[1] && j.p[1].sds_1;
          if (sds && sds.s) sds.s.forEach((x) => bars.push(x.v));
        }
        if (j.m === "series_completed") return finish(null);
      }
    });
    ws.on("error", (e) => finish(e));
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const symbol = String(req.query.symbol || ""), interval = String(req.query.interval || "1d"), range = String(req.query.range || "3y");
  const tv = SYMS[symbol], rr = RES[interval + "|" + range];
  if (!tv || !rr) return res.status(400).json({ error: "unsupported symbol/interval/range" });
  try {
    const raw = await fetchBars(tv, rr[0], rr[1]);
    const intraday = rr[0] !== "D" && rr[0] !== "W" && rr[0] !== "M";
    const seen = new Set();
    const data = raw
      .filter((v) => v && v.length >= 5 && !seen.has(v[0]) && seen.add(v[0]))
      .sort((a, b) => a[0] - b[0])
      .map((v) => ({
        time: intraday ? v[0] : new Date((v[0] + 7 * 3600) * 1000).toISOString().slice(0, 10),   // วันที่ตามเวลาไทย
        open: v[1], high: v[2], low: v[3], close: v[4], volume: 0,
      }));
    if (!data.length) { res.setHeader("Cache-Control", "no-store"); return res.status(404).json({ error: "no data" }); }
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({ symbol, source: "tradingview", interval, range, count: data.length, data });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: String(e && e.message || e).slice(0, 120) });
  }
}
