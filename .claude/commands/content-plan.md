---
description: Từ bộ từ khóa lên content plan (danh sách bài + outline + internal link)
argument-hint: <KeywordSet id hoặc chủ đề> [số bài]
---

Lên **content plan** từ bộ từ khóa: **$ARGUMENTS**

Mục tiêu: biến `KeywordSet` thành `ContentPlan` gồm nhiều `PlanItem` sẵn sàng để viết.

Các bước:

1. Lấy `KeywordSet` tương ứng (theo id, hoặc chạy `/keyword-research` trước nếu chưa
   có). Plan kế thừa `locale` của KeywordSet — mọi `PlanItem` cùng một ngôn ngữ. Nếu
   user nêu số bài, tôn trọng; mặc định đề xuất 8–12 bài.
2. Nhóm theo mô hình **pillar + cluster** (topic cluster): 1 bài trụ (pillar) + nhiều
   bài vệ tinh. Mỗi `PlanItem` gồm:
   - `title` (chuẩn SEO, có target keyword)
   - `targetKeyword` chính + 3–5 keyword phụ
   - `searchIntent` và **dạng nội dung** (how-to / listicle / so sánh / định nghĩa…)
   - `outline` (H2/H3) bao phủ cả ý phục vụ GEO (câu hỏi trực tiếp + câu trả lời ngắn)
   - `internalLinks` (liên kết tới các PlanItem khác trong plan)
   - `priority` (cao/trung/thấp dựa trên volume × intent × độ khó)
3. Đảm bảo **không trùng intent** giữa các bài (tránh keyword cannibalization).
4. Trả về bảng plan + sơ đồ liên kết nội bộ (pillar ↔ cluster).
5. Lưu `ContentPlan` vào DB hoặc xuất `docs/plans/`.

Mỗi bài phải tối ưu được cả SEO và GEO — tham chiếu
[docs/SEO-GEO-CHECKLIST.md](../../docs/SEO-GEO-CHECKLIST.md) khi dựng outline.
