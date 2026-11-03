// /api/flow?kind=etf|thgroups|tr — ตัวกลางของหน้า "เงินไหล" และการแปลคำอธิบายบริษัท
// (Vercel Hobby จำกัดฟังก์ชัน 12 ตัว → ยุบหลาย route ไว้ในไฟล์เดียว; ตรรกะอยู่ใน api/_lib/flow_*.js ซึ่ง Vercel ไม่นับเป็นฟังก์ชัน)
//   kind=etf&set=cross|sector|country → ราคาปิด Yahoo ของชุดสินทรัพย์/ETF   (flow_etf.js)
//   kind=groups&mk=th|us&by=sector|setind|setsec|theme → ดัชนีกลุ่มหุ้นที่สร้างเอง (flow_th.js) · kind=thgroups = ชื่อเดิม
//   kind=tr&mk=us|th&tk=XXXX           → แปลคำอธิบายบริษัทเป็นไทย            (flow_tr.js)
//   kind=surp&mk=us|th                 → ส่วนต่างงบล่าสุดเทียบประมาณการ        (flow_surp.js)
//   kind=pre                           → ราคา Pre-market หุ้นสหรัฐ (flow_pre.js)
//   kind=cal&mk=us|th                  → ปฏิทินเศรษฐกิจสัปดาห์นี้ (เฉพาะข่าวใหญ่)  (flow_cal.js)
import etf from "./_lib/flow_etf.js";
import thg from "./_lib/flow_th.js";
import tr from "./_lib/flow_tr.js";
import surp from "./_lib/flow_surp.js";
import cal from "./_lib/flow_cal.js";
import pre from "./_lib/flow_pre.js";

export default async function handler(req, res) {
  const k = String(req.query.kind || "");
  if (k === "etf") return etf(req, res);
  if (k === "thgroups") { req.query.mk = "th"; return thg(req, res); }   // ชื่อเดิม (เว็บรุ่นเก่า)
  if (k === "groups") return thg(req, res);
  if (k === "tr") return tr(req, res);
  if (k === "surp") return surp(req, res);   // ส่วนต่างงบเทียบประมาณการ (เกินคาด/ต่ำกว่าคาด)
  if (k === "pre") return pre(req, res);   // Pre-market สหรัฐ
  if (k === "cal") return cal(req, res);   // ปฏิทินเศรษฐกิจ
  res.setHeader("Access-Control-Allow-Origin", "*");
  return res.status(400).json({ error: "kind must be etf|groups|tr|surp|cal|pre" });
}
