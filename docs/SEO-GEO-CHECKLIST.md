# SEO, AEO & GEO Checklist

Tiêu chí chấm điểm dùng chung cho `seo-optimizer`, `geo-optimizer` và module
`src/lib/seo` / `src/lib/geo`. Mỗi tiêu chí có trọng số; tổng quy về thang 0–100.

---

## A. SEO on-page (thang 100)

| # | Tiêu chí | Trọng số | Đạt khi |
|---|----------|:--------:|---------|
| 1 | Title tag | 12 | ≤ 60 ký tự, có target keyword, hấp dẫn |
| 2 | Meta description | 8 | ≤ 155 ký tự, có keyword + CTA tự nhiên |
| 3 | Slug/URL | 6 | Ngắn, có keyword, không dấu/ký tự thừa |
| 4 | Heading structure | 10 | 1×H1, H2/H3 phân cấp đúng, keyword ở heading |
| 5 | Keyword usage | 10 | Có trong 100 từ đầu, mật độ tự nhiên, không nhồi |
| 6 | Độ phủ chủ đề | 12 | Bao đủ sub-intent so với top SERP |
| 7 | Internal links | 8 | ≥ 2 link nội bộ, anchor mô tả |
| 8 | External links | 6 | Tới nguồn uy tín, liên quan |
| 9 | Hình ảnh + alt | 8 | Có ảnh, alt mô tả, file gọn |
| 10 | Structured data | 8 | Schema phù hợp loại bài (Article/FAQ/HowTo) |
| 11 | Readability | 6 | Câu/đoạn ngắn, dễ đọc |
| 12 | Độ dài phù hợp | 6 | Tương xứng intent & đối thủ |

## B. GEO — Generative Engine Optimization (thang 100)

| # | Tiêu chí | Trọng số | Đạt khi |
|---|----------|:--------:|---------|
| 1 | Câu trả lời trích dẫn được | 16 | Đoạn 1–3 câu đầu mục trả lời thẳng, tự đứng độc lập |
| 2 | Cấu trúc Q&A | 12 | Câu hỏi người dùng → câu trả lời rõ ràng, trực tiếp |
| 3 | Entity clarity | 10 | Định nghĩa & gọi tên thực thể nhất quán, rõ ràng |
| 4 | Dẫn chứng có nguồn | 12 | Số liệu có nguồn + ngày; không bịa; nguồn uy tín |
| 5 | Định dạng dễ trích | 10 | List/bảng/bullet/steps cho thông tin then chốt |
| 6 | Structured data | 10 | FAQPage/HowTo/Article + Author/Organization |
| 7 | E-E-A-T | 12 | Tác giả rõ, kinh nghiệm thực, độ chính xác cao |
| 8 | Tính cập nhật | 8 | "Last updated" rõ, thông tin mới |
| 9 | Độ đầy đủ | 10 | Bao phủ câu hỏi liên quan quanh chủ đề |

---

## B2. AEO — Answer Engine Optimization (thang 100)

> Tối ưu để nội dung được **CHỌN làm câu trả lời trực tiếp**: featured snippet, People
> Also Ask, answer box, trợ lý giọng nói (Google Assistant / Siri / Alexa). Khác GEO:
> AEO = engine **lấy nguyên** một đoạn làm câu trả lời; GEO = LLM **tổng hợp & trích dẫn**.
> Cài đặt: `src/lib/aeo/score.ts` (`scoreAeo`).

| # | Tiêu chí | Trọng số | Đạt khi |
|---|----------|:--------:|---------|
| 1 | Trả lời trực tiếp đầu bài | 16 | Đoạn đầu trả lời thẳng, **tự đứng độc lập** (không phụ thuộc ngữ cảnh) |
| 2 | Đoạn cỡ featured snippet | 10 | Có ≥1 đoạn ~40–60 từ (≈250–340 ký tự) trả lời trọn 1 ý |
| 3 | Heading dạng câu hỏi | 12 | ≥2 H2/H3 là câu hỏi tự nhiên (giống People Also Ask) |
| 4 | Khối FAQ/Q&A | 12 | Có mục FAQ + cặp hỏi–đáp (FAQPage schema-able) |
| 5 | Định nghĩa trực tiếp | 9 | Câu "X là …" rõ ràng (definition snippet + voice) |
| 6 | List/bảng rút-trích | 9 | Có danh sách và/hoặc bảng cho thông tin then chốt |
| 7 | Các bước How-To | 8 | Danh sách đánh số ≥3 bước (HowTo rich result) khi là bài hướng dẫn |
| 8 | Khớp truy vấn ↔ trả lời | 9 | Target keyword nằm ở heading hoặc đoạn trả lời đầu |
| 9 | Tóm tắt/Key takeaways | 7 | Có khối tóm tắt gạch đầu dòng để rút-trích nhanh |
| 10 | Câu trả lời súc tích | 8 | Phần lớn đoạn ngắn, dễ quét (không phải tường chữ) |

---

## C. Đa ngôn ngữ (áp dụng khi bài thuộc TranslationGroup)

| # | Tiêu chí | Đạt khi |
|---|----------|---------|
| 1 | hreflang | Có `<link rel="alternate" hreflang="x">` cho mọi bản ngôn ngữ + `x-default` |
| 2 | Canonical | Canonical trỏ về chính bản locale đó, không trỏ chéo sang ngôn ngữ khác |
| 3 | `lang`/`inLanguage` | `<html lang>` và `inLanguage` trong schema đúng locale |
| 4 | Keyword bản địa | Target keyword nghiên cứu riêng cho thị trường, không dịch máy |
| 5 | Bản địa hóa | Đơn vị, tiền tệ, ví dụ, ngày/số thích nghi theo locale |
| 6 | URL/slug | Slug bằng ngôn ngữ đích; cấu trúc URL đa ngôn ngữ nhất quán |
| 7 | Đồng bộ phiên bản | Bản dịch không lệch quá xa bản gốc (cảnh báo nếu gốc đã cập nhật) |
| 8 | Không trộn ngôn ngữ | Toàn bài một ngôn ngữ (trừ thuật ngữ giữ nguyên có chủ đích) |

> hreflang phải **đối xứng**: A trỏ tới B thì B phải trỏ lại A, nếu không Google bỏ qua.

## SEO vs AEO vs GEO — khác nhau ở đâu

- **SEO** tối ưu để **xếp hạng** một trang trên SERP. Quan tâm keyword, backlink,
  CTR, kỹ thuật on-page.
- **AEO** tối ưu để được **chọn làm câu trả lời trực tiếp** (featured snippet, People
  Also Ask, answer box, voice). Quan tâm: trả lời thẳng & sớm, đúng cỡ snippet, heading
  câu hỏi, FAQ, định nghĩa, các bước How-To — engine **lấy nguyên** đoạn của bạn.
- **GEO** tối ưu để nội dung được **engine sinh AI trích dẫn** trong câu trả lời tổng
  hợp. Quan tâm tính trích-dẫn-được, độ rõ của fact, structured data, thẩm quyền, nguồn.
- Một bài tốt cần **cả ba**. Khi đề xuất mâu thuẫn (vd: nhồi keyword cho SEO làm hỏng
  độ tự nhiên cho AEO/GEO) → ưu tiên trải nghiệm người đọc & tính đáng tin.

## Ngưỡng publish khuyến nghị

- SEO ≥ 75 **và** AEO ≥ 70 **và** GEO ≥ 70 → đủ điều kiện đăng.
- Dưới ngưỡng vẫn cho đăng nếu user xác nhận, nhưng phải cảnh báo điểm yếu cụ thể.
