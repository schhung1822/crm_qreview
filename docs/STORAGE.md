# Lớp lưu trữ (Storage) — file (mặc định) ↔ Prisma/Postgres

Ứng dụng đọc/ghi dữ liệu qua **lớp repository** trừu tượng (`src/lib/data/repos/`),
có 2 driver:

| Driver | Khi nào | Lưu ở |
|--------|---------|-------|
| `file` (mặc định) | Zero-setup, self-host nhỏ | `.data/*.json` (hoặc `DATA_DIR`) |
| `prisma` | SaaS / nhiều instance | PostgreSQL qua Prisma |

Chọn driver bằng env:
```bash
# Mặc định (không cần đặt gì) → file
STORAGE_DRIVER=prisma          # bật Postgres
DATABASE_URL=postgresql://...  # bắt buộc khi prisma
DATA_DIR=/var/lib/seogeo       # (driver file) đổi thư mục lưu, mặc định ./.data
```

## Kiến trúc

```
routes / domain (auth, store/*)
        │  gọi
        ▼
  getRepos(): Repositories      ← src/lib/data/repos/index.ts (chọn driver theo env)
   ├── fileRepositories         ← repos/file.ts   (json-store: atomic + lock)
   └── prismaRepositories       ← repos/prisma.ts (Prisma client)
```

- `repos/types.ts` — hợp đồng (interface) ở **mức lưu trữ** (CRUD record). Logic nghiệp
  vụ (mã hóa credential, băm mật khẩu, bảo vệ owner…) vẫn nằm ở `auth/*` và `store/*`.
- Cả 2 driver trả về **cùng kiểu record** (`ArticleRecord`, `ConnectionRecord`, …) nên
  nơi gọi không cần biết đang dùng driver nào.

## Trạng thái hiện tại

Driver `prisma` đã **viết xong và typecheck**, nhưng **CHƯA được nối vào** các hàm
`store/*`/`auth/*` (chúng vẫn ghi file trực tiếp). Đây là chủ ý: bật khi đã có Postgres.

## Cách RÁP Postgres khi sẵn sàng

1. **Tạo client + DB schema**
   ```bash
   npm run prisma:generate          # sinh client từ prisma/schema.prisma (offline)
   npx prisma migrate dev -n init   # tạo bảng (cần DATABASE_URL trỏ tới Postgres)
   ```
   (Có sẵn Postgres qua Docker: `docker compose up -d db`.)

2. **Nối domain vào repository.** Trong từng module `store/*` và `auth/*`, thay phần
   đọc/ghi file trực tiếp bằng `const r = await getRepos()` rồi gọi `r.articles.*`,
   `r.users.*`, … Chữ ký hàm public **giữ nguyên** nên route không phải sửa. Ví dụ
   `upsertArticle`:
   ```ts
   import { getRepos } from '@/lib/data/repos';
   export async function upsertArticle(input) {
     const r = await getRepos();
     if (input.id && (await r.articles.get(input.id))) {
       return (await r.articles.update(input.id, input))!;
     }
     const record = buildArticleRecord(input);   // logic dựng record giữ nguyên
     await r.articles.insert(record);
     return record;
   }
   ```

3. **Bật driver:** đặt `STORAGE_DRIVER=prisma` + `DATABASE_URL`, restart.

4. **(Tùy chọn) Di trú dữ liệu** từ `.data/*.json` sang Postgres: viết script đọc từng
   file rồi gọi `prismaRepositories.<entity>.insert(...)`.

## Multi-tenant (SaaS) sau này

Schema đã có sẵn cột `orgId String?` ở các bảng theo tenant (Connection, Article,
KeywordSet, Plan). Khi làm SaaS: thêm bảng `Organization`, gán `orgId`, và thêm tham số
`orgId` vào các method repo để lọc theo tenant.

## Test

`tests/repos-file.test.ts` kiểm tra driver `file` (CRUD, chống trùng email, session hết
hạn, config) bằng `DATA_DIR` tạm — không đụng `.data` thật.
```

