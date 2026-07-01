---
description: Viết bài mới hoàn chỉnh từ một PlanItem, tối ưu sẵn SEO + GEO
argument-hint: <PlanItem id hoặc title bài> [locale, mặc định defaultLocale]
---

Viết bài mới: **$ARGUMENTS**

Dùng subagent `content-writer` để soạn, rồi `seo-optimizer` và `geo-optimizer` để chấm
và tinh chỉnh trước khi trả về.

Các bước:

1. Lấy `PlanItem` (title, target keyword, outline, internal link, intent) và **locale**
   đầu ra (mặc định `defaultLocale` của Project). Nếu chưa có plan, hỏi user hoặc chạy
   `/content-plan` trước. Bài viết bằng đúng ngôn ngữ của `locale`; dùng `KeywordSet`
   của chính locale đó. (Cần bản ngôn ngữ khác → dùng `/localize` sau.)
2. **Soạn bài** theo outline với `claude-opus-4-8`:
   - Mở đầu trả lời thẳng câu hỏi chính trong 2–3 câu (tốt cho GEO featured answer).
   - Heading rõ ràng, mỗi H2/H3 bám một sub-intent.
   - Văn phong tự nhiên, đúng ngôn ngữ thị trường (mặc định tiếng Việt).
   - Chèn internal link theo plan; chừa chỗ external link uy tín có đánh dấu
     `[CẦN KIỂM CHỨNG]` nếu cần dẫn số liệu.
   - **Không bịa số liệu, không bịa nguồn.**
3. **Tối ưu SEO**: title ≤ 60 ký tự, meta description ≤ 155, slug, mật độ keyword tự
   nhiên, alt ảnh, heading hợp lệ, FAQ schema gợi ý. (giao `seo-optimizer`)
4. **Tối ưu GEO**: thêm đoạn trả lời ngắn gọn dạng trích dẫn được, định nghĩa rõ thực
   thể, câu hỏi–trả lời, danh sách/bảng dễ trích, structured data. (giao `geo-optimizer`)
5. Trả về: nội dung Markdown/HTML + khối meta (title/description/slug/schema) +
   **điểm SEO và GEO** kèm checklist đã đạt/chưa đạt.
6. Lưu `Article` (`source = generated`, `status = draft`). Không tự đăng.

Sau khi xong, gợi ý chạy `/publish` để đăng lên WordPress/Wix.
