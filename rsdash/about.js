/* about.js — "เกี่ยวกับบริษัท" ในป็อปอัปหุ้น: คำอธิบายธุรกิจจาก Yahoo Finance (อังกฤษ)
   ข้อมูล: /desc/<us|th>/<shard>.json  (shard = ตัวอักษรแรกของ ticker, ขึ้นต้นด้วยอย่างอื่น = "0")
   สร้างโดย scripts/news/fetch_profiles.mjs · ใช้ทั้งเว็บและเทสต์ → globalThis.About */
(function (g) {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shardOf = (tk) => { const c = String(tk || '').charAt(0).toUpperCase(); return c >= 'A' && c <= 'Z' ? c : '0'; };
  // แสดงคำอธิบายเต็มเสมอ (บอส 6 พ.ย. 2026 — ไม่ต้องกด "อ่านต่อ")
  function aboutHtml(text, th) {
    if (!text) return '';
    const t = String(text);
    const head = '<div class="text-[11px] text-slate-400 font-semibold mb-0.5">🏢 เกี่ยวกับบริษัท <span class="font-normal text-slate-500">' + (th ? '(Yahoo Finance · แปลไทย)' : '(Yahoo Finance)') + '</span>' + (th ? ' <button type="button" class="text-sky-400 font-normal" onclick="aboutToggle()">ต้นฉบับ EN</button>' : '') + '</div>';
    return `<div class="text-[12px] leading-relaxed p-2 rounded-lg border" style="background:var(--panel2);border-color:var(--line)">${head}${esc(t)}</div>`;
  }

  g.About = { shardOf, aboutHtml };
})(globalThis);
