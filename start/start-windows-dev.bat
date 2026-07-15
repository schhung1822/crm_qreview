@echo off
chcp 65001 >nul
title SEO-GEO Platform (DEV - hot reload)
cd /d "%~dp0.."

echo ==========================================
echo   SEO-GEO Platform - CHE DO DEV (hot reload)
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
  echo [1/2] Cai thu vien ^(chi lan dau, mat 1-2 phut^)...
  call npm install
  if errorlevel 1 ( echo [X] Loi cai thu vien. & pause & exit /b 1 )
  echo.
)

echo [2/2] Dang chay DEV SERVER.
echo   - SUA FILE la trinh duyet TU CAP NHAT ngay ^(khong can build, khong chay lai file nay^).
echo   - Chi chay file nay 1 LAN, GIU cua so mo. Dong cua so de tat app.
echo   - Lan dau vao 1 trang moi se bien dich ~vai giay roi nhanh; cac lan sau tuc thi.
echo.

REM Mo trinh duyet sau 6 giay (dev server can vai giay de san sang)
start "" cmd /c "timeout /t 6 >nul & start http://localhost:3000"

call npm run dev

pause
