/* push.mjs — แถวสั้นสำหรับ rsdash → Supabase stock_notes (PostgREST upsert) */
import { addDays, sourceLabel } from './store.mjs';

const PLACEHOLDER = /^_ยังไม่มีสรุป/;

export function extractSummary(md) {
  const m = String(md || '').match(/^## ทำไมติด Top20[ \t]*\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  if (!m) return null;
  const text = m[1].trim();
  if (!text || PLACEHOLDER.test(text)) return null;
  const at = (text.match(/_อัปเดต (\d{4}-\d{2}-\d{2})/) || [])[1] || null;
  return { text: text.slice(0, 1500), at };
}

export function buildRow(ticker, member, recentItems, summary, today) {
  const d7 = addDays(today, -7), recent = (recentItems || []).filter((x) => x.published >= d7);
  const news = (recentItems || []).filter((x) => x.source !== 'reddit').sort((a, b) => b.published.localeCompare(a.published));
  const row = {
    ticker, market: 'america', in_top20_since: member.since,
    news_7d: recent.filter((x) => x.source !== 'reddit').length,
    reddit_7d: recent.filter((x) => x.source === 'reddit').length,
    headlines: news.slice(0, 5).map((x) => ({ title: x.title, url: x.url, source: sourceLabel(x), date: x.published })),
    updated_at: new Date().toISOString(),
  };
  if (summary) { row.summary = summary.text; row.summary_at = summary.at; }
  return row;
}

export async function pushRows(rows, { url, key, fetchFn = fetch }) {
  const r = await fetchFn(`${url}/rest/v1/stock_notes?on_conflict=ticker,market`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(rows),
  });
  return { ok: !!r.ok, status: r.status };
}
