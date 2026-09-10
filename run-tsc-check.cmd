@echo off
cd /d "c:\Users\tg computer\admas"
npx tsc -p tsconfig.ticket-check.json --noEmit > tsc-ticket.log 2>&1
echo EXITCODE=%ERRORLEVEL% >> tsc-ticket.log
