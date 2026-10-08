# 📈 RS Dashboard — Auto Screener & Weekly Report

ชุดสคริปต์นี้สร้างขึ้นตาม **RS Dashboard Strategy Playbook** โดยดึงข้อมูลตรงจาก API ของ [rsdashclean.vercel.app](https://rsdashclean.vercel.app) เพื่อคำนวณและสร้าง Shortlist อัตโนมัติ พร้อมจัดสรรน้ำหนัก (Position Sizing) ตามคะแนน RS

## 📁 ไฟล์ในโปรเจกต์
- `screener.mjs`: สคริปต์หลักสำหรับรัน Screener ดูสถานะตลาด (Market Regime) และจัดพอร์ตประจำวัน/สัปดาห์
- `weekly.mjs`: สคริปต์สำหรับรันรายสัปดาห์ (แนะนำรันทุกวันศุกร์เย็น) จะบันทึกประวัติ (History) และเปรียบเทียบว่าหุ้นตัวไหนเพิ่งเข้า (New), ตัวไหนถูกตัดออก (Dropped), และสร้าง Markdown Report
- `package.json`: รวมคำสั่งลัดให้เรียกใช้งานง่ายขึ้น
- `data/history.json`: เก็บประวัติการรัน weekly เพื่อใช้เปรียบเทียบ
- `reports/`: โฟลเดอร์เก็บรายงาน Markdown และ JSON ประจำสัปดาห์

## 🚀 วิธีการใช้งาน

เปิด Command Prompt หรือ PowerShell ไปที่โฟลเดอร์นี้ (`rsdash/screener`) แล้วใช้คำสั่งผ่าน `npm` (หรือรันด้วย `node` โดยตรง)

### 1. ดู Shortlist แบบรวดเร็วใน Terminal
```bash
npm run screen
```
*ระบบจะดึงข้อมูลสด, คำนวณ Composite Score, เช็ค Market Breadth และแสดงผลในหน้าจอ*

### 2. ดู Shortlist พร้อมออกรายงานเป็น HTML และ JSON
```bash
npm run screen:full
```
*ระบบจะบันทึกไฟล์ `shortlist_YYYY-MM-DD.html` และเปิดให้ดูผ่านเบราว์เซอร์อัตโนมัติ*

### 3. รันรายงานประจำสัปดาห์ (Weekly Review)
```bash
npm run weekly
```
*ระบบจะสร้างรายงานสรุปในโฟลเดอร์ `reports/` และแสดงหุ้นที่เข้าใหม่/ออกเปรียบเทียบกับสัปดาห์ก่อนหน้า*

## ⚙️ กฎเกณฑ์ที่ใช้ (อิงตาม Playbook)
- **Market Regime**: ใช้ % เหนือเส้น SMA50 ตัดสิน (≥50% = Bull, 40-49% = Neutral, <40% = Bear)
- **Universe**: RS ขั้นต่ำ 70, มูลค่าซื้อขาย (Val) ขั้นต่ำ 30 ล้านบาท
- **Scoring**: ให้คะแนน RS 40%, 3M% 20%, 1M% 15%, การไต่อันดับ (ΔRank) 15%, RVOL 10%
- **Sizing**: กำหนดน้ำหนักการซื้อตามคะแนน RS สูงสุดไม่เกิน 15% และต่ำสุดไม่ต่ำกว่า 4% ต่อตัว

---
*Developed as part of Antigravity AI autonomous task.*
