# Lộ trình fix & triển khai — SEO·GEO Platform

> **Mục đích:** danh sách công việc có thể theo dõi (checkbox) để đưa hệ thống từ *closed-beta* lên
> *sẵn sàng bán SaaS công khai*. Hợp nhất phát hiện từ 2 lượt đánh giá (Claude + Codex), **đã verify
> trên commit `fccd826`**.
>
> **Bối cảnh triển khai thật:** 1 VPS, Docker, PostgreSQL, reverse proxy **nginx** (không phải Caddy),
> deploy bằng `docker-compose.yml` + `docker-compose.vps.yml`. Domain: `demo.noti.vn` / VPS `/opt/seo-geo`.
>
> **Điểm hiện tại:** ~66,5/100 (Codex, cổng blocker) · ~72–75/100 (hội tụ cho bối cảnh 1-VPS).
> **Mục tiêu:** đóng hết Critical + High không-phụ-thuộc-deploy → go-live public.

**Cách dùng:** tick `[x]` khi xong. Mỗi mục có **Verify** — chỉ tick khi verify pass. Cập nhật cột
_Trạng thái_: `TODO` / `DOING` / `DONE` / `SKIP (lý do)`.

**Cổng "xong" chung cho mọi thay đổi:** `npm run typecheck && npm run lint && npm run check:i18n && npm test` phải xanh.

---

## Bảng theo dõi tổng (điền tay khi tiến hành)

| Pha | Hạng mục | Ưu tiên | Trạng thái | Người làm | Ngày xong |
|---|---|---|---|---|---|
| 0 | Chốt cấu hình deploy an toàn | 🔴 Blocker | TODO | | |
| 1 | 3 fix code cốt lõi (data-lifecycle, entitlement, dependency) | 🔴 Blocker/High | TODO | | |
| 2 | Identity & session hardening | 🟠 High | TODO | | |
| 3 | Vận hành: backup có kiểm chứng + observability | 🟠 High | TODO | | |
| 4 | Hardening tầng thấp | 🟡 Medium | TODO | | |
| 5 | Trước public beta có thanh toán | 🟡 Medium | TODO | | |
| 6 | Nợ kỹ thuật 30–60 ngày | ⚪ Low | TODO | | |

---

## PHA 0 — Chốt cấu hình triển khai (làm NGAY, ít code)

> Đây là các "công tắc" phải đúng trước khi nói tới data. Phần lớn là cấu hình hạ tầng, không sửa code.

- [ ] **0.1 — Xác nhận `STORAGE_DRIVER=prisma` đang bật trên VPS.** *(H-04)*
  - **Vì sao:** mặc định là `file` → dữ liệu nằm ở volume `.data`, không vào Postgres → **pg_dump backup rỗng**, và mất an toàn đa-tiến-trình.
  - **Việc:** kiểm `.env` trên VPS có `STORAGE_DRIVER=prisma`; gọi `GET /api/healthz` phải trả `"driver":"prisma"` và `checks.db:"ok"`.
  - **Verify:** `curl -s https://demo.noti.vn/api/healthz` → thấy `driver: prisma`.

- [ ] **0.2 — Thêm fail-fast: production BẮT BUỘC prisma.** *(H-04)*
  - **Vì sao:** để operator không bao giờ lỡ chạy file mode ở prod mà app vẫn "xanh".
  - **Việc:** trong `src/lib/env.ts` (hoặc chỗ đọc env), nếu `NODE_ENV==='production'` và `STORAGE_DRIVER!=='prisma'` → `throw` khi khởi động. Cho phép override bằng `ALLOW_FILE_IN_PROD=1` nếu cố tình.
  - **Verify:** đặt sai driver ở env prod → container fail khởi động với message rõ ràng.

- [ ] **0.3 — Xác nhận nginx scrub `X-Real-IP` / `X-Forwarded-For`.** *(H-05)*
  - **Vì sao:** `clientIp()` (`src/lib/security/rate-limit.ts`) ưu tiên `x-real-ip`; nếu nginx không ghi đè, client tự đặt header → **vượt rate-limit / brute-force**.
  - **Việc:** trong server block nginx của `demo.noti.vn`:
    ```nginx
    proxy_set_header X-Real-IP        $remote_addr;
    proxy_set_header X-Forwarded-For  $remote_addr;   # KHÔNG dùng $proxy_add_x_forwarded_for (giữ header client)
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    ```
  - **Verify:** `curl -H "X-Real-IP: 1.2.3.4" https://demo.noti.vn/...` → log app thấy IP thật của bạn, không phải `1.2.3.4`.

- [ ] **0.4 — (Chỉ nếu dùng Caddy) sửa merge port `docker-compose.prod.yml`.** *(C-02)*
  - **Vì sao:** prod.yml thêm `127.0.0.1:3000` **không** `!override` → gộp cả `0.0.0.0:3000` (base) → lộ port 3000 bypass proxy.
  - **Việc:** với Caddy dùng `ports: !reset []` (app không cần publish, Caddy gọi nội bộ). Nếu deploy bằng **`docker-compose.vps.yml` thì BỎ QUA** — file đó đã `!override` đúng.
  - **Verify:** `docker compose -f docker-compose.yml -f docker-compose.prod.yml config | grep 3000` → không còn `0.0.0.0:3000`.
  - **Trạng thái gợi ý:** `SKIP (dùng nginx + vps.yml)` nếu đúng mô hình của bạn.

- [ ] **0.5 — Đảm bảo `ENCRYPTION_KEY` được backup & escrow tách biệt.** *(H-06)*
  - **Vì sao:** mất key = mọi credential CMS/AI/OAuth mã hóa thành rác, không restore được.
  - **Việc:** lưu `ENCRYPTION_KEY` (và `POSTGRES_PASSWORD`, `CRON_SECRET`) ở password manager / vault **ngoài VPS**. Ghi runbook: khôi phục cần cả DB dump **và** key này.
  - **Verify:** thử restore trên máy staging bằng dump + key từ escrow → app đọc lại được credential (mục 3.2).

---

## PHA 1 — 3 fix code cốt lõi (Blocker/High, không phụ thuộc deploy)

> Đây là giao điểm của cả hai báo cáo — nên làm đầu tiên. Mỗi fix kèm test.

- [ ] **1.1 — `deleteBiz` purge TOÀN BỘ dữ liệu tenant.** *(H-02 — privacy/compliance)*
  - **Vị trí:** `src/lib/store/biz.ts:271-274`.
  - **Hiện trạng:** chỉ `rows.filter` + `fs.rm(bizDir)`. Ở **prisma mode**, dữ liệu ở `JsonBlob(scope=bizId)` **không bị xóa**; share index toàn cục **không revoke**; media **không dọn**. Link share cũ vẫn đọc được nội dung "đã xóa".
  - **Việc:**
    1. Xóa mọi hàng `JsonBlob` có `scope=bizId` (prisma mode): `prisma.jsonBlob.deleteMany({ where: { scope: bizId } })` — bọc trong transaction cùng bước xóa record biz.
    2. Revoke các entry trong share index toàn cục (`social-shares`, `script-shares`, `share-links`) lọc theo `bizId`.
    3. Dọn media của biz (thư mục/records ảnh).
    4. Giữ `fs.rm(bizDir)` cho file mode.
  - **Verify:** test mới (prisma mode) — tạo biz + article + share link → `deleteBiz` → assert `jsonBlob.count({where:{scope}})===0`, share token cũ trả 404. Sửa lại comment "TOÀN BỘ dữ liệu" cho khớp thực tế.

- [ ] **1.2 — Enforce quota server-side + đổi entitlement sang fail-CLOSED.** *(H-08 + fail-open)*
  - **Vị trí:** `src/app/api/connections/route.ts` (POST), `src/lib/billing/entitlement.ts:121` (`canAddCms`), `src/lib/ai/providers.ts:46-47,66-69`.
  - **Hiện trạng:** POST tạo connection không gọi `canAddCms()` → vượt `maxCmsConnections` (kể cả Free=0). `providers.ts` nuốt lỗi đọc entitlement (non-PlanError) và để `budget=0 → return` → **fail-open** khi storage/DB lỗi → thất thoát chi phí AI.
  - **Việc:**
    1. Trong POST connections: sau `guard('connections:manage')`, gọi `canAddCms(bizId)`; nếu vượt → `403` với code lỗi rõ (đã có i18n key hoặc thêm cho đủ 10 locale).
    2. `providers.ts`: khi đọc entitlement/budget lỗi (không phải PlanError) → **chặn** (throw/deny) thay vì bỏ qua. Có thể thêm cờ `ALLOW_ENTITLEMENT_FAILOPEN` cho môi trường dev.
    3. Rà các quota khác (seat, số biz, social report) có cùng pattern fail-open không.
  - **Verify:** test — Free plan tạo connection thứ 1 → 403; giả lập entitlement store lỗi → request AI bị chặn, không rơi về "cho phép".
  - **⚠ i18n:** nếu thêm chuỗi lỗi mới cho UI → cập nhật **đủ 10 file** `src/messages/*.json` (§8.4 CLAUDE.md), chạy `npm run check:i18n`.

- [ ] **1.3 — Nâng Next.js lên bản được hỗ trợ đã vá.** *(H-01)*
  - **Vị trí:** `package.json` `^14.2.18` → lockfile ghim `14.2.35` (unsupported, dính SSRF WebSocket GHSA-c4j6-fc7j-m34r đúng mô hình self-host).
  - **Việc:** nâng Next lên nhánh còn support (15.5.x đã vá, hoặc 16.x). **Đây là major upgrade → có breaking change** (đã ghi ở sổ nợ "Next 15/16 upgrade" trong CI). Làm trên nhánh riêng: nâng → `npm run build` → chạy full test + smoke `/`, `/login`, `/api/healthz`.
  - **Giảm nhẹ tạm thời nếu chưa nâng ngay:** nginx chặn `Upgrade: websocket` tới app nếu không dùng WS; giới hạn egress container.
  - **Verify:** `npm audit --omit=dev --audit-level=high` không còn High liên quan Next; build + test xanh.

- [ ] **1.4 — Nâng Node 20 → Node 24 LTS.** *(đi kèm H-01)*
  - **Vị trí:** `Dockerfile` (`node:20-alpine`), `.github/workflows/ci.yml` (`node-version: 20`).
  - **Vì sao:** Node 20 EOL 24/03/2026.
  - **Verify:** CI + Docker build xanh trên Node 24; app chạy được trên VPS.

---

## PHA 2 — Identity & session hardening (High)

- [ ] **2.1 — Đóng "first request wins" khi bootstrap.** *(C-01)*
  - **Vị trí:** `src/app/api/auth/register/route.ts:39,63`, `src/app/api/auth/setup/route.ts:17`, `src/lib/auth/users.ts:113-124`.
  - **Hiện trạng:** khi `userCount()===0`, request đăng ký/setup ĐẦU TIÊN thành `owner` + verified. Attacker chạm ingress trước chủ thật → chiếm nền tảng (đặc biệt nếu dùng email trong `SUPERADMIN_EMAILS`).
  - **Việc:** yêu cầu `BOOTSTRAP_SECRET` (env, một lần) cho tạo owner đầu tiên; HOẶC seed owner offline bằng script; đóng `/api/auth/setup` sau khi có owner. Với bạn (đã bootstrap) → rủi ro thấp nhưng cần trước mỗi lần redeploy fresh instance công khai.
  - **Verify:** trên instance rỗng, đăng ký thường không tạo owner nếu thiếu `BOOTSTRAP_SECRET`.

- [ ] **2.2 — Admin reset/suspend/đổi vai trò phải revoke session cũ.** *(M-01)*
  - **Vị trí:** `src/app/api/admin/users/route.ts` (action `setPassword`, `suspend`).
  - **Việc:** gọi `destroySessionsForUser(userId)` sau khi admin reset password / suspend / đổi role. (self-change đã revoke rồi — chỉ đường admin còn thiếu.)
  - **Verify:** admin reset password user → session cũ của user đó trả 401 ở request kế tiếp.

- [ ] **2.3 — Share-unlock chuyển sang shared limiter + async hashing.** *(H-07)*
  - **Vị trí:** `src/app/api/share/[token]/unlock/route.ts:24`, `share/video/[token]/unlock`, `src/lib/store/social-shares.ts` (`scryptSync`).
  - **Việc:** đổi limiter in-memory → `rate-limit-shared.ts` (Postgres) như login; đổi `scryptSync` → `scrypt` async (không chặn event loop); thêm min-length cho mật khẩu share.
  - **Verify:** test rate-limit share-unlock; đo event-loop không bị block khi nhiều unlock đồng thời.

---

## PHA 3 — Vận hành: backup có kiểm chứng + observability (High)

- [ ] **3.1 — Viết script backup vào repo (không chỉ cron trên VPS).** *(H-06, M-07)*
  - **Vì sao:** hiện **không có artifact backup nào trong repo** → không kiểm chứng/tái lập được.
  - **Việc:** thêm `scripts/backup.sh` (pg_dump nén + timestamp + retention + optional offsite/S3) và `scripts/restore.sh`. Nếu còn secret ở volume local (mục 3.3) → backup cả `app-data`, `app-media`. Ghi `last-success` + checksum.
  - **Verify:** chạy `scripts/backup.sh` tạo được dump hợp lệ; log ghi last-success.

- [ ] **3.2 — Restore drill trên staging (bằng chứng RPO/RTO).** *(M-07)*
  - **Việc:** dựng máy staging, restore từ dump + `ENCRYPTION_KEY` escrow, khởi động app, xác nhận đọc lại được credential mã hóa và dữ liệu biz. Ghi thời gian → RTO; tần suất backup → RPO.
  - **Verify:** app staging sau restore đăng nhập được + connection CMS test-connection OK.

- [ ] **3.3 — Đưa secret local-file vào store/DB (hoặc chắc chắn backup phủ).** *(H-06)*
  - **Vị trí:** `src/lib/secrets/store.ts`, `src/lib/store/drive.ts`, `src/lib/store/dataforseo.ts` — vẫn đọc/ghi file trực tiếp kể cả prisma mode.
  - **Việc:** chuyển các store này qua `json-store` (để vào JsonBlob khi prisma) HOẶC đảm bảo backup `app-data` volume + tài liệu rõ.
  - **Verify:** ở prisma mode, xóa volume local → app vẫn đọc được các secret này từ DB (nếu chọn hướng chuyển store).

- [ ] **3.4 — Structured logging + error tracking + alert cơ bản.** *(M-06)*
  - **Vì sao:** hiện chỉ `console.error` rải rác, không metrics/tracing.
  - **Việc:** thêm logger có cấu trúc (pino) + request/correlation ID; tích hợp Sentry/OTel; alert cho: app down, DB down, disk đầy, worker chết, backup stale, TLS sắp hết hạn.
  - **Verify:** gây lỗi giả → thấy log JSON có correlation ID + Sentry nhận event.

- [ ] **3.5 — Worker heartbeat + chống overlap tick.** *(M-06)*
  - **Vị trí:** `scripts/worker.mjs` (`setInterval` 60s có thể chồng nếu tick trước chưa xong).
  - **Việc:** đổi sang vòng lặp tuần tự (chờ tick xong mới hẹn tick sau); thêm heartbeat/healthcheck cho worker.
  - **Verify:** giả lập job chạy > 60s → không có 2 tick chồng nhau.

---

## PHA 4 — Hardening tầng thấp (Medium)

- [ ] **4.1 — DB role least-privilege cho app.** *(H-03)* — app đang dùng `POSTGRES_USER=seogeo` (superuser image tạo). Tách role `seogeo_app` quyền tối thiểu; migration dùng role riêng.
- [ ] **4.2 — Global body-size limit ở nginx** (`client_max_body_size`) + hard cap streaming ở các fetch đọc body. *(M-04)*
- [ ] **4.3 — CSP đầy đủ** (nonce-based `script-src`/`style-src`), hiện `next.config.mjs` chủ yếu chỉ `frame-ancestors`. *(M-05)*
- [ ] **4.4 — Mời thành viên bằng invitation token** thay vì gửi mật khẩu plaintext qua email. *(M-02)* — `src/app/api/biz/[id]/members/route.ts`.
- [ ] **4.5 — Tách subkey HMAC (HKDF) + cơ chế key-rotation** thay vì tái dùng `ENCRYPTION_KEY` cho cả AES-GCM và HMAC token chia sẻ.
- [ ] **4.6 — Quota RAM/time khi parse DOCX/PDF** (chống zip-bomb) — `src/lib/ingest/extract.ts`.
- [ ] **4.7 — Resource limits Compose** (CPU/RAM/PID, `no-new-privileges`, `cap_drop`, log size cap). *(M-06)*
- [ ] **4.8 — Bỏ default `POSTGRES_PASSWORD=seogeo`** ở base `docker-compose.yml` (buộc env như overlay).
- [ ] **4.9 — Gỡ Redis khỏi `docker-compose.yml`** (khai báo nhưng code không dùng — queue tự viết) HOẶC sửa CLAUDE.md/ARCHITECTURE cho khớp.

---

## PHA 5 — Trước public beta có thanh toán (Medium)

- [ ] **5.1 — Migration chuẩn hóa:** one-shot service chạy `prisma migrate deploy` (không `psql` thủ công). *(H-09)*
- [ ] **5.2 — E2E (Playwright)** cho hành trình: signup/bootstrap → tạo Biz → tenant isolation → billing/webhook → viết bài → publish → xóa Biz. Thêm vào CI. *(mảng test còn thiếu)*
- [ ] **5.3 — Postgres integration test trong CI** (chạy migration + isolation test trên PG thật).
- [ ] **5.4 — Test cho tầng gen-jobs/runner** (`runNextGenJob`/`runDueGenJobs`) — hiện chỉ publish-jobs được test.
- [ ] **5.5 — Docker build + image scan trong CI**; đổi `npm install` → cân nhắc `npm ci` (lưu ý sharp/musl).
- [ ] **5.6 — Billing UI hoàn thiện:** invoice, lịch sử order, self cancel/downgrade/refund. *(mảng billing 62)*

---

## PHA 6 — Nợ kỹ thuật 30–60 ngày (Low)

- [ ] **6.1 — Chuyển collection nóng khỏi `JsonBlob`** sang bảng quan hệ / chia nhỏ blob theo entity (chống hot-row, bloat, contention).
- [ ] **6.2 — Tenant policy ở tầng DB** (RLS thực sự arm cho `JsonBlob`, không chỉ dựa app guard). *(docs/RLS.sql hiện không bảo vệ JsonBlob)*
- [ ] **6.3 — MFA/WebAuthn cho owner/superadmin** + màn quản lý session/device.
- [ ] **6.4 — Account self-service:** đổi email/tên, export dữ liệu, tự xóa tài khoản.
- [ ] **6.5 — Đồng bộ tài liệu** (README, ARCHITECTURE, STORAGE) với runtime hiện tại (Prisma đã nối, không dùng BullMQ/Redis/TanStack như mô tả cũ).
- [ ] **6.6 — Pagination cho danh sách admin** (hiện lấy toàn bộ); UI audit log đầy đủ.

---

## Điều kiện "sẵn sàng go-live public" (checklist cổng cuối)

Chỉ mở SaaS công khai khi TẤT CẢ có bằng chứng:

- [ ] Không còn Critical mở; mọi High đã fix hoặc có risk-acceptance ghi rõ owner + hạn.
- [ ] Owner được bootstrap trước public ingress; không còn "first request wins" (2.1).
- [ ] Next/Node ở phiên bản còn support; `npm audit --omit=dev` không còn High chưa chấp nhận (1.3, 1.4).
- [ ] Merged Compose không lộ `0.0.0.0:3000`; chỉ nginx/Caddy nhận traffic (0.4).
- [ ] Runtime bắt buộc PostgreSQL; app DB role không phải superuser (0.2, 4.1).
- [ ] Xóa Biz thật sự xóa/thu hồi data + share + media; test 404 sau xóa (1.1).
- [ ] Mọi entitlement/quota enforce server-side + fail-closed (1.2).
- [ ] Backup DB + volume + `ENCRYPTION_KEY` có offsite + alert + restore drill gần nhất thành công (3.1–3.3).
- [ ] Có monitoring app/DB/disk/worker/error/backup-age/TLS (3.4, 3.5).
- [ ] E2E hành trình chính + tenant-isolation chạy trên PG thật trong CI/staging (5.2, 5.3).

---

## Phụ lục — Bản đồ mã lỗi ↔ nguồn phát hiện

| Mã | Nguồn | Đã verify (commit `fccd826`) | Mục lộ trình |
|---|---|:---:|---|
| C-01 | Codex | ✅ | 2.1 |
| C-02 | Codex | ✅ (chỉ path Caddy) | 0.4 |
| H-01 | Codex | ✅ (`next 14.2.35`) | 1.3, 1.4 |
| H-02 | Codex + Claude | ✅ | 1.1 |
| H-03 | Codex | — (thiết kế) | 4.1 |
| H-04 | Codex | ✅ (default file) | 0.1, 0.2 |
| H-05 | Codex | ✅ (Caddyfile không scrub) | 0.3 |
| H-06 | Codex | ✅ (secret local file) | 0.5, 3.1, 3.3 |
| H-07 | Codex + Claude | ✅ | 2.3 |
| H-08 | Codex | ✅ (không gọi canAddCms) | 1.2 |
| H-09 | Codex | — (runbook) | 5.1 |
| entitlement fail-open | Codex + Claude | ✅ (`providers.ts:46,66`) | 1.2 |
| M-01…M-08 | Codex | một phần | Pha 2/4/5 |
| Backup không trong repo | Claude | ✅ | 3.1 |
| Không structured logging | Claude + Codex | ✅ | 3.4 |
| Redis khai báo nhưng không dùng | Claude | ✅ | 4.9 |

_Cập nhật lần cuối: khởi tạo. Chỉnh cột Trạng thái/Người làm/Ngày khi tiến hành._
