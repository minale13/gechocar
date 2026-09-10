@echo off
cd /d "c:\Users\tg computer\admas"
CALL npx tsc -p tsconfig.ticket-check.json --pretty false 1> tsc-check.txt 2>&1
echo TSC_EXIT=%errorlevel% >> tsc-check.txt
echo DONE >> tsc-check.txt