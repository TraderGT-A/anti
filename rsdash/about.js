/* about.js — "เกี่ยวกับบริษัท" ในป็อปอัปหุ้น: คำอธิบายธุรกิจจาก Yahoo Finance (อังกฤษ)
   ข้อมูล: /desc/<us|th>/<shard>.json  (shard = ตัวอักษรแรกของ ticker, ขึ้นต้นด้วยอย่างอื่น = "0")
   สร้างโดย scripts/news/fetch_profiles.mjs · ใช้ทั้งเว็บและเทสต์ → globalThis.About */
(function (g) {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shardOf = (tk) => { const c = String(tk || '').charAt(0).toUpperCase(); return c >= 'A' && c <= 'Z' ? c : '0'; };
  const LIMIT = 320;

  function aboutHtml(text) {
    if (!text) return '';
    const t = String(text);
    const head = '<div class="text-[11px] text-slate-400 font-semibold mb-0.5">🏢 เกี่ยวกับบริษัท <span class="font-normal text-slate-500">(Yahoo Finance)</span></div>';
    if (t.length <= LIMIT) return `<div class="text-[12px] leading-relaxed p-2 bg-[#0b1018] rounded-lg border border-[#1e2634]">${head}${esc(t)}</div>`;
    let cut = t.lastIndexOf('. ', LIMIT); if (cut < 120) cut = LIMIT;
    return `<div class="text-[12px] leading-relaxed p-2 bg-[#0b1018] rounded-lg border border-[#1e2634]">${head}${esc(t.slice(0, cut + 1))}` +
      `<details class="inline"><summary class="cursor-pointer text-sky-400 inline">อ่านต่อ</summary>${esc(t.slice(cut + 1))}</details></div>`;
  }

  g.About = { shardOf, aboutHtml };
})(globalThis);
