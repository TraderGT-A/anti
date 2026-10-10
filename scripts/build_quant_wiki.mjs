// อัปเดต vault โดยไม่เสีย token:
//   node scripts/build_quant_wiki.mjs        1) ตรวจ [[ลิงก์]] ใน Quant/*.md ว่าไฟล์ปลายทางมีจริง  2) เขียนรายงาน forward test เดือนปัจจุบัน → Quant/05_รายงานรายเดือน/YYYY-MM.md
//   node scripts/build_quant_wiki.mjs --links-only
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), ".."), QUANT = path.join(ROOT, "Quant");
const BASE = process.env.RSDASH_URL || "https://rsdashclean.vercel.app";

function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])); }

/* คืนรายการลิงก์เสีย "ไฟล์ → [[ลิงก์]]" — ลิงก์แบบ [[a/b]] นับจากราก vault, [[ชื่อ]] ค้นตามชื่อไฟล์ทั้ง vault ส่วน Quant */
export function brokenLinks(files, exists) {
  const bad = [];
  for (const f of files) {
    if (!f.endsWith(".md")) continue;
    const txt = fs.readFileSync(f, "utf8").replace(/<!--[\s\S]*?-->/g, "");
    for (const m of txt.matchAll(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g)) if (!exists(m[1].trim())) bad.push(`${path.relative(ROOT, f)} → [[${m[1]}]]`);
  }
  return bad;
}

const pct = (x) => (Number.isFinite(x) ? (x >= 0 ? "+" : "") + (x * 100).toFixed(2) + "%" : "-");

export function monthlyMd(j, month) {
  const p = j.paper || {}, s = p.summary || {}, rb = (p.rebalances || [])[0];
  const warn = Number.isFinite(s.excessVsEW) && s.excessVsEW < -0.15 ? "\n> ⚠️ **สัญญาณเตือนตาม PREREG:** ส่วนต่างเทียบ EW ติดลบสะสมมากกว่า 15 จุด — พักและตรวจว่ามีบั๊ก/edge หายไป\n" : "";
  const started = s.start ? "" : "\n> ยังไม่เริ่มนับ NAV (รอเดือนใหม่แรกหลังระบบเริ่ม)\n";
  return `---\ntype: forward-test-report\nmonth: ${month}\ntags: [quant, forward-test]\n---\n# Forward test ผู้นำไทย — ${month}\n> กฎ: [[research/PREREG_forward_th_leaders_2026-10-10]] · ผลสำรวจ in-sample ยังไม่พิสูจน์ edge · ไม่ใช่คำแนะนำการลงทุน${started}${warn}\n## สรุป ณ ${j.asOf}\n- Gate: ${j.gate && j.gate.state} (สัดส่วนหุ้น ${j.gate ? Math.round(j.gate.exposure * 100) : "-"}%) · พูล ${j.poolSize} ตัว\n- เริ่ม: ${s.start || "-"} · ล่าสุด: ${s.asOf || p.lastDate || "-"} · rebalance แล้ว ${s.rebalances || 0} ครั้ง · ถือ ${p.holdings || 0} ตัว\n- ผลตอบแทนสะสม: กลยุทธ์ ${pct(s.strategy)} · EW ${pct(s.ew)} · SET ${pct(s.set)}\n- ส่วนเกิน: เทียบ EW ${pct(s.excessVsEW)} · เทียบ SET ${pct(s.excessVsSET)}\n\n## Rebalance ล่าสุด\n${rb ? `- ${rb.d} (สัญญาณจาก ${rb.signalDate}) · Gate ${rb.gate} · หมุนพอร์ต ${(rb.turnover * 100).toFixed(0)}%\n- หุ้น: ${(rb.picks || []).map((x) => x.tk).join(", ")}` : "- ยังไม่มี"}\n\n## ตรวจกลไก / ข้อสังเกต\n<!-- เติมด้วยมือ: เทียบกับการคำนวณซ้ำออฟไลน์ (ต้องทำหลัง 3 เดือน) -->\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const vaultNames = new Map(walk(ROOT).filter((f) => f.endsWith(".md") && !f.includes("node_modules")).map((f) => [path.basename(f, ".md"), f]));
  const rels = new Set([...vaultNames.values()].map((f) => path.relative(ROOT, f).replace(/\\/g, "/").replace(/\.md$/, "")));
  const bad = brokenLinks(walk(QUANT), (l) => rels.has(l) || vaultNames.has(l));
  if (bad.length) { console.error("ลิงก์เสีย:\n- " + bad.join("\n- ")); } else console.log("ลิงก์ใน Quant/ ถูกต้องทั้งหมด");
  if (!process.argv.includes("--links-only")) {
    const r = await fetch(BASE + "/api/scan?universe=leaders"); if (!r.ok) { console.error("HTTP", r.status); process.exit(1); }
    const j = await r.json(), month = new Date().toISOString().slice(0, 7), dir = path.join(QUANT, "05_รายงานรายเดือน");
    fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, month + ".md"), monthlyMd(j, month), "utf8"); console.log("เขียนรายงาน", month);
  }
  if (bad.length) process.exit(1);
}
