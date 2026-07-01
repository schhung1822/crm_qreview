#!/bin/bash
cd "$(dirname "$0")/.." || exit 1

echo "=========================================="
echo "  SEO-GEO Platform - dang khoi dong..."
echo "=========================================="
echo ""

if [ ! -d "node_modules" ]; then
  echo "[1/2] Chua co thu vien, dang cai dat (chi lan dau)..."
  npm install
  echo ""
fi

echo "[2/2] Dang chay app, trinh duyet se tu mo sau vai giay..."
echo "Nhan Ctrl+C hoac dong cua so nay de tat app."
echo ""

# Mo trinh duyet sau 6 giay (cho server san sang)
( sleep 6; open http://localhost:3000 ) &

npm run dev
