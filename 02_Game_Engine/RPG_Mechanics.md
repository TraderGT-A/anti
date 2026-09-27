---
title: "⚙️ RPG Mechanics — กลไกเกม"
tags: [game-engine, mechanics, exp, level, stats]
created: 2026-09-27
---

# ⚙️ RPG Mechanics — กลไกเกม

> กลับ [[000_Index]] | ดูต่อ [[Boss_Shadow_Sloth]] | [[Reward_Vault]]

---

## 🏗️ ภาพรวม Architecture

```
ผู้เล่น
│
├── EXP → Level (Global Character Level)
├── Gold → แลก Reward Vault
├── 6-Axis Stats (Mind/Body/Wealth/Fuel/Strength/Endurance)
│
└── 6 Pillars (แต่ละเสามี Level + EXP ของตัวเอง)
    ├── สมาธิ → Mind +
    ├── Journal → Mind +
    ├── บัญชี → Wealth +
    ├── คุมแคล → Fuel +
    ├── เวท → Strength + Body (Synergy)
    └── วิ่ง → Endurance + Body (Synergy)
```

---

## ⚡ EXP System

### สูตรคำนวณ EXP ต่อ Level
```
EXP_Required(Lv) = floor(100 × 1.35^(Lv-1))

Level 1  →  100 XP    Level 6  →  448 XP
Level 2  →  135 XP    Level 7  →  605 XP
Level 3  →  182 XP    Level 8  →  817 XP
Level 4  →  246 XP    Level 9  → 1,103 XP
Level 5  →  332 XP    Level 10 → 1,489 XP
```

### แหล่ง EXP
| แหล่ง | XP ต่อครั้ง |
|---|---|
| กิจกรรมเสาปกติ | 15–100 XP |
| ตีบอสด้วย Skill | DMG × 2 XP |

---

## 🏛️ Pillar Level System

```
Pillar EXP_Required(Lv) = Lv × 250 XP

Pillar Lv 1 →  250 XP
Pillar Lv 2 →  500 XP
Pillar Lv 3 →  750 XP
Pillar Lv 5 → 1,250 XP
```

- แต่ละเสา Level แยกจากกันอิสระ
- ติดตาม `totalExp` สะสมตลอดชาติ (ไม่ reset)

---

## 📊 Stats System

### การขึ้น Stat
```
ทุกๆ 18-25 XP จากกิจกรรม = +1 Stat หลักของเสานั้น
เวท/วิ่ง = +1 Strength/Endurance + +1 Body (Synergy)
Stat cap = 100 ต่อ axis
```

### การใช้ Stat (Boss Attack)
```
ตีบอสด้วยสกิล = เสีย Stat ชั่วคราว
🧘 ตีด้วยสมาธิ : Mind -2  → Boss -30 HP
⚡ ระเบิดพลัง  : Str  -3  → Boss -55 HP
🏃 Sprint Rush  : End  -2  → Boss -45 HP
```

---

## 🪙 Gold Economy

| แหล่งที่มา | Gold |
|---|---|
| กิจกรรมทั่วไป | 3–30 / action |
| ตีบอสสำเร็จ | +5 / skill |
| Kill Boss | +100 โบนัส |

| ใช้ Gold ที่ไหน | Gold |
|---|---|
| Reward Vault รายการเล็ก | 25–50 |
| Reward Vault รายการกลาง | 100–150 |
| Reward Vault รายการใหญ่ | 200 |

---

## 💾 State Structure (localStorage)

```json
{
  "level": 1,
  "exp": 0,
  "gold": 0,
  "bossHP": 500,
  "bossMaxHP": 500,
  "bossDmg": 0,
  "weekNum": 1,
  "weekDays": [false, false, false, false, false, false, false],
  "stats": {
    "mind": 0, "body": 0, "wealth": 0,
    "fuel": 0, "strength": 0, "endurance": 0
  },
  "pillars": {
    "meditation": { "exp": 0, "level": 1, "totalExp": 0 },
    "journal":    { "exp": 0, "level": 1, "totalExp": 0 },
    "finance":    { "exp": 0, "level": 1, "totalExp": 0 },
    "nutrition":  { "exp": 0, "level": 1, "totalExp": 0 },
    "weight":     { "exp": 0, "level": 1, "totalExp": 0 },
    "running":    { "exp": 0, "level": 1, "totalExp": 0 }
  },
  "log": [],
  "lastLogin": "ISO8601 timestamp"
}
```

---

## 🔗 ดูต่อ
- [[Boss_Shadow_Sloth]] — ระบบบอสรายสัปดาห์
- [[Reward_Vault]] — รายการรางวัล
- [[System_Spec]] — สเปกภาพรวม
