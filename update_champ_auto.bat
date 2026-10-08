@echo off
cd /d "%~dp0"
echo [%date% %time%] Running automatic Port Champ update ^& cloud deploy... >> "%~dp0data\champ_cron.log"
node "%~dp0scripts\update_champ_snapshot.mjs" --deploy >> "%~dp0data\champ_cron.log" 2>&1
echo [%date% %time%] Finished with exit code %ERRORLEVEL% >> "%~dp0data\champ_cron.log"
