/* sources.mjs — แหล่งข่าวฟรี (ไม่ต้องใช้ key): Yahoo Finance RSS, Google News RSS, SEC EDGAR, Reddit
   Item = { ticker, source: 'yahoo'|'gnews'|'sec'|'reddit', title, url, published: 'YYYY-MM-DD', meta? }
   parser ทุกตัวไม่ throw — ข้อมูลเสีย/หน้า error คืน [] */
const UA = 'Mozilla/5.0 (compatible; thushouse-news/1.0)';
const SEC_FORMS = new Set(['8-K', '10-Q', '10-K', '4']);
const SUBS = ['stocks', 'wallstreetbets', 'investing'];

export const symbolFor = (ticker) => String(ticker).replace(/\./g, '-');

const decode = (s) => String(s || '')
  .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
  .trim();
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`)); return m ? decode(m[1]) : ''; };
const isoDate = (v) => { const d = new Date(v); return isNaN(d) ? null : d.toISOString().slice(0, 10); };

export function parseRss(xml, { ticker, source }) {
  const out = [];
  for (const m of String(xml || '').matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    let title = tag(m[1], 'title');
    const url = tag(m[1], 'link'), published = isoDate(tag(m[1], 'pubDate'));
    if (!title || !/^https?:\/\//.test(url) || !published) continue;
    const item = { ticker, source, title, url, published };
    if (source === 'gnews') {
      let publisher = tag(m[1], 'source');
      const cut = title.lastIndexOf(' - ');
      if (cut > 0) { publisher = publisher || title.slice(cut + 3).trim(); title = title.slice(0, cut).trim(); }
      item.title = title;
      if (publisher) item.meta = { publisher };
    }
    out.push(item);
  }
  return out;
}

export function parseSecTickers(json) {
  const m = new Map();
  for (const v of Object.values(json || {})) if (v && v.ticker && v.cik_str != null) m.set(String(v.ticker).toUpperCase(), String(v.cik_str).padStart(10, '0'));
  return m;
}

export function parseSecSubmissions(json, { ticker, cik, sinceISO }) {
  const r = json && json.filings && json.filings.recent;
  if (!r || !Array.isArray(r.form)) return [];
  const cikNum = String(Number(cik)), out = [];
  r.form.forEach((form, i) => {
    const date = r.filingDate && r.filingDate[i], acc = r.accessionNumber && r.accessionNumber[i], doc = r.primaryDocument && r.primaryDocument[i];
    if (!SEC_FORMS.has(form) || !date || date < sinceISO || !acc || !doc) return;
    const desc = (r.primaryDocDescription && r.primaryDocDescription[i]) || form;
    out.push({ ticker, source: 'sec', title: `${form}: ${desc}`, url: `https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc.replace(/-/g, '')}/${doc}`, published: date, meta: { form } });
  });
  return out;
}

/* Reddit: ใช้ Atom search feed (JSON ตอบ 403 ถ้าไม่ล็อกอิน) — ไม่มีคะแนนโหวตใน feed */
export function parseReddit(xml, { ticker }) {
  const out = [];
  for (const m of String(xml || '').matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const title = tag(m[1], 'title'), url = (m[1].match(/<link[^>]*href="([^"]+)"/) || [])[1] || '';
    const published = isoDate(tag(m[1], 'published') || tag(m[1], 'updated')), sub = (m[1].match(/<category[^>]*term="([^"]+)"/) || [])[1] || '';
    if (!title || !/^https:\/\/www\.reddit\.com\//.test(url) || !published) continue;
    out.push({ ticker, source: 'reddit', title, url: decode(url), published, meta: { sub } });
  }
  return out;
}

/* ดึง map ticker → CIK ครั้งเดียวต่อรอบ (ต้องมี User-Agent ที่มีช่องทางติดต่อตามกติกา SEC) */
export async function fetchCikMap(secUA, fetchFn = fetch) {
  if (!secUA) return new Map();
  const r = await fetchFn('https://www.sec.gov/files/company_tickers.json', { headers: { 'User-Agent': secUA } });
  if (!r.ok) throw new Error(`sec tickers HTTP ${r.status}`);
  return parseSecTickers(JSON.parse(await r.text()));
}

const defaultSleep = (ms) => new Promise((res) => setTimeout(res, ms));

export async function fetchTicker(ticker, { sinceISO, cikMap = new Map(), secUA = '', fetchFn = fetch, sleep = defaultSleep } = {}) {
  const sym = symbolFor(ticker), items = [], errors = [];
  const get = async (name, url, headers, parse) => {
    try {
      await sleep(1000);
      const r = await fetchFn(url, { headers });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      items.push(...parse(await r.text()));
    } catch (e) { errors.push(`${name}: ${e.message}`); }
  };
  await get('yahoo', `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(sym)}&region=US&lang=en-US`, { 'User-Agent': UA }, (t) => parseRss(t, { ticker, source: 'yahoo' }));
  await get('gnews', `https://news.google.com/rss/search?q=%22${encodeURIComponent(sym)}%22+stock+when:7d&hl=en-US&gl=US&ceid=US:en`, { 'User-Agent': UA }, (t) => parseRss(t, { ticker, source: 'gnews' }));
  const cik = cikMap.get(sym.toUpperCase());
  if (!secUA) errors.push('sec: skipped (NEWS_SEC_UA not set)');
  else if (!cik) errors.push(`sec: no CIK for ${sym}`);
  else await get('sec', `https://data.sec.gov/submissions/CIK${cik}.json`, { 'User-Agent': secUA }, (t) => parseSecSubmissions(JSON.parse(t), { ticker, cik, sinceISO }));
  await get('reddit', `https://www.reddit.com/r/${SUBS.join('+')}/search.rss?q=${encodeURIComponent(sym)}&restrict_sr=1&sort=new&t=week&limit=25`, { 'User-Agent': UA }, (t) => parseReddit(t, { ticker }));
  return { items: items.filter((x) => x.published >= sinceISO), errors };
}
