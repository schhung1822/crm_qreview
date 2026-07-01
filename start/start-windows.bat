@echo off
chcp 65001 >nul
title SEO-GEO Platform
cd /d "%~dp0.."

echo ==========================================
echo   SEO-GEO Platform - dang khoi dong...
echo ==========================================
echo.

if not exist "node_modules" (
  echo [1/2] Chua co thu vien, dang cai dat ^(chi lan dau^)...
  call npm install
  echo.
)

echo [2/2] Dang chay app, trinh duyet se tu mo sau vai giay...
echo Dong cua so nay de tat app.
echo.

REM Mo trinh duyet sau 6 giay (cho server san sang)
start "" cmd /c "timeout /t 6 >nul & start http://localhost:3000"

npm run dev

pause
