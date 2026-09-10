@echo off
cd /d "c:\Users\tg computer\admas"
npm run build > build-final.log 2>&1
echo __BUILD_DONE__ >> build-final.log