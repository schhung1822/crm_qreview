---
description: Nghiên cứu bộ từ khóa từ một chủ đề/seed keyword (SEO + GEO)
argument-hint: <chủ đề hoặc seed keyword> [locale/thị trường, vd vi / en / ja]
---

Nghiên cứu bộ từ khóa cho chủ đề: **$ARGUMENTS**

Mục tiêu: tạo ra một `KeywordSet` phục vụ cả SEO lẫn GEO. Dùng subagent
`keyword-researcher` để làm phần thu thập và phân nhóm.

Các bước:

1. Xác định **seed keyword**, **locale/thị trường** (mặc định: `defaultLocale` của
   Project, hoặc Việt Nam / tiếng Việt). Nếu thiếu thông tin quan trọng, hỏi đúng 1
   câu rồi tiếp. **Mỗi locale là một KeywordSet riêng** — không dịch máy keyword giữa
   các ngôn ngữ vì volume/intent khác nhau theo thị trường.
2. Gọi `KeywordProvider` (DataForSEO mặc định, ở `src/lib/keywords/`) để lấy:
   - từ khóa liên quan + biến thể long-tail
   - `volume`, `difficulty`, `cpc`, `intent` (informational/commercial/transactional/navigational)
3. Sinh thêm **từ khóa dạng câu hỏi cho GEO** — những câu người dùng thực sự hỏi
   ChatGPT/Perplexity/Google AI (đánh dấu `isQuestion = true`). Dùng Claude
   (`claude-haiku-4-5-20251001`) ép theo schema Zod.
4. **Phân cụm (cluster)** từ khóa theo chủ đề con + intent.
5. Trả về bảng gọn: cluster → keyword → volume/difficulty/intent/loại(SEO|GEO), và
   highlight 5–10 từ khóa ưu tiên (volume khá + difficulty thấp + intent rõ).
6. Lưu thành `KeywordSet` trong DB (nếu app đã có), hoặc xuất ra `docs/keywords/`.

Không bịa số liệu volume/difficulty — chỉ dùng số từ provider. Nếu provider chưa cấu
hình (thiếu env), báo rõ và đề xuất chạy ở chế độ ước lượng (đánh dấu là ước lượng).
