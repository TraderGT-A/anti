// /api/flow?kind=pivot&mk=th|us — ผลสแกน "Pivot Break" (VDU / VCP) จากไฟล์ที่คำนวณล่วงหน้า
//   ไฟล์ต้นทาง: rsdash/pivot_{th|us}.json สร้างโดย scripts/flow/precompute_pivot.mjs (รวมเป็น api/_lib/pivot_data.js)
//   แยกจากสัญญาณ Buy/Wait โดยสิ้นเชิง — ใช้ดูจังหวะเบรกยอดฐานเท่านั้น
import data from "./pivot_data.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const mk = String(req.query.mk || req.query.market || "th").toLowerCase().startsWith("us") ? "us" : "th";
  const block = (data && data[mk]) || null;
  if (!block) {
    res.status(200).json({ market: mk, asOf: null, total: 0, rows: [], note: "ยังไม่มีไฟล์สแกน" });
    return;
  }
  const kind = String(req.query.t || "").toUpperCase();      // VDU | VCP (ไม่ใส่ = ทั้งหมด)
  let rows = block.rows || [];
  if (kind === "VDU" || kind === "VCP") rows = rows.filter((r) => r.kind === kind);
  const st = String(req.query.st || "");
  if (st) rows = rows.filter((r) => r.st === st);
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).json({ market: mk, asOf: block.asOf, generatedAt: block.generatedAt, total: rows.length, rows });
}
