/* fetch_news.mjs — ดึงข่าวฟรีของหุ้น US ที่ติด Top20 (YTD ∪ RS) → Stocks_US/*.md + Supabase stock_notes
   ใช้:  node scripts/news/fetch_news.mjs [--limit N] [--dry] [--summary-only] [--base URL]
     --dry           ไม่ push, ไม่บันทึก state (ไว้ทดสอบ)
     --limit N       ดึงข่าวแค่ N ตัวแรก
     --summary-only  ไม่ดึงข่าว: อ่านส่วน "ทำไมติด Top20" ใน md แล้ว push ขึ้น rsdash
   env (scripts/news/.env): SUPABASE_URL, SUPABASE_SERVICE_KEY, NEWS_SEC_UA */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchUniverse, pickUniverse } from './universe.mjs';
import { fetchTicker, fetchCikMap } from './sources.mjs';
import { loadState, saveState, dedupe, updateMembership, sinceFor, pruneRecent, fileNameFor, renderFeedBlock, upsertStockMd, renderIndexMd } from './store.mjs';
import { extractSummary, buildRow, pushRows } from './push.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '../..');
const STATE = join(ROOT, 'data/news_state.json'), LOG = join(ROOT, 'data/news_log.txt'), OUT = join(ROOT, 'Stocks_US');

const argv = process.argv.slice(2), flag = (f) => argv.includes(f), val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const DRY = flag('--dry'), SUMMARY_ONLY = flag('--summary-only'), LIMIT = Number(val('--limit', 0)) || Infinity, BASE = val('--base', 'https://rsdashclean.vercel.app');
if (existsSync(join(HERE, '.env'))) process.loadEnvFile(join(HERE, '.env'));
const { SUPABASE_URL = '', SUPABASE_SERVICE_KEY = '', NEWS_SEC_UA = '' } = process.env;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const log = (line) => { mkdirSync(dirname(LOG), { recursive: true }); appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`); console.log(line); };
const readMd = (t) => { const p = join(OUT, fileNameFor(t)); return existsSync(p) ? readFileSync(p, 'utf8') : null; };
const writeMd = (t, s) => writeFileSync(join(OUT, fileNameFor(t)), s);

async function push(state, active) {
  if (DRY) return 'push=skipped(dry)';
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return 'push=skipped(no key)';
  const rows = active.map(([t, m]) => buildRow(t, m, state.recent[t], extractSummary(readMd(t)), today));
  const r = await pushRows(rows, { url: SUPABASE_URL, key: SUPABASE_SERVICE_KEY });
  return r.ok ? `push=${rows.length}` : `push=FAIL(${r.status})`;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const state = loadState(STATE);
  const activeOf = () => Object.entries(state.members).filter(([, m]) => !m.left);
  if (SUMMARY_ONLY) return log(`ok summary-only ${await push(state, activeOf())}`);

  let universe;
  try { universe = pickUniverse(await fetchUniverse(BASE)); }
  catch (e) {
    universe = activeOf().map(([ticker, m]) => ({ ticker, name: m.name, lists: m.lists }));
    if (!universe.length) throw new Error(`universe: ${e.message} (and no previous members)`);
    console.warn(`WARN universe: ${e.message} — using ${universe.length} previous members`);
  }
  const { left } = updateMembership(state, universe, today);
  let cikMap = new Map(), errors = 0, fresh = 0;
  try { cikMap = await fetchCikMap(NEWS_SEC_UA); } catch (e) { errors++; console.warn(`WARN ${e.message}`); }

  for (const [t, m] of activeOf().slice(0, LIMIT)) {
    const out = await fetchTicker(t, { sinceISO: sinceFor(state, t, today), cikMap, secUA: NEWS_SEC_UA });
    out.errors.filter((e) => !e.startsWith('sec: skipped')).forEach((e) => { errors++; console.warn(`WARN ${t} ${e}`); });
    const items = dedupe(out.items, state);
    fresh += items.length;
    state.recent[t] = [...items, ...(state.recent[t] || [])];
    let md = readMd(t);
    const byDay = new Map();
    for (const it of items) byDay.set(it.published, [...(byDay.get(it.published) || []), it]);
    const meta = { ticker: t, name: m.name, lists: m.lists, since: m.since, lastFetch: today };
    if (!byDay.size) md = upsertStockMd(md, meta, null);
    for (const d of [...byDay.keys()].sort()) md = upsertStockMd(md, meta, renderFeedBlock(d, byDay.get(d)));
    writeMd(t, md);
    if (!DRY) saveState(STATE, state);   // md เขียนแล้ว → จำว่าเห็นข่าวแล้วทันที (ถ้ารอบนี้ล้มกลางทาง รอบหน้าจะไม่ต่อท้ายซ้ำ)
    console.log(`${t}: +${items.length}`);
  }
  for (const t of left) { const md = readMd(t), m = state.members[t]; if (md) writeMd(t, upsertStockMd(md, { ticker: t, name: m.name, lists: m.lists, since: m.since, lastFetch: today, left: m.left }, null)); }

  pruneRecent(state, today);
  writeFileSync(join(OUT, '_Top20.md'), renderIndexMd(state, today));
  if (!DRY) { state.lastRun = today; saveState(STATE, state); }   // บันทึกก่อน push: push พังต้องไม่ทำให้ state หาย
  const pushed = await push(state, activeOf());
  log(`ok tickers=${Math.min(activeOf().length, LIMIT)} new=${fresh} errors=${errors} ${pushed}${DRY ? ' (dry)' : ''}`);
}

main().catch((e) => { log(`FAIL ${e.message}`); process.exit(1); });
