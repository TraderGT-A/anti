# ⚔️ RS ARENA — เว็บพอร์ตจำลองประลองกลยุทธ์ (Boss vs System Bot)

เว็บแอปพลิเคชันพอร์ตจำลอง (Paper Trading Arena) แยกเด็ดขาดจาก RS Dashboard หลัก เพื่อแข่งขันและวัดผลลัพธ์ระหว่างการตัดสินใจของมนุษย์ (Discretionary Trader) กับระบบเชิงปริมาณอัตโนมัติ 100% (Quantitative Systematic Bot)

---

## 🌟 ฟังก์ชันหลัก (Core Features)

### 1. แบบที่ 1 — Semi-Auto (👑 พอร์ตบอสเคาะมือ)
* **สัญญาณซื้อ Real-time**: ดึงหุ้นที่เกิดสัญญาณ ▲ BUY ล่าสุดจาก RS Dashboard (`api/scan` + `rshist_*.json`) กรองเฉพาะหุ้นแข็งแกร่ง (RS > 60 + แนวโน้มขาขึ้น)
* **1-Click Paper Buy**: กดปุ่มเคาะซื้อพร้อมชิปเลือกขนาดไม้ (10%, 15%, 20%, 25%) ปัดเศษตาม Board Lot อัตโนมัติ (หุ้นไทย 100 หุ้น, หุ้นสหรัฐฯ 1 หุ้น)
* **Smart Alert & Risk Management**:
  * 🚨 **เตือนจุดขาย**: แจ้งเตือนทันทีเมื่อหุ้นที่ถืออยู่เกิดสัญญาณ ▼ SELL ใน RS Dashboard
  * ⚠️ **เตือนจุดตัดขาดทุน**: เตือนเมื่อราคาแตะ Hard Stop Loss (-8%)
  * 📄 **ป้ายข่าวงบการเงิน**: แจ้งเตือนเมื่อบริษัทประกาศงบ (ดึง % กำไร YoY จาก F45 ที่ตรวจจับจากตลาดหลักทรัพย์)
* **เคาะซื้อหุ้นนอกสัญญาณ (Manual Entry)**: บอสสามารถเพิ่มหุ้นใดๆ เข้าพอร์ตได้อิสระ

### 2. แบบที่ 2 — Full-Auto (🤖 บอทจำลองรันตามระบบ 100%)
* **Market Gate Stage 2 Filter**: บอทจะเปิดเกมรุกเข้าซื้อเฉพาะเมื่อตลาดเป็น Stage 2 (ไฟเขียว) เท่านั้น
* **RS Momentum Ranking**: เลือกถือครองหุ้นที่มี RS Rating สูงสุด 8 ตัวแรก และแบ่งสัดส่วนเงินเท่ากัน (12% ต่อไม้)
* **Mechanical Exits**: ขายออกทันทีเมื่อ:
  1. เกิดสัญญาณ ▼ SELL ในระบบ RS Dashboard
  2. ราคาร่วงแตะ Stop Loss (-8%)
* **Zero Emotion**: ตัดสินใจตามกฎตัวเลข 100% ไม่มีอารมณ์มาเกี่ยวข้อง

### 3. ⚔️ Battle Arena & Head-to-Head Matrix (วัดผลตัวต่อตัว)
* **Live Tug-of-War Bar**: แถบวัดพลังการแข่งขันระหว่างบอส (สีทอง) กับบอท (สีฟ้า) พร้อมป้ายสถานะบอกว่าใครกำลังนำกี่เปอร์เซ็นต์
* **Dual Equity Curve Chart**: พล็อตเส้นกราฟผลตอบแทนสะสมเปรียบเทียบ 3 เส้น:
  * 🟡 **เส้นบอส (Boss)**
  * 🔵 **เส้นบอท (Bot)**
  * ⚪ **เส้นดัชนีตลาด (Benchmark: SET Index / S&P 500)**
* **Scorecard & Consensus Matrix**:
  * ตารางเปรียบเทียบ Win Rate, Profit Factor, Total Return, Closed Trades
  * 🤝 **ใจตรงกัน (Both Bought)**: หุ้นที่บอสและบอทเลือกตรงกัน เทียบราคาต้นทุนและกำไร
  * 👑 **บอสเลือกเดี่ยว (Boss Solo)**: หุ้นที่บอสเลือกเคาะเอง
  * 🤖 **บอทเลือกเดี่ยว (Bot Solo)**: หุ้นที่บอทเลือกตามระบบ

### 4. 📱 Webull OpenAPI & Paper Trading Bridge (ตลาดสหรัฐฯ 🇺🇸)
* เชื่อมโยงบัญชี Webull Thailand OpenAPI (`CTH0082988`)
* สคริปต์เชื่อมต่อ `rsarena/scripts/webull_bridge.py`:
  * ตรวจสอบสถานะและยอดเงินคงเหลือใน Webull (`python rsarena/scripts/webull_bridge.py --summary`)
  * จำลองคำสั่งซื้อขาย US Equities ในรูปแบบมาตรฐาน Webull Order Payload

---

## 🚀 วิธีเปิดใช้งาน (Getting Started)

### วิธีที่ 1: เปิดใช้งานในเครื่อง (Local Run)
คุณสามารถเปิดไฟล์ `rsarena/index.html` บนเบราว์เซอร์ได้ทันที หรือรัน Local Web Server:
```bash
cd rsarena
npm start
```
เปิดเบราว์เซอร์ไปที่: `http://localhost:3000`

### วิธีที่ 2: ขึ้นโฮสต์เว็บใหม่บน Vercel (Separate Web App)
โปรเจกต์นี้แยกโฟลเดอร์ออกมาเด็ดขาดและมี `vercel.json` ในตัว สามารถดีพลอยเป็นโปรเจกต์ใหม่ได้ด้วยคำสั่ง:
```bash
cd rsarena
vercel
```
*(จะไม่กระทบกับโปรเจกต์ RS Dashboard เดิม)*

---

## 💾 ระบบสำรองข้อมูล (Data Persistence)
* บันทึกข้อมูลพอร์ตทั้งหมดไว้ใน `localStorage` อัตโนมัติ
* มีปุ่ม **"💾 สำรอง/นำเข้า"** เพื่อ Export JSON ออกมาเก็บไว้ หรือดาวน์โหลดเป็นไฟล์ `.json` เพื่อนำไปเปิดในเครื่องอื่นได้ตลอดเวลา
