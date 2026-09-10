@echo off
cd /d "c:\Users\tg computer\admas"
echo TSC_VERSION: > tsc-result.txt
node "c:\Users\tg computer\admas\node_modules\typescript\bin\tsc" --version >> tsc-result.txt 2>&1
echo EXITCODE_START >> tsc-result.txt
node "c:\Users\tg computer\admas\node_modules\typescript\bin\tsc" --noEmit -p "c:\Users\tg computer\admas\tsconfig.json" >> tsc-result.txt 2>&1
echo EXITCODE=%ERRORLEVEL% >> tsc-result.txt
echo DONE >> tsc-result.txt
