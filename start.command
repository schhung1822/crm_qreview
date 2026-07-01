#!/bin/bash
# Bấm đúp file này trong Finder để chạy app SEO-GEO.
# Lần đầu sẽ tự cài thư viện (npm install), các lần sau chạy ngay.

cd "$(dirname "$0")" || exit 1

echo "================================================"
echo "  SEO-GEO Platform — đang khởi động..."
echo "================================================"

# Cài thư viện nếu chưa có
if [ ! -d node_modules ]; then
  echo "Lần đầu chạy: đang cài thư viện (mất 1-2 phút)..."
  npm install || { echo "Lỗi npm install. Bạn đã cài Node.js chưa? (nodejs.org)"; read -r; exit 1; }
fi

echo ""
echo "  Mở trình duyệt vào: http://localhost:3000"
echo "  (Để dừng: đóng cửa sổ này hoặc bấm Ctrl + C)"
echo ""

# Mở trình duyệt sau 4 giây rồi chạy server
( sleep 4 && open "http://localhost:3000" ) &
npm run dev
