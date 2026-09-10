@echo off
cd /d "%~dp0"
call npx tsc --noEmit > tscheck3.log 2>&1
echo __TSC_DONE__ >> tscheck3.log