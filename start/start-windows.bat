@echo off
chcp 65001 >nul
title SEO-GEO Platform
cd /d "%~dp0.."

echo ==========================================
echo   SEO-GEO Platform - dang khoi dong...
echo ==========================================
echo.

REM Kiem tra Node.js
where node >nul 2>nul
if errorlevel 1 (
  echo [X] Chua cai Node.js. Tai tai https://nodejs.org roi chay lai file nay.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/3] Cai thu vien ^(chi lan dau, mat 1-2 phut^)...
  call npm install
  if errorlevel 1 ( echo [X] Loi cai thu vien. & pause & exit /b 1 )
  echo.
)

echo [2/3] Bien dich san toan bo trang de MENU PHAN HOI TUC THI...
echo       ^(lan dau ~1 phut; cac lan sau nhanh hon nho cache^)
call npm run build
if errorlevel 1 ( echo [X] Loi bien dich. & pause & exit /b 1 )
echo.

echo [3/3] Dang chay app o che do PRODUCTION - dieu huong khong con do tre.
echo       Trinh duyet se tu mo. Dong cua so nay de tat app.
echo.

REM Mo trinh duyet sau 3 giay (che do production khoi dong nhanh)
start "" cmd /c "timeout /t 3 >nul & start http://localhost:3000"

call npm run start

pause
