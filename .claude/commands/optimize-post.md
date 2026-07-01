---
description: Kéo bài cũ từ WordPress/Wix về, chấm điểm và tối ưu lại SEO + GEO
argument-hint: <URL bài hoặc cmsPostId> [connection]
---

Tối ưu bài viết cũ: **$ARGUMENTS**

Mục tiêu: cải thiện điểm SEO + GEO của một bài đang sống trên site, có duyệt diff
trước khi cập nhật.

Các bước:

1. Xác định `Connection` (WordPress hay Wix) và bài cần sửa (qua URL hoặc `cmsPostId`).
   Dùng `CmsAdapter.getPost()` để tải nội dung + meta hiện tại. **Nhận diện `locale`
   của bài** và chấm điểm/tối ưu theo `KeywordSet` của đúng locale đó.
2. **Tạo `Revision`** (snapshot bản gốc) TRƯỚC khi đụng vào nội dung.
3. Chấm điểm hiện trạng bằng `seo-optimizer` và `geo-optimizer` →
   liệt kê điểm yếu cụ thể (thiếu meta, heading lộn xộn, không có đoạn trả lời ngắn,
   thiếu schema, internal link yếu, nội dung lỗi thời…).
4. Sinh **đề xuất chỉnh sửa** (giữ nguyên giọng văn & ý chính của tác giả; chỉ cải
   thiện, không viết lại toàn bộ trừ khi user yêu cầu). Bổ sung:
   - đoạn trả lời ngắn dạng trích dẫn được (GEO)
   - meta title/description, slug nếu cần
   - structured data / FAQ schema
   - internal/external link hợp lý
5. **Hiện diff** giữa bản gốc và bản tối ưu + điểm trước/sau. Chờ user duyệt.
6. Sau khi duyệt → `CmsAdapter.updatePost()`, ghi `PublishJob`. Báo kết quả + link bài.

Không cập nhật site nếu user chưa duyệt diff. Không xóa nội dung gốc — chỉ cải thiện.
