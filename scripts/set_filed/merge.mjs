// รวมข่าวงบการเงินจาก SET (ที่คนหรือเอเจนต์อ่านจากหน้า https://www.set.or.th/th/market/news-and-alert/news) → rsdash/set_filed_th.json
// ใช้: node scripts/set_filed/merge.mjs            (อ่าน scripts/set_filed/raw.json แล้วรวมกับไฟล์เดิม)
// raw.json = [{ "symbol":"PSL", "datetime":"2026-11-02T17:51:40+07:00", "headline":"งบการเงิน ไตรมาสที่ 3/2569 (สอบทานแล้ว)" }, ...]
// กฎ: เก็บรายการล่าสุดต่อหุ้น · เก็บย้อนหลัง 60 วัน · ตรวจรูปแบบทุกรายการ (ผิดรูปแบบ = ข้าม + บอกจำนวน) · ไม่ยิงเน็ต ไม่ใช้ข้อมูลอื่นนอกจาก raw.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(here, "raw.json"), OUT = path.join(here, "..", "..", "rsdash", "set_filed_th.json");
const KEEP_MS = 60 * 864e5;

const raw = JSON.parse(fs.readFileSync(RAW, "utf8"));
if (!Array.isArray(raw)) throw new Error("raw.json ต้องเป็น array");
let old = {}; try { old = JSON.parse(fs.readFileSync(OUT, "utf8")).filed || {}; } catch (e) {}
const filed = { ...old }; let added = 0, skipped = 0;
for (const x of raw) {
  const sym = String(x.symbol || "").trim().toUpperCase(), t = Date.parse(String(x.datetime || "").replace(" ", "T").replace(/([+-]\d\d:\d\d|Z)?$/, (m) => m || "+07:00"));
  const head = String(x.headline || "").trim();
  if (!/^[A-Z0-9&.-]{1,14}$/.test(sym) || !Number.isFinite(t) || !/งบการเงิน/.test(head) || t > Date.now() + 36e5) { skipped++; continue; }
  const at = new Date(t).toISOString().replace("Z", "+00:00");
  if (!filed[sym] || Date.parse(filed[sym].at) <= t) {
    const entry = { at: new Date(t).toISOString(), headline: head };
    if (typeof x.niY === "number") entry.niY = x.niY;
    if (typeof x.eps === "number") entry.eps = x.eps;
    if (typeof x.npCurrent === "number") entry.npCurrent = x.npCurrent;
    if (typeof x.npPrior === "number") entry.npPrior = x.npPrior;
    filed[sym] = entry;
    added++;
  }
}
for (const k of Object.keys(filed)) if (Date.now() - Date.parse(filed[k].at) > KEEP_MS) delete filed[k];
const out = { generatedAt: new Date().toISOString(), source: "set.or.th ข่าวงบการเงิน (อ่านจากหน้าข่าว SET)", count: Object.keys(filed).length, filed };
fs.writeFileSync(OUT + ".tmp", JSON.stringify(out, null, 1)); fs.renameSync(OUT + ".tmp", OUT);
console.log("set_filed_th.json: รวม", out.count, "ตัว · เพิ่ม/อัปเดต", added, "· ข้าม", skipped);
