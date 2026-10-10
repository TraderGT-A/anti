// /api/scan — full-market RS ranking with per-group filters + Rank Change via Supabase
import { scanMarket, toCommonStocks, breadthFull, getIndexMembership } from "./lib/scan.js";

// force=1 ข้ามแคชได้ แต่ไม่ให้สแกน TradingView + เขียน Supabase ถี่กว่านี้ (กันผู้เข้าชมหลายคน/auto-refresh รัวใส่)
const FORCE_COOLDOWN_MS = 30_000;
import { loadPreviousSnapshot, saveSnapshot, marketToday, supabase } from "./lib/supabase.js";
import "../trendlib.js";
import "../fundlog.js";   // globalThis.FundLog — บันทึก EPS แบบ point-in-time
import "../leaders.js";   // globalThis.Leaders — ผู้นำหุ้นไทย + paper-trade (กฎล็อกใน research/PREREG_forward_th_leaders_2026-10-10.md)   // ตั้ง globalThis.TrendLib (ไฟล์เดียวกับที่เว็บ/เทสต์ใช้ — อยู่นอก api/ จึงไม่นับเป็น Function)

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
  if (universe === "squeeze") {   // ATR10/ATR50 ของหุ้นที่ client ส่งมา (≤80 ตัว) — คำนวณจากแท่งรายวัน Yahoo, แคช 6 ชม. ต่อหุ้น (อัตโนมัติ ไม่ต้องมีใครมาเรียกด้วยมือ)
    const list = [...new Set(String(req.query.t || "").split(",").map((x) => x.trim()).filter((x) => /^[A-Za-z0-9.\-]{1,12}$/.test(x)))].slice(0, 80);
    global.__sqCache = global.__sqCache || {};
    const TTL = 6 * 3600_000, today = marketToday(market), out = {}, todo = [];
    for (const tk of list) { const c = global.__sqCache[market + "|" + tk]; if (c && now - c.ts < TTL) out[tk] = c.v; else todo.push(tk); }
    const ysym = (tk) => market === "america" ? tk.replace(/\./g, "-") : (/\.BK$/.test(tk) ? tk : tk + ".BK");
    const one = async (tk) => {
      try {
        const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ysym(tk))}?interval=1d&range=1y`, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
        const q = (await r.json())?.chart?.result?.[0]; if (!q) return;
        const ts = q.timestamp || [], z = q.indicators?.quote?.[0] || {}, bars = [];
        for (let i = 0; i < ts.length; i++) {
          if (z.close?.[i] == null || z.high?.[i] == null || z.low?.[i] == null) continue;
          const d = new Date(ts[i] * 1000).toISOString().slice(0, 10);
          if (d >= today) continue;   // ตัดแท่งของวันนี้ (ยังไม่ปิด → ช่วงแกว่งสั้นเกินจริง ทำให้ดูบีบตัวเกินจริง)
          bars.push({ time: d, open: z.open?.[i] ?? z.close[i], high: z.high[i], low: z.low[i], close: z.close[i], volume: z.volume?.[i] || 0 });
        }
        const v = globalThis.TrendLib.squeeze(bars); if (!v || !Number.isFinite(v.atrRatio)) return;
        const rounded = { atrRatio: Math.round(v.atrRatio * 1000) / 1000, atr10Pct: Math.round(v.atr10Pct * 100) / 100, range10Pct: Math.round(v.range10Pct * 100) / 100, volDry: v.volDry == null ? null : Math.round(v.volDry * 100) / 100, asOf: v.asOf };
        global.__sqCache[market + "|" + tk] = { ts: Date.now(), v: rounded }; out[tk] = rounded;
      } catch (e) { /* ตัวไหนดึงไม่ได้ก็ข้าม */ }
    };
    for (let i = 0; i < todo.length; i += 10) await Promise.all(todo.slice(i, i + 10).map(one));
    res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=3600");
    return res.status(200).json({ market, asOf: new Date().toISOString(), requested: list.length, sq: out });
  }
  if (universe === "leaders") {   // ผู้นำหุ้นไทย near52wHigh + โมเมนตัม 12-1 (ไทยเท่านั้น) — GET = ดูรายชื่อ/ผล paper-trade, tick=1 (cron + CRON_SECRET) = เก็บ snapshot และเดิน paper-trade 1 วัน
    const L = globalThis.Leaders, KEY = "leaders|state";
    try {
      const isUs = req.query.market === "us" || req.query.market === "america", MKT = isUs ? "america" : "thailand";
      const { raw } = await scanMarket(MKT);
      const rows = toCommonStocks(raw).filter((s) => s.price > 0 && s.hi52 > 0).map((s) => ({ tk: s.ticker, name: s.name, close: s.price, open: s.o || null, hi52: s.hi52, p1y: s.p1y, p1m: s.p1m, turn: (s.avgVol || 0) * s.price }));
      let gate = {}, setClose = null;
      try {
        const r = await fetch("https://scanner.tradingview.com/" + MKT + "/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: { tickers: [isUs ? "SP:SPX" : "SET:SET"] }, columns: ["close", "SMA50", "SMA200"] }) });
        const d = (await r.json())?.data?.[0]?.d; if (d) { gate = { price: d[0], sma50: d[1], sma200: d[2] }; setClose = d[0]; }
      } catch (e) { /* Gate = unknown → 50% */ }
      const snap = { date: marketToday(MKT), rows, gate, setClose };
      if (isUs) {   // สหรัฐฯ: รายชื่อประกอบเท่านั้น — backtest 26 ปีไม่พบ edge จึงไม่มี paper-trade/state
        if (req.query.tick) { res.setHeader("Cache-Control", "no-store"); return res.status(400).json({ error: "tick is Thailand-only" }); }
        const sig = L.pick(rows, gate, 20, "america");
        res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=900");
        return res.status(200).json({ market: "america", noEdge: true, asOf: snap.date, gate: sig.gate, gateIdx: gate, poolSize: sig.poolSize, picks: sig.top });
      }
      const db = supabase(), cur = await db.from("snapshots").select("payload").eq("dt", KEY).maybeSingle(), state = (cur.data && cur.data.payload) || L.newState();
      if (req.query.tick === "1" || req.query.tick === "true") {
        const sec = process.env.CRON_SECRET;
        if (!sec || req.headers.authorization !== "Bearer " + sec) { res.setHeader("Cache-Control", "no-store"); return res.status(401).json({ error: "unauthorized" }); }
        const out = L.step(state, snap);
        if (out.changed) { const { error } = await db.from("snapshots").upsert({ dt: KEY, created_at: new Date().toISOString(), payload: state }, { onConflict: "dt" }); if (error) return res.status(500).json({ error: error.message }); }
        let fund = null;   // เก็บ EPS/กำไรสุทธิแบบ point-in-time (เฉพาะวันที่ค่าเปลี่ยน) — ล้มเหลวต้องไม่กระทบ paper-trade
        try {
          const FL = globalThis.FundLog, tks = new Set(rows.map((x) => x.tk));
          const fr = await fetch("https://scanner.tradingview.com/thailand/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: { query: { types: [] }, tickers: [] }, columns: ["name", ...FL.COLS], range: [0, 4000] }) });
          const cur = {}; for (const x of ((await fr.json())?.data || [])) { const d = x.d || []; if (tks.has(d[0])) cur[d[0]] = FL.pack(d.slice(1)); }
          if (Object.keys(cur).length > 100) {
            const FK = "fund|th|latest", LK = "fund|th|log|" + snap.date.slice(0, 7), prev = await db.from("snapshots").select("payload").eq("dt", FK).maybeSingle();
            const df = FL.diff((prev.data && prev.data.payload && prev.data.payload.f) || {}, cur);
            if (df.changes.length) {
              const lg = await db.from("snapshots").select("payload").eq("dt", LK).maybeSingle(), log = (lg.data && lg.data.payload) || { cols: FL.COLS, days: {} };
              log.days[snap.date] = df.changes.map((c) => [c.tk, ...c.v]);
              const now = new Date().toISOString();
              const e1 = await db.from("snapshots").upsert({ dt: LK, created_at: now, payload: log }, { onConflict: "dt" });
              const e2 = await db.from("snapshots").upsert({ dt: FK, created_at: now, payload: { d: snap.date, cols: FL.COLS, f: df.latest } }, { onConflict: "dt" });
              fund = { added: df.added, changed: df.changed, error: (e1.error || e2.error || {}).message || null };
            } else fund = { added: 0, changed: 0 };
          } else fund = { skipped: "too few rows " + Object.keys(cur).length };
        } catch (e) { fund = { error: String((e && e.message) || e) }; }
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).json({ ok: true, date: snap.date, changed: out.changed, rebalanced: !!out.rebalanced, reason: out.reason || null, rows: rows.length, summary: L.summary(state), fund });
      }
      const sig = L.pick(rows, gate);
      res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=900");
      return res.status(200).json({
        asOf: snap.date, gate: sig.gate, gateIdx: gate, poolSize: sig.poolSize, picks: sig.top,
        paper: { started: state.start, lastDate: state.lastDate, summary: L.summary(state), nav: (state.nav || []).slice(-400), rebalances: (state.rebal || []).slice(-6).reverse(), holdings: Object.keys((state.S && state.S.pos) || {}).length },
      });
    } catch (e) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(500).json({ error: String((e && e.message) || e) });
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

    // snapshot เก็บเฉพาะฟิลด์หลัก — ฟิลด์ Scanner (SMA150/EMA20/52w/ATR/vol) คำนวณสดทุกสแกน ไม่ต้องบวม DB
    const SCANNER_ONLY = ["sma150", "ema20", "hi52", "lo52", "atr"];
    await saveSnapshot({ ...payload, data: clean.map(s => { const c = { ...s }; SCANNER_ONLY.forEach(k => delete c[k]); return c; }) });   // persist to Supabase (แยก snapshot ต่อ market)
    if (!global.__scanCache) global.__scanCache = {};
    global.__scanCache[market] = { data: payload, ts: Date.now() };
    return res.status(200).json(payload);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}