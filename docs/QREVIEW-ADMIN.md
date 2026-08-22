# Khu quản trị website Qreview (`/qreview`)

Khu này quản trị **nội dung của website Qreview** — một website review/affiliate chạy
độc lập. Nó KHÔNG liên quan tới nghiệp vụ SEO-GEO của CRM; chỉ mượn khung giao diện,
đăng nhập và phân quyền của CRM để tập trung mọi việc quản trị về một chỗ.

Trước đây khu này nằm trong dự án `Qreview` (thư mục `src/app/(admin)`). Toàn bộ đã
chuyển sang đây; bên `Qreview` chỉ còn website cho khách.

---

## 1. Ranh giới cần nhớ

Có **hai cơ sở dữ liệu** và **hai hệ tài khoản** hoàn toàn tách biệt. Nhầm hai thứ này
là nguồn gốc của gần như mọi lỗi khó hiểu trong khu vực này.

| | CRM | Website Qreview |
|---|---|---|
| CSDL | `crm_qreview`, qua **Prisma** (`DATABASE_URL`) | `qreview`, qua **mysql2** (`QREVIEW_DB_*`) |
| Truy cập trong code | `@/lib/data/*`, `prisma` | `@/lib/qreview/db` |
| Tài khoản | bảng `User` — dùng để **đăng nhập** | bảng `users` — là **độc giả** của website |
| Vai trò | `owner/admin/editor/viewer` + `SUPERADMIN_EMAILS` | `admin/user` (chỉ có ý nghĩa trên website) |

Hai CSDL nằm cùng một máy chủ MySQL nhưng là hai database khác nhau.

**Quyền vào `/qreview` lấy từ CRM, không lấy từ website.** Chỉ email nằm trong
`SUPERADMIN_EMAILS` mới vào được. Màn hình "Người dùng" trong khu này quản lý độc giả
của website — người đang thao tác gần như chắc chắn không có mặt trong danh sách đó.

---

## 2. Bố cục mã nguồn

```
src/app/[locale]/qreview/      # 16 màn hình + layout (cổng kiểm soát) + CSS
src/app/api/qreview/           # 18 route API, thao tác trên CSDL website
src/components/qreview/        # 16 component màn hình + bộ UI dùng chung
src/lib/qreview/               # kết nối CSDL, chốt quyền, tiện ích
```

Điểm quan trọng: **mọi route API đi qua `guardAdminRequest()`** (`src/lib/qreview/api.ts`)
và **mọi truy vấn đi qua `queryRows()`** (`src/lib/qreview/db.ts`). Muốn đổi cách xác
thực hay cách kết nối thì sửa đúng hai chỗ đó, không phải sửa từng route.

Tương tự ở giao diện: 16 màn hình đều dựng từ `src/components/qreview/ui/index.tsx`
(`PageHeader`, `Modal`, `StatusBadge`, `FeedbackBox`, `Field`, `EmptyState`...). Bộ này
được dựng trên component Polaris, nên sửa một chỗ là đổi diện mạo cả 16 màn hình.

---

## 3. Giao diện

Khu này **không viết lại bằng Polaris**; nó giữ nguyên cấu trúc HTML cũ và được phủ
lại màu qua `src/app/[locale]/qreview/qreview-admin.css`.

- Mọi màu bắc cầu qua token Polaris: `--admin-primary: var(--p-color-bg-fill-brand)`,
  `--admin-border: var(--p-color-border)`, v.v. Không còn mã màu ghi cứng. Nhờ vậy khi
  superadmin đổi màu thương hiệu ở "Thông tin hệ thống", khu này đổi theo.
- File CSS này là nguồn Tailwind (`@tailwind`, `@apply`). Đó là lý do dự án có
  `tailwind.config.ts` + `postcss.config.mjs`. Tailwind **chỉ** quét hai thư mục
  `qreview` và **tắt `preflight`** — bật preflight sẽ reset CSS toàn cục và phá Polaris
  ở mọi trang. Đừng nới `content` ra ngoài hai thư mục đó.
- Khung trang là `Page` của Polaris (`src/components/qreview/PageShell.tsx`), nằm trong
  `AppFrame` chung của CRM.

---

## 4. Ảnh: vì sao phải đi vòng qua website

Nội dung website lưu **đường dẫn tương đối** (`/images/products/abc.webp`). Trình duyệt
đọc đường dẫn đó theo tên miền đang mở. Vì vậy:

- **Tải ảnh lên**: `/api/qreview/uploads` KHÔNG lưu tệp. Nó xác thực superadmin rồi
  chuyển tiếp sang `/api/uploads` của website (ký bằng `QREVIEW_ADMIN_TOKEN`). Tệp nằm
  trên máy chủ website — nơi duy nhất phục vụ được nó. Route nhập ảnh ngoài của bài viết
  dùng chung đường này qua `src/lib/qreview/upload-to-site.ts`.
- **Hiển thị ảnh**: `next.config.mjs` có rewrite `/images/:folder/:path*` trỏ về website.
  Quy tắc này cố ý đòi **ít nhất hai đoạn** đường dẫn — ảnh của chính CRM nằm phẳng ngay
  dưới `/images/` (`logo_amban.webp`...) nên không bị ảnh hưởng. Và vì là rewrite mặc
  định (`afterFiles`), tệp thật trong `public/` luôn được ưu tiên trước.

Server ưu tiên `QREVIEW_SITE_URL`; `NEXT_PUBLIC_QREVIEW_SITE_URL` chỉ còn dùng cho link
ở client và làm fallback tương thích. Hai biến phải trỏ về **website** (`https://qreview.asia`),
không phải CRM (`https://crm.qreview.asia`). Route upload kiểm tra self-proxy và trả 503 rõ
nguyên nhân; bước build cũng từ chối nếu `QREVIEW_SITE_URL` trùng origin với `APP_URL`.

---

## 5. Biến môi trường

```bash
QREVIEW_DB_HOST=            # CSDL nội dung website (KHÁC DATABASE_URL của CRM)
QREVIEW_DB_PORT=3306
QREVIEW_DB_USER=
QREVIEW_DB_PASSWORD=
QREVIEW_DB_NAME=

QREVIEW_SITE_URL=https://qreview.asia
                                # URL server-to-server + rewrite ảnh (ưu tiên).
NEXT_PUBLIC_QREVIEW_SITE_URL=https://qreview.asia
                                # Link website ở client; VPS lấy theo biến phía trên.
QREVIEW_ADMIN_TOKEN=            # = ADMIN_TOKEN trong .env.local của dự án Qreview.
                                # Chỉ dùng ở máy chủ, không lộ ra trình duyệt.
QREVIEW_ADMIN_EMAILS=           # Email là admin TRÊN WEBSITE. Không cấp quyền vào /qreview.
```

Để kiểm thử hoàn toàn local, chạy website ở cổng khác CRM:

```bash
# terminal 1 — project Qreview
npm run dev -- -p 3002

# crm_qreview/.env
QREVIEW_SITE_URL=http://localhost:3002
NEXT_PUBLIC_QREVIEW_SITE_URL=http://localhost:3002
# QREVIEW_ADMIN_TOKEN phải giống ADMIN_TOKEN trong Qreview/.env.local
```

Sau khi đổi URL/token, restart CRM vì rewrite trong `next.config.mjs` chỉ được tính
khi Next khởi động. CRM vẫn chạy ở `http://localhost:3000`.

Với VPS dùng nginx, deploy bằng overlay và **bắt buộc rebuild** vì rewrite được tính
ở bước `next build`:

```bash
docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d --build --force-recreate app
```

Sau deploy, kiểm tra một ảnh có thật phải trả `200` ở cả hai URL:

```bash
curl -I https://qreview.asia/images/products/1_main.png
curl -I https://crm.qreview.asia/images/products/1_main.png
```

---

## 6. Việc còn lại

- **Chuỗi giao diện chưa qua i18n.** 16 màn hình giữ nguyên tiếng Việt viết thẳng trong
  JSX như bản gốc, chưa theo quy tắc ở §8.4 của `CLAUDE.md`. Chuyển sang `t()` là một
  đợt làm riêng (~15.000 dòng); chỉ nhãn điều hướng đã được đưa vào `messages/vi.json`.
- **Ảnh trong trình soạn thảo bài viết** hiển thị nhờ rewrite ở mục 4, nên phụ thuộc vào
  `QREVIEW_SITE_URL`. Chưa đặt biến này thì phần xem trước sẽ thiếu ảnh.
