// ตัวช่วยวินัยงานวิจัย:
//   node scripts/prereg.mjs new <slug>   สร้าง research/PREREG_<slug>_<วันนี้>.md จากเทมเพลตของ skill (ยังไม่ commit — ต้องกรอกแล้ว commit ก่อนรันสคริปต์)
//   node scripts/prereg.mjs check        ตรวจว่า REPORT_<slug>_* ทุกไฟล์มี PREREG_<slug>_* ที่ถูก commit "ก่อน" REPORT (ตาม git history)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RES = path.join(ROOT, "research"), TPL = path.join(ROOT, ".claude", "skills", "quant-backtest-method", "references", "PREREG_template.md");
const today = () => new Date().toISOString().slice(0, 10);
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();

/* เวลา commit แรกที่เพิ่มไฟล์นี้ (unix) หรือ null ถ้ายังไม่ commit */
function firstCommit(rel) { const o = git("log", "--diff-filter=A", "--follow", "--format=%ct", "--", rel).split("\n").filter(Boolean); return o.length ? +o[o.length - 1] : null; }

export function slugOf(name) { const m = /^(PREREG|REPORT)_(.+?)(?:_(\d{4}-\d{2}-\d{2}))?\.md$/.exec(name); return m ? { kind: m[1], slug: m[2], date: m[3] || "" } : null; }

export function check(files, commitTime) {
  const bad = [], pre = new Map();
  for (const f of files) { const s = slugOf(f); if (s && s.kind === "PREREG") pre.set(s.slug, f); }
  for (const f of files) {
    const s = slugOf(f); if (!s || s.kind !== "REPORT" || s.date < "2026-10-10") continue;   // วิธีนี้เริ่มใช้ 2026-10-10 — รายงานเก่ากว่านั้นไม่ตรวจ
    const p = pre.get(s.slug); if (!p) { bad.push(`${f}: ไม่มี PREREG_${s.slug}_*`); continue; }
    const tp = commitTime(p), tr = commitTime(f);
    if (tp == null) bad.push(`${p}: ยังไม่ได้ commit`); else if (tr != null && tp > tr) bad.push(`${p}: ถูก commit หลัง ${f}`);
  }
  return bad;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const [cmd, slug] = process.argv.slice(2);
  if (cmd === "new") {
    if (!/^[a-z0-9_]+$/.test(slug || "")) { console.error("ใช้: node scripts/prereg.mjs new <slug> (a-z 0-9 _ เท่านั้น)"); process.exit(1); }
    const out = path.join(RES, `PREREG_${slug}_${today()}.md`);
    if (fs.existsSync(out)) { console.error("มีไฟล์แล้ว:", out); process.exit(1); }
    fs.writeFileSync(out, fs.readFileSync(TPL, "utf8").replace(/\{\{YYYY-MM-DD\}\}/g, today()), "utf8"); console.log("สร้างแล้ว:", path.relative(ROOT, out), "\nกรอกให้ครบแล้ว commit ก่อนรันสคริปต์");
  } else if (cmd === "check") {
    const bad = check(fs.readdirSync(RES).filter((f) => f.endsWith(".md")), (f) => firstCommit("research/" + f));
    if (bad.length) { console.error("พบปัญหา:\n- " + bad.join("\n- ")); process.exit(1); } console.log("ผ่าน: ทุก REPORT มี PREREG ที่ commit ก่อน");
  } else { console.error("ใช้: new <slug> | check"); process.exit(1); }
}
