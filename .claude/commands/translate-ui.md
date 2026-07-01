---
description: Thêm/cập nhật bản dịch giao diện (UI i18n) cho một ngôn ngữ
argument-hint: <locale, vd en / ja / fr>
---

Dịch giao diện app sang locale: **$ARGUMENTS**

Đây là i18n cho **giao diện** (next-intl), khác với bản địa hóa nội dung bài viết.

Các bước:

1. Đọc file message gốc `src/messages/{DEFAULT_LOCALE}.json` làm nguồn key.
2. Tạo/cập nhật `src/messages/{locale}.json` với **đầy đủ key** như bản gốc — không
   thiếu key (thiếu key sẽ vỡ UI hoặc rơi về fallback).
3. Dịch giá trị tự nhiên, đúng ngữ cảnh UI (ngắn gọn, đúng thuật ngữ Polaris/SEO).
   Giữ nguyên: placeholder `{name}`, biến ICU, HTML tag, key.
4. Chú ý số nhiều (ICU plural) và format ngày/số theo locale.
5. Thêm `locale` vào `SUPPORTED_LOCALES` (env) và cấu hình next-intl nếu là ngôn ngữ
   mới. Nếu là ngôn ngữ RTL (ar, he) → nhắc bật `dir="rtl"`.
6. Báo các key còn thiếu/thừa so với bản gốc.

Không hardcode chuỗi trong component — nếu phát hiện chuỗi chưa i18n hóa, liệt kê ra để
bổ sung vào message gốc trước.
