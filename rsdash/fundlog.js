/* fundlog.js — บันทึกข้อมูลพื้นฐาน (EPS/กำไรสุทธิ) แบบ point-in-time: เก็บเฉพาะ "วันที่ค่าเปลี่ยน" ที่เราเห็นจริง
   ไม่เขียนทับอดีต → ในอนาคต backtest ได้โดยไม่มี look-ahead (ข้อมูลที่ TradingView แก้ย้อนหลังจะถูกบันทึกเป็นวันที่เราเห็น)
   ใช้บนเซิร์ฟเวอร์ (api/scan.js) และเทสต์ → globalThis.FundLog */
(function (g) {
  'use strict';
  const COLS = ['earnings_per_share_diluted_ttm', 'earnings_per_share_diluted_yoy_growth_ttm', 'net_income_ttm', 'net_income_yoy_growth_ttm', 'earnings_release_date'];
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const r = (v, k) => (fin(v) ? Math.round(v * k) / k : null);
  /* d (ตามลำดับ COLS) → เวกเตอร์กะทัดรัด [eps, epsG%, netIncome, niG%, releaseUnix] */
  const pack = (d) => [r(d[0], 1e4), r(d[1], 10), r(d[2], 1), r(d[3], 10), fin(d[4]) ? Math.round(d[4]) : null];
  const same = (a, b) => !!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]);

  /* latest: { tk: vec } เดิม; cur: { tk: vec } ใหม่; คืน { latest, changes:[{tk,v}], added, changed }
     หุ้นที่หายจากการสแกนวันนี้คงค่าเดิมไว้ (ไม่ถือว่าเปลี่ยน) */
  function diff(latest, cur) {
    const next = Object.assign({}, latest || {}), changes = []; let added = 0, changed = 0;
    for (const [tk, v] of Object.entries(cur || {})) {
      if (v.every((x) => x == null)) continue;
      const prev = next[tk];
      if (same(prev, v)) continue;
      changes.push({ tk, v }); next[tk] = v; if (prev) changed++; else added++;
    }
    return { latest: next, changes, added, changed };
  }
  const api = { COLS, pack, diff };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  g.FundLog = api;
})(typeof window !== 'undefined' ? window : globalThis);
