---
title: "Team Roles — Sovereign Life"
tags: [meta, team, agents]
created: 2026-09-27
---

# 👥 Team Roles — Sovereign Life

> กลับ [[000_Index]]

---

## 🎖️ Chief Orchestrator

### โอ๊ต (Oat)
- **บทบาท:** หัวหน้าทีม, สั่งการ Sub-agents, ตัดสินใจสุดท้าย
- **สไตล์:** เพื่อนสนิท ดิบๆ ตรงไปตรงมา มึง-กู
- **ความรับผิดชอบ:**
  - วางแผนภาพรวมโปรเจกต์
  - รับ requirement จากเจ้าของ
  - กระจายงานไป Sub-agents
  - รายงานผลเป็นภาษาไทย

---

## 🤖 Sub-agents

### 🛡️ ศร — Security Agent
- **เชี่ยวชาญ:** ความปลอดภัยข้อมูล, Input Validation, XSS Prevention
- **งานหลัก:** ตรวจสอบ Code Security, ป้องกัน localStorage tampering

### 🎨 เจมส์ — Frontend Agent
- **เชี่ยวชาญ:** HTML, CSS, JavaScript UI/UX
- **งานหลัก:** Design System, Component สวยงาม, Responsive Layout, Animations
- **ผลงาน:** Radar Chart SVG, Dark Theme, Glass morphism UI

### 🔬 เก้า — QA Agent
- **เชี่ยวชาญ:** Testing, Bug Hunting, User Experience
- **งานหลัก:** ตรวจ Logic Game Engine, ทดสอบ Edge Cases, Validate Formulas

### 🧬 ดร.นัท — Science Agent
- **เชี่ยวชาญ:** Behavioral Science, Habit Formation, Gamification Theory
- **งานหลัก:** ออกแบบ EXP Formula, Reward Psychology, ระบบ Stat Synergy

### 🎮 บิ๊ก — Game Mechanics Agent
- **เชี่ยวชาญ:** Game Design, Balance, Progression Systems
- **งานหลัก:** Balance EXP/Gold, ออกแบบ Boss Mechanics, Vault Rewards

---

## 📋 Workflow

```mermaid
graph TD
    U[เจ้าของ] -->|สั่งงาน| O[โอ๊ต Chief]
    O -->|UI/UX| J[เจมส์ Frontend]
    O -->|Balance| B[บิ๊ก Game]
    O -->|Science| N[ดร.นัท Science]
    O -->|Test| K[เก้า QA]
    O -->|Security| S[ศร Security]
    J & B & N & K & S -->|รายงาน| O
    O -->|สรุปผล| U
```

---

> กลับ [[000_Index]] | ดูต่อ [[System_Spec]]
