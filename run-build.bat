@echo off
call npm run build > build-log.txt 2>&1
echo EXITCODE=%ERRORLEVEL% >> build-log.txt
