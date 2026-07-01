# SEO·GEO Platform

Web app tối ưu **SEO** (Search Engine Optimization) và **GEO** (Generative Engine
Optimization): nghiên cứu từ khóa → lên content plan → viết/sửa bài bằng AI → đăng tự
động lên **WordPress, Wix và Shopify**. Giao diện kiểu Shopify (Polaris, font Inter),
**đa ngôn ngữ** (10 ngôn ngữ) cho cả app lẫn nội dung.

## Bắt đầu nhanh (không cần cài database)

1. Chạy app: `npm install && npm run dev` → mở http://localhost:3000
2. **Tạo tài khoản quản trị** (lần đầu app tự hiện form ở `/login`).
3. **Nhập API key AI** ở *API Keys & AI* (Claude / ChatGPT / Gemini / DeepSeek).
4. **Kết nối website** ở *Kết nối CMS* (WordPress / Wix / Shopify) — bấm *Test* rồi *Lưu*.

## Đăng nhập & phân quyền nhân viên

App yêu cầu **đăng nhập**. Tài khoản đầu tiên là **Chủ sở hữu** (toàn quyền). Vào
*Nhân viên* để tạo tài khoản cho nhân viên với vai trò:

| Vai trò | Quyền |
|---------|-------|
| **Chủ sở hữu / Quản trị** | Toàn quyền: nội dung, đăng bài, kết nối CMS, API key, quản lý nhân viên |
| **Biên tập viên** | Viết & tối ưu bài bằng AI, lưu nháp, đăng bài |
| **Chỉ xem** | Chỉ đọc |

Bảo mật: mật khẩu băm **scrypt + salt**; phiên đăng nhập qua **cookie httpOnly**; mọi
API kiểm tra quyền ở server; chặn **SSRF** (không cho trỏ kết nối tới host nội bộ);
credential AI/CMS **mã hóa AES-256-GCM**.

Dashboard có **checklist onboarding** dẫn từng bước. Mọi credential (API key AI + CMS)
lưu **mã hóa AES-256-GCM** ở `.data/` (gitignored), chỉ xử lý phía server.

### Lấy credential ở đâu
- **WordPress**: Users → Profile → *Application Passwords* (không dùng mật khẩu đăng nhập).
- **Wix**: manage.wix.com → Settings → *API Keys*; cần *Site ID*.
- **Shopify**: Settings → Apps → *Develop apps* → tạo app → *Admin API access token*
  (bật quyền Blog/Article).

> Tài liệu nguồn chân lý: [CLAUDE.md](CLAUDE.md) ·
> [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ·
> [docs/SEO-GEO-CHECKLIST.md](docs/SEO-GEO-CHECKLIST.md) ·
> [docs/UI-GUIDELINES.md](docs/UI-GUIDELINES.md). Mockup tĩnh: `mockups/index.html`.

## Tech stack
Next.js 14 (App Router, TS) · Shopify Polaris · next-intl · Prisma + PostgreSQL ·
Anthropic Claude · DataForSEO · Zod.

## Chạy nhanh (không cần DB hay API key)

```bash
npm install
npm run dev      # http://localhost:3000 → tự chuyển /vi/dashboard
```

App chạy ngay bằng **dữ liệu seed in-memory** (`src/lib/data`). Mọi tích hợp ngoài
(Claude, DataForSEO, WordPress, Wix) đều **graceful-degrade**: thiếu key → dùng mock,
giao diện vẫn hoạt động. Kiểm tra trạng thái tích hợp: `GET /api/health`.

## Bật tính năng thật

Copy `.env.example` → `.env.local` và điền:

| Biến | Dùng cho |
|------|----------|
| `ANTHROPIC_API_KEY` | Viết/bản địa hóa bài bằng Claude |
| `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` | Số liệu từ khóa thật |
| `DATABASE_URL` | PostgreSQL (Prisma) |
| `ENCRYPTION_KEY` | Mã hóa credential CMS (AES-256-GCM) — `openssl rand -base64 32` |

Khởi tạo DB:

```bash
npm run prisma:generate
npm run prisma:migrate    # cần DATABASE_URL
```

## Cấu trúc

```
src/
├── app/
│   ├── [locale]/          # 10 trang UI (Polaris): dashboard, keywords, plan,
│   │                      #   editor, optimize, translations, publish, calendar,
│   │                      #   reports, connections
│   └── api/               # keywords, articles, articles/score, publish, health
├── components/            # AppFrame (Polaris shell), icons SVG, ui helpers
├── i18n/                  # next-intl: config (10 locale) + request; middleware ở gốc
├── lib/
│   ├── ai/                # Claude wrapper + prompts (versioned) + content gen
│   ├── keywords/          # KeywordProvider: DataForSEO + mock
│   ├── seo/ · geo/        # Chấm điểm theo checklist (hàm thuần, testable)
│   ├── cms/               # CmsAdapter: WordPress + Wix + hreflang
│   ├── crypto.ts          # AES-256-GCM cho credential
│   └── data/              # Seed + data layer (thay bằng Prisma khi có DB)
└── messages/              # i18n UI: 10 file locale đầy đủ & đồng bộ (check:i18n)
```

## Lệnh

```bash
npm run dev          # dev server
npm run build        # build production
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run check:i18n   # kiểm tra 10 file message đồng bộ
npm test             # Vitest
npm run worker       # worker lịch đăng (cần CRON_SECRET)
npm run prisma:studio
```

Trước khi mở PR, chạy đủ 4 cổng: `npm run typecheck && npm run lint && npm run check:i18n && npm test`.

## Nguyên tắc bất biến

- **Đa ngôn ngữ là tham số bậc nhất** ở mọi bước; không dịch máy từ khóa — mỗi locale
  nghiên cứu riêng theo thị trường.
- **Mọi thay đổi lên site thật cần preview + xác nhận** (`/api/publish` mặc định
  dry-run; `confirm=true` mới ghi). Sửa bài cũ tạo `Revision` trước.
- **Icon luôn là SVG** (xem `src/components/icons.tsx`), không dùng emoji/ký tự làm icon.
- Output AI luôn **ép schema Zod** rồi parse; không bịa số liệu/nguồn.

## Trạng thái

Kiến trúc + UI + lib chạy được, có **test Vitest** cho scoring/parser/adapter, JSON‑LD
structured data khi đăng, và **worker lịch đăng** (`PublishJob`). Các bước tiếp theo để
lên production: nối Prisma thật vào `src/lib/data`, hoàn thiện luồng OAuth/Media của Wix,
và tích hợp dữ liệu hiệu suất (Google Search Console) cho gợi ý tối ưu.

## Đóng góp & giấy phép

- Hướng dẫn đóng góp: [CONTRIBUTING.md](CONTRIBUTING.md) (setup, 4 cổng kiểm tra, quy
  tắc i18n 10 ngôn ngữ).
- Báo lỗ hổng bảo mật: [SECURITY.md](SECURITY.md) (riêng tư, không mở issue công khai).
- Giấy phép: **[MIT](LICENSE)**.
