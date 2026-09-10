@echo off
cd /d "%~dp0"
npx tsc --noEmit > tsc-check.log 2>&1
echo DONE > tsc-done.flag
