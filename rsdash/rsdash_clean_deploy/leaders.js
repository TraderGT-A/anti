/* leaders.js — "ผู้นำหุ้นไทย": near52wHigh + โมเมนตัม 12-1, Top20 รายเดือน × สัดส่วนหุ้นตาม Gate  + ตัวจำลอง paper-trade
   กฎล็อกไว้ใน research/PREREG_forward_th_leaders_2026-10-10.md (ห้ามแก้หลังเริ่ม)
   ใช้ทั้งบนเซิร์ฟเวอร์ (api/scan.js) เว็บ และเทสต์ → ตั้ง globalThis.Leaders */
(function (g) {
  'use strict';
  const N = 20, COST = 0.0035, CAPITAL = 1e6, BAND = 0.01, EXPOSURE = { green: 1, yellow: 0.5, red: 0, unknown: 0.5 };
  const fin = (v) => typeof v === 'number' && isFinite(v);

  /* Gate: SET เทียบ SMA50/SMA200 (นิยามเดียวกับ trendlib.gate) → { state, exposure } */
  function gateOf(idx) {
    const p = idx && idx.price, s50 = idx && idx.sma50, s200 = idx && idx.sma200;
    if (![p, s50, s200].every(fin)) return { state: 'unknown', exposure: EXPOSURE.unknown };
    let state = 'yellow';
    if (p > s50 && s50 > s200) state = 'green';
    else if (p < s200 || (p < s50 && s50 < s200)) state = 'red';
    return { state, exposure: EXPOSURE[state] };
  }

  /* พูล: ราคา ≥ 1, มูลค่าซื้อขาย > 0, มี high52/ผลตอบแทน 1 ปี/1 เดือน → เก็บครึ่งบนตามมูลค่าซื้อขาย */
  function pool(rows) {
    const ok = (rows || []).filter((r) => r && r.close >= 1 && r.turn > 0 && r.hi52 > 0 && fin(r.p1y) && fin(r.p1m) && 1 + r.p1m / 100 > 0);
    if (!ok.length) return [];
    const sorted = ok.map((r) => r.turn).sort((a, b) => a - b), thr = sorted[Math.floor(sorted.length * 0.5)];
    return ok.filter((r) => r.turn >= thr);
  }

  /* คะแนน = z(ราคา/high52) + z(โมเมนตัม 12-1) ภายในพูล (เรียงจากมากไปน้อย) */
  function score(poolRows) {
    const feats = poolRows.map((r) => ({ r, near52: r.close / r.hi52, mom: (1 + r.p1y / 100) / (1 + r.p1m / 100) - 1 }));
    const z = (key) => { const m = feats.reduce((a, f) => a + f[key], 0) / feats.length, sd = Math.sqrt(feats.reduce((a, f) => a + (f[key] - m) ** 2, 0) / feats.length) || 1; feats.forEach((f) => (f['z_' + key] = (f[key] - m) / sd)); };
    z('near52'); z('mom'); feats.forEach((f) => (f.score = f.z_near52 + f.z_mom));
    return feats.sort((a, b) => b.score - a.score);
  }

  function pick(rows, gateIdx, n) {
    n = n || N; const gate = gateOf(gateIdx), pl = pool(rows), sc = score(pl), top = sc.slice(0, n), w = top.length ? gate.exposure / n : 0;
    return { gate, poolSize: pl.length, poolTickers: pl.map((r) => r.tk), top: top.map((f, i) => ({ rank: i + 1, tk: f.r.tk, name: f.r.name, close: f.r.close, near52: f.near52, mom: f.mom, score: f.score, weight: w, turn: f.r.turn })) };
  }

  /* ---------- paper-trade ---------- */
  function newState() { return { v: 1, start: null, lastDate: null, lastSnap: null, setBase: null, S: { cash: CAPITAL, pos: {} }, E: { cash: CAPITAL, pos: {} }, nav: [], rebal: [] }; }
  const pxOpen = (m, tk, pos) => { const r = m.get(tk); return r ? (r.open > 0 ? r.open : r.close) : (pos && pos.last) || 0; };
  const pxClose = (m, tk, pos) => { const r = m.get(tk); return r && r.close > 0 ? r.close : (pos && pos.last) || 0; };
  const valueOf = (book, m, f) => { let v = book.cash; for (const [tk, p] of Object.entries(book.pos)) { const px = f(m, tk, p); if (px > 0) p.last = px; v += p.sh * (px || p.last || 0); } return v; };

  function execute(book, targets, m) {   // targets: Map tk → น้ำหนัก (สัดส่วนของพอร์ต) ที่ราคาเปิด
    const E = valueOf(book, m, pxOpen); let traded = 0;
    for (const [tk, p] of Object.entries(book.pos)) {   // ขายก่อน
      const px = pxOpen(m, tk, p), cur = p.sh * px, want = (targets.get(tk) || 0) * E, diff = want - cur;
      if (!(px > 0)) continue;
      if (want === 0) { book.cash += cur * (1 - COST); traded += cur; delete book.pos[tk]; }
      else if (diff < 0 && -diff > BAND * E) { const sh = Math.min(p.sh, -diff / px); book.cash += sh * px * (1 - COST); traded += sh * px; p.sh -= sh; }
    }
    for (const [tk, w] of targets) {   // ซื้อ
      if (w <= 0) continue; const r = m.get(tk); if (!r) continue; const px = r.open > 0 ? r.open : r.close; if (!(px > 0)) continue;
      const p = book.pos[tk] || (book.pos[tk] = { sh: 0, last: px }), cur = p.sh * px, diff = w * E - cur;
      if (diff <= 0 || (p.sh > 0 && diff <= BAND * E)) { if (!p.sh) delete book.pos[tk]; continue; }
      const notional = Math.min(diff, book.cash / (1 + COST)); if (notional <= 0) { if (!p.sh) delete book.pos[tk]; continue; }
      book.cash -= notional * (1 + COST); traded += notional; p.sh += notional / px; p.last = px;
    }
    return { traded, equity: E };
  }

  /* หนึ่งก้าวของวัน (หลังตลาดปิด): snap = { date, rows:[{tk,name,close,open,hi52,p1y,p1m,turn}], gate:{price,sma50,sma200}, setClose }
     คืน { state, changed, rebalanced } — idempotent ต่อวันที่เดิม, ข้ามวันที่ราคาไม่เปลี่ยน (ตลาดหยุด) */
  function step(state, snap) {
    if (!snap || !snap.date || !snap.rows || snap.rows.length < 30) return { state, changed: false, reason: 'no-data' };
    if (state.lastDate && snap.date <= state.lastDate) return { state, changed: false, reason: 'already-processed' };
    if (state.lastSnap) {   // ตลาดหยุด: ราคาปิดเกือบทุกตัวเหมือนเดิม
      const prev = new Map(state.lastSnap.rows.map((r) => [r.tk, r.close])); let same = 0, tot = 0; for (const r of snap.rows) { if (prev.has(r.tk)) { tot++; if (prev.get(r.tk) === r.close) same++; } }
      if (tot >= 30 && same / tot > 0.9) return { state, changed: false, reason: 'no-new-trading-day' };
    }
    const m = new Map(snap.rows.map((r) => [r.tk, r]));
    if (!state.start) { state.start = snap.date; state.setBase = snap.setClose; state.nav.push({ d: snap.date, s: 1, e: 1, x: 1 }); state.lastSnap = snap; state.lastDate = snap.date; return { state, changed: true, rebalanced: false, reason: 'started' }; }
    let rebalanced = false;
    if (snap.date.slice(0, 7) !== state.lastSnap.date.slice(0, 7)) {   // เดือนใหม่: สัญญาณจาก snapshot สุดท้ายของเดือนก่อน ซื้อขายที่ราคาเปิดวันนี้
      const sig = pick(state.lastSnap.rows, state.lastSnap.gate), targets = new Map(sig.top.map((t) => [t.tk, t.weight])), ew = new Map(sig.poolTickers.map((t) => [t, 1 / sig.poolTickers.length]));
      const a = execute(state.S, targets, m); execute(state.E, ew, m); rebalanced = true;
      state.rebal.push({ d: snap.date, signalDate: state.lastSnap.date, gate: sig.gate.state, exposure: sig.gate.exposure, poolSize: sig.poolSize, picks: sig.top.map((t) => ({ tk: t.tk, w: t.weight, px: m.get(t.tk) ? (m.get(t.tk).open || m.get(t.tk).close) : null })), turnover: a.equity ? a.traded / a.equity : 0 });
      if (state.rebal.length > 120) state.rebal.shift();
    }
    state.nav.push({ d: snap.date, s: valueOf(state.S, m, pxClose) / CAPITAL, e: valueOf(state.E, m, pxClose) / CAPITAL, x: snap.setClose / state.setBase });
    if (state.nav.length > 3000) state.nav.shift();
    state.lastSnap = snap; state.lastDate = snap.date;
    return { state, changed: true, rebalanced };
  }

  function summary(state) {
    const nav = state.nav || []; if (nav.length < 2) return { days: nav.length };
    const a = nav[0], b = nav[nav.length - 1], days = (new Date(b.d) - new Date(a.d)) / 864e5;
    return { start: a.d, asOf: b.d, days, strategy: b.s - 1, ew: b.e - 1, set: b.x - 1, excessVsEW: b.s - b.e, excessVsSET: b.s - b.x, rebalances: (state.rebal || []).length };
  }

  const api = { N, COST, CAPITAL, EXPOSURE, gateOf, pool, score, pick, newState, step, summary };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  g.Leaders = api;
})(typeof window !== 'undefined' ? window : globalThis);
