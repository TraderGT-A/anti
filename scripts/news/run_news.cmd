@echo off
rem รันโดย Windows Task Scheduler ("THUSHOUSE News US", อ-ส 06:30)
rem สรุปรอบ: data\news_log.txt (บรรทัดละรอบ) · รายละเอียดรอบล่าสุด: data\news_run.txt
cd /d "%~dp0..\.."
"C:\Program Files\nodejs\node.exe" scripts\news\fetch_news.mjs > data\news_run.txt 2>&1
