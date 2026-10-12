/* store.mjs — state (กันข่าวซ้ำ, สมาชิก Top20) + เขียน md
   กติกาสำคัญ: ส่วนก่อน "## Feed" (สรุปที่ Claude เขียน, มุมมองจาก X, โน้ตผู้ใช้) ห้ามแตะ */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';

export const newState = () => ({ v: 1, lastRun: null, seen: {}, members: {}, recent: {} });

export const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function itemKey(item) {
  let u = String(item.url || '');
  try {
    const x = new URL(u); x.hash = '';
    for (const k of [...x.searchParams.keys()]) if (/^utm_/i.test(k)) x.searchParams.delete(k);
    u = x.toString();
  } catch { /* url เพี้ยน ใช้ตามเดิม */ }
  return createHash('sha1').update(u).digest('hex');
}

export const normTitle = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function dedupe(items, state) {
  const out = [], titles = new Set();
  for (const r of state.recent[items[0] && items[0].ticker] || []) if (r.source !== 'sec') titles.add(normTitle(r.title));
  for (const it of items) {
    // SEC: title มักซ้ำกัน ("8-K: 8-K") ทั้งที่เป็นคนละฉบับ → ใช้ URL อย่างเดียว
    const k = itemKey(it), t = it.source === 'sec' ? null : normTitle(it.title);
    if (state.seen[k] || (t && titles.has(t))) continue;
    state.seen[k] = it.published; if (t) titles.add(t); out.push(it);
  }
  return out;
}

export function loadState(path) {
  if (!existsSync(path)) return newState();
  try { return { ...newState(), ...JSON.parse(readFileSync(path, 'utf8')) }; }
  catch (e) {   // ไฟล์เสีย (เช่น sync ชนกัน) → เก็บไว้ดูทีหลัง แล้วเริ่มใหม่ แทนที่จะล้มทุกรอบ
    const bad = `${path}.corrupt-${Date.now()}`;
    renameSync(path, bad);
    console.warn(`WARN state corrupt (${e.message}) → moved to ${bad}, starting fresh`);
    return newState();
  }
}

export function saveState(path, state) {
  writeFileSync(path + '.tmp', JSON.stringify(state, null, 1));
  renameSync(path + '.tmp', path);
}

export function updateMembership(state, universe, today) {
  const entered = [], left = [], now = new Set();
  for (const u of universe) {
    now.add(u.ticker);
    const m = state.members[u.ticker];
    if (!m || m.left) { state.members[u.ticker] = { name: u.name, since: today, lists: u.lists }; entered.push(u.ticker); }
    else { m.name = u.name; m.lists = u.lists; }
  }
  for (const [t, m] of Object.entries(state.members)) if (!now.has(t) && !m.left) { m.left = today; left.push(t); }
  return { entered, left };
}

export function sinceFor(state, ticker, today) {
  const m = state.members[ticker];
  if (!state.lastRun || !m || m.since === today) return addDays(today, -30);
  return state.lastRun;
}

export function pruneRecent(state, today) {
  const r30 = addDays(today, -30), s120 = addDays(today, -120);
  for (const t of Object.keys(state.recent)) state.recent[t] = state.recent[t].filter((x) => x.published >= r30);
  for (const [k, d] of Object.entries(state.seen)) if (d < s120) delete state.seen[k];
}

export const fileNameFor = (ticker) => String(ticker).replace(/\./g, '-') + '.md';

export const sourceLabel = (it) => {
  const m = it.meta || {};
  if (it.source === 'yahoo') return 'Yahoo';
  if (it.source === 'gnews') return m.publisher || 'Google News';
  if (it.source === 'sec') return `SEC ${m.form || ''}`.trim();
  if (it.source === 'reddit') return `Reddit r/${m.sub}` + (m.score ? ` ▲${m.score}` : '');
  return it.source;
};
const mdText = (s) => String(s).replace(/[\[\]]/g, (c) => (c === '[' ? '(' : ')')).replace(/\s+/g, ' ');
const mdUrl = (u) => String(u).replace(/[ ()]/g, (c) => encodeURIComponent(c));

export function renderFeedBlock(date, items) {
  return `### ${date}\n` + items.map((it) => `- [${sourceLabel(it)}] ${mdText(it.title)} ([ลิงก์](${mdUrl(it.url)}))`).join('\n') + '\n';
}

const OWN_KEYS = new Set(['ticker', 'market', 'in_top20_since', 'lists', 'last_fetch', 'left_top20']);

/* เขียนเฉพาะ key ของสคริปต์ — property อื่นที่ผู้ใช้เพิ่ม (tags ฯลฯ) เก็บไว้ตามเดิม */
function frontmatter(meta, oldBody) {
  const lines = [`ticker: ${meta.ticker}`, 'market: america', `in_top20_since: ${meta.since}`, `lists: [${(meta.lists || []).join(', ')}]`, `last_fetch: ${meta.lastFetch}`];
  if (meta.left) lines.push(`left_top20: ${meta.left}`);
  let skip = false;
  for (const l of String(oldBody || '').split(/\r?\n/)) {
    const key = (l.match(/^([A-Za-z0-9_-]+):/) || [])[1];
    if (key) skip = OWN_KEYS.has(key); else if (!/^\s/.test(l)) skip = false;   // บรรทัดย่อหน้า = ค่าต่อของ key ก่อนหน้า
    if (!skip && l.trim()) lines.push(l);
  }
  return '---\n' + lines.join('\n') + '\n---\n';
}

export function upsertStockMd(existing, meta, block) {
  let md = existing, oldFm = '';
  if (md == null) {
    md = `# ${meta.ticker} — ${meta.name}\n\n## ทำไมติด Top20\n_ยังไม่มีสรุป — สั่ง "สรุป Top20 US"_\n\n## มุมมองจาก X\n_ยังไม่มี — สั่ง "ดู X ของ ${meta.ticker}"_\n\n## Feed\n`;
  } else {
    md = md.replace(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/, (_, body) => { oldFm = body; return ''; });
  }
  md = frontmatter(meta, oldFm) + md;
  if (!block) return md;
  let feed = md.search(/^## Feed[ \t]*\r?$/m);
  if (feed < 0) { md = md.replace(/\s*$/, '\n\n## Feed\n'); feed = md.search(/^## Feed[ \t]*\r?$/m); }
  if (md.indexOf('\n', feed) < 0) md += '\n';   // ไฟล์จบที่ "## Feed" พอดี (ไม่มี newline)
  const head = block.slice(0, block.indexOf('\n') + 1), lines = block.slice(head.length);
  const sameDay = md.indexOf('\n' + head, feed);
  if (sameDay >= 0) { const at = sameDay + 1 + head.length; return md.slice(0, at) + lines + md.slice(at); }
  const afterFeed = md.indexOf('\n', feed) + 1;
  return md.slice(0, afterFeed) + '\n' + block + md.slice(afterFeed).replace(/^(?=\S)/, '\n');
}

const cell = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|');

export function renderIndexMd(state, today) {
  const d7 = addDays(today, -7), active = [], gone = [];
  for (const [t, m] of Object.entries(state.members)) (m.left ? gone : active).push([t, m]);
  const link = (t) => `[[${fileNameFor(t).slice(0, -3)}]]`;
  const cnt = (t, reddit) => (state.recent[t] || []).filter((x) => x.published >= d7 && (x.source === 'reddit') === reddit).length;
  let md = `---\nlast_fetch: ${today}\n---\n# Top20 หุ้น US (YTD ∪ RS)\n\n_อธิบายย้อนหลัง ไม่ใช่สัญญาณซื้อขาย · อัปเดตอัตโนมัติจาก scripts/news_\n\n`;
  md += '| หุ้น | ชื่อ | List | เข้าเมื่อ | ข่าว 7 วัน | Reddit 7 วัน |\n|---|---|---|---|---|---|\n';
  for (const [t, m] of active.sort((a, b) => a[1].since.localeCompare(b[1].since) || a[0].localeCompare(b[0]))) md += `| ${link(t)} | ${cell(m.name)} | ${(m.lists || []).join('+')} | ${m.since} | ${cnt(t, false)} | ${cnt(t, true)} |\n`;
  if (gone.length) {
    md += '\n## หลุดแล้ว\n\n| หุ้น | ชื่อ | เข้า | หลุด |\n|---|---|---|---|\n';
    for (const [t, m] of gone.sort((a, b) => b[1].left.localeCompare(a[1].left))) md += `| ${link(t)} | ${cell(m.name)} | ${m.since} | ${m.left} |\n`;
  }
  return md;
}
