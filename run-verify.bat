@echo off
cd /d "c:\Users\tg computer\admas"
type nul > tscheck-verify.log 2>nul
npx tsc --noEmit > tscheck-verify.log 2>&1
echo __TSC_DONE__ >> tscheck-verify.log
type nul > build-verify.log 2>nul
npm run build > build-verify.log 2>&1
echo __BUILD_DONE__ >> build-verify.log