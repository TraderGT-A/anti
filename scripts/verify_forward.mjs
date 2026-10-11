// ตรวจกลไก forward test (ตาม PREREG_forward_th_leaders: "ผลในระบบตรงกับที่คำนวณซ้ำออฟไลน์จากข้อมูลเดียวกัน")
// ดึงรายการ rebalance และ snapshot สัญญาณที่เก็บไว้ (leaders|snap|YYYY-MM) แล้วคำนวณ Top20 + Gate ซ้ำด้วย leaders.js เทียบกับที่ระบบซื้อจริง
//   node scripts/verify_forward.mjs
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
await import(pathToFileURL(path.join(ROOT, "rsdash", "trendlib.js")).href);
await import(pathToFileURL(path.join(ROOT, "rsdash", "leaders.js")).href);
const L = globalThis.Leaders, BASE = process.env.RSDASH_URL || "https://rsdashclean.vercel.app";

/* rebal = รายการจาก state.rebal; snap = ข้อมูลสัญญาณ { date, gate, rows } — คืนรายการความไม่ตรง (ว่าง = ตรง) */
export function verifyRebalance(rebal, snap) {
  const bad = [], sig = L.pick(snap.rows, snap.gate), want = new Map(sig.top.map((t) => [t.tk, t.weight])), got = new Map((rebal.picks || []).map((p) => [p.tk, p.w]));
  if (rebal.signalDate !== snap.date) bad.push(`signalDate ${rebal.signalDate} ≠ snapshot ${snap.date}`);
  if (rebal.gate !== sig.gate.state) bad.push(`gate ${rebal.gate} ≠ ${sig.gate.state}`);
  for (const [tk, w] of want) if (!got.has(tk)) bad.push(`ขาด ${tk}`); else if (Math.abs(got.get(tk) - w) > 1e-9) bad.push(`น้ำหนัก ${tk} ${got.get(tk)} ≠ ${w}`);
  for (const tk of got.keys()) if (!want.has(tk)) bad.push(`เกิน ${tk}`);
  return bad;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const j = await (await fetch(BASE + "/api/scan?universe=leaders")).json(), rbs = (j.paper && j.paper.rebalances) || [];
  if (!rbs.length) { console.log("ยังไม่มี rebalance ให้ตรวจ"); process.exit(0); }
  let fail = 0;
  for (const rb of rbs) {
    const r = await fetch(BASE + "/api/scan?universe=leaders&archive=" + rb.signalDate.slice(0, 7));
    if (!r.ok) { console.log(`${rb.d}: ไม่มี snapshot สัญญาณ (${r.status}) — ข้าม`); continue; }
    const bad = verifyRebalance(rb, await r.json()); if (bad.length) { fail++; console.log(`${rb.d}: ไม่ตรง\n  - ` + bad.join("\n  - ")); } else console.log(`${rb.d}: ตรง (${rb.picks.length} ตัว, gate ${rb.gate})`);
  }
  process.exit(fail ? 1 : 0);
}
