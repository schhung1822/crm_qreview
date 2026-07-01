---
description: Tạo bản ngôn ngữ khác của một bài (bản địa hóa, không dịch literal) + tối ưu SEO/GEO bản địa
argument-hint: <Article id> <locale đích, vd en / ja / vi>
---

Bản địa hóa bài viết: **$ARGUMENTS**

Dùng subagent `localizer`, rồi `seo-optimizer` + `geo-optimizer` chấm lại theo locale
đích.

Các bước:

1. Lấy `Article` nguồn và `locale` đích. Kiểm tra `locale` đích nằm trong
   `supportedLocales` của Project; nếu chưa có, hỏi user có muốn thêm không.
2. Lấy `KeywordSet` của locale đích. **Nếu chưa có → đề nghị chạy `/keyword-research`
   cho locale đó trước** (không dịch máy keyword từ bản gốc).
3. Giao `localizer` bản địa hóa: thích nghi văn hóa/đơn vị/ví dụ, chọn keyword bản
   địa, viết lại đoạn trả lời ngắn + Q&A theo cách người bản xứ hỏi AI, tạo meta/slug
   bằng ngôn ngữ đích.
4. Chấm lại SEO + GEO theo locale đích (không dùng điểm của bản gốc).
5. Tạo `Article` mới (`locale` = đích, `status = draft`) và gắn cùng
   `TranslationGroup` với bản gốc để sinh hreflang.
6. Trả về nội dung + meta + điểm. Gợi ý `/publish` lên `Connection` đúng locale.

Không tự đăng. Không dịch literal — đọc phải tự nhiên như viết gốc bằng ngôn ngữ đích.
