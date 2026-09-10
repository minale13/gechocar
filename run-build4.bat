@echo off
cd /d "%~dp0"
call npm run build > build4.log 2>&1
echo __BUILD_DONE__ >> build4.log