#!/bin/bash
cd "$(dirname "$0")/.." || exit 1

echo "=========================================="
echo "  SEO-GEO Platform - dang khoi dong..."
echo "=========================================="
echo ""

# Kiem tra Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "[X] Chua cai Node.js. Tai tai https://nodejs.org roi chay lai file nay."
  read -r -p "Nhan Enter de thoat..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "[1/3] Cai thu vien (chi lan dau, mat 1-2 phut)..."
  npm install || { echo "[X] Loi cai thu vien."; read -r; exit 1; }
  echo ""
fi

echo "[2/3] Bien dich san toan bo trang de MENU PHAN HOI TUC THI..."
echo "      (lan dau ~1 phut; cac lan sau nhanh hon nho cache)"
npm run build || { echo "[X] Loi bien dich."; read -r; exit 1; }
echo ""

echo "[3/3] Dang chay app o che do PRODUCTION - dieu huong khong con do tre."
echo "      Trinh duyet se tu mo. Nhan Ctrl+C hoac dong cua so de tat app."
echo ""

# Mo trinh duyet sau 3 giay (che do production khoi dong nhanh)
( sleep 3; open http://localhost:3000 ) &

npm run start
