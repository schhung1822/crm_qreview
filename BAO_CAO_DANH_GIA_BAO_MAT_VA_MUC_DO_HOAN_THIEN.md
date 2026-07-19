# Báo cáo đánh giá bảo mật và mức độ hoàn thiện SaaS

**Dự án:** SEO·GEO Platform  
**Ngày đánh giá:** 19/07/2026 (Asia/Bangkok)  
**Phiên bản được đánh giá:** nhánh `main`, commit `fccd826`  
**Mô hình triển khai dự kiến:** VPS + Docker + PostgreSQL + reverse proxy HTTPS  
**Kết luận ngắn:** sản phẩm đã vượt MVP và phù hợp cho beta kỹ thuật/closed beta, nhưng **chưa nên mở bán SaaS công khai** trước khi xử lý các blocker về bootstrap tài khoản đầu tiên, dependency Next.js, cấu hình Compose production, vòng đời xóa tenant và quyền PostgreSQL.

---

## 1. Kết quả tổng quan

### Điểm chính thức của dự án: **66,5/100**

Điểm trên là trung bình có trọng số, trong đó bảo mật, dữ liệu và vận hành production được ưu tiên cao hơn tài liệu hoặc độ đẹp giao diện:

`Điểm dự án = Σ(điểm tiêu chí × trọng số) / 100 = 66,52 ≈ 66,5`

Nếu coi 12 tiêu chí có trọng số bằng nhau, điểm tham khảo là **65,8/100**. Báo cáo dùng **66,5/100** làm điểm chính thức.

| # | Tiêu chí | Trọng số | Điểm /100 | Điểm quy đổi |
|---:|---|---:|---:|---:|
| 1 | Độ phủ tính năng lõi và workflow | 12% | 88 | 10,56 |
| 2 | UX, onboarding, i18n và trạng thái lỗi | 8% | 76 | 6,08 |
| 3 | Nền tảng SaaS: tenant, team, account, admin | 10% | 78 | 7,80 |
| 4 | Billing, quota và entitlement | 8% | 62 | 4,96 |
| 5 | Xác thực, session, RBAC và tenant isolation | 12% | 68 | 8,16 |
| 6 | Bảo mật ứng dụng/API, dependency và secret | 12% | 58 | 6,96 |
| 7 | PostgreSQL, tính toàn vẹn và vòng đời dữ liệu | 10% | 50 | 5,00 |
| 8 | Docker, reverse proxy, migration và deploy | 8% | 48 | 3,84 |
| 9 | Reliability, backup/restore, monitoring | 8% | 52 | 4,16 |
| 10 | Test, CI và chất lượng kỹ thuật | 7% | 82 | 5,74 |
| 11 | Tài liệu và khả năng bảo trì | 3% | 72 | 2,16 |
| 12 | Hiệu năng và khả năng mở rộng | 2% | 55 | 1,10 |
|  | **Tổng** | **100%** |  | **66,52** |

### Mức trưởng thành

| Mảng | Nhận định |
|---|---|
| Sản phẩm | **Tốt** — feature set rộng, các hành trình chính đã có implementation thật |
| Bảo mật ứng dụng | **Trung bình khá** — nhiều lớp phòng vệ tốt, nhưng còn blocker/CVE quan trọng |
| SaaS/commercial | **Khá** — tenant, team, plan, billing, admin đã có; entitlement còn lỗ hổng |
| Production/DevOps | **Trung bình yếu** — Docker cơ bản tốt nhưng cấu hình production và vận hành còn rủi ro |
| Chất lượng mã | **Tốt** — build, lint, typecheck và 350 test đều pass |

**Quyết định go-live tại thời điểm audit: `NO-GO` cho public SaaS.** Điểm số không thay thế “cổng blocker”: chỉ cần còn một Critical chưa xử lý thì vẫn không nên nhận dữ liệu/thanh toán của khách thật. Có thể dùng cho closed beta với người dùng tin cậy, giới hạn truy cập và giám sát thủ công.

---

## 2. Phạm vi và phương pháp

Đã rà soát:

- 36 trang App Router và 159 API route.
- Authentication, session, email verification/reset, RBAC per-Biz, superadmin và API token.
- Tenant isolation ở lớp guard, file store, `JsonBlob` PostgreSQL và tài liệu RLS.
- Billing, plan, quota, Sepay webhook, coupon và entitlement.
- Outbound fetch/SSRF, upload, XSS, CSRF, rate limiting và secret encryption.
- Dockerfile, ba file Compose, Caddy, worker, healthcheck, Prisma schema/migration và backup runbook.
- CI, unit/security test, i18n, build production và dependency audit.

Các lệnh kiểm chứng chính:

| Kiểm tra | Kết quả |
|---|---|
| `npm test` | **PASS — 41 file, 350/350 test** |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS — không warning/error** |
| `npm run check:i18n` | **PASS — 10 locale, 2.748 key/locale** |
| `npm run build` | **PASS — production build hoàn tất** |
| `npm audit --omit=dev --json` | **FAIL — 2 package mức High, 1 Moderate, 0 Critical** |
| Render `docker compose ... config` cho prod | **FAIL — tồn tại đồng thời public port 3000 và localhost port 3000** |
| Render Compose cho overlay VPS/nginx | **PASS — port 3000 chỉ bind `127.0.0.1`** |
| Smoke test local `/`, `/login`, `/api/healthz` | **PASS — HTTP 200** |

### Giới hạn đánh giá

- Đây là static review + local build/test + dependency/Compose audit; chưa phải penetration test đầy đủ trên VPS thật.
- Kết nối điều khiển trình duyệt trong phiên audit không khởi tạo được. Vì vậy chỉ thực hiện HTTP smoke test, chưa có E2E browser/visual regression hoàn chỉnh.
- Chưa kiểm thử tải, failover, restore trên staging, DAST hoặc scan image Docker sau build.
- Người vận hành xác nhận đã có **tự động backup**. Báo cáo đã cộng điểm cho thông tin này, nhưng repository không chứa artifact triển khai hay bằng chứng `last-success`, offsite copy và restore drill; các phần đó vẫn được đánh dấu “cần xác minh”.

---

## 3. Chấm điểm chi tiết

### 3.1. Độ phủ tính năng lõi và workflow — 88/100

Điểm mạnh:

- Hành trình end-to-end khá đầy đủ: keyword research → content plan → AI draft/edit/optimize → review → publish/schedule → report.
- Có SEO/AEO/GEO scoring, backlink, citations, translation, image generation/library, landing audit, social report và script analysis.
- Hỗ trợ WordPress, Wix, Shopify, Haravan và Sapo tại `src/app/api/connections/route.ts:21-30`.
- Publish có dry-run/xác nhận, revision, schedule, retry và worker.
- Admin platform rộng: user, Biz, plan, order, coupon, payment, email, announcement, tracking, token và prompt.

Khoảng trống:

- Một số kênh/tích hợp vẫn được tài liệu mô tả là chưa hoàn thiện, ví dụ Zalo/Messenger.
- Chưa có Search Console/performance data thực sự dù README đã nêu trong roadmap.
- Một số tính năng tích hợp ngoài phụ thuộc mock/fallback nên “UI chạy được” chưa đồng nghĩa “production integration đã được chứng nhận”.

### 3.2. UX, onboarding, i18n và trạng thái lỗi — 76/100

Điểm mạnh:

- Có onboarding tạo workspace, welcome tutorial, setup checklist, global error boundary, loading skeleton và not-found.
- 10 ngôn ngữ đồng bộ hoàn toàn theo automated check.
- Landing, login và health endpoint render thành công trong smoke test.

Khoảng trống:

- Một số lỗi fetch có thể để UI quay spinner vô hạn hoặc thất bại im lặng, ví dụ trang Biz, Account và Billing (`src/app/[locale]/biz/page.tsx:54`, `src/app/[locale]/account/page.tsx:37`, `src/app/[locale]/billing/page.tsx:167`).
- Thao tác switch/create Biz trong shell chưa luôn hiển thị lỗi rõ cho người dùng (`src/components/AppFrame.tsx:106`).
- Chưa có browser E2E, accessibility audit tự động, visual regression hoặc UX telemetry.
- Một số bundle trang lớn, ví dụ Guide/Admin, cần theo dõi trên thiết bị yếu.

### 3.3. Nền tảng SaaS: tenant, team, account, admin — 78/100

Điểm mạnh:

- Multi-workspace, member role per-Biz, custom permission, suspended Biz, task/review/comment và budget đã có.
- Guard kiểm membership mỗi request và sửa cookie Biz không hợp lệ (`src/lib/auth/current.ts:76-151`).
- Admin platform có phạm vi chức năng rộng và API admin riêng có token/scope/audit.

Khoảng trống:

- “Mời thành viên” chưa phải invitation workflow: admin tạo ngay account, tự đặt mật khẩu rồi gửi chính mật khẩu đó qua email (`src/app/api/biz/[id]/members/route.ts:65-72,105-120`). Thiếu pending/accept/expiry/resend/revoke.
- Account self-service còn ít: chưa tự đổi email/tên, quản lý thiết bị/session, MFA, export hoặc tự xóa dữ liệu.
- Danh sách admin còn chỗ lấy toàn bộ dữ liệu thay vì pagination; audit log chưa có UI đầy đủ.

### 3.4. Billing, quota và entitlement — 62/100

Điểm mạnh:

- Có trial, 5 plan, quota, overage, coupon, Sepay QR/webhook, polling trạng thái thanh toán và activation.
- Có giới hạn số Biz, seat, social report và feature flag theo plan.

Vấn đề chính:

- `canAddCms()` có triển khai (`src/lib/billing/entitlement.ts:121-126`) nhưng route tạo connection không gọi nó (`src/app/api/connections/route.ts:32-50`). Khách có thể vượt `maxCmsConnections`, kể cả gói Free có giới hạn 0.
- Model/quota AI đang **fail-open** nếu đọc entitlement lỗi (`src/lib/ai/providers.ts:38-60`), tạo rủi ro chi phí/doanh thu trong sự cố storage/DB.
- Billing UI chưa hoàn chỉnh cho invoice, lịch sử order, self-cancel/downgrade/refund/payment method.
- Một số feature flag chưa đồng bộ đầy đủ với màn hình/schema chỉnh plan.

### 3.5. Xác thực, session, RBAC và tenant isolation — 68/100

Điểm mạnh:

- Password tài khoản dùng async scrypt + salt; so sánh constant-time.
- Session token 256-bit, chỉ lưu SHA-256 hash; cookie `HttpOnly`, `Secure` ở production, `SameSite=Lax`, TTL 7 ngày.
- Reset/verify token một lần, hash-at-rest, có hạn; self-change/reset hủy các session cũ.
- RBAC per-Biz khá chặt; owner/admin/editor/viewer và permission tùy chỉnh được tính lại server-side.
- Cookie Biz giả hoặc membership cũ bị từ chối.

Blocker làm giảm điểm:

- **Fresh-instance bootstrap là “first request wins”.** `/api/auth/register` và `/api/auth/setup` công khai khi chưa có user. Tài khoản đầu tiên được ép thành owner và verified (`src/app/api/auth/register/route.ts:39-65`, `src/app/api/auth/setup/route.ts:15-29`, `src/lib/auth/users.ts:111-124`). Nếu attacker đăng ký trước bằng email nằm trong `SUPERADMIN_EMAILS`, họ chiếm quyền platform admin.
- Superadmin reset password không hủy session cũ (`src/app/api/admin/users/route.ts:35-40`), nên session đã bị đánh cắp vẫn sống sau incident reset.
- Chưa có MFA/WebAuthn cho owner/superadmin.

### 3.6. Bảo mật ứng dụng/API, dependency và secret — 58/100

Điểm mạnh:

- AES-256-GCM cho credential; production fail-fast nếu `ENCRYPTION_KEY` không hợp lệ.
- SSRF helper có kiểm IPv4/IPv6/NAT64, DNS pinning, redirect revalidation và giới hạn body stream.
- Markdown renderer escape HTML/attribute và chặn scheme nguy hiểm ở link chính.
- Zod được dùng rộng, upload có giới hạn và ảnh được xử lý qua Sharp.
- CSRF Origin check, security headers, token hash-at-rest, scoped admin API và security tests đều có.

Rủi ro lớn:

- Lockfile dùng **Next.js 14.2.35**, hiện ngoài support và nằm trong phạm vi nhiều advisory. Đặc biệt [GHSA-c4j6-fc7j-m34r](https://github.com/vercel/next.js/security/advisories/GHSA-c4j6-fc7j-m34r) là SSRF qua crafted WebSocket upgrade cho self-hosted Node server — đúng mô hình Docker/Caddy này. Bản vá tối thiểu: 15.5.16 hoặc 16.2.5; nên nâng lên Next 16.x được hỗ trợ.
- Node 20 trong Dockerfile/CI đã EOL ngày 24/03/2026; production nên dùng LTS còn hỗ trợ, ưu tiên Node 24.
- CI chỉ hard-fail dependency ở mức Critical, còn High được cho qua (`.github/workflows/ci.yml:51-70`).
- `clientIp()` ưu tiên header `X-Real-IP` (`src/lib/security/rate-limit.ts:71-83`) trong khi Caddyfile không xóa/ghi đè header này; client có thể spoof để vượt limiter.
- Public share unlock dùng `scryptSync` trên Node event loop và limiter in-memory theo IP spoofable (`src/lib/store/social-shares.ts:20-30`, `src/app/api/share/[token]/unlock/route.ts:24-38`).
- CSP hiện chủ yếu chỉ có `frame-ancestors`; chưa có nonce-based `script-src`/`style-src` (`next.config.mjs:5-16`).
- Chưa có ingress body-size limit toàn cục; webhook/auth route vẫn phải parse body trước khi validation hoàn tất.

### 3.7. PostgreSQL, tính toàn vẹn và vòng đời dữ liệu — 50/100

Điểm mạnh:

- `JsonBlob` backend dùng transaction + `SELECT ... FOR UPDATE`, tránh lost update đa instance (`src/lib/data/json-store.ts:99-126`).
- Có migration baseline, script di trú và cơ chế rollback về file store.
- Tenant key được tách theo `scope=bizId`; route/guard có test isolation.

Rủi ro:

- Runtime chủ yếu dùng `JsonBlob`, không dùng các bảng quan hệ đã mô hình hóa. RLS trong `docs/RLS.sql` không bảo vệ `JsonBlob`; tài liệu VPS cũng thừa nhận RLS runtime chưa arm (`docs/SELF-HOST-VPS.md:430-432`).
- App kết nối bằng chính `POSTGRES_USER=seogeo`; role này do official image tạo có quyền superuser/table owner. Compromise app credential đồng nghĩa compromise toàn cluster và bypass RLS.
- `deleteBiz()` chỉ xóa record Biz và thư mục local (`src/lib/store/biz.ts:270-274`). Ở Prisma mode nó không xóa các `JsonBlob` có `scope=bizId`, không revoke index share global và không dọn media. Link share cũ có thể vẫn đọc nội dung “đã xóa”. Đây là rủi ro privacy/compliance cao.
- `ai-secrets`, Drive và DataForSEO vẫn đọc/ghi file trực tiếp (`src/lib/secrets/store.ts:107-120`, `src/lib/store/drive.ts:21-32`, `src/lib/store/dataforseo.ts:19-30`) kể cả khi app dùng PostgreSQL.
- Blob JSON lớn bị rewrite nguyên hàng; tenant lớn có thể tạo hot row, bloat và contention.

### 3.8. Docker, reverse proxy, migration và deploy — 48/100

Điểm mạnh:

- Docker multi-stage, standalone output, app/worker chạy non-root, healthcheck và restart policy.
- PostgreSQL/Redis không publish port trực tiếp.
- Caddy có HTTPS tự động; overlay VPS/nginx bind app vào `127.0.0.1` đúng cách.
- Secret bắt buộc được fail-fast ở Compose production.

Blocker:

- Base Compose publish `3000:3000` (`docker-compose.yml:7-8`). Overlay Caddy production thêm `127.0.0.1:3000:3000` (`docker-compose.prod.yml:16-18`) nhưng không `!override`/`!reset`. Kết quả `docker compose ... config` có **cả hai mapping**. Có thể gây bind conflict hoặc vẫn expose port 3000, cho phép bypass Caddy. Overlay `docker-compose.vps.yml:18-21` đã làm đúng bằng `!override`.
- Production vẫn mặc định `STORAGE_DRIVER=file` (`docker-compose.yml:27-30`). Nếu operator quên env, app vẫn healthy nhưng pg_dump không chứa dữ liệu nghiệp vụ.
- Runbook migration dùng raw `psql`, thiếu transaction/schema-history chuẩn; baseline không có `BEGIN/COMMIT`. CI chưa smoke-test migration trên Postgres thật.
- Runbook sinh `POSTGRES_PASSWORD` bằng base64 rồi chèn trực tiếp vào URL. Ký tự đặc biệt phải percent-encode theo Prisma; nên dùng hex/base64url hoặc URL-encode.
- Image tag/action chưa pin digest; Dockerfile dùng `npm install` thay vì `npm ci`, làm build kém tái lập.

### 3.9. Reliability, backup/restore và monitoring — 52/100

Điểm đã cộng:

- Người vận hành xác nhận có automatic backup.
- Có DB/app healthcheck, restart policy, worker và runbook pg_dump/restore/offsite.
- Health endpoint kiểm DB với timeout khi driver là Prisma.

Điểm còn thiếu/chưa xác minh:

- Cần bằng chứng backup gần nhất thành công, retention, checksum, mã hóa, offsite copy và restore drill định kỳ.
- Backup PostgreSQL **không đủ một mình**: phải backup cả `app-data`, `app-media` và lưu an toàn `ENCRYPTION_KEY`, vì một số secret vẫn ở volume local.
- Chưa có RPO/RTO chính thức, PITR/WAL, cảnh báo backup stale/fail hoặc giám sát dung lượng.
- Worker không có heartbeat/healthcheck; `setInterval` có thể chồng request nếu tick trước chưa kết thúc (`scripts/worker.mjs:14-37`).
- Chưa có structured logging, request/correlation ID, error tracking, metrics, alerting hay log rotation.
- Compose chưa đặt CPU/RAM/PID limit, `no-new-privileges`, `cap_drop`, read-only filesystem hoặc log size cap.

### 3.10. Test, CI và chất lượng kỹ thuật — 82/100

Điểm mạnh:

- 350/350 test pass; có test riêng cho SSRF, rate limit, webhook auth, permission, Biz cookie/context, email verification và image isolation.
- TypeScript, lint, i18n và production build đều pass.
- CI có gitleaks full history và dependency audit.
- Code có nhiều defense-in-depth và comment kỹ ở các điểm nhạy cảm.

Khoảng trống:

- Chưa có Playwright/Cypress E2E cho hành trình signup → Biz → billing → content → publish.
- Chưa có integration test với PostgreSQL thật, migration/restore test, Compose test hoặc container/image scan.
- Chưa có coverage threshold, load/soak test, chaos/failover test hoặc DAST.
- CI không chạy `npm run build`/Docker build và không phát hiện được lỗi merge ports.

### 3.11. Tài liệu và khả năng bảo trì — 72/100

Điểm mạnh:

- Có README, architecture, deployment, self-host, storage, PostgreSQL migration, security policy, user guide và API guide đa ngôn ngữ.
- Nhiều runbook thực tế cho firewall, TLS, backup và restore.

Vấn đề:

- Tài liệu bị lệch phiên bản: `README.md:122-127` và `docs/STORAGE.md:35-39` vẫn nói Prisma chưa nối, trong khi runtime đã có blob backend PostgreSQL.
- `docs/ARCHITECTURE.md` mô tả một số thành phần như BullMQ/Redis/TanStack Query nhưng dependency/runtime hiện không dùng tương ứng.
- Checklist security trong tài liệu còn các item đã sửa xong, làm người vận hành khó biết đâu là nợ thật.
- Một số cam kết “xóa toàn bộ dữ liệu” không khớp hành vi Prisma hiện tại.

### 3.12. Hiệu năng và khả năng mở rộng — 55/100

Điểm mạnh:

- Standalone build, worker tách service, DB transaction đa instance và healthcheck là nền tảng tốt.
- Có timeout/rate limit cho nhiều workload AI/scrape/upload.

Rủi ro:

- `JsonBlob` rewrite nguyên collection tạo hot row và giới hạn scale theo kích thước tenant.
- Một số limiter/resource throttle còn in-memory; scale ngang làm tổng hạn mức tăng theo số replica.
- Public share dùng synchronous scrypt; worker có thể overlap.
- Fixed host port 3000 khiến lệnh `--scale app=2` trong runbook không khả thi nếu chưa đổi network/port model.
- Chưa có benchmark, query/row-size monitoring, connection-pool tuning hoặc capacity plan cho VPS.

---

## 4. Danh sách phát hiện ưu tiên

### Critical / Go-live blocker

| ID | Phát hiện | Tác động | Khắc phục bắt buộc |
|---|---|---|---|
| C-01 | Fresh instance cho request đăng ký đầu tiên thành owner; có thể chiếm superadmin nếu dùng email đã cấu hình | Chiếm toàn bộ nền tảng trước khi chủ thật bootstrap | Seed owner offline hoặc dùng `BOOTSTRAP_SECRET` một lần; đóng endpoint setup trước khi public |
| C-02 | Compose Caddy production merge cả `0.0.0.0:3000` và `127.0.0.1:3000` | Bind conflict hoặc bypass TLS/proxy/security controls | Với Caddy dùng `ports: !reset []`; hoặc `!override` và CI assert merged config |

### High

| ID | Phát hiện | Tác động | Khắc phục |
|---|---|---|---|
| H-01 | Next 14.2.35 unsupported và dính SSRF WebSocket/RSC DoS advisories; Node 20 EOL | SSRF nội bộ, DoS, không còn security support | Nâng Node 24 LTS + Next 16.x đã vá; tạm thời block WebSocket upgrade nếu không dùng và giới hạn egress |
| H-02 | Xóa Biz không xóa `JsonBlob`, share index và media | Dữ liệu/link công khai tồn tại sau khi “xóa” | Transactional tenant purge + revoke share + media cleanup + test Postgres |
| H-03 | App dùng PostgreSQL superuser; RLS không bảo vệ runtime `JsonBlob` | App compromise thành DB cluster compromise; thiếu DB defense-in-depth | Tách migration role và `seogeo_app` least privilege; thiết kế policy cho `scope` hoặc chuyển bảng quan hệ |
| H-04 | Production có thể chạy file mode dù PostgreSQL/backup vẫn “xanh” | Backup nhầm DB rỗng, mất dữ liệu khi volume hỏng | Prod hard-code/fail-fast `STORAGE_DRIVER=prisma`; readiness kiểm schema và driver |
| H-05 | Có thể spoof `X-Real-IP` qua Caddy | Vượt rate limit, brute force/DoS | Caddy remove/overwrite header; app chỉ tin proxy/header chuẩn đã scrub |
| H-06 | Secret AI/Drive/DataForSEO vẫn ở volume local trong Prisma mode | pg_dump không bao phủ toàn bộ dữ liệu cần khôi phục | Chuyển qua `json-store`/DB hoặc backup `app-data` + key, kiểm restore |
| H-07 | Public share unlock dùng sync scrypt + limiter yếu | Event-loop DoS | Async scrypt/Argon2, shared limiter theo token+IP, body/password cap |
| H-08 | `maxCmsConnections` không enforce; entitlement AI fail-open | Bypass gói và phát sinh chi phí | Enforce server-side mọi quota; fail-closed với lỗi entitlement |
| H-09 | Migration production thủ công, không tracking/transaction | Partial schema, deploy không tái lập | One-shot migrator chạy `prisma migrate deploy`; Postgres integration CI |

### Medium

| ID | Phát hiện | Khắc phục |
|---|---|---|
| M-01 | Admin reset password không revoke session cũ | Gọi `destroySessionsForUser()` sau reset/suspend/role-sensitive changes |
| M-02 | Gửi mật khẩu nhân viên plaintext qua email | Invitation token một lần, expiry/revoke, user tự đặt mật khẩu |
| M-03 | Share password không có minimum; đổi password không revoke access cookie 7 ngày | Min length, password version trong HMAC/cookie, revoke khi đổi |
| M-04 | Không có global body-size cap; một số fetch đọc body lớn trước khi cắt | Caddy `request_body` limit + streaming hard cap/abort |
| M-05 | CSP chưa đầy đủ | Nonce-based CSP, allowlist scheme/url cho HTML report |
| M-06 | Thiếu resource limit/log rotation/observability | Compose limit, JSON log, Sentry/OTel, uptime/backup/disk alerts |
| M-07 | Backup chưa có bằng chứng offsite/restore drill trong repo | Theo dõi last-success, checksum, encryption, restore staging định kỳ |
| M-08 | Docs không đồng bộ runtime | Chọn một source-of-truth và cập nhật trong cùng PR với code |

---

## 5. Điểm mạnh bảo mật đã xác nhận

- Không phát hiện SQL injection trực tiếp hoặc BOLA rõ ràng ở các route tenant chính.
- Session/token/reset token đều có entropy cao và phần lớn chỉ lưu hash.
- Permission được chốt server-side, không chỉ ẩn UI.
- SSRF helper là một trong những phần tốt nhất của codebase: DNS pinning, private ranges, redirect validation, credential stripping và streaming cap.
- Secret mã hóa bằng AES-256-GCM; production không âm thầm tự sinh key.
- Webhook Sepay có xác thực, API token có scope/revoke/hash-at-rest.
- Docker application chạy non-root và DB không publish port.
- `.env.local` không bị Git track; CI có gitleaks.
- Bộ test bảo mật hiện có mang lại giá trị thực và đều pass.

---

## 6. Kế hoạch xử lý đề xuất

### Trong 72 giờ — đóng blocker

1. Seed owner/superadmin trước khi mở ingress hoặc thêm `BOOTSTRAP_SECRET`; đặt self-registration theo chủ đích ngay từ lần deploy đầu.
2. Nâng Next.js lên bản supported đã vá và chuyển Docker/CI sang Node 24 LTS.
3. Sửa `docker-compose.prod.yml` để app không publish port host khi dùng Caddy; thêm test merged Compose.
4. Production fail-fast nếu không phải `STORAGE_DRIVER=prisma`; readiness phải query `JsonBlob`/migration version.
5. Tạo DB role runtime least privilege, không dùng `POSTGRES_USER` superuser cho app.
6. Sửa purge Biz để xóa DB scope, share/short-link/token/media; kiểm link cũ trả 404.
7. Xóa/ghi đè `X-Real-IP`; chuyển share password hashing sang async và thêm body cap.
8. Enforce `canAddCms()` và đổi entitlement/quota quan trọng sang fail-closed.

### Trước public beta có thanh toán

1. Chuẩn hóa migration bằng `prisma migrate deploy` trong one-shot service/pipeline.
2. Thay gửi password bằng invitation workflow.
3. Admin password reset/suspend phải revoke session.
4. Xác minh backup bao phủ DB + `app-data` + `app-media` + encryption key; chạy restore staging và ghi RPO/RTO.
5. Thêm E2E cho signup/bootstrap, tenant isolation, billing/webhook, content/publish và delete-account/Biz.
6. Thêm Docker build/image scan, Postgres integration test và dependency High gate có allowlist hạn dùng.
7. Bổ sung log rotation, resource limits, uptime/error/worker/backup alerts.

### Trong 30–60 ngày

1. Chuyển dần collection nóng khỏi `JsonBlob` sang bảng quan hệ hoặc benchmark/chia nhỏ blob theo entity/tenant.
2. Thực thi tenant policy ở DB thay vì chỉ dựa vào app guard.
3. Thêm MFA/WebAuthn cho superadmin/owner và màn quản lý session/device.
4. Hoàn thiện invoice/order history, cancel/downgrade/refund và đồng bộ feature schema admin.
5. Chuẩn hóa error state UI, accessibility và visual/browser regression.
6. Đồng bộ README, Architecture, Storage, Security và runbook với runtime hiện tại.

---

## 7. Điều kiện để đổi trạng thái sang “sẵn sàng go-live”

Chỉ nên mở SaaS công khai khi tất cả điều kiện sau có bằng chứng:

- [ ] Không còn Critical mở; mọi High đã sửa hoặc có risk acceptance ghi rõ owner và ngày hết hạn.
- [ ] Tài khoản owner được bootstrap trước public ingress; không còn “first request wins”.
- [ ] Next/Node đang ở phiên bản còn support và `npm audit --omit=dev` không còn High chưa chấp nhận.
- [ ] Merged Compose không publish `0.0.0.0:3000`; chỉ Caddy/nginx nhận traffic Internet.
- [ ] Runtime bắt buộc dùng PostgreSQL và app DB role không phải superuser.
- [ ] Xóa Biz thật sự xóa/thu hồi dữ liệu, share link, token và media; test xác nhận 404 sau xóa.
- [ ] Tất cả entitlement/quota được enforce server-side và fail-closed khi storage lỗi.
- [ ] Backup DB + volume + encryption key có offsite copy, alert và restore drill thành công gần nhất.
- [ ] Có monitoring cho app, DB, disk, worker, error rate, backup age và chứng chỉ TLS.
- [ ] E2E hành trình chính và tenant-isolation test chạy trên PostgreSQL thật trong CI/staging.

---

## 8. Nguồn tham chiếu bên ngoài

- [Next.js Support Policy](https://nextjs.org/support-policy) — Next 14 nằm trong danh sách unsupported tại ngày audit.
- [Next.js GHSA-c4j6-fc7j-m34r](https://github.com/vercel/next.js/security/advisories/GHSA-c4j6-fc7j-m34r) — SSRF qua WebSocket upgrade trên self-hosted Node server.
- [Node.js release schedule](https://nodejs.org/en/about/previous-releases) — Node 20 EOL ngày 24/03/2026.
- [Prisma connection URLs](https://www.prisma.io/docs/orm/reference/connection-urls) — ký tự đặc biệt trong password phải percent-encode.
- [Caddy reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) — WebSocket/header/proxy behavior.
- [PostgreSQL Docker Official Image](https://github.com/docker-library/docs/blob/master/postgres/README.md) — hành vi `POSTGRES_USER` và khởi tạo role.

---

## 9. Kết luận cuối

SEO·GEO Platform có **độ hoàn thiện chức năng cao**, kiến trúc application-level security tốt hơn nhiều dự án cùng giai đoạn và chất lượng code/test đáng ghi nhận. Điểm yếu không nằm ở việc “thiếu màn hình”, mà nằm ở các ranh giới production quan trọng: bootstrap identity, dependency/runtime đã hết support, cấu hình network Docker, quyền PostgreSQL, vòng đời xóa tenant, entitlement và khả năng khôi phục đầy đủ.

**Điểm trung bình cuối cùng: 66,5/100.**  
**Khuyến nghị phát hành: closed beta có kiểm soát; chưa public SaaS cho tới khi đóng Critical và các High liên quan dữ liệu/identity/deploy.**
