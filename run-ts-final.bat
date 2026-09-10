@echo off
cd /d "c:\Users\tg computer\admas"
npx tsc --noEmit > tscheck-final.log 2>&1
echo __TSC_DONE__ >> tscheck-final.log  
