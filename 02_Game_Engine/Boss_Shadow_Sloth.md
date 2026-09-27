---
title: "👹 Boss Shadow Sloth — Weekly Raid"
tags: [game-engine, boss, weekly, raid]
created: 2026-09-27
---

# 👹 Boss Shadow Sloth — Weekly Boss Raid

> กลับ [[000_Index]] | ดูด้วย [[RPG_Mechanics]] | [[Reward_Vault]]

---

## 🦥 ตัวตนของ Shadow Sloth

> *"มันไม่ได้อยู่ข้างนอก — มันอยู่ในหัวแก มันคือเสียงที่บอกว่า 'พรุ่งนี้ค่อยทำ'"*

Shadow Sloth คือ Metaphor ของ **ความเฉื่อยชา, Procrastination และ Inertia** ที่ดึงแกให้อยู่ใน Comfort Zone ทุกสัปดาห์ มันกลับมาใหม่ทุกวันจันทร์ แข็งแกร่งขึ้นเรื่อยๆ — แต่แกก็แข็งแกร่งขึ้นด้วยเช่นกัน

---

## ❤️ Boss HP System

### HP เริ่มต้นและการ Scale
```
สัปดาห์ที่ 1 : 500 HP  (Base)
สัปดาห์ที่ N : floor(500 × 1.12^(N-1))

สัปดาห์ 1  →   500 HP
สัปดาห์ 3  →   627 HP
สัปดาห์ 5  →   785 HP
สัปดาห์ 10 → 1,385 HP
สัปดาห์ 20 → 4,823 HP
```

> [!NOTE] Boss แข็งขึ้นทุกสัปดาห์ = แกต้องทำกิจกรรมมากขึ้นเรื่อยๆ เพื่อชนะ — Design ตั้งใจ!

---

## ⚔️ วิธีโจมตี Boss

### 1. อัตโนมัติ — ผ่านกิจกรรม
```
ทุกครั้งที่บันทึกกิจกรรม → Boss รับดาเมจ
DMG = floor(EXP_ที่ได้ / 6)

กิจกรรม 20 XP  → Boss -3 HP
กิจกรรม 40 XP  → Boss -6 HP
กิจกรรม 100 XP → Boss -16 HP
```

### 2. Manual Attack — ใช้ Stat Skills
| Skill | DMG | ต้นทุน | หมายเหตุ |
|---|---|---|---|
| 🧘 ตีด้วยสมาธิ | 30 HP | Mind -2 | ตีได้เสมอถ้า Mind ≥ 2 |
| ⚡ ระเบิดพลัง | 55 HP | Strength -3 | ดาเมจสูงสุด |
| 🏃 Sprint Rush | 45 HP | Endurance -2 | Balance ระหว่าง DMG/Cost |

**รางวัลจากการตีด้วย Skill:**
- EXP +DMG×2 ต่อการตี
- Gold +5 ต่อครั้ง

---

## 🎁 รางวัลเมื่อ Kill Boss

| รางวัล | จำนวน |
|---|---|
| 🪙 Gold โบนัส | +100 |
| Notification | "BOSS DEFEATED!" |

---

## 🔄 Weekly Reset

- **รีเซ็ตเมื่อไหร่:** ทุกวันจันทร์ 00:00 น.
- **สิ่งที่ Reset:**
  - Boss HP → กลับมาเต็ม (HP ใหม่สูงกว่าเดิม)
  - Boss Total Damage → 0
  - Week Days tracker → ทั้ง 7 วัน = false
  - Week Number → +1
- **สิ่งที่ไม่ Reset:**
  - Level, EXP, Gold, Stats ทั้งหมด — ถาวร

---

## 🧠 ปรัชญาเบื้องหลัง (ดร.นัท)

Shadow Sloth ถูกออกแบบโดยใช้หลัก **Variable Reward Schedule** — ทุกกิจกรรมที่ทำตีบอสด้วยอัตโนมัติ ทำให้ทุก action มี "ผลกระทบ" ที่เห็นได้ชัด ซึ่งเป็น Dopamine Loop ที่ทรงพลังที่สุดในการสร้าง Habit

---

## 📅 Boss Kill Log

> *(บันทึก season boss ที่ kill ได้ ไว้เป็น trophy)*

| สัปดาห์ | HP | วันที่ Kill | DMG รวม |
|---|---|---|---|
| | | | |

---

> [!CAUTION] ถ้า Boss ไม่ตายภายในสัปดาห์
> ไม่มี Penalty — แค่รีเซ็ต HP ใหม่ สัปดาห์ถัดไป HP เพิ่มขึ้น
> แต่ประวัติ Kill จะว่างเปล่า — แกจะรู้เองว่าสัปดาห์ไหนแพ้ตัวเอง
