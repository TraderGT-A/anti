@echo off
chcp 65001 >nul
echo.
echo  ⚔️  SOVEREIGN LIFE RPG — Git Setup Script
echo  ==========================================
echo.

REM ── ตรวจ git ──
where git >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  [ERROR] ไม่พบ Git ในเครื่อง!
    echo  กรุณาดาวน์โหลด Git ที่ https://git-scm.com
    echo  แล้วติดตั้ง แล้วรันไฟล์นี้ใหม่
    pause
    exit /b 1
)

echo  [OK] พบ Git แล้ว
git --version

REM ── ถามชื่อ GitHub user ──
echo.
set /p GH_USER="กรอก GitHub Username ของแก: "

if "%GH_USER%"=="" (
    echo  [ERROR] ไม่ได้กรอก Username!
    pause
    exit /b 1
)

REM ── Init repo ──
echo.
echo  [1/5] กำลัง init git repo...
git init

REM ── Config (ถ้ายังไม่เคย config) ──
echo  [2/5] ตั้งค่า git user...
git config --global user.name "%GH_USER%"
set /p GH_EMAIL="กรอก GitHub Email: "
git config --global user.email "%GH_EMAIL%"

REM ── Add remote ──
echo  [3/5] เชื่อม remote sovereign-rpg...
git remote remove origin 2>nul
git remote add origin https://github.com/%GH_USER%/sovereign-rpg.git
echo  Remote URL: https://github.com/%GH_USER%/sovereign-rpg.git

REM ── Commit ──
echo  [4/5] Staging และ Commit...
git add index.html .gitignore
git commit -m "feat: Sovereign Life RPG v2.0 — 6 pillars, boss raid, radar chart, vault"

REM ── Push ──
echo  [5/5] Push ไป GitHub...
git branch -M main
git push -u origin main

echo.
echo  ════════════════════════════════════════
echo  ✅ เสร็จแล้ว! โปรเจกต์ขึ้น GitHub แล้ว
echo  URL: https://github.com/%GH_USER%/sovereign-rpg
echo  ════════════════════════════════════════
echo.
pause
