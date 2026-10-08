# 🔐 LOGIN / บัญชี — RS Dashboard (rsdash) — Deploy Cloud

> **สำคัญ:** ไฟล์นี้จดเฉพาะ user/account/repo ไม่เก็บ password (ห้ามเขียน password ในนี้)
> อัปเดตล่าสุด: 30 กันยายน 2569

## ภาพรวมบัญชีที่ใช้ (แยกโปรเจกต์เด็ดขาด)

| บริการ | สถานะ | Login User / Account | รายละเอียด | หมายเหตุ |
| :-- | :-- | :-- | :-- | :-- |
| **GitHub** | ยังไม่ login | **TraderGT-A** | repo ใหม่แยกจาก `anti` เดิม | ใช้บัญชีนี้ผ่าน OAuth ของ gh |
| **Vercel** | ✅ login แล้ว | **tradergt-a** (ผ่าน GitHub SSO) | deploy ผ่านทีม hermes-351d (Hobby) | Vercel CLI 61.1.0 |
| **Supabase** | ✅ ทำงาน | **TraderGT-A's Project** (Seoul) | project `ecvqiykjmgxlziuwkwki` + table snapshots เรียบร้อย | Supabase CLI 2.118.0 |

---

## 📦 โปรเจกต์ที่ deploy ที่นี่ (แยกชุด)

- **Folder โปรเจกต์:** `C:/Users/Tar/OneDrive/เดสก์ท็อป/THUSHOUSE/rsdash/`
- **GitHub Repo (ใหม่):** ✅ `TraderGT-A/rs-dashboard` (private, แยกจาก `anti` เดิม) — https://github.com/TraderGT-A/rs-dashboard
- **Vercel Project (ใหม่):** ✅ `rsdash_clean` → **https://rsdashclean.vercel.app** (Hobby, public, deploy จากโฟลเดอร์ไร้ .git) — env SUPABASE_URL + SUPABASE_ANON_KEY ตั้งแล้ว
- **Supabase Project (ใหม่):** ✅ สร้างแล้ว
  - **URL:** `https://ecvqiykjmjmgxlziuwkwki.supabase.co`
  - **Region:** Northeast Asia (Seoul)
  - **Compute:** NANO (free tier)
  - **Status:** Healthy 📍 สร้างผ่าน dashboard ของบอส 30 ก.ย. 2569
- **Supabase Table:** `snapshots` (dt TEXT PK, created_at TEXT, payload JSONB)

### Environment Variables ใน Vercel (Secret)
- `SUPABASE_URL` → @supabase_url
- `SUPABASE_ANON_KEY` → @supabase_anon_key

---

## ⚠️ กติกา
1. **ห้ามปนกับโปรเจกต์เก่า** (THUSHOUSE หลัก / anti) เด็ดขาด
2. **ไม่จด password** ในไฟล์นี้
3. login ผ่าน **บัญชีจริงของบอส** (OAuth ผ่าน browser บอสเท่านั้น)