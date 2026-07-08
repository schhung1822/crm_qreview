# Di trú kho dữ liệu: file-JSON → PostgreSQL (GĐ2)

> Runbook thực thi cho việc chuyển SEO-GEO từ kho file `.data/*.json` (single-instance)
> sang PostgreSQL, để bỏ ràng buộc "một instance" và mở đường scale ngang + backup/HA.
>
> Trạng thái hiện tại: **2A xong** (schema Prisma đầy đủ ở `prisma/schema.prisma`).
> Các bước 2B–2F dưới đây là công việc còn lại, làm **tăng dần + kiểm thử giữa mỗi bước**.

## 0. Bối cảnh & bất biến

- Lớp repo đã có sẵn khung: `src/lib/data/repos/{index,file,prisma,types}.ts`, chọn driver
  qua `STORAGE_DRIVER` (`file` mặc định | `prisma`). **Hiện chưa file nào import lớp này** —
  các store vẫn gọi thẳng `mutateJson(bizFile(...))`.
- **Cô lập biz** hiện dựa vào thư mục vật lý `.data/biz/<bizId>/`. Trên Postgres, cô lập
  thành cột `bizId` (bắt buộc) + index. **Đây là rủi ro số 1**: quên một `where bizId` =
  rò dữ liệu chéo tenant. Bù lại bằng: (a) lớp repo tự chèn `bizId`, (b) RLS (mục 3).
- Không đổi hành vi tầng route/UI: chữ ký các hàm store giữ nguyên; chỉ đổi phần ruột
  từ file JSON sang Prisma.

## 1. Bảng phân loại (khớp `prisma/schema.prisma`)

| Nhóm | Bảng | Nguồn `.data` |
|---|---|---|
| Toàn cục | `User`, `Session` | `users.json`, `sessions.json` |
| Toàn cục | `Biz`, `BizMember` | `bizes.json` (members lồng trong biz) |
| Toàn cục | `Subscription`, `Order`, `Coupon` | `subscriptions.json`, `orders.json`, `coupons.json` |
| Toàn cục | `Notification` | `.data/biz/<id>/`? → thực ra theo userId, gom toàn cục |
| Toàn cục | `PlatformConfig` | `branding.json`, `payment-config.json`, `platform-email.json`, `announcements.json`, `plans.json` |
| Thuộc biz | `Connection`, `Article`, `KeywordSet`, `ContentPlan` | `.data/biz/<id>/{connections,articles,keywordsets,plans}.json` |
| Thuộc biz | `Revision`, `PublishJob`, `Comment`, `Citation` | `.data/biz/<id>/{revisions,publish-jobs,comments,citations}.json` |
| Thuộc biz | `ApiToken` | `.data/biz/<id>/api-tokens.json` |
| Thuộc biz | `AiUsage`, `AiUsageSeries`, `AiUsageByUser` | `.data/biz/<id>/ai-usage*.json` |
| Thuộc biz | `BizConfig` (key→JSON) | `.data/biz/<id>/{image-config,article-config,task-routing,cost-config,drive,dataforseo,integrations,ai-secrets,email,tracking-config}.json` |

> Kiểm lại vị trí `notifications.json` và `api-tokens.json` trong `.data` thực tế trước khi
> viết script di trú (mục 4) — nếu chúng nằm dưới `.data/biz/<id>/` thì gom theo bizId, nếu
> nằm ở gốc thì xử lý như toàn cục.

## 2. Bước 2B — Triển khai `prismaRepositories`

Mở rộng `src/lib/data/repos/types.ts` để phủ TẤT CẢ thực thể (hiện chỉ có users, sessions,
connections, articles, keywordSets, plans, config). Bổ sung repo cho: biz, subscription,
order, coupon, notification, revision, publishJob, comment, apiToken, aiUsage, citation,
bizConfig, platformConfig.

Yêu cầu bắt buộc với mỗi repo THUỘC BIZ:
- **Tự lấy `bizId` từ ngữ cảnh** (`activeBizId()` / ALS) và chèn vào mọi `where` + `create`.
  KHÔNG để chỗ gọi truyền query thô → không thể quên lọc tenant.
- Chuẩn hóa kiểu: `DateTime` (Prisma) ↔ ISO string (interface hiện tại) tại biên repo, để
  tầng trên không đổi.

```ts
// Ví dụ khung ArticlesRepo (prisma):
articles: {
  async list() {
    const bizId = requireBizId();
    return (await prisma.article.findMany({ where: { bizId } })).map(toIso);
  },
  async upsert(input) {
    const bizId = requireBizId();
    return toIso(await prisma.article.upsert({
      where: { id: input.id ?? '' },
      create: { ...input, bizId },
      update: stripBizId(input), // KHÔNG cho đổi bizId
    }));
  },
}
```

## 3. Bước 2B+ — Row-Level Security (lưới an toàn)

Bật RLS trên mọi bảng thuộc biz. Ngay cả khi một query quên `where bizId`, Postgres vẫn chặn.

```sql
-- docs/RLS.sql (chạy sau prisma migrate)
ALTER TABLE "Article" ENABLE ROW LEVEL SECURITY;
CREATE POLICY article_isolation ON "Article"
  USING ("bizId" = current_setting('app.current_biz', true));
-- lặp cho: Connection, KeywordSet, ContentPlan, Revision, PublishJob, Comment,
-- ApiToken, AiUsage, AiUsageSeries, AiUsageByUser, Citation, BizConfig.
```

Lớp repo đặt biến phiên đầu mỗi giao dịch: `SET LOCAL app.current_biz = <bizId>`.
Dùng connection pool riêng cho superadmin (bypass RLS) khi cần thao tác xuyên biz.

## 4. Bước 2E — Script di trú `.data` → Postgres

`scripts/migrate-to-postgres.mjs` (chạy 1 lần, idempotent):

1. Đọc bảng toàn cục: `users.json`, `sessions.json`, `bizes.json`, `subscriptions.json`,
   `orders.json`, `coupons.json`, các `PlatformConfig`. Nạp vào bảng tương ứng.
2. Với `bizes.json`: tách `members[]` lồng nhau ra bảng `BizMember`.
3. Quét MỌI thư mục `.data/biz/*/`: với mỗi `bizId`, nạp từng file JSON vào bảng thuộc biz,
   gán cột `bizId`. Các file cấu hình → `BizConfig(bizId, key=<tên file bỏ .json>, value)`.
4. **Secret**: `encrypted` (connections, ai-secrets) là ciphertext AES-GCM — copy NGUYÊN
   ciphertext, KHÔNG giải mã lại (ENCRYPTION_KEY không đổi → vẫn giải mã được sau di trú).
5. Đối chiếu: in số bản ghi trước (đếm từ JSON) và sau (đếm từ DB) cho từng bảng → phải khớp.
6. Idempotent: dùng `upsert` theo khóa chính để chạy lại an toàn.

```bash
# Thứ tự chạy
export DATABASE_URL=postgresql://...
npx prisma migrate deploy          # tạo bảng
node scripts/migrate-to-postgres.mjs   # nạp dữ liệu + đối chiếu
psql "$DATABASE_URL" -f docs/RLS.sql   # bật RLS
```

## 5. Bước 2C — Nối lớp repo vào store (theo nhóm, có kiểm thử)

Thứ tự đề xuất (ít phụ thuộc → nhiều phụ thuộc), mỗi nhóm 1 PR + chạy `npm test`:

1. **auth**: `users`, `sessions` (đã có repo — nối trước để test đường đi).
2. **biz**: `biz` (kèm BizMember) — trái tim cô lập; test kỹ `memberOf`, `resolveActiveBiz`.
3. **billing**: `subscription`, `orders`, `coupons` — cần atomic (mục 6).
4. **content**: `connections`, `articles`, `keywordsets`, `plans`, `revisions`, `comments`.
5. **jobs & usage**: `publish-jobs`, `ai-usage*`, `api-tokens`, `notifications`, `citations`.
6. **config**: 10+ store cấu hình → `BizConfig`/`PlatformConfig`.

Mỗi store: đổi ruột từ `mutateJson(bizFile(...))` sang `getRepos().<repo>`, GIỮ chữ ký hàm.

## 6. Bước 2D — Atomic hóa (đóng các lỗ audit M2/M4/M5)

Sau khi có Postgres, dùng transaction/atomic thay khóa in-process:

- **M4 (race quota token)**: `recordUsage` + kiểm cap trong CÙNG transaction, hoặc dùng
  `UPDATE ... RETURNING` atomic increment; cân nhắc "đặt trước" token ước lượng trước khi gọi AI.
- **M5 (race coupon)**: `UPDATE "Coupon" SET usedCount = usedCount + 1 WHERE code = $1 AND
  (maxUses = 0 OR usedCount < maxUses) RETURNING *` — 0 dòng trả về = hết lượt (không cần đọc trước).
- **M2 (rate-limit/session đa-instance)**: chuyển rate-limit sang Redis (INCR + EXPIRE);
  session đọc/ghi bảng `Session` (đã có index userId + expiresAt).

## 7. Bước 2F — Cutover (cửa sổ bảo trì ngắn)

Với quy mô hiện tại, **big-bang** đơn giản và đủ an toàn (chưa cần dual-write):

1. Bật banner bảo trì, DỪNG ghi (tắt worker cron, đặt app read-only nếu có).
2. Chạy script di trú (mục 4) trên dữ liệu `.data` mới nhất; kiểm đối chiếu số bản ghi.
3. Đặt `STORAGE_DRIVER=prisma` + `DATABASE_URL`; deploy.
4. Khói kiểm (smoke test): đăng nhập, chuyển biz, xem bài, tạo nháp, chạy 1 publish-job.
5. **GIỮ NGUYÊN `.data`** ít nhất 1–2 tuần làm bản lùi. Rollback = bỏ `STORAGE_DRIVER` (về file).
6. Bật lại worker; theo dõi log/metric.

## 8. Sau cutover

- Backup Postgres tự động (pg_dump định kỳ) + diễn tập khôi phục (GĐ5).
- Chạy ≥2 instance sau load balancer → xác nhận rate-limit/quota/session vẫn đúng.
- Cập nhật `CLAUDE.md`: đổi mô tả stack sang "Postgres + Prisma (đang chạy)", bỏ đề cập
  BullMQ nếu không dùng; ghi rõ ràng buộc đã gỡ.
- Xóa nhánh chết: nếu file driver không còn cần cho dev, cân nhắc giữ cho test/offline.

## Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| Quên `where bizId` → rò tenant | Repo tự chèn bizId + RLS (mục 3) |
| Sai kiểu Date ↔ ISO | Chuẩn hóa tại biên repo + test round-trip |
| Mất/hỏng secret khi di trú | Copy nguyên ciphertext, không giải mã; giữ ENCRYPTION_KEY |
| Dữ liệu lệch sau cutover | Đối chiếu số bản ghi + smoke test + giữ `.data` làm bản lùi |
| Downtime | Cửa sổ bảo trì ngắn + script idempotent chạy lại được |
