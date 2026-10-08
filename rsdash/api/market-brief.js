// /api/market-brief — Market Brief: บอกการเปลี่ยนแปลง Breadth เทียบเมื่อวาน + เทียบสัปดาห์ แนวโน้มเข้าใจง่าย
import { supabase } from "./lib/supabase.js";

const mkLabel = { thailand: "ไทย 🇹🇭", america: "อเมริกา 🇺🇸" };

// อ่าน history จาก breadth_history ตรง (เหมือน /api/breadth) — ไม่พึ่ง snapshots-map
async function loadHist(market){
  try{
    const db=supabase();
    const {data,error}=await db.from("breadth_history")
      .select("date, pct_above_ma50, pct_above_ma200")
      .eq("market",market).order("date",{ascending:true}).limit(400);
    if(error) return [];
        // ตัดวันตลาดปิด (เสาร์-อาทิตย์) ออก — ให้ Δ เทียบเฉพาะวันทำการก่อนหน้า (จันทร์เทียบศุกร์, เสาร์คงค่าเดิม)
        const wk = (data||[]).filter(x=>{
          const dd=new Date(String(x.date||'').slice(0,10)+'T00:00:00Z').getUTCDay();
          return dd!==0 && dd!==6;
        });
        return wk.map(x=>({date:x.date, pctAboveMA50:x.pct_above_ma50, pctAboveMA200:x.pct_above_ma200}));
  }catch(e){ return []; }
}

// เทรนด์ label จาก delta
function trend(dv, dw){
  if (dv == null && dw == null) return "";
  // ใช้ delta ช่วง 5 วันเป็นหลัก (vw มีทิศ) แล้ว delta 1วันเสริม
  let s = "";
  if (dw != null && Math.abs(dw) >= 1) s += dw > 0 ? "ดีขึ้น ▲" : "อ่อนลง ▼";
  else s += dw != null ? "ทรง ▲/▽" : (dv != null ? (dv > 0 ? "ดีขึ้น ▲" : dv < 0 ? "อ่อนลง ▼" : "ทรง") : "");
  return s;
}

async function currentBreadth(market) {
  const r = await fetch(`https://rsdashclean.vercel.app/api/scan?market=${market}`, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) return null;
  const d = await r.json();
  const bf = d?.marketSummary?.breadth_full || {};
  if (bf.pctAboveMA50 == null) return null;
  return { ma50: bf.pctAboveMA50, ma200: bf.pctAboveMA200, a50: bf.aboveMA50, a200: bf.aboveMA200, total: bf.total, up: bf.up, down: bf.down };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=240");
  if (req.method === "OPTIONS") return res.status(200).end();
  try {
    const out = { updated_at: new Date().toISOString(), markets: [] };
    for (const m of ["thailand", "america"]) {
      const cur = await currentBreadth(m);
      if (!cur) continue;
      const history = await loadHist(m);
      // หา Δ เทียบวาน (จุดก่อนหน้าสุด) + Δ5D (จุดที่ 6 นับจากท้าย)
      const ptsMA50 = (history || []).filter(x => x.pctAboveMA50 != null);
      const ptsMA200 = (history || []).filter(x => x.pctAboveMA200 != null);
      const dl50 = ptsMA50.length >= 2 ? cur.ma50 - ptsMA50[ptsMA50.length - 1].pctAboveMA50 : null;
            const dw50 = ptsMA50.length >= 6 ? cur.ma50 - ptsMA50[ptsMA50.length - 5].pctAboveMA50 : null;
            const dl200 = ptsMA200.length >= 2 ? cur.ma200 - ptsMA200[ptsMA200.length - 1].pctAboveMA200 : null;
            const dw200 = ptsMA200.length >= 6 ? cur.ma200 - ptsMA200[ptsMA200.length - 5].pctAboveMA200 : null;
      const r50 = Math.round((dl50 != null ? dl50 : 0) * 10) / 10;
      const r500 = Math.round((dw50 != null ? dw50 : 0) * 10) / 10;
      const r200 = Math.round((dl200 != null ? dl200 : 0) * 10) / 10;
      const r2000 = Math.round((dw200 != null ? dw200 : 0) * 10) / 10;
      out.markets.push({
        market: m, label: mkLabel[m] || m,
        ma50: cur.ma50, ma200: cur.ma200, a50: cur.a50, a200: cur.a200, total: cur.total, up: cur.up, down: cur.down,
        d1: { ma50: r50, ma200: r200 },
        d5: { ma50: r500, ma200: r2000 },
        trend: {
          ma50: trend(r50, r500),
          ma200: trend(r200, r2000),
        },
      });
    }
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}