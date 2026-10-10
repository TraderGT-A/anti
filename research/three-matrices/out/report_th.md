symbols in store: 158
month-end observations: 8813 | months: 60 | stocks: 155
pooled monthly transitions: 8658
train months: 2021-12 -> 2025-06 | test: 2025-07 -> 2026-10
# วัดผล '3 เมทริกซ์' (OMD-Portfolio ตามเปเปอร์ Halperin 2026) กับหุ้นไทย

- ข้อมูล: 155 หุ้นไทยจาก /api/scan?market=thailand, ราคารายวัน 5 ปี ผ่าน /api/chart ของเราเอง
- หน้าต่างสถิติ: trailing 21 วันทำการ (ทั้ง return และ volatility), จัดอันดับเป็น 10 decile ต่อเดือน
- จำนวน transition รายเดือน (pooled): 8658 | train 6180 | test 2478
- test = 2025-07 -> 2026-10 (เดือนที่โมเดลไม่เคยเห็น)

## chain ผลตอบแทน (R)
- เส้นทแยง P(อยู่ decile เดิม) : [0.182, 0.137, 0.107, 0.105, 0.118, 0.127, 0.141, 0.107, 0.087, 0.173]
- อยู่ top decile ต่อ: 0.182 | อยู่ bottom ต่อ: 0.173
- entropy production σ: 0.0115
- OOS log-lik/เดือน: chain -2.2952 vs baseline(marginal) -2.3024 → gain 0.0072 nats (t=1.77)
- + market regime เป็น covariate: gain -0.0148 nats (t=-2.97)
- + อีก chain เป็น covariate: gain -0.0514 nats (t=-5.42)
- + class เมื่อ 2 เดือนก่อน (memory เกิน 1 ก้าว): gain -0.0555 nats (t=-6.73)

## chain ความผันผวน (V)
- เส้นทแยง P(อยู่ decile เดิม) : [0.518, 0.225, 0.179, 0.165, 0.137, 0.161, 0.139, 0.175, 0.226, 0.453]
- อยู่ top decile ต่อ: 0.518 | อยู่ bottom ต่อ: 0.453
- entropy production σ: 0.0137
- OOS log-lik/เดือน: chain -2.0274 vs baseline(marginal) -2.3024 → gain 0.2751 nats (t=20.16)
- + market regime เป็น covariate: gain -0.027 nats (t=-5.82)
- + อีก chain เป็น covariate: gain -0.058 nats (t=-7.68)
- + class เมื่อ 2 เดือนก่อน (memory เกิน 1 ก้าว): gain 0.0072 nats (t=0.79)

## ผลตอบแทนเดือนถัดไป แยกตาม decile ปัจจุบัน
- ตามอันดับผลตอบแทน R: {1: (1.35, 894), 2: (-0.01, 851), 3: (0.35, 879), 4: (-0.68, 857), 5: (0.29, 867), 6: (-0.26, 862), 7: (0.28, 879), 8: (-0.56, 857), 9: (0.74, 873), 10: (-0.2, 839)}
- ตามอันดับความผันผวน V: {1: (0.4, 895), 2: (-0.01, 851), 3: (-0.35, 879), 4: (0.03, 857), 5: (-0.06, 867), 6: (-0.79, 862), 7: (0.4, 879), 8: (0.8, 857), 9: (-0.03, 873), 10: (1.01, 838)}

## ตัวเลขใช้งานจริง (hit rate)
- P(return top10 อยู่ต่อ): 0.188
- P(vol เงียบสุด อยู่ต่อ): 0.509
- P(vol ผันผวนสุด อยู่ต่อ): 0.432
- P(return top10 | vol เงียบสุด): 0.032
- P(return bottom10 | vol ผันผวนสุด): 0.21
