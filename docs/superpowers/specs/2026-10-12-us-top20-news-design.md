# Spec: ข่าว + มุมมอง "ทำไมหุ้นติด Top20" (เริ่มที่หุ้น US)

วันที่: 2026-10-12 · สถานะ: รอผู้ใช้ตรวจ

## 1. เป้าหมาย
ช่วยให้เข้าใจว่าทำไมหุ้นแต่ละตัวถึงติด Top20 ผลตอบแทน/RS — **เพื่อทำความเข้าใจ ไม่ใช่สัญญาณซื้อขาย**
(ไม่ผ่าน backtest ตาม quant-backtest-method จึงห้ามใช้เป็นกฎใน rsdash)

### ข้อกำหนดจากผู้ใช้
- ตลาด: US ก่อน (ไทยทีหลัง)
- รายชื่อ: Top20 YTD ∪ Top20 RS (≈25–35 ตัว)
- ผลลัพธ์: md แยกรายตัว อัปเดตต่อเนื่อง + สรุปโชว์ในหน้า Top20 ของ rsdash
- ความถี่: ข่าวอัปเดตอัตโนมัติทุกวันทำการ; วันแรกเก็บเยอะ วันต่อไปเฉพาะของใหม่
- **ค่าใช้จ่าย $0** — ไม่ใช้ API ที่เสียเงิน (X API, Claude API)
- X: อยากได้มุมมองจากโปรไฟล์ที่น่าเชื่อถือ (อ้างอิงแหล่งข่าวจริง)

### นอกขอบเขต
- ดึง X อัตโนมัติ (ฟรี + ถูกกติกาไม่มีทาง) → ทำแบบสั่งเองเท่านั้น (ข้อ 5)
- สรุปด้วย AI อัตโนมัติรายวัน (ต้องจ่าย API) → ทำแบบสั่งเอง (ข้อ 4)
- ตลาดไทย, sentiment score เชิงตัวเลข, การใช้ข่าวเป็นสัญญาณ

## 2. ภาพรวม

```
[Windows Task Scheduler 06:30 น. อ–ส]
        │
        ▼
scripts/news/fetch_news.mjs ──► rsdash /api/scan?market=america  (หารายชื่อ Top20)
        │                ──► RSS/JSON ฟรี: Yahoo Finance, Google News, SEC EDGAR, Reddit
        ├──► Stocks_US/<TICKER>.md   (ต่อท้าย feed ใหม่, ไม่ซ้ำ)
        ├──► Stocks_US/_Top20.md     (ตารางรายชื่อปัจจุบัน + วันที่เข้า/ออก)
        └──► Supabase: stock_notes   (สรุปสั้นสำหรับ rsdash)
                                          │
rsdash หน้า Top20 ◄── /api/notes ◄────────┘

[สั่งเอง] "สรุป Top20 US"  → Claude อ่าน feed ใน md → เขียนส่วน "ทำไมติด Top20" → push สรุปขึ้น stock_notes
[สั่งเอง] "ดู X ของ NVDA"  → Claude อ่าน X ผ่าน Chrome ที่ผู้ใช้ล็อกอิน → เติมส่วน "มุมมองจาก X"
```

ทำไมรันบนเครื่องนี้ (Task Scheduler) ไม่ใช่ GitHub Actions/Vercel:
md ต้องลง vault บนเครื่องโดยตรง; Actions จะ commit ชนกับ working copy บน Google Drive; Vercel เขียนไฟล์ไม่ได้
ข้อแลก: เครื่องต้องเปิดตอน 06:30 — ถ้าไม่เปิด รอบถัดไปจะเก็บย้อนให้ (dedupe ด้วย state ไม่หาย)

## 3. ตัวดึงข่าวอัตโนมัติ — `scripts/news/` (Node 24 ไม่มี dependency — เครื่องนี้ไม่มี Python ใน PATH)

| ไฟล์ | หน้าที่ |
|---|---|
| `universe.mjs` | เรียก `https://rsdashclean.vercel.app/api/scan?market=america&universe=all&v=2` → Top20 ตาม `pYTD` ∪ Top20 ตาม `score` (หุ้นสามัญ, ตัวกรองเดียวกับหน้า Top20 "ทั้งหมด") |
| `sources.mjs` | ตัวดึงแต่ละแหล่ง คืน `Item{ticker, source, title, url, published, summary?}` |
| `store.mjs` | state (`data/news_state.json`: url-hash ที่เห็นแล้ว, วันเข้า/ออก Top20), เขียน md |
| `push.mjs` | upsert แถวลง Supabase `stock_notes` |
| `fetch_news.mjs` | entry point: universe → sources → dedupe → md → push; log ไป `data/news_log.txt` |

### แหล่งข่าว (ฟรี ไม่ต้องใช้ key)
| แหล่ง | URL | ใช้ทำอะไร |
|---|---|---|
| Yahoo Finance RSS | `feeds.finance.yahoo.com/rss/2.0/headline?s=TICKER` | ข่าวรายหุ้น |
| Google News RSS | `news.google.com/rss/search?q="TICKER"+stock+when:7d` | ข่าวกว้าง |
| SEC EDGAR | `data.sec.gov/submissions/CIK##########.json` | 8-K / 10-Q / 10-K / Form 4 (ต้องใส่ User-Agent พร้อมอีเมลตามกติกา SEC) |
| Reddit | `reddit.com/r/{stocks,wallstreetbets,investing}/search.json?q=TICKER&restrict_sr=1&sort=new&t=week` | กระแสคนพูดถึง (นับจำนวน + ลิงก์โพสต์คะแนนสูง) |

กติกา:
- **วันแรก / ตัวที่เพิ่งเข้า Top20:** เก็บย้อน 30 วัน
- **วันต่อไป:** เฉพาะ item ที่ url-hash ยังไม่เคยเห็น
- หน่วง ≥1 วินาที/request; แหล่งไหนพังให้ข้ามและ log — ห้ามล้มทั้งรอบ
- รวมข่าวซ้ำต่างแหล่ง (หัวข่าวเหมือนกันหลัง normalize) เหลือ 1

## 4. ไฟล์ md — `Stocks_US/<TICKER>.md`

```markdown
---
ticker: NVDA
market: america
in_top20_since: 2026-10-13
lists: [YTD, RS]
last_fetch: 2026-10-14
---
# NVDA — NVIDIA Corp

## ทำไมติด Top20          ← Claude เขียนเมื่อผู้ใช้สั่ง (เขียนทับทั้งส่วน)
_อัปเดต 2026-10-14 · อธิบายย้อนหลัง ไม่ใช่การพิสูจน์สาเหตุ_
- **ข้อเท็จจริง/ตัวเร่ง:** … [แหล่ง](url)
- **ความเห็น/กระแส:** …
- **ความเสี่ยงที่มีคนพูดถึง:** …

## มุมมองจาก X          ← เติมเมื่อสั่ง (ข้อ 5)

## Feed                  ← สคริปต์ต่อท้าย ใหม่สุดอยู่บน
### 2026-10-14
- [Yahoo] หัวข่าว … ([ลิงก์](url))
- [SEC 8-K] … ([ลิงก์](url))
- [Reddit r/stocks ▲412] … ([ลิงก์](url))
```

- `Stocks_US/_Top20.md`: ตารางรายชื่อปัจจุบัน, อยู่ใน list ไหน, วันที่เข้า, จำนวนข่าว 7 วัน, wikilink `[[NVDA]]`
- หุ้นที่หลุด Top20: ไฟล์ไม่ถูกลบ, frontmatter เพิ่ม `left_top20: <วันที่>`, หยุดดึงข่าว

## 5. ส่วนที่สั่งเอง (ใช้โควตาแพ็กเกจ Claude ที่มีอยู่ ไม่มีค่าใช้จ่ายเพิ่ม)

**"สรุป Top20 US"** — Claude อ่าน Feed ของแต่ละตัว → เขียน "ทำไมติด Top20" แยก ข้อเท็จจริง / ความเห็น / ความเสี่ยง ทุกข้อมีลิงก์แหล่งที่มา → `fetch_news.mjs --summary-only` ขึ้น rsdash
ทำเฉพาะตัวที่มีข่าวใหม่ตั้งแต่สรุปครั้งก่อน (ประหยัดโควตา)

**"ดู X ของ <TICKER>"** — ผ่าน Claude in Chrome (บัญชีที่ผู้ใช้ล็อกอินเอง, ผู้ใช้อยู่หน้าเครื่อง):
- อ่านจาก X List ที่ผู้ใช้ระบุ หรือค้น `$TICKER` เรียงตามล่าสุด
- คัดเฉพาะโพสต์ที่**มีลิงก์ไปแหล่งข่าวที่เชื่อถือได้** (reuters, bloomberg, wsj, cnbc, ft, barrons, sec.gov, เว็บ IR ของบริษัท) — ติ๊กฟ้าเป็นเงื่อนไขรอง (ติ๊กฟ้า = จ่าย Premium ไม่ใช่การรับรองความน่าเชื่อถือ)
- ไม่เกิน ~10 โพสต์ต่อตัวต่อครั้ง, บันทึก @handle + ลิงก์ + สรุป 1 บรรทัด
- ข้อจำกัด: เป็นการเข้าถึงแบบอัตโนมัติปริมาณน้อย — มีความเสี่ยงเรื่องเงื่อนไขของ X ซึ่งผู้ใช้ยอมรับเองว่าจะใช้หรือไม่

## 6. rsdash

**Supabase** ตารางใหม่ `stock_notes`:
`ticker text, market text, PK(ticker, market)`, `in_top20_since date`, `news_7d int`, `reddit_7d int`, `headlines jsonb` (5 ล่าสุด: title,url,source,date), `summary text`, `summary_at timestamptz`, `updated_at timestamptz`
- RLS: anon อ่านได้อย่างเดียว; สคริปต์เขียนด้วย service-role key ที่เก็บใน `.env` บนเครื่อง (gitignored) — ผู้ใช้ใส่ key เอง

**API** `rsdash/api/notes.js`: `GET /api/notes?market=america&universe=all&v=2` → แถวทั้งหมดของตลาดนั้น (cache 5 นาที)

**UI** หน้า Top20 (US): แต่ละแถว/การ์ดมีปุ่ม 📰 + จำนวนข่าว 7 วัน; แตะ → กางสรุป "ทำไมติด" + หัวข่าว 5 อัน (ลิงก์ออก) + วันที่อัปเดต
ไม่มีข้อมูล → ไม่แสดงปุ่ม (ไม่ error) · แก้ทั้ง `rsdash/index.html` และ `rsdash_clean_deploy` ตามที่ deploy จริง

## 7. Error handling
- universe ดึงไม่ได้ → ใช้รายชื่อรอบก่อนจาก state + log เตือน
- แหล่งข่าวแหล่งเดียวพัง → ข้าม, log, รอบอื่นเดินต่อ
- Supabase พัง → md ยังเขียน, push ซ้ำรอบหน้า (idempotent upsert)
- Task Scheduler รันไม่สำเร็จ → `news_log.txt` บรรทัดสุดท้ายบอกสถานะ; `_Top20.md` แสดง `last_fetch`

## 8. Testing
- unit (node --test, ใช้ fixture RSS/JSON ที่บันทึกไว้ ไม่ยิงเน็ตจริง): parse แต่ละแหล่ง, dedupe, เลือก universe, เขียน md แบบต่อท้ายไม่ทับส่วนสรุป, state เข้า/ออก Top20
- smoke: รันจริง 1 รอบด้วย `--limit 3` แล้วตรวจไฟล์
- rsdash: `/api/notes` คืน JSON ถูก; UI ตรวจด้วยเบราว์เซอร์ในแอปทั้งจอมือถือและเดสก์ท็อป

## 9. สิ่งที่ต้องขออนุมัติตอนลงมือ
- สร้างตาราง `stock_notes` ใน Supabase (migration)
- สร้าง Windows Task Scheduler job (การตั้งค่าถาวรบนเครื่อง)
- deploy rsdash (`vercel --prod`) — เช็ก `vercel whoami` ก่อนตาม AGENTS.md
- ผู้ใช้ใส่ Supabase service-role key ลง `.env` เอง

## 10. ค่าที่เลือกไว้ (แก้ได้)
- โฟลเดอร์ md: `Stocks_US/` ที่ root ของ vault
- เวลารัน: 06:30 น. ไทย อ–ส (= หลังตลาด US ปิดของวัน จ–ศ)
- ย้อนหลังรอบแรก: 30 วัน · หัวข่าวบน rsdash: 5 อัน
