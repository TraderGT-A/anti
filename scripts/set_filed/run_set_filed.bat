@echo off
cd /d "%~dp0"
node fetch_set_filed.mjs >> run.log 2>&1
