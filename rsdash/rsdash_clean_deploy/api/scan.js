// /api/scan — full-market RS ranking with per-group filters + Rank Change via Supabase
import { scanMarket, toCommonStocks, breadthFull, getIndexMembership } from "./lib/scan.js";

// force=1 ข้ามแคชได้ แต่ไม่ให้สแกน TradingView + เขียน Supabase ถี่กว่านี้ (กันผู้เข้าชมหลายคน/auto-refresh รัวใส่)
const FORCE_COOLDOWN_MS = 30_000;
import { loadPreviousSnapshot, saveSnapshot } from "./lib/supabase.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const force = (req.query.force === "1" || req.query.force === "true");
  const market = (req.query.market === "us" || req.query.market === "america") ? "america" : "thailand";
  const now = Date.now();

  if (force) {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  } else {
    res.setHeader("Cache-Control", "public, s-maxage=45, stale-while-revalidate=120");
  }

  // universe 'all' → หุ้นสามัญล้วนทั้งตลาด (Top20 จริง ไม่อิงเกณฑ์ RS/สภาพคล่อง)
  // ⚠️ ต้องเช็คก่อน in-memory cache ของ scan ปกติ — ไม่งั้น cache (key แค่ market) จะตอบทับแล้วได้ 108 ตัว (บั๊ก 5 ต.ค.)
  const universe = String(req.query.universe || "");
  if (universe === "indexes") {   // สมาชิก index สหรัฐฯ (แคช 12 ชม.) — รวมไว้ที่นี่เพราะแพลน Hobby จำกัด 12 Functions
    try {
      const data = await getIndexMembership();
      res.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=86400");
      return res.status(200).json(data);
    } catch (e) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(502).json({ error: String((e && e.message) || e) });
    }
  }
  if (universe === "all") {
    if (!force) {
      res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");   // สั้นกว่า default (กัน CDN แคชคำตอบข้าม deploy)
    }
    const ckAll = global.__scanAllCache && global.__scanAllCache[market];
    if (!force && ckAll && ckAll.data && now - ckAll.ts < 300_000) {
      return res.status(200).json(ckAll.data);
    }
    try {
      // ใช้ raw ของ scanMarket → RS ฐานเดียวกันกับ Dashboard (เลข RS ตรงกันทุกหน้า)
      const { raw } = await scanMarket(market);
      const rows = toCommonStocks(raw);
      const payload = {
        market, universe: "all", source: "tradingview_scan_common",
        total_market: raw.length, count: rows.length, data: rows,
      };
      global.__scanAllCache = global.__scanAllCache || {};
      global.__scanAllCache[market] = { ts: Date.now(), data: payload };
      return res.status(200).json(payload);
    } catch (e) {
      return res.status(500).json({ error: String((e && e.message) || e) });
    }
  }

  // Simple in-memory TTL cache per (market) — เฉพาะ scan ปกติ (universe ว่าง)
  const ck = global.__scanCache?.[market];
  if (ck && ck.data && (force ? now - ck.ts < FORCE_COOLDOWN_MS : now - ck.ts < 300_000)) {
    return res.status(200).json(ck.data);
  }

  const t0 = Date.now();
  try {
    const { raw, clean } = await scanMarket(market);

    // Yesterday's Rank map from Supabase (แยกตาม market)
    const { snapshot } = await loadPreviousSnapshot(market);
    const oldRank = {};
    if (snapshot && snapshot.payload) {
      // snapshot เก่าที่ไม่มี rT: data ถูกเรียงตาม score อยู่แล้ว → ใช้ลำดับในลิสต์เป็นอันดับ
      // (ของเดิมถอยไปใช้ s.rs ซึ่งเป็นคะแนนเปอร์เซ็นไทล์ 1-99 ไม่ใช่อันดับ → Rank Change เพี้ยน)
      (snapshot.payload.data || []).forEach((s, i) => {
        oldRank[s.ticker] = (s.rT != null) ? s.rT : i + 1;
      });
    }

    clean.sort((a, b) => b.score - a.score);
    clean.forEach((s, i) => {
      s.rT = i + 1;
      s.score = Math.round(s.score * 10000) / 10000;
      const y = oldRank[s.ticker];
      if (y != null) {
        // อันดับจริง: อันดับเมื่อวาน - อันดับวันนี้ (เช่น เมื่อวาน #20 วันนี้ #5 => 20 - 5 = +15 อันดับดีขึ้น)
        s.rD = y - s.rT;
        s.rD_str = s.rD > 0 ? "+" + s.rD : String(s.rD);
      } else {
        s.rD = null;
        s.rD_str = "NEW";
      }
    });

    // (ลบ aggregate 'industries' แล้ว — ค่านี้คือ Value traded ไม่ใช่ Money Flow หลอก ทำให้เข้าใจผิด)

    // === "มูลค่าซื้อขายของหุ้นที่ขึ้น/ลง" (โปร่งใส เก็บแค่ 1D) ===
    // หมายเหตุ: เราไม่มี data "เงินไหลจริง" (net flow) — ใช้ "มูลค่าซื้อขาย(val) ของหุ้นที่ราคาขึ้น/ลงวันนี้" แทน
    // ตัด 1W/1M ออก เพราะ val เป็นมูลค่า 1 วันเดียว นำไปชั่งข้าม TF ไม่ได้ความ → จะเป็น "มโน"
    // หุ้นที่ไม่เปลี่ยนราคา/ไม่มีค่า change ไม่นับเป็น "ลง" (ของเดิมตกไปฝั่ง out → ขัดกับ Breadth ที่นับ up/down แยกจริง)
    const tfs = {
      "1d": s => (s.change ?? 0) > 0,
    };
    const moneyFlow = { sums: {}, byIndustry: {} };
    for (const tf of Object.keys(tfs)) {
      let tin = 0, tout = 0;
      const ind = {};
      clean.forEach(s => {
        const k = s.industry || s.sector || "Other";
        const v = s.val || 0;
        const ch = s.change ?? 0;
        if (tfs[tf](s)) { tin += v; ind[k] = ind[k] || { in: 0, out: 0 }; ind[k].in += v; }
        else if (ch < 0) { tout += v; ind[k] = ind[k] || { in: 0, out: 0 }; ind[k].out += v; }
      });
      moneyFlow.sums[tf] = { in: Math.round(tin), out: Math.round(tout), net: Math.round(tin - tout) };
      moneyFlow.byIndustry[tf] = Object.entries(ind)
        .map(([name, v]) => ({ name, in: Math.round(v.in), out: Math.round(v.out), net: Math.round(v.in - v.out) }))
        .sort((a, b) => b.net - a.net);
    }
    moneyFlow.updated_at = new Date().toISOString();

    // === ธีมหุ้นอัตโนมัติ: กลุ่มหุ้นที่ RS แรง (>=80) ใน Industry เดียวกัน ===
    // ธีม = industry ที่มีหุ้น RS>=80 อย่างน้อย 2 ตัว เรียงตามผลรวม RS+เงินเข้า
    const strong = clean.filter(s => s.rs >= 80);
    const themeMap = {};
    strong.forEach(s => {
      const k = s.industry || s.sector || "Other";
      if (!themeMap[k]) themeMap[k] = [];
      themeMap[k].push(s);
    });
    const themes = Object.entries(themeMap)
      .filter(([k, arr]) => arr.length >= 2)               // ต้องมี >=2 หุ้นแรง
      .map(([name, arr]) => {
        const sorted = arr.sort((a, b) => b.rs - a.rs);
        const avgRS = Math.round(sorted.reduce((x, s) => x + s.rs, 0) / sorted.length);
        const totalVal = sorted.reduce((x, s) => x + (s.val || 0), 0);
        return {
          name,
          rank: 0, avgRS, count: sorted.length, totalVal: Math.round(totalVal),
          stocks: sorted.map(s => ({ ticker: s.ticker, name: s.name, rs: s.rs, change: s.change, price: s.price })),
        };
      })
      .sort((a, b) => (b.avgRS - a.avgRS) || (b.totalVal - a.totalVal))
      .map((t, i) => ({ ...t, rank: i + 1 }))
      .slice(0, 10);

    // === สรุปตลาดอัตโนมัติ (ตามกรอบ O'Neil/CANSLIM: ดู character ของ tape) ===
    // === Breadth แท้: เต็มตลาด (stock ล้วน — ก่อน RS/filter) ตาม O'Neil CANSLIM (M) ===
    // ใช้ raw (ทุกหุ้นหลัง junk/close ผ่าน) ไม่ใช่ clean (filter RS/เงิน) — ภาพจริงทั้งกระดาน
    // ใช้ raw (ทุกหุ้นหลัง junk/close ผ่าน = กลุ่มที่คำนวณ RS) เป็นฐานทั้งกระดาน — อย่าตัด change≠0 (ราคาเปิด=ปิดก็เป็นหุ้นจริง)
    const breadth_full = breadthFull(raw);   // สูตรเดียวกับ /api/market-brief และ /api/market-breadth (lib/scan.js)

    // 1) momentum วันนี้ของทั้งตลาด (หุ้นที่ผ่าน filter ขึ้น vs ลง)
    const upToday = clean.filter(s => (s.change ?? 0) > 0);
    const dnToday = clean.filter(s => (s.change ?? 0) < 0);
    const breadth = clean.length ? Math.round(upToday.length / clean.length * 100) : 0;
    // 2) เงินไหลรวม 1d
    const m1d = moneyFlow.sums["1d"] || {};
    const netDir = m1d.net >= 0 ? "เข้า" : "ออก";
    // 3) หุ้นแรงสุด (RS>=90) และอ่อนสุด (RS<50) น่าจับตา
    const strongTop = clean.filter(s => s.rs >= 90).sort((a,b)=>b.rs-a.rs).slice(0,5)
      .map(s => ({ ticker: s.ticker, name: s.name, rs: s.rs, change: s.change, p1m: s.p1m, industry: s.industry, isDR: s.isDR }));
    const weakFlag = clean.filter(s => s.rs < 50 && (s.change ?? 0) < -3).sort((a,b)=>a.change-b.change).slice(0,5)
      .map(s => ({ ticker: s.ticker, name: s.name, rs: s.rs, change: s.change, p3m: s.p3m, industry: s.industry, isDR: s.isDR }));
    // 4) UPCOMING = RS >70 (ยังไม่พีค, 73-89 ไม่ใช่ท็อปแรงสุด) + กำลังเร่ง 1M/1W + — ตามบอส: RS>70
    const upComing = clean
      .filter(s => s.rs >= 70 && s.rs <= 89 && (s.p1m ?? 0) > 0 && (s.p1w ?? 0) > 0)
      .sort((a,b) => (b.p1m??0) - (a.p1m??0)).slice(0,6)
      .map(s => ({ ticker: s.ticker, name: s.name, rs: s.rs, p1m: s.p1m, p1w: s.p1w, p6m: s.p6m, change: s.change, industry: s.industry, isDR: s.isDR }));
    // 5) DOWNCOMING = RS สูง (RS>70) แต่กำลังอ่อน: 1M ลบ/แรงขายเริ่ม (distribution) — ตามบอส: RS>70
    const downComing = clean
      .filter(s => (s.rs ?? 0) >= 70 && ((s.p1m ?? 0) < -4 || ((s.p1m ?? 0) < 0 && (s.p1w ?? 0) < -3)))
      .sort((a,b) => (a.p1m??0) - (b.p1m??0)).slice(0,6)
      .map(s => ({ ticker: s.ticker, name: s.name, rs: s.rs, p1m: s.p1m, p1w: s.p1w, p3m: s.p3m, change: s.change, industry: s.industry, isDR: s.isDR }));
    // 6) ธีมที่มีเงินไหลเข้า net ดีสุด กับแย่สุด 1d
    const flowByInd = moneyFlow.byIndustry["1d"] || [];
    const inflows1d = flowByInd.filter(x => x.net > 0).sort((a,b)=>b.net-a.net).slice(0,3).map(x=>x.name);
    const outflows1d = flowByInd.filter(x => x.net < 0).sort((a,b)=>a.net-b.net).slice(0,3).map(x=>x.name);
    const marketSummary = {
      breadth: { up: upToday.length, down: dnToday.length, upPct: breadth, sampled: clean.length },
      breadth_full,                // เต็มตลาด stock ล้วน — ภาพจริงทั้งกระดาน (CANSLIM M)
      money1d: m1d, moneyDir: netDir,
      strongest: strongTop,          // RS>=90 leaders
      weakening: weakFlag,           // RS<50 + drop>3%
      upComing,                      // Emerging: RS กำลังขึ้น ยังไม่พีค
      downComing,                    // กำลังอ่อนแรง ระวัง
      inflows1d, outflows1d,          // ธีมเงินเข้า/ออก net สุด 1d
      themes_top: themes.slice(0,3).map(t=>({rank:t.rank,name:t.name,avgRS:t.avgRS,count:t.count})),
      // Top rank movers (ขึ้น/ลงอันดับวัน) — ใช้ rD (rank change) เรียงตามขนาด shift
      rank_up: clean.filter(s=>Number.isFinite(s.rD)&&s.rD>0).sort((a,b)=>b.rD-a.rD).slice(0,3)
        .map(s=>({ticker:s.ticker,name:s.name,rs:s.rs,rD:s.rD,rT:s.rT,change:s.change,p1m:s.p1m,industry:s.industry})),
      rank_down: clean.filter(s=>Number.isFinite(s.rD)&&s.rD<0).sort((a,b)=>a.rD-b.rD).slice(0,3)
        .map(s=>({ticker:s.ticker,name:s.name,rs:s.rs,rD:s.rD,rT:s.rT,change:s.change,p1m:s.p1m,industry:s.industry})),
      generated_at: new Date().toISOString(),
    };

    // Industry money flow — NOTE: ไม่ส่ง 'industries' (Value traded) ออกไปแล้ว เพราะ
    // มันถูกเข้าใจผิดเป็น Money Flow (ค่า Value ≠ เงินไหล) เราใช้ moneyFlow.byIndustry แทน
    const payload = {
      market,
      source: "tradingview_scan_serverless",
      total_market: raw.length,
      count: clean.length,
      created_at: new Date().toISOString(),
      yesterday_rank_date: snapshot ? snapshot.dt : null,
      elapsed_ms: Date.now() - t0,
      moneyFlow,
      themes,
      marketSummary,
      data: clean,
    };

    await saveSnapshot(payload);   // persist to Supabase (แยก snapshot ต่อ market)
    if (!global.__scanCache) global.__scanCache = {};
    global.__scanCache[market] = { data: payload, ts: Date.now() };
    return res.status(200).json(payload);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}