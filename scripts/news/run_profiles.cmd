@echo off
rem รันโดย Windows Task Scheduler ("THUSHOUSE Profiles", อาทิตย์ 07:00) — อัปเดตคำอธิบายบริษัท 🏢 แล้ว deploy rsdash ถ้ามีการเปลี่ยน
cd /d "%~dp0..\.."
"C:\Program Files\nodejs\node.exe" scripts\news\refresh_profiles.mjs > data\profiles_run.txt 2>&1
