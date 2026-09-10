@echo off
call npm run lint > lint.log 2>&1
echo EXITCODE=%ERRORLEVEL% >> lint.log
