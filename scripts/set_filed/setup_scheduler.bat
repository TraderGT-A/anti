@echo off
set SCRIPT_PATH=C:\Users\Tar\OneDrive\BEDD~1\THUSHO~1\scripts\SET_FI~1\silent_run.vbs
echo Registering task: SET_Filed_Daily_1720 (Mon-Fri 17:20)...
schtasks /create /tn "SET_Filed_Daily_1720" /tr "wscript.exe \"%SCRIPT_PATH%\"" /sc weekly /d MON,TUE,WED,THU,FRI /st 17:20 /f
if %ERRORLEVEL% EQU 0 (
  echo [SUCCESS] Scheduled task SET_Filed_Daily_1720 registered successfully!
) else (
  echo [NOTE] Please right-click and choose 'Run as administrator'.
)
pause
