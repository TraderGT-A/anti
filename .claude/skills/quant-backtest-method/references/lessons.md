# สิ่งที่รู้แล้ว (สรุปจากงานจริง — ตัวเลขละเอียดดูไฟล์ที่ลิงก์)

> อัปเดตทุกครั้งที่มี REPORT ใหม่ ถ้าขัดกับตัวเลขในไฟล์ REPORT ให้เชื่อ REPORT

## ผลที่ได้ (ณ 2026-10-11)
| เรื่อง | ข้อสรุป | หลักฐาน |
|---|---|---|
| Minervini/Qullamaggie setup (Trend Template + บีบตัว ATR10/ATR50) | ไทยและ US ไม่พบ edge ที่พิสูจน์ได้ | `research/REPORT_setups_th_*`, `REPORT_setups_us_*` |
| ผู้นำ 12 เดือน (Top10/20 น้ำหนัก RS, Gate, SMA50) รายเดือน/รายสัปดาห์ | ไม่ผ่านเกณฑ์เข้ม (≥499/500, ≥4 จุด, ต้องผ่านทั้งสองตลาด) | `REPORT_ytd_leaders_*`, `REPORT_leaders_periodic_*` |
| US ปัจจัยราคา/จับจังหวะ 2000–2026 | ไม่พบ edge (ญี่ปุ่นก็ไม่พบ) | `EXPLORE_edge_search_*` |
| near52wHigh + โมเมนตัม 12-1 | ใช้ได้ในไทย อินโด สิงคโปร์ และตลาดเอเชีย/ยุโรป/EM ส่วนใหญ่; ตลาดใหม่ BR/MX/TR/ZA ยืนยัน 3/4 (ข้อมูลบาง) | `REPORT_momentum_oos_markets_*` |
| พอร์ตดัชนีข้ามตลาดตามเทรนด์ | ลด MaxDD (~−19% เทียบ ~−52%) ที่ CAGR ใกล้เคียง | `scripts/explore_trendport.mjs` |
| Market Gate (ดัชนี vs SMA50/200) | ช่วยไทย แต่ทำให้ US แย่ลง | `EXPLORE_edge_search_*` |
| น้ำหนักพอร์ต Top20 ไทย (inv-vol / risk parity / HRP เทียบ EW) | ไม่ผ่านเกณฑ์ลงทะเบียน: ลด beta/ขาดทุนวิกฤตได้บ้าง แต่ Sharpe ไม่สม่ำเสมอ (ล้มในช่วง 2020–26) → คง EW | `research/REPORT_th_weighting_riskfolio_*` |
| ตัวกรอง/คะแนนความผันผวนต่ำบน near52+mom | ไม่ผ่าน: ลด DD บางช่วงแต่ตัดผู้ชนะผันผวนสูง CAGR ตก (2020–26 ตกหนัก) ข้ามตลาดผ่าน 1/4 | `research/REPORT_th_lowvol_filter_*` |
| ผู้นำไทยรายเดือน + Gate | อยู่ใน forward paper-trade (เริ่ม 2026-10-10) ตัดสินได้เมื่อ ≥ 36 เดือน | `PREREG_forward_th_leaders_*` |

## ข้อควรระวังที่เจอจริง
- ราคาตรึงจากดีลซื้อกิจการ (ATR 0.3–0.6%) หลุดเข้ามาเป็น "บีบตัว" → ต้องมี ATR% ขั้นต่ำ (1.0%)
- ตลาดหยุด: ราคาปิดแทบทั้งตลาดเหมือนเมื่อวาน → ห้ามนับเป็นวันซื้อขาย (paper-trade ข้ามวัน ≥90% ราคาเดิม)
- ฟังก์ชัน serverless บน Vercel Hobby จำกัด 12 ตัว (นับรวม `api/lib/`) → ไฟล์ตรรกะวางนอก `api/` แล้ว import; ต่อ route ใหม่ด้วยพารามิเตอร์ `universe=`
- ตลาดที่ไม่ใช่รหัส Yahoo ตรง (เช่น Malaysia) ดึงไม่ได้ → ตัดออกจากชุดทดสอบ ไม่ปั้นข้อมูล
- ปฏิทิน factor ไทย: ดัชนี SET ในไฟล์เริ่ม 2006 → สร้างปฏิทินจากวันที่ของหุ้นรวมกัน (2001+)
- `Select-Object -First N` ตัด pipe ของ node ทำให้ไฟล์ JSON ไม่ถูกเขียน → เขียนไฟล์ก่อนแล้วค่อยอ่าน
- Riskfolio-Lib: เรียกฟังก์ชันด้วยพารามิเตอร์ที่ไม่มี → ตกไป fallback เงียบ ๆ ได้ ต้องนับและแสดงจำนวน fallback ทุกครั้ง (HRP เคยล้ม 239/239 เดือนโดยไม่รู้ตัว)
- ติดตั้ง Python: venv อยู่ที่ `research_py/.venv` (ไม่ commit) รันด้วย `research_py/.venv/Scripts/python scripts/py/*.py` และตั้ง `PYTHONIOENCODING=utf-8`; อ่าน JSON ไทยต้องระบุ encoding='utf8'
- UI ที่ hardcode ตลาด ("thailand") พังเมื่อสลับตลาด → ใช้ `currentMarket` เสมอ

## สิ่งที่ยังไม่ได้ตอบ
- ขนาด survivorship จริงของไทย/EM (ไม่มีข้อมูลหุ้นที่ถูกเพิกถอน)
- ตัวกรอง EPS/การเติบโตกำไร (ต้องสะสม point-in-time จาก `fund|th|log|*` อย่างน้อย 1–2 ปี)
- edge ของ near52wHigh+12-1 ในไทยหลังหัก survivorship
