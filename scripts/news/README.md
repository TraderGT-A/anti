# ข่าว "ทำไมหุ้นติด Top20" — หุ้น US

คู่มือนี้สำหรับผู้ใช้, Claude และ Antigravity ใช้ทำงานต่อ
Spec: `docs/superpowers/specs/2026-10-12-us-top20-news-design.md`

> อธิบายย้อนหลัง ไม่ใช่การพิสูจน์สาเหตุ และไม่ใช่สัญญาณซื้อขาย (ยังไม่ผ่าน backtest ตาม quant-backtest-method)

## ระบบอัตโนมัติ (ฟรี)
- Task Scheduler: **"THUSHOUSE News US"** อังคาร–เสาร์ 06:30 (เวลาไทย) → `scripts/news/run_news.cmd`
- รายชื่อหุ้น = Top20 YTD ∪ Top20 RS จาก `rsdashclean.vercel.app/api/scan?market=america&universe=all&v=2`
- แหล่งข่าว: Yahoo Finance RSS, Google News RSS, SEC EDGAR (ต้องตั้ง `NEWS_SEC_UA`), Reddit Atom (r/stocks+wallstreetbets+investing; อาจโดน 429 บางวัน)
- ผลลัพธ์:
  - `Stocks_US/<TICKER>.md` — Feed ใหม่สุดอยู่บน, จัดหัวข้อตามวันที่เผยแพร่
  - `Stocks_US/_Top20.md` — ตารางรายชื่อปัจจุบัน + หุ้นที่หลุดแล้ว
  - Supabase `stock_notes` → ปุ่ม 📰 ในหน้า Top20 US ของ rsdash
- log: `data/news_log.txt` (บรรทัดละรอบ: `ok tickers=… new=… errors=… push=…` หรือ `FAIL …`) · รายละเอียดรอบล่าสุด: `data/news_run.txt`
- ความลับอยู่ใน `scripts/news/.env` (ดูตัวอย่างที่ `.env.example`)

## รันเอง
```bash
node scripts/news/fetch_news.mjs                 # รอบปกติ
node scripts/news/fetch_news.mjs --limit 3 --dry # ทดสอบ: ไม่ push ไม่บันทึก state (ลบ Stocks_US ที่ได้ทิ้งเอง)
node scripts/news/fetch_news.mjs --summary-only  # push เฉพาะส่วนสรุปขึ้น rsdash
schtasks /Run /TN "THUSHOUSE News US"            # สั่ง job ให้รันทันที
```

## คำสั่ง "สรุป Top20 US" (ทำเมื่อผู้ใช้สั่ง)
1. อ่าน `Stocks_US/_Top20.md` เพื่อดูรายชื่อปัจจุบัน
2. ทำเฉพาะหุ้นที่ Feed มีหัวข้อวันที่ใหม่กว่าบรรทัด `_อัปเดต YYYY-MM-DD` ใต้ "ทำไมติด Top20" (หรือที่ยังเป็น `_ยังไม่มีสรุป_`)
3. อ่าน Feed ของหุ้นตัวนั้น (เปิดลิงก์ที่จำเป็นได้) แล้ว**เขียนทับเฉพาะเนื้อหาใต้ `## ทำไมติด Top20`** ด้วยแม่แบบนี้:
   ```markdown
   _อัปเดต 2026-10-14 · อธิบายย้อนหลัง ไม่ใช่การพิสูจน์สาเหตุ_
   - **ข้อเท็จจริง/ตัวเร่ง:** … [แหล่ง](url)
   - **ความเห็น/กระแส:** … [แหล่ง](url)
   - **ความเสี่ยงที่มีคนพูดถึง:** … [แหล่ง](url)
   ```
   - ทุกข้อต้องมีลิงก์แหล่งที่มา และแยกข้อเท็จจริง (งบ, filings, ข่าวบริษัท) ออกจากความเห็นให้ชัด
   - ยาวรวมไม่เกิน ~1,500 ตัวอักษร (rsdash ตัดส่วนที่เกิน)
   - ห้ามแก้ส่วน `## Feed` และ `## มุมมองจาก X`
4. `node scripts/news/fetch_news.mjs --summary-only`

## คำสั่ง "ดู X ของ <TICKER>" (ทำเมื่อผู้ใช้สั่ง และผู้ใช้อยู่หน้าเครื่องเท่านั้น)
- ใช้ Claude in Chrome กับบัญชีที่ผู้ใช้ล็อกอินไว้เอง (ห้ามล็อกอินหรือกรอกรหัสผ่านแทน) อ่านจาก X List ที่ผู้ใช้ระบุ หรือค้น `$TICKER` เรียงตามล่าสุด
- เก็บเฉพาะโพสต์ที่**มีลิงก์ไปแหล่งข่าวที่เชื่อถือได้**: reuters.com, bloomberg.com, wsj.com, cnbc.com, ft.com, barrons.com, sec.gov และเว็บ IR ของบริษัท ส่วนติ๊กฟ้าเป็นแค่เงื่อนไขรอง (ติ๊กฟ้าคือคนที่จ่าย Premium ไม่ได้แปลว่าน่าเชื่อถือ)
- เก็บไม่เกิน ~10 โพสต์ต่อหุ้นต่อครั้ง แล้วเขียนใต้ `## มุมมองจาก X` ในรูปแบบ:
  `- 2026-10-14 @handle: สรุป 1 บรรทัด ([โพสต์](url)) · อ้าง [Reuters](url)`
- การดึงแบบนี้เป็นการเข้าถึงอัตโนมัติปริมาณน้อย จึงมีความเสี่ยงเรื่องเงื่อนไขของ X ทำเฉพาะเมื่อผู้ใช้สั่ง
