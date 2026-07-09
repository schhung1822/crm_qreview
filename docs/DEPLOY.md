# Deploy SEO-GEO lên VPS bằng Docker (geo.done.vn)

Hướng dẫn dựng bản production trên VPS `103.97.125.153`, domain `geo.done.vn`, HTTPS tự động qua
Caddy. Bản đầu chạy **file mode** (dữ liệu ở volume `app-data`) — đơn giản, đủ chạy. Chuyển Postgres
là bước tùy chọn sau (xem `POSTGRES-MIGRATION.md`).

Kiến trúc khi chạy: `Internet → Caddy(443, tự cấp TLS) → app(3000) → worker/db/redis` (mạng nội bộ Docker).

---

## Bước 1 — Trỏ tên miền (làm TRƯỚC, chờ vài phút cho DNS lan)

Tại nơi quản lý DNS của `done.vn`, thêm bản ghi:

| Type | Name | Value            | TTL |
|------|------|------------------|-----|
| A    | geo  | 103.97.125.153   | 300 |

Kiểm tra đã trỏ đúng (từ máy bạn): `nslookup geo.done.vn` → phải ra `103.97.125.153`.
Caddy chỉ xin được chứng chỉ HTTPS khi DNS đã trỏ đúng + cổng 80/443 mở.

---

## Bước 2 — Kết nối VPS bằng Termius

1. Mở Termius → New Host → Address `103.97.125.153`, user `root` (hoặc user sudo của bạn), nhập
   mật khẩu/khóa SSH → Connect.
2. Các lệnh dưới chạy trong cửa sổ terminal của Termius (đang ở trên VPS).

---

## Bước 3 — Cài Docker trên VPS (Ubuntu/Debian)

```bash
curl -fsSL https://get.docker.com | sh
docker version && docker compose version   # kiểm đã cài xong (compose v2)
```

Mở tường lửa cho web + SSH (nếu dùng ufw):

```bash
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
```

---

## Bước 4 — Đưa mã nguồn lên VPS

Repo chưa có remote git, nên đóng gói rồi tải lên bằng SFTP của Termius.

**Trên máy Windows của bạn** (Git Bash, tại thư mục `f:/project/SEO-GEO`) — nén, bỏ thư mục nặng:

```bash
tar czf seo-geo.tar.gz --exclude=node_modules --exclude=.next --exclude=.data --exclude=.git .
```

**Tải lên**: trong Termius mở tab **SFTP** cùng host → kéo `seo-geo.tar.gz` vào `/opt/` trên VPS.

**Trên VPS** — giải nén:

```bash
mkdir -p /opt/seo-geo && tar xzf /opt/seo-geo.tar.gz -C /opt/seo-geo && cd /opt/seo-geo
```

> Cách khác (nếu bạn đẩy repo lên GitHub riêng): `git clone <url> /opt/seo-geo`.

---

## Bước 5 — Tạo file bí mật `.env`

`docker-compose.yml` BẮT BUỘC `ENCRYPTION_KEY` + `CRON_SECRET`. Sinh và ghi vào `.env`:

```bash
cd /opt/seo-geo
cat > .env <<EOF
ENCRYPTION_KEY=$(openssl rand -base64 32)
CRON_SECRET=$(openssl rand -hex 16)
EOF
chmod 600 .env
cat .env    # lưu lại 2 giá trị này nơi an toàn — MẤT ENCRYPTION_KEY = mất mọi credential đã mã hóa
```

> ⚠️ Giữ `ENCRYPTION_KEY` cố định vĩnh viễn. Đổi nó → không giải mã được API key/credential CMS đã lưu.

---

## Bước 6 — Sửa email trong Caddyfile (1 dòng)

```bash
sed -i 's/admin@done.vn/EMAIL_CUA_BAN@gmail.com/' Caddyfile
```

---

## Bước 7 — Build & chạy (kèm lớp production có Caddy)

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Lần đầu build ~vài phút. Theo dõi Caddy xin chứng chỉ:

```bash
docker compose logs -f caddy      # chờ dòng 'certificate obtained' cho geo.done.vn; Ctrl+C để thoát
docker compose ps                 # tất cả service phải 'running'
```

Mở trình duyệt: **https://geo.done.vn** → tài khoản ĐẦU TIÊN đăng ký sẽ là **chủ sở hữu (owner)**.
Đăng ký ngay để không ai chiếm mất, rồi (khuyến nghị) khóa tự đăng ký ở bước 9.

---

## Bước 8 — Nhập API key AI (để dùng tính năng)

Đăng nhập → phần **API Keys & AI** → nhập key (Anthropic/OpenAI/Gemini...). Key được mã hóa AES-GCM
bằng `ENCRYPTION_KEY` rồi mới lưu. Không có key thì app vẫn chạy nhưng tính năng AI ở chế độ mock.

---

## Bước 9 — (Khuyến nghị) Khóa tự đăng ký sau khi có owner

Sửa `.env` thêm dòng `DISABLE_SELF_REGISTRATION=true` rồi dựng lại app:

```bash
echo 'DISABLE_SELF_REGISTRATION=true' >> .env
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Từ đó nhân viên mới do owner/admin tạo trong phần Quản lý nhân viên (không tự đăng ký ngoài).

---

## Vận hành

```bash
cd /opt/seo-geo
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f app   # xem log app
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart app   # khởi động lại app
docker compose -f docker-compose.yml -f docker-compose.prod.yml down           # tắt (giữ dữ liệu volume)
```

**Cập nhật phiên bản mới**: tải `seo-geo.tar.gz` mới lên, giải nén đè vào `/opt/seo-geo` (KHÔNG xóa
volume), rồi:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

**Sao lưu dữ liệu** (file mode — dữ liệu ở volume `app-data`, ảnh ở `app-media`):

```bash
docker run --rm -v seo-geo_app-data:/d -v /opt/backup:/b alpine tar czf /b/app-data-$(date +%F).tgz -C /d .
```

---

## Tùy chọn — Chuyển sang PostgreSQL (đa-instance)

Chỉ cần khi muốn chạy nhiều instance / cần backup DB chuẩn. App đã hỗ trợ sẵn (blob-backend):

```bash
# db + redis đã nằm trong compose. Tạo bảng rồi nạp dữ liệu .data hiện có sang Postgres:
docker compose exec app npx prisma migrate deploy
docker compose exec app node scripts/migrate-to-postgres.mjs --dry-run   # thử
docker compose exec app node scripts/migrate-to-postgres.mjs             # nạp thật
# Bật driver: thêm STORAGE_DRIVER=prisma vào .env rồi up -d lại. Rollback = bỏ dòng đó.
```

Chi tiết + đối chiếu: `docs/POSTGRES-MIGRATION.md`.

---

## Sự cố thường gặp

- **Caddy không xin được chứng chỉ**: DNS chưa trỏ đúng IP, hoặc cổng 80 bị chặn. Kiểm
  `nslookup geo.done.vn` và `ufw status`. Xem `docker compose logs caddy`.
- **502 Bad Gateway**: app chưa sẵn sàng — `docker compose logs app` xem lỗi (thường thiếu env).
- **App khởi động lỗi "Thiếu ENCRYPTION_KEY"**: `.env` chưa có key hoặc chạy thiếu file env.
- **Đổi domain**: sửa `Caddyfile` (tên miền) + `APP_URL` trong `docker-compose.prod.yml` rồi up -d lại.
