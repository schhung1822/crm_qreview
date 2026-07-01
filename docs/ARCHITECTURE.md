# Architecture — SEO-GEO Platform

Tài liệu kiến trúc chi tiết. Đọc cùng [CLAUDE.md](../CLAUDE.md).

## Tổng quan

Next.js full-stack app. UI Polaris (kiểu Shopify, font Inter). Logic nghiệp vụ tách
thành các module trong `src/lib`. Tác vụ nặng/ghi CMS chạy qua worker BullMQ.

```
Browser (Polaris UI)
      │  TanStack Query
      ▼
Next.js API routes (src/app/api)  ──►  PostgreSQL (Prisma)
      │                                      ▲
      ├──► src/lib/ai      (Claude)          │
      ├──► src/lib/keywords (DataForSEO)     │
      ├──► src/lib/seo / src/lib/geo (scoring)
      └──► src/lib/cms (WordPress / Wix) ◄── BullMQ worker (src/jobs)  ──► Redis
                                                     │
                                                     ▼
                                          WordPress REST / Wix REST API
```

## Luồng dữ liệu chính

### 1. Bài mới
`seed keyword` → **keyword-research** (DataForSEO + Claude phân cụm) → `KeywordSet`
→ **content-plan** (Claude) → `ContentPlan[PlanItem]`
→ **write-article** (content-writer/Opus) → `Article(draft)`
→ **scoring** (seo-optimizer + geo-optimizer) → điểm + sửa
→ **publish** (cms-publisher, preview+confirm) → CMS.

### 2. Sửa bài cũ
`Connection` → import (`CmsAdapter.getPost`) → tạo `Revision`
→ scoring → đề xuất sửa → **diff + confirm** → `CmsAdapter.updatePost`.

### 3. Bản địa hóa (tạo bản ngôn ngữ khác)
`Article(locale gốc)` → **localize** (agent `localizer` + `KeywordSet` của locale
đích) → `Article(locale đích)` gắn cùng `TranslationGroup` → scoring theo locale đích
→ publish lên `Connection` của locale đó (kèm hreflang).

## Module chính

- **`src/lib/ai`** — wrapper `@anthropic-ai/sdk`. Mọi call ép output theo Zod schema.
  Prompt versioned trong `prompts/`. Chọn model theo tác vụ (Opus viết, Haiku phân loại).
- **`src/lib/keywords`** — interface `KeywordProvider`; impl mặc định DataForSEO. Dễ
  thay provider khác (Ahrefs, SEMrush) mà không đụng tầng trên.
- **`src/lib/seo` / `src/lib/geo`** — hàm `score(article): { score, breakdown[] }`
  thuần (testable), theo [SEO-GEO-CHECKLIST.md](SEO-GEO-CHECKLIST.md).
- **`src/lib/cms`** — interface `CmsAdapter` + impl `wordpress.ts`, `wix.ts`. Mọi ghi
  qua `PublishJob`.
- **`src/jobs`** — worker BullMQ: publish/update, batch generation, re-score định kỳ.

## Đa ngôn ngữ (i18n)

Hai lớp độc lập:

**1. UI i18n (next-intl)**
- Route `/[locale]/...`; middleware next-intl phát hiện & chuyển hướng locale.
- Message ở `src/messages/{locale}.json`. Thêm ngôn ngữ = thêm file, không sửa code.
- Polaris `AppProvider` nạp gói i18n theo locale; format số/ngày/tiền qua `Intl`.
- RTL: set `dir` ở `<html>`, dùng logical CSS properties.

**2. Content i18n**
- `locale` là trường bắt buộc trên `KeywordSet`, `ContentPlan`, `PlanItem`, `Article`,
  `Keyword`. Nghiên cứu từ khóa **riêng cho từng thị trường** (không dịch máy).
- `TranslationGroup` gom các `Article` là bản dịch của nhau → sinh hreflang đối xứng +
  canonical theo locale, và phát hiện lệch phiên bản giữa bản gốc và bản dịch.
- Bản địa hóa qua agent `localizer` (thích nghi văn hóa + tối ưu SEO/GEO bản địa),
  không phải dịch literal.
- Mỗi locale có thể map tới một `Connection` riêng (site/subdir/subdomain) khi đăng.

```
Article(vi) ─┐
Article(en) ─┼─ TranslationGroup ──► hreflang vi/en/ja + x-default, canonical/locale
Article(ja) ─┘
```

## Bảo mật

- Credential CMS lưu DB **mã hóa AES-256-GCM**, key từ `ENCRYPTION_KEY` (env).
- Secret chỉ từ env. Không log token.
- Mọi ghi lên site cần xác nhận của user (preview/diff).

## Lựa chọn cần chốt với user trước khi build

- Auth người dùng (NextAuth? multi-tenant?).
- Provider keyword cuối cùng (DataForSEO vs Ahrefs vs SEMrush — phụ thuộc ngân sách).
- Hosting (Vercel + Postgres + Redis managed?).
- Phạm vi Wix (Blog API quyền hạn tới đâu với loại site của user).
- Danh sách ngôn ngữ cần hỗ trợ ngay (UI + nội dung) và cấu trúc URL đa ngôn ngữ
  (subdir `/en/` vs subdomain `en.` vs site riêng) — ảnh hưởng map `Connection`.
