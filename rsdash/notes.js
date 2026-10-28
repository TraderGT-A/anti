/* notes.js — "ทำไมติด Top20": ปุ่ม 📰 + แผงสรุป/หัวข่าว จากตาราง stock_notes (เขียนโดย scripts/news)
   ข้อมูลทุกช่องมาจากภายนอก (หัวข่าว, สรุป) → escape ก่อนเสมอ; ลิงก์อนุญาตเฉพาะ http(s)
   ใช้ทั้งเว็บและเทสต์ → ตั้ง globalThis.Notes */
(function (g) {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => /^https?:\/\//i.test(String(u || '')) ? esc(u) : '';
  const link = (href, text) => `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-sky-400 hover:underline">${text}</a>`;
  const panelId = (m, tk) => 'notes_' + m + '_' + String(tk).replace(/[^a-z0-9]/gi, '_');

  function mdLite(text) {   // escape แล้วค่อยแปลงเฉพาะรูปแบบที่ปลอดภัย
    // สรุปที่ถูกตัดกลางลิงก์ (เช่น URL Google News ยาวมากแล้วโดนตัดที่ 2,500 ตัวอักษร) → ตัดหางที่ไม่ครบทิ้ง กันข้อความดิบยาวล้นหน้าจอ
    text = String(text == null ? '' : text).replace(/\s*[·•]?\s*\[[^\]\n]*\]\(https?:[^)\s]*\s*$/, '').replace(/\s*\[[^\]\n]*\s*$/, '');
    return esc(text)
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => link(u, t))
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, '$1<i class="text-slate-500">$2</i>')
      .replace(/\n/g, '<br>');
  }

  function notesHtml(row) {
    const sum = row && row.summary ? `<div class="leading-relaxed">${mdLite(row.summary)}</div>` : '<div class="text-slate-500">ยังไม่มีสรุป — มีแค่หัวข่าวล่าสุด</div>';
    const heads = ((row && row.headlines) || []).map((h) => {
      const u = safeUrl(h.url), t = esc(h.title);
      return `<li><span class="text-slate-500">${esc(h.date)} · ${esc(h.source)}</span> ${u ? link(u, t) : t}</li>`;
    }).join('');
    const d = String((row && (row.summary_at || row.updated_at)) || '').slice(0, 10);
    return `<div class="text-[11px] p-2 bg-[#0b1018] rounded-lg border border-[#1e2634]">${sum}` +
      (heads ? `<div class="mt-2 text-slate-400 font-semibold">หัวข่าวล่าสุด</div><ul class="mt-1 space-y-0.5">${heads}</ul>` : '') +
      `<div class="mt-2 text-[10px] text-slate-500">อัปเดต ${esc(d)} · อธิบายย้อนหลัง ไม่ใช่สัญญาณซื้อขาย</div></div>`;
  }

  function badgeHtml(row, m, tk) {
    if (!row) return '';
    const a = esc(m), b = esc(tk);
    return `<button class="tf-chip !py-0 !px-1.5 !min-h-0 text-[10px] ml-1" title="ข่าว 7 วัน · แตะเพื่อดูสรุปว่าทำไมติด Top20" onclick="event.stopPropagation();toggleNotes('${a}','${b}')">📰 ${Number(row.news_7d) || 0}</button>`;
  }

  /* แผงใต้หุ้น — open=true วาดแบบเปิดพร้อมเนื้อหา (ตารางถูกวาดใหม่เป็นระยะ ต้องคงสถานะที่ผู้ใช้เปิดไว้) */
  function panelHtml(row, m, tk, open, kind) {
    if (!row) return '';
    const id = panelId(m, tk), style = open ? '' : ' style="display:none"', body = open ? notesHtml(row) : '';
    return kind === 'table'
      ? `<tr id="${id}"${style}><td colspan="8" class="p-1" data-notes>${body}</td></tr>`
      : `<div id="${id}" class="mt-1"${style} data-notes>${body}</div>`;
  }

  g.Notes = { esc, notesHtml, badgeHtml, panelId, panelHtml };
})(globalThis);
