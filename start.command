#!/bin/bash
# Bấm đúp file này trong Finder để chạy app SEO-GEO (chế độ nhanh - production).
# Lần đầu sẽ tự cài thư viện + biên dịch sẵn; các lần sau chạy nhanh hơn nhờ cache.

cd "$(dirname "$0")" || exit 1

echo "================================================"
echo "  SEO-GEO Platform — đang khởi động..."
echo "================================================"
echo ""

# Kiểm tra Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "[X] Chưa cài Node.js. Tải tại https://nodejs.org rồi chạy lại file này."
  read -r -p "Nhấn Enter để thoát..."
  exit 1
fi

# Cài thư viện nếu chưa có
if [ ! -d node_modules ]; then
  echo "[1/3] Lần đầu chạy: đang cài thư viện (mất 1-2 phút)..."
  npm install || { echo "[X] Lỗi npm install."; read -r; exit 1; }
  echo ""
fi

# Biên dịch sẵn toàn bộ → điều hướng menu tức thì (không còn compile khi bấm)
echo "[2/3] Biên dịch sẵn toàn bộ trang để MENU PHẢN HỒI TỨC THÌ..."
echo "      (lần đầu ~1 phút; các lần sau nhanh hơn nhờ cache)"
npm run build || { echo "[X] Lỗi biên dịch."; read -r; exit 1; }
echo ""

echo "[3/3] Đang chạy app ở chế độ PRODUCTION - điều hướng không còn độ trễ."
echo "      Mở trình duyệt: http://localhost:3000"
echo "      (Để dừng: đóng cửa sổ này hoặc bấm Ctrl + C)"
echo ""

# Mở trình duyệt sau 3 giây rồi chạy server
( sleep 3 && open "http://localhost:3000" ) &

npm run start
