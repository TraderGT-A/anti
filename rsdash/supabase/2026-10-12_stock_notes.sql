-- stock_notes: สรุปข่าว/เหตุผลที่หุ้นติด Top20 (เขียนโดย scripts/news/fetch_news.mjs ด้วย service-role, rsdash อ่านด้วย anon)
create table if not exists public.stock_notes (
  ticker          text not null,
  market          text not null,
  in_top20_since  date,
  news_7d         int  default 0,
  reddit_7d       int  default 0,
  headlines       jsonb default '[]'::jsonb,
  summary         text,
  summary_at      timestamptz,
  updated_at      timestamptz default now(),
  primary key (ticker, market)
);

alter table public.stock_notes enable row level security;

drop policy if exists "stock_notes anon read" on public.stock_notes;
create policy "stock_notes anon read" on public.stock_notes for select to anon using (true);
