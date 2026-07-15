# Tự lưu trữ lên GitHub & tự host trên VPS (Docker + PostgreSQL)

Hướng dẫn **đầy đủ, có kiểm chứng** để:

1. Đẩy mã nguồn lên **GitHub** (repo riêng) làm nơi lưu trữ.
2. Tự host trên **VPS** bằng **Docker Compose**, dùng **PostgreSQL** làm kho lưu trữ chính
   (đa-instance, backup chuẩn) — thay vì file mode.

> Kiến trúc khi chạy:
> `Internet → Caddy(443, TLS tự động) → app(3000) → worker · PostgreSQL · Redis` (mạng nội bộ Docker).
>
> Kho dữ liệu ở chế độ Postgres: mỗi file `.data/*.json` được lưu thành **một hàng** trong bảng
> `JsonBlob(scope, name, data)` (`scope` = `bizId` hoặc `_global`). Cô lập tenant ở tầng ứng dụng.
> Chi tiết: [POSTGRES-MIGRATION.md](./POSTGRES-MIGRATION.md).

> ⚠️ **Khác với [DEPLOY.md](./DEPLOY.md)** (dùng tar + file mode). Tài liệu này dùng **git clone +
> PostgreSQL** ngay từ đầu. Nếu chỉ cần bản đơn giản 1 máy, DEPLOY.md là đủ.

---

## 0. Yêu cầu & chuẩn bị

| Hạng mục | Yêu cầu |
|---|---|
| VPS | Ubuntu 22.04/24.04 (hoặc Debian 12), **tối thiểu 2 vCPU / 4 GB RAM / 40 GB SSD** (build Next tốn RAM; <2 GB dễ OOM khi build) |
| Domain | Một tên miền/subdomain trỏ được A record về IP VPS (ví dụ `geo.example.com`) |
| Cổng mở | `22` (SSH), `80` + `443` (web/TLS) |
| Máy cá nhân | Đã cài **git**; có tài khoản GitHub |
| Kiến thức | Dùng được terminal/SSH cơ bản |

Các biến bí mật sẽ cần (sinh ở bước tương ứng):

| Biến | Bắt buộc | Cách sinh | Ghi chú |
|---|---|---|---|
| `ENCRYPTION_KEY` | ✅ | `openssl rand -base64 32` | **Cố định vĩnh viễn.** Mất/đổi = mất mọi credential AI/CMS đã mã hóa |
| `POSTGRES_PASSWORD` | ✅ (prod) | `openssl rand -base64 24` | Không để mặc định `seogeo` |
| `CRON_SECRET` | ✅ | `openssl rand -hex 16` | Để worker gọi `/api/jobs/run` |
| `SUPERADMIN_EMAILS` | ✅ | email của bạn | Chủ nền tảng (vào `/admin`, gói Enterprise) |

---

# PHẦN A — Đẩy lên GitHub

## A1. Kiểm tra an toàn TRƯỚC khi push (không để lộ secret)

Chạy tại thư mục dự án trên máy bạn (`f:/project/SEO-GEO`):

```bash
# 1) .gitignore đã chặn secret? (phải thấy: .env, .env.local, .data/, *.pem, /secrets/)
cat .gitignore

# 2) Có file nhạy cảm nào đang bị git theo dõi không? (KẾT QUẢ MONG ĐỢI: chỉ .env.example)
git ls-files | grep -E '\.env|\.data|\.localkey|\.pem' || echo "OK - không có secret nào bị track"

# 3) Rà nhanh secret vô tình hardcode trong mã (nên trả về rỗng hoặc chỉ là biến môi trường)
git grep -nEI 'sk-[A-Za-z0-9]{20}|AIza[A-Za-z0-9_-]{20}|-----BEGIN' -- . ':!*.md' ':!.env.example' || true
```

> `.env.local` (chứa `SUPERADMIN_EMAILS` local) đã nằm trong `.gitignore` → **không** bị đẩy lên.
> `.data/` (chứa `.localkey`, sessions, credential đã mã hóa) cũng bị loại. Tuyệt đối không `git add -f`
> các file này.

## A2. Tạo repo GitHub **riêng tư** (Private)

Đây là mã nguồn SaaS → nên để **Private**.

**Cách 1 — GitHub CLI** (nếu đã cài `gh` và `gh auth login`):

```bash
gh repo create seo-geo-platform --private --source . --remote origin --description "SEO/GEO SaaS platform"
```

**Cách 2 — Thủ công:** vào github.com → **New repository** → tên `seo-geo-platform` → **Private** →
**KHÔNG** tick "Add README/.gitignore/license" (dự án đã có) → Create. Rồi:

```bash
git remote add origin git@github.com:<user>/seo-geo-platform.git   # SSH (khuyên dùng)
# hoặc HTTPS: git remote add origin https://github.com/<user>/seo-geo-platform.git
```

## A3. Commit & push

Kiểm tra nhánh hiện tại và các thay đổi:

```bash
git status
git branch --show-current
```

> Dự án hiện đang ở nhánh làm việc (ví dụ `fix/phase0-1-hardening`) và **còn nhiều file chưa commit**.
> Quyết định: đưa hết lên nhánh `main` cho gọn:

```bash
git add -A
git commit -m "chore: bản deploy self-host (Docker + Postgres)"

# Đưa nhánh hiện tại thành main rồi push (giữ toàn bộ lịch sử):
git branch -M main
git push -u origin main
```

Kiểm tra trên GitHub: mở repo, xác nhận **không** thấy `.env`, `.env.local`, thư mục `.data/`.

## A4. (Khuyến nghị) Bảo vệ nhánh & bật cảnh báo bảo mật

Trong repo GitHub → **Settings**:
- **Branches → Add rule** cho `main`: require PR trước khi merge (nếu làm nhóm).
- **Code security and analysis**: bật **Dependabot alerts** + **Secret scanning** (miễn phí cho repo).
- **Actions**: đã có sẵn workflow CI (`.github/workflows/ci.yml`) chạy typecheck/lint/test.

---

# PHẦN B — Chuẩn bị VPS

## B1. Kết nối & cập nhật

```bash
ssh root@<IP_VPS>          # hoặc user sudo của bạn
apt update && apt upgrade -y
```

## B2. Cài Docker + Docker Compose v2

```bash
curl -fsSL https://get.docker.com | sh
docker version && docker compose version   # phải ra cả 2 (compose v2)
```

## B3. Tường lửa + gia cố SSH (khuyến nghị mạnh)

```bash
# Firewall: chỉ mở SSH + web
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp
ufw --force enable

# Chống dò mật khẩu SSH
apt install -y fail2ban
systemctl enable --now fail2ban
```

> Nên dùng **SSH key** thay mật khẩu và tắt `PasswordAuthentication` trong `/etc/ssh/sshd_config`
> (`systemctl restart ssh` sau khi sửa). Tạo user thường có sudo thay vì dùng `root` trực tiếp.

## B4. Cho VPS quyền `git clone` repo riêng tư

Repo Private → VPS cần xác thực. Dùng **Deploy Key** (chỉ đọc, an toàn nhất):

```bash
# Trên VPS: sinh khóa SSH riêng cho deploy (không đặt passphrase để tự động clone/pull)
ssh-keygen -t ed25519 -C "vps-deploy-seo-geo" -f ~/.ssh/seo_geo_deploy -N ""
cat ~/.ssh/seo_geo_deploy.pub
```

Copy nội dung `.pub` → GitHub repo → **Settings → Deploy keys → Add deploy key** → dán vào →
tick **Allow write access = KHÔNG** (chỉ cần đọc) → Add.

Cấu hình SSH dùng đúng key này cho GitHub:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/seo_geo_deploy
  IdentitiesOnly yes
EOF
ssh -T git@github.com   # lần đầu gõ 'yes'; thấy "Hi <user>/... You've successfully authenticated"
```

> Cách khác đơn giản hơn (kém an toàn hơn): dùng **Personal Access Token** với HTTPS
> (`git clone https://<TOKEN>@github.com/<user>/seo-geo-platform.git`). Deploy key được khuyên hơn.

---

# PHẦN C — Deploy bằng Docker + PostgreSQL

## C1. Clone mã nguồn

```bash
mkdir -p /opt && cd /opt
git clone git@github.com:<user>/seo-geo-platform.git seo-geo
cd /opt/seo-geo
```

## C2. Trỏ DNS

Tại nơi quản lý DNS của tên miền, thêm bản ghi:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `geo` (hoặc subdomain bạn chọn) | `<IP_VPS>` | 300 |

Kiểm tra (đợi vài phút cho DNS lan): `nslookup geo.example.com` → phải ra IP VPS.
**Caddy chỉ xin được HTTPS khi DNS đã trỏ đúng + cổng 80/443 mở.**

## C3. Sửa domain + email trong `Caddyfile`

```bash
# Đổi domain và email quản trị (nhận cảnh báo chứng chỉ TLS)
sed -i 's/geo\.done\.vn/geo.example.com/g; s/admin@done\.vn/ban@example.com/g' Caddyfile
cat Caddyfile   # kiểm lại
```

## C4. Sửa `APP_URL` trong `docker-compose.prod.yml`

`APP_URL` là domain công khai — dùng cho link email, ảnh `/generated/...` (Shopify/Wix cần), và
**chốt CSRF** (kiểm Origin). Phải là domain thật, HTTPS:

```bash
sed -i 's|https://geo\.done\.vn|https://geo.example.com|' docker-compose.prod.yml
grep APP_URL docker-compose.prod.yml   # xác nhận
```

## C5. Tạo file `.env` (bí mật)

```bash
cd /opt/seo-geo
cat > .env <<EOF
# Kho lưu trữ: Postgres
STORAGE_DRIVER=prisma

# Bí mật (sinh ngẫu nhiên ngay tại đây)
ENCRYPTION_KEY=$(openssl rand -base64 32)
POSTGRES_PASSWORD=$(openssl rand -base64 24)
CRON_SECRET=$(openssl rand -hex 16)

# Chủ nền tảng (đổi thành email THẬT của bạn)
SUPERADMIN_EMAILS=ban@example.com

# Khóa tự đăng ký (bật SAU khi đã tạo tài khoản owner ở bước C9 — xem C10)
DISABLE_SELF_REGISTRATION=false
EOF
chmod 600 .env
cat .env   # LƯU LẠI ENCRYPTION_KEY & POSTGRES_PASSWORD nơi an toàn (password manager)
```

> ⚠️ **Sao lưu `ENCRYPTION_KEY` ngay.** Mất nó = không giải mã lại được API key AI/credential CMS
> đã lưu. Đổi nó = hỏng toàn bộ secret cũ.
>
> Biến khác (API key AI, DataForSEO, Apify…) **không cần** đặt ở đây — nhập trực tiếp trong app
> (được mã hóa AES-256-GCM rồi mới lưu). Xem [.env.example](../.env.example) cho danh sách đầy đủ.

## C6. Khởi động DB + Redis trước (để tạo bảng)

Vì app chạy `STORAGE_DRIVER=prisma` sẽ ghi vào bảng `JsonBlob` ngay khi tạo tài khoản đầu tiên,
ta phải **tạo bảng trước** khi app ghi. Bật riêng db + redis:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build db redis
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps   # chờ db (healthy)
```

## C7. Tạo bảng PostgreSQL (áp migration)

Migration baseline `prisma/migrations/0_init/migration.sql` tạo đủ 23 bảng (gồm `JsonBlob`).
Áp thẳng bằng `psql` trong container db — **cách chắc chắn nhất**, không phụ thuộc Prisma CLI:

```bash
cd /opt/seo-geo
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T db \
  psql -U seogeo -d seogeo -v ON_ERROR_STOP=1 < prisma/migrations/0_init/migration.sql

# Kiểm tra bảng đã tạo (phải liệt kê JsonBlob, User, Biz, Article, ...):
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec db \
  psql -U seogeo -d seogeo -c '\dt'
```

> Chỉ chạy **một lần** trên DB trống. Chạy lại sẽ báo "relation already exists" (vô hại, nhưng
> không cần).
>
> **Vì sao không dùng `npx prisma migrate deploy` trong container app?** Image `app` là bản Next
> *standalone*, **không kèm Prisma CLI** → lệnh đó sẽ lỗi. Runtime (`@prisma/client` + query engine)
> đã được Dockerfile copy sẵn để driver `prisma` chạy được; còn *chạy migration* thì dùng `psql`
> như trên. (Nếu bạn có Node + repo trên máy khác, có thể chạy
> `DATABASE_URL=postgresql://seogeo:<pass>@<IP_VPS>:5432/seogeo npx prisma migrate deploy` — nhưng
> cổng 5432 **không** mở ra ngoài theo thiết kế, nên `psql` trong container là đường chuẩn.)

## C8. Khởi động toàn bộ stack

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps   # app, worker, db, redis, caddy đều 'running'
```

Theo dõi Caddy xin chứng chỉ TLS:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f caddy
# chờ dòng 'certificate obtained' cho domain của bạn → Ctrl+C thoát
```

Xác minh app đọc/ghi Postgres (không phải file):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs app | tail -30   # không có lỗi Prisma
```

## C9. Tạo tài khoản chủ (owner) + nhập API key

1. Mở **https://geo.example.com** → tài khoản **đăng ký ĐẦU TIÊN sẽ là chủ sở hữu (owner)** →
   đăng ký ngay bằng email trùng `SUPERADMIN_EMAILS` để có luôn quyền quản trị nền tảng (`/admin`).
2. Đăng nhập → **API Keys & AI** → nhập key Anthropic/OpenAI/Gemini/DeepSeek (mã hóa rồi mới lưu).
3. **Kết nối CMS** → thêm WordPress/Wix/Shopify → *Test* → *Lưu*.

Kiểm chứng dữ liệu nằm trong Postgres:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec db \
  psql -U seogeo -d seogeo -c "SELECT scope, name FROM \"JsonBlob\" ORDER BY 1,2 LIMIT 20;"
# phải thấy các hàng như (_global, users.json), (biz_xxx, articles.json), ...
```

## C10. Khóa tự đăng ký (sau khi đã có owner)

```bash
sed -i 's/DISABLE_SELF_REGISTRATION=false/DISABLE_SELF_REGISTRATION=true/' .env
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d app
```

Từ đây nhân viên mới do owner/admin tạo trong phần **Quản lý nhân viên** (không ai tự đăng ký ngoài).

---

# PHẦN D — Vận hành

Đặt alias cho gọn (tùy chọn):

```bash
echo "alias dc='docker compose -f /opt/seo-geo/docker-compose.yml -f /opt/seo-geo/docker-compose.prod.yml'" >> ~/.bashrc
source ~/.bashrc
# Từ đây dùng: dc ps | dc logs -f app | dc restart app | dc down
```

## D1. Cập nhật phiên bản mới (qua GitHub)

```bash
cd /opt/seo-geo
git pull origin main
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
# Nếu bản mới có thêm migration trong prisma/migrations/ → áp migration mới bằng psql như bước C7
# (chỉ áp file .sql MỚI chưa từng chạy).
```

> Volume dữ liệu (`db-data`, `app-media`, `caddy-data`) **được giữ nguyên** khi rebuild. Chỉ `down -v`
> mới xóa volume — **không bao giờ** chạy `down -v` trên production.

## D2. Sao lưu tự động (QUAN TRỌNG — bắt buộc cho SaaS)

**a) Backup PostgreSQL định kỳ** bằng `pg_dump` + cron:

```bash
mkdir -p /opt/backup
cat > /opt/seo-geo/backup-db.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd /opt/seo-geo
STAMP=$(date +%F_%H%M)
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T db \
  pg_dump -U seogeo -d seogeo | gzip > /opt/backup/db-$STAMP.sql.gz
# Giữ 14 ngày gần nhất
find /opt/backup -name 'db-*.sql.gz' -mtime +14 -delete
EOF
chmod +x /opt/seo-geo/backup-db.sh

# Lên lịch 02:30 mỗi ngày
( crontab -l 2>/dev/null; echo "30 2 * * * /opt/seo-geo/backup-db.sh >> /opt/backup/backup.log 2>&1" ) | crontab -
```

**b) Backup ảnh sinh ra** (volume `app-media`) — nếu dùng ảnh AI:

```bash
docker run --rm -v seo-geo_app-media:/d -v /opt/backup:/b alpine \
  tar czf /b/media-$(date +%F).tgz -C /d .
```

**c) Đưa backup ra ngoài VPS** (bắt buộc để chống mất máy): dùng `rclone`/`scp` đẩy `/opt/backup`
lên object storage (S3/R2/Backblaze) hoặc máy khác. Backup nằm cùng VPS = không phải backup thật.

**d) Diễn tập KHÔI PHỤC (ít nhất 1 lần):**

```bash
# Khôi phục vào DB trống (ví dụ trên VPS staging)
gunzip -c /opt/backup/db-YYYY-MM-DD_HHMM.sql.gz | \
  docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T db psql -U seogeo -d seogeo
```

> Backup chưa từng restore thử = backup không đáng tin. Hãy diễn tập.

## D3. Log, restart, giám sát

```bash
dc logs -f app        # log ứng dụng
dc logs -f worker     # log worker lịch đăng
dc restart app        # khởi động lại app
dc ps                 # trạng thái + health
docker stats          # CPU/RAM realtime
```

Healthcheck nội bộ: app tự expose `GET /api/healthz` (không cần auth) — compose đã dùng để theo dõi.

## D4. (Tùy chọn) Chạy nhiều instance app

Postgres blob-backend đã atomic đa-instance (`SELECT … FOR UPDATE`). Có thể scale:

```bash
dc up -d --scale app=2
```

> Lưu ý: **rate-limit và một số khóa hiện in-memory theo tiến trình** (xem
> [POSTGRES-MIGRATION.md](./POSTGRES-MIGRATION.md) mục 6) → chạy >1 instance thì rate-limit tính
> riêng mỗi instance. Chấp nhận được, nhưng để chuẩn hãy chuyển rate-limit/session sang Redis trước
> khi scale thật sự. Với 1 instance thì không ảnh hưởng.

---

# PHẦN E — Checklist gia cố bảo mật production

Rút từ đợt audit bảo mật. Nên xử lý các mục **BLOCKER** trước khi mở cho khách hàng thật:

### 🔴 Nên sửa trước khi go-live
- [ ] **`nodemailer`** đang dính CVE HIGH → nâng `^9.0.3` trong `package.json`, test lại gửi mail
      xác thực/reset. (`npm i nodemailer@^9.0.3`)
- [ ] **`next.config.mjs`** `images.remotePatterns: hostname '**'` → giới hạn về whitelist domain
      CMS/CDN thực sự cần (chống DoS/SSRF Image Optimizer).
- [ ] **SSRF DNS-rebinding**: `src/lib/security/safe-fetch.ts` kiểm IP rồi fetch bằng hostname
      (undici resolve lại) → **ghim IP** đã validate (undici `Agent` với `connect.lookup`).
- [ ] Lên kế hoạch nâng **Next 14 → 15/16** (còn advisory HIGH ở nhánh 14).

### 🟠 Gia cố sớm
- [ ] **Session token** đang lưu plaintext trong kho → nên lưu `sha256(token)` (`src/lib/auth/session.ts`).
- [ ] **`CRON_SECRET`** so sánh `===` → dùng `timingSafeEqual` (`src/app/api/jobs/run/route.ts`).
- [ ] **RLS**: hiện chỉ là tài liệu, **chưa arm** trên bảng `JsonBlob` runtime. Cô lập tenant đang
      hoàn toàn ở tầng app → hoặc arm RLS (policy `scope = current_setting('app.current_biz')` +
      `SET LOCAL` trong `mutateJson`), hoặc gỡ tuyên bố RLS trong docs để không hiểu nhầm.
- [ ] Thêm **`npm audit --audit-level=high`** + secret-scan (gitleaks) + CodeQL vào CI.

### ✅ Đã đạt sẵn (không cần làm)
- Docker chạy **non-root**, multi-stage, HEALTHCHECK; fail-fast khi thiếu `ENCRYPTION_KEY` ở prod.
- Cổng app + Postgres **không** expose ra Internet (chỉ qua Caddy 443); Caddy HTTPS tự động + tự gia hạn.
- Mật khẩu băm scrypt + salt; credential mã hóa AES-256-GCM; CSRF qua Origin; chống SSRF nền tảng tốt;
  Zod validate 100% route JSON; `.gitignore`/`.dockerignore` sạch.

> Tài liệu audit chi tiết: hỏi lại để xuất bản báo cáo đầy đủ.

---

# PHẦN F — Sự cố thường gặp

| Triệu chứng | Nguyên nhân & cách xử lý |
|---|---|
| Caddy **không xin được chứng chỉ** | DNS chưa trỏ đúng IP, hoặc cổng 80 bị chặn. Kiểm `nslookup <domain>`, `ufw status`, `dc logs caddy`. |
| **502 Bad Gateway** | App chưa sẵn sàng/khởi động lỗi → `dc logs app`. Thường do thiếu env (`ENCRYPTION_KEY`/`POSTGRES_PASSWORD`). |
| App log **"Thiếu ENCRYPTION_KEY"** | `.env` chưa có key hoặc chạy thiếu file env. |
| App log lỗi **Prisma "Query engine … not found"** | Rebuild lại image (`--build`) để lấy bản Dockerfile đã copy Prisma engine + `openssl`. Xác nhận đang dùng Dockerfile mới nhất. |
| App log **"relation \"JsonBlob\" does not exist"** | Chưa chạy bước **C7** (tạo bảng). Áp `migration.sql` bằng `psql` rồi `dc restart app`. |
| Tạo tài khoản/ghi dữ liệu báo lỗi DB | Sai `POSTGRES_PASSWORD` giữa app và db (đảm bảo cùng `.env`), hoặc db chưa `healthy`. |
| Build **OOM/treo** | VPS thiếu RAM. Thêm swap: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`. |
| Muốn **đổi domain** | Sửa `Caddyfile` (domain) + `APP_URL` trong `docker-compose.prod.yml` → `dc up -d`. |
| Muốn **quay lại file mode** | Bỏ dòng `STORAGE_DRIVER=prisma` trong `.env` → `dc up -d app` (dữ liệu Postgres vẫn còn, nhưng app đọc `.data` — chỉ dùng khi thật cần rollback). |

---

## Tóm tắt lệnh (sau khi đã cấu hình xong)

```bash
cd /opt/seo-geo
# Deploy lần đầu:
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build db redis
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T db \
  psql -U seogeo -d seogeo -v ON_ERROR_STOP=1 < prisma/migrations/0_init/migration.sql
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
# Cập nhật:
git pull origin main && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```
