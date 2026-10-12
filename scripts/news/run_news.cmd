@echo off
rem รันโดย Windows Task Scheduler ("THUSHOUSE News US", อ-ส 06:30) — ดึงข่าวทั้งหุ้น US และหุ้นไทย
rem สรุปรอบ: data\news_log.txt (บรรทัดละรอบต่อตลาด) · รายละเอียดรอบล่าสุด: data\news_run.txt
cd /d "%~dp0..\.."
"C:\Program Files\nodejs\node.exe" scripts\news\fetch_news.mjs --market america > data\news_run.txt 2>&1
"C:\Program Files\nodejs\node.exe" scripts\news\fetch_news.mjs --market thailand >> data\news_run.txt 2>&1
