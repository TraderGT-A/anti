# 09 Basic TradingView P1

- **คลิป:** https://www.youtube.com/watch?v=Q_Dk_hvO91g
- **ความยาว:** 45:56

## สรุปสั้น

- TradingView ใช้ได้ทั้งแอปมือถือ, Browser และ **Desktop App** (ผู้สอนใช้ Desktop App) ช่วง **Black Friday** ลดราคาได้ถึงประมาณ 60% แพ็กเกจ Essential ประมาณ 155 เหรียญต่อปี แบบฟรีมีข้อจำกัด (1 ชาร์ตต่อแท็บ, เซฟ Layout ได้ 1 อัน, ย้อนกราฟได้ประมาณ 7 ปี)
- **Layout** ใช้เก็บ Watchlist, เส้นที่วาด และอินดิเคเตอร์แยกเป็นชุด เหมาะกับการทดสอบหลายกลยุทธ์โดยไม่ต้องลบของเดิม
- **เครื่องมือวาด** (Trend Line, Horizontal Ray, Parallel Channel, Fibonacci, Pattern, Elliott Wave, Long/Short Position) กดดาวไว้เป็น Favorite ได้ และเซฟ **Drawing Template** (สี ขอบ พื้นหลัง) ไว้เรียกใช้ซ้ำได้
- **Compare** ใช้เทียบหลายสินทรัพย์ เช่น 1 ปีที่ผ่านมา Bitcoin +150%, ทอง +33%, S&P 500 +30%, Nasdaq +29% ส่วน **Indicator Template** (เช่น TZC ของผู้สอน) เรียกชุดอินดิเคเตอร์ได้ในคลิกเดียว
- **Alert** (วางเมาส์ที่แกนราคาแล้วกด +) แจ้งเตือนไปมือถือหรือนาฬิกาได้ **Bar Replay** ใช้ย้อนกราฟเพื่อ Backtest ทีละแท่ง

---

## การเข้าใช้งานและแพ็กเกจ

- บทนี้เป็นคลาสแรกของส่วนปรับพื้นฐาน สอนการใช้ TradingView แบบพื้นฐาน สัปดาห์หน้าจะสอน **Stock Screener** สำหรับหาหุ้น
- ใช้ได้ทั้ง **แอปมือถือ** (iOS/Android), **Browser** (tradingview.com) และ **Desktop App** (กด Download บนเว็บ) ผู้สอนใช้ Desktop App เพราะแยกจาก Chrome
- ต้อง **ล็อกอิน** ไม่งั้นเซฟอะไรไม่ได้และใช้ฟังก์ชันได้น้อย
- **ช่วง Black Friday** ลดราคามากสุดประมาณ 60% ควรต่ออายุหรือซื้อรายปีช่วงนี้
- **Essential** ประมาณ 155 เหรียญต่อปี (ราว 5,000 กว่าบาท) เปิดได้ 2 ชาร์ตต่อแท็บ ใส่อินดิเคเตอร์ได้ 5 ตัว
- **แบบฟรี** ได้ 1 ชาร์ตต่อแท็บ เซฟ Layout ได้ 1 อัน ย้อนกราฟได้ประมาณ 7 ปี Bar Replay ใช้ได้จำกัด (Timeframe Day) สำหรับมือใหม่ถือว่าพอใช้
- ผู้สอนใช้ **Premium** (ประมาณหมื่นกว่าบาทต่อปี) หารกับเพื่อน เพราะตั้ง Alert และเซฟ Layout/Template ได้เยอะ

## Layout

- กด **+** ที่แท็บ แล้วเลือก Layout หรือ **Create New Layout** จากนั้น Rename ตั้งชื่อ (เช่น "THUS") แล้วเซฟ
- Layout เก็บทุกอย่าง ได้แก่ Watchlist, เส้นที่วาด, อินดิเคเตอร์ และพื้นหลัง เช่น เปิด EURUSD ใน Layout "FTMO" กับ Layout อื่น จะเห็นเส้นและอินดิเคเตอร์ต่างกัน
- ประโยชน์คือ **ทดสอบกลยุทธ์ใหม่ใน Layout แยก** โดยไม่ต้องลบของเดิม
- เปลี่ยนสินทรัพย์ที่ **Symbol Search** เช่น พิมพ์ `XAUUSD` (ทองคำ)

## แถบด้านซ้าย: เครื่องมือวาด

- **Lines:** Trend Line, Ray, Horizontal Ray, Parallel Channel กด Settings ให้ **Extend** ไปซ้ายหรือขวาได้
- **กดดาว (Favorite)** เครื่องมือที่ใช้บ่อย แล้วกด **Show Favorite Drawing Tools** จะได้แถบลอยไว้ใช้เร็ว ๆ
- **Fibonacci:** Fib Retracement
- **Patterns:** XABCD (Harmonic), Head and Shoulders, Elliott Impulse Wave (1–5) และ Correction Wave (ABC) ไม่ต้อง Label เอง
- **Projection:** **Long Position / Short Position** วางจุดเข้า SL และ TP แล้วเห็น Risk:Reward ทันที (เช่น SL 16 เหรียญ TP 42 เหรียญ ≈ 2.56R) ตั้งให้ **Always Show Stats**, ปรับขนาดตัวอักษร หรือใส่ทุนและ Risk เพื่อคำนวณ Position Size ได้
- **Brush/Highlighter, Arrow, Price Range, Date & Price Range** (บอกระยะแท่ง วัน และราคา) และป้ายราคา
- ทุกเส้นปรับได้ทั้งสี ความหนา และแบบเส้น (ทึบ ประ จุด)

### Drawing Template (ข้อดีเด่นของ TradingView)

- ตั้งค่ากรอบสี่เหลี่ยม เช่น เส้นขอบ พื้นหลัง โปร่งแสง Extend ขวา แล้ว **Save As Template** ตั้งชื่อ (เช่น "กรอบขาว") ครั้งหน้าเรียกใช้ได้ทันที
- ผู้สอนมี Template หลายแบบ เช่น โซน H1/H4/M15 คนละสี, Red Zone, เส้น Swing High/Low, Stop Loss, Liquidity และ Fibo หลายชุด (เฉพาะ 75%, Target 261.8/400) แต่ส่วนตัวไม่ค่อยใช้ Fibo
- ไม่แน่ใจว่าแบบฟรีเซฟ Template ได้กี่อัน ใครทราบให้แจ้งในกลุ่ม

## แถบด้านล่าง

- ปุ่มช่วงเวลา **1D / 5D / 1M / 1Y / 5Y** จะปรับ Timeframe ให้เหมาะกับช่วงนั้นอัตโนมัติ (เช่น 5Y จะแสดงเป็น Weekly)
- Stock Screener จะสอนสัปดาห์หน้า

## แถบด้านบน

- **Symbol Search:** เปลี่ยนสินทรัพย์ เช่น SET
- **Compare:** เทียบหลายสินทรัพย์ในกราฟเดียว เช่น SET กับ DXY (ดอลลาร์แข็งค่าขณะที่ SET Sideways) ผู้สอนใช้เทียบ Index ต่าง ๆ ผลตอบแทน 1 ปีที่ผ่านมา: **Bitcoin +150%, ทอง +33%, S&P 500 +30%, Nasdaq +29%**
- **Timeframe:** 1m / 3m / 5m / 15m / 30m / 1H / 4H / D คลิกกราฟแล้วพิมพ์ตัวเลข (เช่น 7, 14) + Enter เพื่อใช้ Timeframe แปลก ๆ ได้ และกดดาว Timeframe ที่ใช้บ่อย
- **Chart Type:** Line, Bars, Candlestick (ใช้เป็นหลัก), Heikin Ashi ฯลฯ
- **Indicators:** ค้นหา เช่น **MACD** (Moving Average Convergence Divergence) หรือ **RSI** (Relative Strength Index) กดดาวไว้ใน Favorites
  - **อย่าใช้อินดิเคเตอร์ของคนอื่นแบบมั่ว ๆ** เพราะไม่รู้ว่าเขาคำนวณอย่างไร ใช้ตัวมาตรฐานเป็นหลัก
  - Settings ปรับเส้น สี และค่าได้ เช่น RSI 14 ผู้สอนเอา MA ของ RSI และ Background Fill ออก
- **Source Code / Pine Editor:** แก้โค้ดอินดิเคเตอร์ได้ เช่น ผู้สอนเพิ่ม **Zero Line** ให้ MACD เพื่อเห็นชัดตอนตัดเส้น 0 ถ้าไม่ถนัดเขียนโค้ด ให้เรียนจาก YouTube หรือใช้ **ChatGPT** ช่วยเขียนแล้วค่อยปรับแก้
- **Indicator Template:** เซฟชุดอินดิเคเตอร์ (เช่น "THUS MACD") แล้วเรียกกลับได้ในคลิกเดียว Template หลักของผู้สอนคือ **TZC** (ระบบของผู้สอน มี RSI, Stochastic ฯลฯ) กดดาว Template ไว้เพื่อสลับเร็ว ๆ (Clean / TZC / All Index / US Stock) ถ้าซ่อนอินดิเคเตอร์บางตัวแล้วต้องการให้จำ ให้เซฟทับใหม่
- **ทริก:** **ดับเบิลคลิก** ที่หน้าต่างกราฟ (หรือหน้าต่างอินดิเคเตอร์) เพื่อขยายเต็มจอ ดับเบิลคลิกอีกครั้งเพื่อกลับ

## Alert

- วิธีเร็ว: วางเมาส์ที่ราคาบนแกนขวา แล้วกด **+ → Add Alert** เช่น SET ที่ 1,440 (Crossing) ลบได้ด้วย Delete
- ใช้ร่วมกับการบ้านที่วาดไว้ เช่น ตั้ง Alert ที่ขอบกรอบบนหรือล่าง รอดู Breakout แล้ว **Lock** เส้นไว้ไม่ให้ขยับ
- เปิดสิทธิ์แจ้งเตือนในแอปมือถือ (หรือ Apple Watch) จะได้ **ไม่ต้องเฝ้ากราฟ**

## Bar Replay (Backtest)

- กด **Replay** แล้วเลือกวันเวลาที่จะเริ่ม เช่น EURUSD Timeframe 1 ชั่วโมง เริ่ม 30 ก.ย. 09:00 กราฟหลังจากนั้นจะหายไป
- เลื่อนกราฟทีละแท่ง (ปรับความเร็วได้) เพื่อทดสอบกลยุทธ์ เช่น "Breakout ขึ้นแล้ว Long, หลุดลงแล้ว Sell"
- ฟังก์ชันเต็มต้องใช้แพ็กเกจเสียเงิน
