@echo off
call npm install --no-audit --no-fund > npm-install.log 2>&1
echo EXITCODE=%ERRORLEVEL% >> npm-install.log
