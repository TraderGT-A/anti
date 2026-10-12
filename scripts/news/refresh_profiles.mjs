/* refresh_profiles.mjs — งานรายสัปดาห์ (Task Scheduler "THUSHOUSE Profiles", อาทิตย์ 07:00)
   - ทุกสัปดาห์: ดึงคำอธิบายบริษัทเฉพาะหุ้นที่ยังไม่มี (หุ้นใหม่ใน rsdash)
   - อาทิตย์แรกของเดือน (วันที่ 1–7): --refresh ดึงใหม่ทั้งหมด
   - deploy rsdash เฉพาะเมื่อ desc/ เปลี่ยน และในโฟลเดอร์ deploy ไม่มีไฟล์อื่นที่แก้ค้างอยู่ (กันงานที่ยังไม่เสร็จหลุดขึ้นเว็บ)
   ผลสรุปหนึ่งบรรทัดใน data/news_log.txt ([PROFILES]) */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), DEPLOY = join(ROOT, 'rsdash/rsdash_clean_deploy');
const log = (line) => { appendFileSync(join(ROOT, 'data/news_log.txt'), `${new Date().toISOString()} [PROFILES] ${line}\n`); console.log(line); };
const run = (cmd, args, cwd = ROOT) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 3 * 3600e3 });

try {
  const monthly = new Date().getDate() <= 7;
  const out = run(process.execPath, [join(ROOT, 'scripts/news/fetch_profiles.mjs'), ...(monthly ? ['--refresh'] : [])]);
  const summary = out.trim().split('\n').filter((l) => l.includes('done')).join(' | ');
  const changed = run('git', ['status', '--porcelain', '--', 'rsdash/rsdash_clean_deploy']).split('\n').filter(Boolean);
  const descChanged = changed.filter((l) => l.includes('rsdash_clean_deploy/desc/')), other = changed.filter((l) => !l.includes('rsdash_clean_deploy/desc/'));
  let deployed = 'no change';
  if (descChanged.length && other.length) deployed = `SKIPPED deploy (other uncommitted files in deploy folder: ${other.length})`;
  else if (descChanged.length) { run('npx.cmd', ['--yes', 'vercel', '--prod', '--yes'], DEPLOY); deployed = `deployed (${descChanged.length} files)`; }
  log(`ok ${monthly ? 'refresh' : 'new-only'} · ${summary} · ${deployed}`);
} catch (e) {
  log(`FAIL ${String(e.message || e).split('\n')[0]}`);
  process.exit(1);
}
