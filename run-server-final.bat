@echo off
cd /d "c:\Users\tg computer\admas"
call npm run build > build-final.log 2>&1
call npm start >> build-final.log 2>&1
echo __DONE__ >> build-final.log