# CLAUDE.md — SEO-GEO Platform

> Hệ thống tối ưu **SEO** (Search Engine Optimization), **AEO** (Answer Engine
> Optimization) và **GEO** (Generative Engine Optimization) cho nội dung web. Nghiên cứu
> từ khóa → lên kế hoạch → viết bài mới, hoặc sửa bài cũ; rồi đăng/cập nhật tự động lên
> **WordPress** và **Wix**.
>
> **SEO** = xếp hạng trên trang kết quả (Google/Bing). **AEO** = được CHỌN làm câu trả
> lời trực tiếp (featured snippet, People Also Ask, trợ lý giọng nói). **GEO** = được
> engine sinh AI (ChatGPT, Perplexity, AI Overviews) TRÍCH DẪN khi tổng hợp. Ba lăng kính
> chồng lấn nhưng KHÁC nhau — mỗi bài đều có 3 điểm: `seoScore`, `aeoScore`, `geoScore`.

Tài liệu này là nguồn chân lý (source of truth) cho mọi agent làm việc trong repo.
Đọc kỹ trước khi viết code. Khi có mâu thuẫn giữa code và tài liệu này, ưu tiên tài
liệu này rồi cập nhật lại file cho khớp.

---

## 1. Sản phẩm là gì

Một web app giúp người làm nội dung:

1. **Nghiên cứu từ khóa** — nhập chủ đề/seed keyword → trả về cụm từ khóa (search
   volume, độ khó, intent, nhóm chủ đề/cluster), gồm cả câu hỏi mà người dùng hỏi
   AI (cho GEO).
2. **Lên content plan** — từ cụm từ khóa → đề xuất danh sách bài, outline, internal
   link, độ ưu tiên.
3. **Viết bài mới** — sinh bài hoàn chỉnh theo outline, đã tối ưu sẵn SEO + GEO.
4. **Sửa bài cũ** — kéo bài đang có trên WordPress/Wix về, phân tích, đề xuất và áp
   dụng chỉnh sửa để tăng điểm SEO + GEO.
5. **Đăng tự động** — publish/update bài lên WordPress và Wix qua API, kèm meta,
   schema, ảnh, internal link.

**SEO** = tối ưu cho Google/Bing (xếp hạng trang kết quả tìm kiếm).
**GEO** = tối ưu để nội dung được trích dẫn bởi engine sinh AI (Google AI Overviews,
ChatGPT, Perplexity, Gemini, Copilot). Hai mục tiêu chồng lấn nhưng KHÔNG giống nhau
— xem [docs/SEO-GEO-CHECKLIST.md](docs/SEO-GEO-CHECKLIST.md).

---

## 2. Nguyên tắc thiết kế (đọc trước khi code UI)

- **Giao diện kiểu Shopify, đơn giản, dễ dùng.** Dùng **Shopify Polaris** làm
  design system. Không tự chế component khi Polaris đã có sẵn (Card, Page, Button,
  Banner, DataTable, IndexTable, Badge, Tabs, FormLayout...).
- **Font chữ: Inter** cho toàn bộ app (Polaris đã dùng Inter — không ghi đè bằng
  font khác). Tải qua `next/font/google` để tránh layout shift.
- Mỗi màn hình trả lời đúng **một câu hỏi/việc**. Ít lựa chọn, mặc định thông minh.
- Mọi tác vụ AI tốn thời gian phải **bất đồng bộ + có progress** (không để spinner
  treo). Hiện trạng thái job rõ ràng.
- Mọi thay đổi lên site thật (publish/update) phải **xem trước (preview/diff) và xác
  nhận** trước khi gọi API. Không bao giờ tự đăng mà không có bước duyệt.
- Tông màu trung tính kiểu Shopify admin; không màu mè. Accent dùng để chỉ hành động
  chính.
- **Đa ngôn ngữ ngay từ đầu**: cả giao diện app lẫn nội dung tạo ra đều đa ngôn ngữ.
  Không hardcode chuỗi UI — mọi text đi qua message i18n. Xem mục 8.
- **Icon luôn là SVG** (Polaris Icons / Lucide), KHÔNG dùng emoji hay ký tự Unicode
  (✓ ✕ ★ → ▲ ℹ …) làm icon. Cờ ngôn ngữ ở production dùng asset cờ SVG. Chi tiết +
  checklist review giao diện ở [docs/UI-GUIDELINES.md](docs/UI-GUIDELINES.md).

---

## 3. Tech stack (mặc định — không đổi nếu chưa thống nhất)

| Lớp | Lựa chọn | Ghi chú |
|-----|----------|---------|
| Framework | **Next.js 14 (App Router) + TypeScript** | Full-stack, API routes ngay trong app |
| UI | **Shopify Polaris** (`@shopify/polaris`) | Look & feel Shopify, sẵn Inter |
| Font | **Inter** qua `next/font/google` | Không dùng font khác |
| i18n (UI) | **next-intl** | Routing `/[locale]/...`, message JSON theo locale |
| Data fetching | **TanStack Query** | Cache + retry phía client |
| DB | **PostgreSQL + Prisma** | Schema ở mục 5 |
| Queue/job | **BullMQ + Redis** | Cho publish & batch generation |
| AI | **Anthropic Claude API** (`@anthropic-ai/sdk`) | Model ids ở mục 6 |
| Keyword data | **DataForSEO** (provider mặc định) | Ẩn sau interface `KeywordProvider` |
| Validation | **Zod** | Validate input API + response AI |
| Test | **Vitest** (unit) + **Playwright** (e2e) | |
| Lint/format | **ESLint + Prettier** | Chạy trước khi commit |

> Nếu cần đổi stack, hỏi user trước và cập nhật bảng này.

---

## 4. Cấu trúc thư mục dự định

```
SEO-GEO/
├── CLAUDE.md                  # File này
├── .claude/                   # Cấu hình agent (commands, subagents, settings)
├── .env.example               # Mẫu biến môi trường — copy sang .env.local
├── docs/
│   ├── ARCHITECTURE.md        # Kiến trúc chi tiết, luồng dữ liệu
│   └── SEO-GEO-CHECKLIST.md   # Tiêu chí chấm điểm SEO & GEO
├── prisma/
│   └── schema.prisma          # Data model (nguồn chân lý của DB)
├── src/
│   ├── app/                   # Next.js App Router (pages + API routes)
│   │   ├── [locale]/          # UI Polaris đa ngôn ngữ: keyword, plan, editor...
│   │   └── api/               # REST endpoints
│   ├── messages/              # i18n UI: vi.json, en.json, ... (next-intl)
│   ├── i18n/                  # Cấu hình next-intl (routing, locales)
│   ├── lib/
│   │   ├── ai/                # Wrapper Claude, prompt, parsing có schema
│   │   ├── seo/               # Chấm điểm + sửa SEO
│   │   ├── aeo/               # Chấm điểm AEO (answer engine: snippet, PAA, voice)
│   │   ├── geo/               # Chấm điểm + sửa GEO
│   │   ├── keywords/          # KeywordProvider + DataForSEO impl
│   │   └── cms/               # Adapter WordPress & Wix (cùng 1 interface)
│   ├── components/            # Component UI dùng lại (bọc Polaris)
│   └── jobs/                  # Worker BullMQ
└── tests/
```

Khi tạo file mới, đặt đúng lớp ở trên. KHÔNG để logic AI/CMS lẫn trong component UI.

---

## 5. Data model (Prisma — rút gọn)

Nguồn chân lý đầy đủ ở `prisma/schema.prisma`. Khái niệm cốt lõi:

- **Project** — một website/khách hàng. Có `defaultLocale` + `supportedLocales[]`
  (BCP-47, vd `vi`, `en`, `ja`). Có nhiều `Connection`, `KeywordSet`, `Article`.
- **Connection** — kết nối tới 1 CMS (`provider`: `wordpress` | `wix`), lưu credential
  đã mã hóa, và `locale` (site này phục vụ ngôn ngữ nào). Một project có thể nối nhiều
  site cho nhiều ngôn ngữ.
- **KeywordSet** — kết quả 1 lần nghiên cứu từ khóa cho **một `locale`/thị trường**
  (seed + danh sách `Keyword` + cluster). Volume/difficulty khác nhau theo thị trường
  → nghiên cứu riêng cho từng locale, KHÔNG dịch máy keyword.
- **Keyword** — `term`, `locale`, `volume`, `difficulty`, `intent`, `cluster`,
  `isQuestion` (đánh dấu câu hỏi dạng GEO).
- **ContentPlan** — danh sách `PlanItem` (mỗi item ~ 1 bài dự kiến: title, outline,
  target keyword, internal link, priority), gắn `locale`.
- **Article** — bài viết, có `locale`. `source`: `generated` | `imported`. Lưu
  `cmsPostId` + `connectionId` khi đã đăng. Có `seoScore`, `geoScore`, `status`
  (`draft`/`review`/`published`), lịch sử `Revision`, và `translationGroupId`.
- **TranslationGroup** — nhóm các `Article` là bản dịch của nhau qua các locale
  (1 nội dung ↔ N ngôn ngữ). Dùng để sinh hreflang và quản lý bản dịch lệch phiên bản.
- **Revision** — snapshot nội dung trước mỗi lần sửa (để diff & rollback).
- **PublishJob** — job đăng/cập nhật, trạng thái + log.

Quy tắc: **không bao giờ ghi đè bài mà không tạo Revision trước.** Mọi entity nội dung
đều phải biết `locale` của mình.

---

## 6. AI / Claude — quy ước bắt buộc

- SDK: `@anthropic-ai/sdk`. Luôn dùng model id mới nhất:
  - **Viết bài / sửa bài chất lượng cao** → `claude-opus-4-8`
  - **Phân loại / chấm điểm / tóm tắt / phân nhóm keyword** → `claude-haiku-4-5-20251001`
    (rẻ, nhanh); nâng lên Sonnet/Opus nếu chất lượng chưa đạt.
- **Luôn ép output theo schema Zod** rồi parse — không tin output tự do của model.
  Mọi prompt sinh dữ liệu có cấu trúc phải dùng tool/JSON + validate, retry khi lệch.
- Prompt sống trong `src/lib/ai/prompts/`, tách khỏi code gọi API. Mỗi prompt có
  version.
- Không hardcode API key trong code — chỉ đọc từ `process.env`.
- Khi không chắc về API/pricing/model của Claude, đọc skill `claude-api` thay vì đoán.
- Nội dung sinh ra phải nêu rõ là draft; **không bịa số liệu, không bịa nguồn**. Nếu
  cần dẫn chứng, để placeholder và đánh dấu `[CẦN KIỂM CHỨNG]`.

---

## 7. Tích hợp CMS (WordPress + Wix)

Tất cả CMS ẩn sau một interface chung `CmsAdapter` ở `src/lib/cms/`:

```ts
interface CmsAdapter {
  testConnection(): Promise<boolean>
  listPosts(opts): Promise<CmsPost[]>
  getPost(id): Promise<CmsPost>
  createPost(input): Promise<CmsPost>
  updatePost(id, input): Promise<CmsPost>
  uploadMedia(file): Promise<{ url: string; id: string }>
}
```

- **WordPress** — dùng **REST API** (`/wp-json/wp/v2/...`) + **Application Password**
  (Basic auth qua HTTPS). Hỗ trợ post, meta (qua plugin SEO nếu có: Yoast/RankMath),
  media, category/tag. Map field SEO theo plugin được cấu hình ở `Connection`.
- **Wix** — dùng **Wix REST API** (Blog / Data) + OAuth hoặc API key của site. Lưu ý
  Wix giới hạn field SEO; cái gì không set được qua API thì báo rõ cho user.
- Mọi lời gọi CMS phải **idempotent khi có thể** và **log vào `PublishJob`**.
- Rate limit + retry có backoff. Lỗi credential → trả lỗi rõ ràng, không nuốt lỗi.
- **Trước khi update bài cũ**: tải bản hiện tại, tạo `Revision`, hiện **diff** cho
  user duyệt, rồi mới gọi `updatePost`.

---

## 8. Đa ngôn ngữ (i18n) — giao diện & nội dung

Hai lớp đa ngôn ngữ tách biệt, đừng nhầm lẫn:

**Ngôn ngữ hỗ trợ (10):** `vi` Việt (mặc định), `en` Anh, `zh` Trung, `ja` Nhật,
`ko` Hàn, `fr` Pháp, `de` Đức, `id` Indonesia, `hi` Ấn Độ (Hindi), `th` Thái.

**Cấu trúc URL đa ngôn ngữ:** dùng **subdirectory** `/{locale}/` cho app và là mặc
định khi đăng (vd `/en/bai-viet`). Ngoài ra hỗ trợ **subdomain** `{locale}.` cho
site đích nếu `Connection` cấu hình vậy (vd `en.example.com`). Mỗi `Connection` khai
báo kiểu URL của nó (`pathStrategy`: `subdir` | `subdomain`) để map đúng + sinh hreflang.

### 8.1. Giao diện app (UI i18n)
- Dùng **next-intl**. Route theo locale: `/[locale]/...` (vd `/vi/dashboard`,
  `/en/dashboard`). Locale mặc định lấy từ `DEFAULT_LOCALE`.
- **Không hardcode chuỗi** trong component. Mọi text qua `t('key')`; message lưu ở
  `src/messages/{locale}.json`. Thêm ngôn ngữ = thêm 1 file message, không sửa code.
- Format ngày/giờ/số/tiền tệ theo locale (`Intl`). Hỗ trợ RTL khi thêm ngôn ngữ RTL
  (ar, he): set `dir` ở `<html>`, dùng logical CSS properties.
- Polaris: bọc app trong `AppProvider` với gói i18n Polaris tương ứng locale.
- `SUPPORTED_LOCALES` (env) là nguồn chân lý danh sách ngôn ngữ UI.

### 8.2. Nội dung tạo ra (content i18n)
- **Ngôn ngữ đầu ra của bài là tham số bậc nhất** ở mọi bước: keyword-research →
  content-plan → write-article → optimize-post → publish. Mặc định = `defaultLocale`
  của Project.
- **Nghiên cứu từ khóa theo từng thị trường, KHÔNG dịch máy keyword.** Volume, độ khó,
  intent, và cả cách người dùng đặt câu hỏi cho AI đều khác nhau giữa các ngôn ngữ.
  Mỗi locale có `KeywordSet` riêng.
- **Bản địa hóa ≠ dịch literal.** Khi tạo bản ngôn ngữ khác của một bài, dùng agent
  `localizer`: thích nghi ví dụ, đơn vị, tiền tệ, văn hóa, và **chấm lại SEO/GEO theo
  từ khóa bản địa của ngôn ngữ đích** — không chỉ dịch chữ.
- Các bản dịch của cùng một nội dung gom vào `TranslationGroup` để:
  - sinh **hreflang** (`<link rel="alternate" hreflang="..">`) + canonical đúng.
  - cảnh báo khi bản gốc cập nhật mà bản dịch chưa theo kịp (lệch phiên bản).
- Khi đăng lên CMS: mỗi locale có thể là một `Connection` riêng (site/subdir/subdomain
  khác nhau). Map URL theo cấu trúc đa ngôn ngữ của site đích.

### 8.3. Quy ước
- Locale dùng mã **BCP-47** (`vi`, `en`, `en-US`, `ja`, `zh-Hant`…).
- Mọi entity nội dung mang trường `locale`. Mọi prompt AI nhận `targetLocale` rõ ràng.
- Không trộn ngôn ngữ trong một bài (trừ thuật ngữ giữ nguyên có chủ đích).

### 8.4. Quy tắc CẬP NHẬT i18n khi code (BẮT BUỘC)
> Mỗi khi **thêm tính năng mới** hoặc **sửa tính năng cũ** mà động đến chuỗi hiển thị
> (UI), **PHẢI cập nhật bản dịch cho ĐỦ 10 ngôn ngữ** trong cùng lần thay đổi đó.
> Không được để sót — không merge/không báo "xong" khi message còn lệch giữa các locale.

- **Không hardcode chuỗi UI.** Mọi text người dùng thấy phải đi qua `t('key')`; chuỗi
  thật nằm ở `src/messages/{locale}.json`. Văn bản viết thẳng trong JSX/TSX là lỗi.
- **Thêm 1 key = thêm vào CẢ 10 file** `src/messages/*.json` (`vi`, `en`, `zh`, `ja`,
  `ko`, `fr`, `de`, `id`, `hi`, `th`). **Sửa/đổi nghĩa 1 key = cập nhật lại cả 10 bản
  dịch** cho khớp nghĩa mới. **Xóa 1 key = xóa ở cả 10 file.**
- **10 file phải luôn ĐỒNG BỘ:** cùng tập key, cùng cấu trúc lồng nhau, cùng thứ tự;
  số leaf-key bằng nhau. `vi` + `en` là bản gốc (viết tay chuẩn); 8 ngôn ngữ còn lại
  dịch theo. Khi gấp, có thể nhờ subagent dịch song song (mỗi locale 1 agent) rồi verify.
- **Giữ nguyên placeholder ICU** (`{n}`, `{inn}`, `{out}`, `{y}`, `{m}`…) và **thuật
  ngữ thương hiệu/kỹ thuật** (SEO, GEO, AI, WordPress, Wix, Shopify, utm_source,
  hreflang, slug, meta, schema, Claude, ChatGPT, Gemini…) trong mọi bản dịch.
- **Trước khi báo "xong"** một thay đổi có UI: chạy kiểm tra đồng bộ message — không
  locale nào thiếu/thừa key, không lệch placeholder — coi như một phần của
  `typecheck && lint && test`. Lệnh kiểm tra nhanh (Node) so từng locale với `en.json`
  về số key, key thiếu/thừa và placeholder; chỉ pass khi cả 10 đều khớp.
- Không bao giờ để một locale rơi về tiếng Anh do thiếu key (fallback chỉ là lưới an
  toàn, KHÔNG phải cách làm hợp lệ).

## 9. Luồng nghiệp vụ chính

**A. Bài mới:** `Project` → `/keyword-research` (seed → KeywordSet) →
`/content-plan` (KeywordSet → ContentPlan) → `/write-article` (PlanItem → Article
draft đã tối ưu) → review/score → `/publish` (đăng lên Connection).

**B. Sửa bài cũ:** chọn `Connection` → import bài (`/optimize-post`) → chấm SEO+GEO →
sinh đề xuất sửa → user duyệt diff → update lên CMS (tạo Revision trước).

Mỗi bước là một slash command trong `.claude/commands/` và (khi build app) một màn
hình Polaris tương ứng.

---

## 10. Quy ước code

- TypeScript `strict`. Không dùng `any` trừ khi có chú thích lý do.
- Đặt tên rõ nghĩa; file kebab-case, component PascalCase, hàm camelCase.
- Mọi API route validate input bằng Zod ở biên; không tin client.
- Side effect (gọi CMS, gọi AI, ghi DB) tách khỏi component render.
- Secrets chỉ đọc từ env; credential CMS lưu DB phải mã hóa (AES-GCM, key từ env).
- Viết test cho: scoring SEO/GEO, parser AI, từng `CmsAdapter` (mock HTTP).
- Comment bằng tiếng Việt cũng được, nhưng nhất quán trong một file.

## 11. Lệnh thường dùng

```bash
npm run dev          # Chạy app dev (localhost:3000)
npm run build        # Build production
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run check:i18n   # Kiểm tra 10 file message đồng bộ (key + placeholder)
npm test             # Vitest
npx prisma migrate dev   # Cập nhật DB theo schema
npm run worker       # Chạy worker BullMQ (publish jobs)
```

Trước khi báo "xong": chạy `npm run typecheck && npm run lint && npm run check:i18n && npm test`.
(Nếu thay đổi có động đến chuỗi UI, `check:i18n` PHẢI pass — xem §8.4.)
Test: **Vitest** (`npm test`). Test unit ở `tests/`. CI (`.github/workflows/ci.yml`)
chạy cả 4 cổng trên mỗi push/PR. Self-host: `docker compose up -d` (cần `ENCRYPTION_KEY`).

## 12. Bảo mật & an toàn

- Không commit `.env.local`, credential, token. Chỉ commit `.env.example`.
- Không log secret. Che bớt token khi log.
- Tôn trọng robots/ToS khi crawl bài để import; chỉ import site mà user sở hữu/được
  phép.
- Hành động không thể hoàn tác (publish, update, xóa) → luôn xác nhận trước.

## 13. Khi bắt đầu một task

1. Đọc `docs/ARCHITECTURE.md` và `docs/SEO-GEO-CHECKLIST.md` nếu task liên quan.
2. Tìm code/pattern sẵn có trước khi viết mới.
3. Việc lớn → dùng subagent trong `.claude/agents/` (xem mô tả từng agent).
4. Cập nhật tài liệu khi thay đổi kiến trúc.
