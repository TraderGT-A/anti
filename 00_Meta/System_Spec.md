---
title: "System Spec — Sovereign Life RPG"
tags: [meta, spec, system]
created: 2026-09-27
---

# ⚙️ System Spec — Sovereign Life RPG

> กลับ [[000_Index]]

---

## 🎯 แนวคิดหลัก

Sovereign Life RPG คือระบบ **Gamification ชีวิตจริง** ที่แปลงพฤติกรรมดีๆ ประจำวันให้กลายเป็น EXP, Gold และ Stats ที่วัดได้จริง โดยไม่มีเส้นแบ่งระหว่าง "เกม" กับ "ชีวิต"

---

## 📐 6-Axis Stats System

| Stat | ไอคอน | คำอธิบาย | ขึ้นจาก |
|---|---|---|---|
| **Mind** | 🧠 | ความคมของจิต, สมาธิ, ความคิด | Meditation, Journal |
| **Body** | 💪 | สุขภาพกาย, รูปร่าง | Strength, Running |
| **Wealth** | 💰 | ฐานะการเงิน, วินัยเงิน | Finance |
| **Fuel** | 🔋 | พลังงาน, โภชนาการ | Nutrition |
| **Strength** | ⚡ | กำลัง, กล้ามเนื้อ | Weight Training |
| **Endurance** | 🏅 | ความทนทาน, Cardio | Running |

> [!TIP] Stat Cap
> Stat สูงสุดอยู่ที่ 100 ต่อ axis — ทุก 18-25 XP ที่ได้จากกิจกรรม = +1 Stat

---

## ⚡ EXP & Level System

```
EXP ต้องการต่อ Level = floor(100 × 1.35^(Level-1))

Level 1  → 100 XP
Level 2  → 135 XP
Level 3  → 182 XP
Level 5  → 332 XP
Level 10 → 1,013 XP
```

- EXP ได้จาก: ทำกิจกรรมใน 6 เสาหลัก + ตีบอส
- Level Up ทริกเกอร์ notification ทันที

---

## 🪙 Gold System

| แหล่งที่มา | Gold |
|---|---|
| กิจกรรมทั่วไป | 3–30 / ครั้ง |
| Kill Shadow Sloth | +100 โบนัส |
| ตีบอสด้วย Skill | +5 / ครั้ง |

**ใช้ Gold:** แลก Self-Reward ใน [[Reward_Vault]]

---

## 🏛️ Pillar EXP System

```
EXP ต้องการต่อ Pillar Level = Level × 250 XP
```

- แต่ละเสามี Level ของตัวเอง
- ติดตาม `totalExp` สะสมตลอดชาติ

---

## 💾 Data Storage

- ทุกข้อมูลเซฟใน **localStorage** ของ Browser (key: `slrpg2`)
- ไม่มี Server, ไม่มี Cloud — ข้อมูลอยู่ในเครื่องแก 100%
- Export: เปิด DevTools → Application → Local Storage → copy JSON

---

## 🔗 ดูต่อ
- [[Team_Roles]] — ทีมที่รับผิดชอบ
- [[RPG_Mechanics]] — กลไกเกมเต็มๆ
- [[Boss_Shadow_Sloth]] — ระบบบอส
