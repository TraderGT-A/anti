/* fetch_profiles.mjs — ดึงคำอธิบายบริษัท (Yahoo Finance, อังกฤษ) ของหุ้นทุกตัวใน rsdash → rsdash/desc/<us|th>/<A-Z|0>.json
   ใช้:  node scripts/news/fetch_profiles.mjs [--market america|thailand] [--limit N] [--refresh]
     ปกติ: ดึงเฉพาะตัวที่ยังไม่มี (ตัวที่ Yahoo ไม่มีข้อมูลจะลองใหม่หลัง 30 วัน)
     --refresh: ดึงใหม่ทั้งหมด (แนะนำเดือนละครั้ง)
   ไฟล์ถูกเขียนทั้ง rsdash/desc และ rsdash/rsdash_clean_deploy/desc → ต้อง deploy rsdash ถึงจะขึ้นเว็บ */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { yahooSymbol, buildShards, yahooSession, fetchProfile } from './profiles.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUTS = [join(ROOT, 'rsdash/desc'), join(ROOT, 'rsdash/rsdash_clean_deploy/desc')];
const MISS = join(ROOT, 'data/profiles_missing.json');
const argv = process.argv.slice(2), val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const MARKETS = val('--market') ? [val('--market')] : ['america', 'thailand'], LIMIT = Number(val('--limit', 0)) || Infinity, REFRESH = argv.includes('--refresh');
const BASE = 'https://rsdashclean.vercel.app', DIR = { america: 'us', thailand: 'th' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Date().toISOString().slice(0, 10);

function loadExisting(mk) {
  const d = join(OUTS[0], DIR[mk]), map = {};
  if (existsSync(d)) for (const f of readdirSync(d).filter((f) => f.endsWith('.json'))) Object.assign(map, JSON.parse(readFileSync(join(d, f), 'utf8')));
  return map;
}
function save(mk, map) {
  const shards = buildShards(map);
  for (const out of OUTS) {
    const d = join(out, DIR[mk]); mkdirSync(d, { recursive: true });
    for (const [k, v] of Object.entries(shards)) writeFileSync(join(d, k + '.json'), JSON.stringify(v));
  }
}

async function main() {
  const missing = existsSync(MISS) ? JSON.parse(readFileSync(MISS, 'utf8')) : {};
  let sess = await yahooSession();
  for (const mk of MARKETS) {
    const r = await fetch(`${BASE}/api/scan?market=${mk}&universe=all&v=2`, { signal: AbortSignal.timeout(60000) });
    const tickers = [...new Set(((await r.json()).data || []).map((x) => x.ticker).filter(Boolean))].sort();
    const map = REFRESH ? {} : loadExisting(mk);
    const old = REFRESH ? loadExisting(mk) : map;
    const todo = tickers.filter((t) => REFRESH || (!map[t] && !(missing[mk + ':' + t] && missing[mk + ':' + t] > new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)))).slice(0, LIMIT);
    console.log(`${mk}: ${tickers.length} tickers, fetching ${todo.length}`);
    let got = 0, miss = 0, err = 0;
    for (const [i, t] of todo.entries()) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const s = await fetchProfile(yahooSymbol(t, mk), sess);
          if (s) { map[t] = s; got++; delete missing[mk + ':' + t]; } else { missing[mk + ':' + t] = today; miss++; if (old[t]) map[t] = old[t]; }
          break;
        } catch (e) {
          if (e.auth && attempt === 0) { sess = await yahooSession(); continue; }
          err++; if (old[t]) map[t] = old[t]; console.warn(`WARN ${mk} ${t}: ${e.message}`); break;
        }
      }
      if ((i + 1) % 100 === 0) { save(mk, map); writeFileSync(MISS, JSON.stringify(missing)); console.log(`${mk}: ${i + 1}/${todo.length} (got ${got}, none ${miss}, err ${err})`); }
      await sleep(300);
    }
    if (REFRESH) for (const t of tickers) if (!map[t] && old[t]) map[t] = old[t];
    save(mk, map); writeFileSync(MISS, JSON.stringify(missing));
    console.log(`${mk}: done — have ${Object.keys(map).length}/${tickers.length} (new ${got}, Yahoo none ${miss}, errors ${err})`);
  }
}
main().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
