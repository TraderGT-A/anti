// ส่งออก Decision Log จาก rsdash (Supabase) → ไฟล์ .md ใน vault: Quant/04_การตัดสินใจ/<วันที่>_<id>.md
// ใช้: node scripts/export_dlog_to_vault.mjs   (อ่านรหัสจาก %LOCALAPPDATA%\hermes\secrets\dlog_key.txt; เขียนทับไฟล์เดิมของ id เดียวกัน = รวมการทบทวนล่าสุด)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const SECRETS = process.env.HERMES_SECRETS || path.join(process.env.LOCALAPPDATA || "", "hermes", "secrets");
const KEY = fs.readFileSync(path.join(SECRETS, "dlog_key.txt"), "utf8").trim();
const BASE = process.env.RSDASH_URL || "https://rsdashclean.vercel.app";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "Quant", "04_การตัดสินใจ");
const ACT = { act: "ลงมือทำ", "no-action": "ไม่ทำ", "more-evidence": "ขอหลักฐานเพิ่ม" };
const v = (x) => (x && String(x).trim()) || "-";

export function toMd(e) {
  const d = e.decision || {}, r = e.repro || {};
  const ev = (e.evidence || []).length ? "| หลักฐาน | แหล่ง/หน้า/เวลา | สนับสนุนอะไร | ข้อจำกัด |\n|---|---|---|---|\n" + e.evidence.map((x) => `| ${v(x.evidence)} | ${v(x.source)} | ${v(x.supports)} | ${v(x.limit)} |`).join("\n") : "-";
  const rv = (e.reviews || []).map((x) => `### ทบทวนเมื่อ ${x.at}\n- ผลที่เกิดขึ้นจริง: ${v(x.outcome)}\n- สมมติฐานที่ถูก/พัง: ${v(x.held)}\n- กระบวนการเทียบผลลัพธ์: ${v(x.processVsOutcome)}\n- บทเรียน/ข้อเสนอแก้วิธี: ${v(x.lesson)}`).join("\n\n") || "(ยังไม่มี)";
  return `---\ntype: decision-log\nid: ${e.id}\ncreated: ${e.createdAt}\naction: ${d.action}\ntickers: ${v(e.tickers)}\ntags: [quant, decision-log]\n---\n# Decision ${e.id} — ${v(e.question)}\n\n## บริบท\n- ผู้ตัดสินใจ/ทบทวน: ${v(e.owner)}\n- เป้าหมาย: ${v(e.objective)}\n- ระยะเวลา: ${v(e.horizon)}\n- ข้อจำกัด: ${v(e.constraints)}\n- ข้อมูล ณ ตอนนั้น: ${v(e.dataCutoff)}\n\n## หลักฐานและเหตุผล\n${ev}\n\n- ข้อเท็จจริง: ${v(e.facts)}\n- สมมติฐาน: ${v(e.assumptions)}\n- หลักฐานสนับสนุน: ${v(e.supporting)}\n- หลักฐานคัดค้าน: ${v(e.contradicting)}\n- ข้อมูลที่ขาด: ${v(e.missing)}\n- ทางเลือกอื่น: ${v(e.alternatives)}\n\n## ทำซ้ำได้\n- ข้อมูลที่ใช้: ${v(r.snapshot)}\n- เวอร์ชัน: ${v(r.versions)}\n- พารามิเตอร์: ${v(r.params)}\n- run/commit: ${v(r.runId)}\n- ผลตรวจสอบ/ความไว: ${v(r.validation)}\n\n## การตัดสินใจของคน\n- การกระทำ: ${ACT[d.action] || "-"}\n- เหตุผล: ${v(d.rationale)}\n- เงื่อนไข/ขีดจำกัด: ${v(d.conditions)}\n- อะไรทำให้เปลี่ยนใจ: ${v(d.changeMind)}\n- ทบทวนครั้งถัดไป: ${v(d.nextReview)}\n\n## ทบทวนย้อนหลัง\n${rv}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const r = await fetch(BASE + "/api/scan?universe=dlog", { headers: { "x-dlog-key": KEY } });
  if (!r.ok) { console.error("HTTP", r.status, await r.text()); process.exit(1); }
  const { entries } = await r.json(); fs.mkdirSync(OUT, { recursive: true });
  for (const e of entries) fs.writeFileSync(path.join(OUT, `${e.createdAt.slice(0, 10)}_${e.id}.md`), toMd(e), "utf8");
  console.log(`exported ${entries.length} entries → ${OUT}`);
}
