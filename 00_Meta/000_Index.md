---
title: "⚔️ Sovereign Life RPG — Map of Content"
tags: [MOC, index, sovereign-life]
created: 2026-09-27
updated: 2026-09-27
---

# ⚔️ Sovereign Life RPG
> *"ชีวิตจริงคือ RPG ที่ยากที่สุด — แต่ถ้าเล่นเป็น มันสนุกที่สุดด้วย"*

---

## 🗺️ แผนที่หลัก (Map of Content)

### 📁 00_Meta — ระบบและทีม
- [[System_Spec]] — สเปกระบบทั้งหมด, Stats, EXP, Gold
- [[Team_Roles]] — บทบาท Chief Orchestrator + Sub-agents

### 📁 01_Pillars — 6 เสาหลัก
| เสา | ไฟล์ | Stat ที่ขึ้น |
|---|---|---|
| 🧘 สมาธิ | [[Meditation]] | Mind |
| 📔 บันทึก | [[Journal]] | Mind |
| 💰 บัญชี | [[Finance]] | Wealth |
| 🥗 คุมแคล | [[Nutrition]] | Fuel |
| 🏋️ เวท | [[Strength]] | Strength + Body |
| 🏃 วิ่ง | [[Running]] | Endurance + Body |

### 📁 02_Game_Engine — กลไก RPG
- [[RPG_Mechanics]] — ระบบ EXP, Level, Gold, 6-Axis Stats
- [[Boss_Shadow_Sloth]] — Weekly Boss Raid, HP, Attack Skills
- [[Reward_Vault]] — Self-Reward Vault, รายการรางวัล, กฎการแลก

---

## 📊 Dashboard Quick View

```dataview
TABLE level, totalExp
FROM "01_Pillars"
SORT level DESC
```

---

## 🔗 ไฟล์สำคัญ
- `index.html` — แอป RPG หลัก (เปิดใน Browser)
- `.gitignore` — Git config
- `setup-git.bat` — Script push ขึ้น GitHub

---

## 📅 Session Log
- **2026-09-27** — สร้าง Sovereign Life RPG v2.0, Obsidian Vault structure

---

> [!NOTE] วิธีใช้ Vault นี้
> - ใช้ `Cmd/Ctrl + O` เปิดไฟล์ด้วยชื่อ
> - ใช้ Graph View ดูความเชื่อมโยง
> - คลิก `[[wikilink]]` เพื่อ navigate ข้ามไฟล์
