@echo off
call npx next lint > lint-after.log 2>&1
echo EXITCODE=%ERRORLEVEL% >> lint-after.log
