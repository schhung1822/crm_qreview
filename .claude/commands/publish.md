---
description: Đăng hoặc cập nhật bài lên WordPress/Wix qua API (có preview + xác nhận)
argument-hint: <Article id> [connection]
---

Đăng/cập nhật bài: **$ARGUMENTS**

Dùng subagent `cms-publisher`. Đây là hành động thay đổi site thật — **bắt buộc** preview
và xác nhận.

Các bước:

1. Lấy `Article` và `Connection` đích (WordPress hoặc Wix). **Chọn Connection khớp
   `locale` của bài** (mỗi ngôn ngữ có thể là site/subdir/subdomain riêng). Nếu chưa
   nối site, hướng dẫn user thêm `Connection` (xem agent `cms-publisher`).
2. Kiểm tra bài đã sẵn sàng: có title, meta description, slug, nội dung, ảnh đại diện,
   điểm SEO/GEO đạt ngưỡng tối thiểu. Thiếu gì → cảnh báo nhưng vẫn cho user quyết.
3. Map field sang đúng CMS:
   - **WordPress**: post content, excerpt, categories/tags, featured media (upload
     trước), meta SEO theo plugin (Yoast/RankMath) cấu hình ở `Connection`.
   - **Wix**: blog post + các field SEO mà Wix API hỗ trợ; field nào không set được,
     báo rõ cho user.
4. **Preview**: hiển thị đúng những gì sẽ gửi lên (title, slug, meta, ảnh, nội dung
   rút gọn). Nếu là update bài cũ → kèm **diff** và tạo `Revision`. Nếu bài thuộc
   `TranslationGroup` → set **hreflang** + canonical trỏ tới các bản ngôn ngữ khác.
5. Chờ **xác nhận**. Sau khi đồng ý → gọi `createPost`/`updatePost`, chạy qua
   `PublishJob` (BullMQ) nếu là batch. Ghi log đầy đủ.
6. Trả về trạng thái + URL bài đã đăng. Lỗi → báo nguyên nhân rõ, không nuốt lỗi.

Không bao giờ publish khi user chưa xác nhận ở bước 5.
