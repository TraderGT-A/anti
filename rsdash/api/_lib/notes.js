// notes — เก็บสรุป "ทำไมติด Top20" ในตาราง snapshots เดิม (dt = "notes|<market>", payload = { rows })
// ไม่ต้องสร้างตารางใหม่; scripts/news ส่งชุดแถวทั้งหมดของหุ้นที่ยังอยู่ใน Top20 มาแทนที่ทุกครั้ง

// แถวใหม่ไม่มี summary → เก็บ summary เดิม; หุ้นที่ไม่อยู่ในชุดใหม่ (หลุด Top20) ถูกตัดออก
export function mergeNotes(oldRows, newRows) {
  const old = new Map((oldRows || []).map((r) => [r.ticker, r]));
  return newRows.map((r) => {
    const o = old.get(r.ticker);
    if ('summary' in r || !o || o.summary == null) return r;
    return { ...r, summary: o.summary, summary_at: o.summary_at };
  });
}

export const validRows = (rows) => Array.isArray(rows) && rows.length <= 100 && rows.every((r) => r && /^[A-Za-z0-9.\-]{1,12}$/.test(String(r.ticker || '')));

// RLS ของตาราง snapshots ให้ anon "เพิ่ม" แถวได้แต่ "แก้" ไม่ได้ → ทุกครั้งที่เขียนเป็นแถวใหม่ (dt = prefix + เวลา ms เติมศูนย์ 15 หลัก)
// แล้วอ่านแถวล่าสุดด้วยการเรียง dt จากมากไปน้อย
export const notesPrefix = (market) => 'notes|' + (market === 'thailand' ? 'thailand' : 'america') + '|';
export const notesRowKey = (market, ms = Date.now()) => notesPrefix(market) + String(ms).padStart(15, '0');
