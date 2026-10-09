-- breadth_history: ลบแถวเสาร์-อาทิตย์เก่า (ตลาดปิด ค่าซ้ำวันศุกร์)
-- รันใน Supabase SQL Editor: ขั้นที่ 1 ดูก่อน → ตรวจ → ขั้นที่ 2 ลบ

-- 1) ดูแถวที่จะถูกลบ
select market, date, pct_above_ma50, pct_above_ma200
from public.breadth_history
where extract(dow from date::date) in (0, 6)
order by date;

-- 2) ลบ (เปิดคอมเมนต์เมื่อตรวจแล้ว)
-- delete from public.breadth_history where extract(dow from date::date) in (0, 6);
