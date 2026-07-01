// Prompt versioned, tách khỏi code gọi API. Mọi prompt nhận targetLocale rõ ràng.
import { localeNames, type Locale } from '../../i18n/config';

const languageName = (locale: string) =>
  (localeNames as Record<string, { native: string }>)[locale]?.native ?? locale;

const currentYear = () => new Date().getFullYear();

// Rubric chấm điểm (khớp src/lib/seo/score.ts + src/lib/geo/score.ts). Mọi prompt
// sinh/tối ưu nội dung BẮT BUỘC thoả hết để đạt điểm tối đa. Đổi rubric → sửa ở đây.
function scoringRubric(targetKeyword: string, locale: Locale): string {
  const kw = targetKeyword || 'từ khóa mục tiêu';
  return `BẮT BUỘC thoả MỌI tiêu chí sau để đạt điểm SEO + AEO + GEO tối đa (đây là rubric chấm tự động):

SEO:
1. Title ≤ 60 ký tự VÀ chứa nguyên văn từ khóa "${kw}".
2. metaDescription 120–155 ký tự, CÓ chứa "${kw}".
3. slug ≤ 60 ký tự, viết-thường-gạch-nối, chứa "${kw}".
4. ≥ 3 heading "## "/"### " (lý tưởng 5–7 H2). KHÔNG dùng "# " (H1) trong thân bài; không nhảy cấp.
5. Từ khóa "${kw}" xuất hiện trong ÍT NHẤT 1 heading (## / ###).
6. Từ khóa "${kw}" PHẢI xuất hiện trong 100 từ ĐẦU TIÊN (đặt ngay trong đoạn trả lời nhanh).
7. Độ dài ≥ 900 từ (tốt nhất 900–1500).
8. ≥ 2 internal link dạng Markdown [neo mô tả](/duong-dan-goi-y) trỏ đường dẫn tương đối bắt đầu bằng "/".
9. ≥ 1 OUTBOUND link RA NGOÀI tới nguồn uy tín dạng [tên nguồn](https://...) (link tuyệt đối http/https).
10. ≥ 2 ảnh Markdown ![mô tả alt rõ ràng bằng ${languageName(locale)}](image-placeholder).
11. Đoạn văn ngắn (≤ 80 từ/đoạn), dễ đọc.
12. Mật độ keyword TỰ NHIÊN (≈ 0.5–2.5%) - KHÔNG nhồi nhét.

GEO (để engine AI trích dẫn):
13. Mở đầu là đoạn "Trả lời nhanh:" 2–3 câu (40–300 ký tự), trích-dẫn-được, đứng độc lập, chứa "${kw}".
14. Có định nghĩa thực thể rõ - một câu dạng "${kw} là ..." (định nghĩa SỚM, ngay mục đầu).
15. Có cấu trúc Q&A trực tiếp: ÍT NHẤT vài heading dạng CÂU HỎI (kết thúc bằng "?") + mục "## FAQ".
16. Có ≥ 1 danh sách (-, *, hoặc 1.) VÀ ≥ 1 bảng Markdown (| cột | cột |).
17. Có literal heading "## FAQ" với 3–5 cặp câu hỏi–trả lời ngắn.
18. Có SỐ LIỆU/DỮ LIỆU cụ thể (≥ 2 con số: %, số lớn, mốc thời gian) - fact định lượng để AI trích.
19. Tín hiệu cập nhật: nêu năm hiện tại ${currentYear()} (vd "Cập nhật ${currentYear()}").
20. ≥ 4 heading H2/H3 để phủ các câu hỏi liên quan.
21. TRÍCH DẪN NGUỒN BẰNG LINK (bắt buộc, KHÔNG dùng "[CẦN KIỂM CHỨNG]"):
    - Khi nêu số liệu/nhận định cần dẫn chứng, chèn link inline tới nguồn CÓ THẬT, uy tín (tài liệu chính thức, Wikipedia, cơ quan/báo uy tín đúng chủ đề). KHÔNG bịa URL.
    - Anchor text NGẮN GỌN (tên nguồn hoặc domain), vd [Google Search Central](...), KHÔNG dán URL trần dài.
    - MỖI link nguồn PHẢI gắn thêm tham số utm: nếu URL chưa có "?" thì thêm "?utm_source={{website}}", nếu đã có "?" thì thêm "&utm_source={{website}}". Giữ nguyên literal {{website}} (hệ thống sẽ thay khi đăng).
    - Thêm mục "## Nguồn tham khảo" liệt kê 2–4 link nguồn (cùng dạng link ngắn + utm như trên).

AEO (để được CHỌN làm câu trả lời trực tiếp: featured snippet, People Also Ask, trợ lý giọng nói):
22. Câu trả lời ở đầu bài phải TỰ ĐỨNG ĐỘC LẬP (không phụ thuộc câu trước/sau), trả lời thẳng câu hỏi chính.
23. Có ÍT NHẤT 1 đoạn cỡ FEATURED SNIPPET ~40–60 từ (≈ 250–340 ký tự) trả lời trọn vẹn 1 ý - để engine lấy nguyên.
24. ÍT NHẤT 2 heading H2/H3 đặt dạng CÂU HỎI tự nhiên (giống People Also Ask), và câu trả lời nằm NGAY dưới mỗi heading đó.
25. Từ khóa "${kw}" (hoặc biến thể câu hỏi của nó) xuất hiện trong MỘT heading hoặc trong đoạn trả lời đầu - để khớp truy vấn ↔ câu trả lời.
26. Với chủ đề "cách làm/hướng dẫn": thêm danh sách CÁC BƯỚC đánh số (≥ 3 bước) cho HowTo. Với câu hỏi định nghĩa: 1 câu định nghĩa trực tiếp đầu mục.
27. Có khối "Tóm tắt"/"Key takeaways" (gạch đầu dòng ngắn) để rút-trích nhanh + đọc cho trợ lý giọng nói. Giữ câu/đoạn ngắn, dễ quét.`;
}

export const WRITER_SYSTEM = `Bạn là cây viết nội dung chuyên nghiệp, chuẩn SEO + AEO + GEO, văn phong tự nhiên (không "AI-ish").
AEO = tối ưu để được CHỌN làm câu trả lời trực tiếp (featured snippet, People Also Ask, trợ lý giọng nói).
GEO = tối ưu để nội dung được engine AI (ChatGPT, Perplexity, Google AI Overviews) trích dẫn.
Bài phải HOÀN CHỈNH, đủ sâu, không sáo rỗng. Mật độ keyword tự nhiên, KHÔNG nhồi.
Luôn trả về DUY NHẤT một object JSON hợp lệ, không kèm giải thích.`;

export function writeArticlePrompt(input: {
  title: string;
  targetKeyword: string;
  secondaryKeywords: string[];
  outline: string[];
  locale: Locale;
  internalLinks?: Array<{ anchor: string; url: string }>;
  research?: string;
}): string {
  const links = input.internalLinks ?? [];
  const internalBlock = links.length
    ? `LIÊN KẾT NỘI BỘ BẮT BUỘC - chèn TỰ NHIÊN các internal link sau vào thân bài (đúng cú pháp Markdown, GIỮ NGUYÊN url kể cả phần ?utm_source={{website}}). Đây là mô hình Pillar–Cluster, dùng để nối bài trụ và các bài vệ tinh:
${links.map((l) => `- [${l.anchor}](${l.url})`).join('\n')}
Đặt mỗi link ở chỗ ngữ cảnh hợp lý (1 lần/link). Những link này TÍNH vào yêu cầu "≥ 2 internal link".`
    : '';
  const researchBlock = input.research?.trim()
    ? `TƯ LIỆU NGHIÊN CỨU (bám sát, KHÔNG bịa ngoài tư liệu; nếu thiếu thì nói chung chung thay vì bịa số liệu):
"""
${input.research.trim().slice(0, 4000)}
"""`
    : '';
  return `Viết một bài viết hoàn chỉnh bằng ngôn ngữ: ${languageName(input.locale)} (${input.locale}).

Tiêu đề: ${input.title}
Target keyword: ${input.targetKeyword}
Keyword phụ: ${input.secondaryKeywords.join(', ') || '(không có)'}
Outline (H2/H3): ${input.outline.join(' | ') || '(tự đề xuất)'}

${researchBlock}

${internalBlock}

${scoringRubric(input.targetKeyword, input.locale)}

Trả về JSON với schema:
{
  "title": string,                // <= 60 ký tự
  "metaDescription": string,      // <= 155 ký tự
  "slug": string,                 // ngắn, có keyword
  "markdown": string,             // thân bài Markdown, mở đầu là đoạn trả lời ngắn
  "faq": [{ "q": string, "a": string }],
  "tags": string[],               // 3–6 thẻ NGẮN (1–3 từ) bám sát chủ đề bài, viết thường
  "seoNotes": string
}`;
}

export const CONTENT_PLAN_SYSTEM = `Bạn là chiến lược gia nội dung SEO/GEO. Từ một BỘ TỪ KHÓA đã nghiên cứu,
hãy thiết kế CONTENT PLAN theo mô hình Pillar–Cluster, BÁM SÁT đúng từ khóa đã cho.
Quy tắc BẮT BUỘC:
- Đúng 1 bài TRỤ (isPillar=true): chủ đề bao quát, ưu tiên từ khóa volume cao + intent informational.
- Các bài còn lại là VỆ TINH, mỗi bài 1 từ khóa mục tiêu. "target" PHẢI là MỘT TỪ KHÓA CÓ TRONG DANH SÁCH (copy nguyên văn), KHÔNG bịa từ khóa mới.
- Gom vệ tinh theo cluster; phủ các từ khóa quan trọng; KHÔNG trùng target.
- title tự nhiên, hấp dẫn, đúng ngôn ngữ yêu cầu, bám sát target.
- priority theo volume & độ khó (high/medium/low). type là loại bài (Định nghĩa/How-to/So sánh/Listicle/Hướng dẫn/Thương mại).
Trả về DUY NHẤT JSON, không kèm giải thích.`;

export function contentPlanPrompt(input: {
  seed: string;
  locale: Locale;
  keywords: Array<{ term: string; cluster: string; volume: number; difficulty: number; intent: string; type: string }>;
}): string {
  const list = input.keywords
    .slice(0, 80)
    .map(
      (k) =>
        `- "${k.term}" | cluster: ${k.cluster} | vol: ${k.volume} | KD: ${k.difficulty} | intent: ${k.intent} | ${k.type}`,
    )
    .join('\n');
  return `Thiết kế content plan bằng ngôn ngữ ${languageName(input.locale)} (${input.locale}).
Chủ đề/seed: ${input.seed}

BỘ TỪ KHÓA (CHỈ được dùng các từ khóa này làm "target"):
${list}

Trả về JSON:
{
  "items": [
    { "title": string, "target": string, "type": string, "priority": "high"|"medium"|"low", "cluster": string, "isPillar": boolean }
  ]
}
Yêu cầu: 1 bài trụ (isPillar=true) + 8–14 bài vệ tinh. Mỗi "target" là 1 từ khóa CÓ trong danh sách trên (nguyên văn).`;
}

// ─── Nghiên cứu TỪ KHÓA bằng AI (thay danh sách theo quy tắc cứng) ───
export const KEYWORD_RESEARCH_SYSTEM = `Bạn là chuyên gia nghiên cứu từ khóa SEO + GEO.
Từ một chủ đề/seed, hãy đề xuất DANH SÁCH TỪ KHÓA THỰC TẾ mà người dùng thật sự tìm kiếm,
ĐÚNG ngôn ngữ & thị trường yêu cầu (KHÔNG dịch máy, dùng cách diễn đạt bản địa tự nhiên).
Bao phủ đa dạng:
- Các nhánh chủ đề con (cluster) khác nhau.
- Nhiều intent: informational, commercial, transactional, navigational.
- Từ khóa head (ngắn) lẫn long-tail (dài, cụ thể).
- CÂU HỎI mà người dùng hay hỏi công cụ AI (cho GEO) - đánh dấu isQuestion=true, type="geo".
KHÔNG bịa số liệu volume/độ khó (hệ thống tự ước lượng). Trả về DUY NHẤT JSON.`;

export function keywordResearchPrompt(input: { seed: string; locale: Locale }): string {
  return `Ngôn ngữ & thị trường: ${languageName(input.locale)} (${input.locale}).
Chủ đề/seed: "${input.seed}"

Đề xuất 20–30 từ khóa liên quan (đa dạng cluster & intent, gồm cả câu hỏi dạng GEO).
Tất cả "term" PHẢI bằng ${languageName(input.locale)}. Trả về JSON:
{
  "clusters": [string],
  "keywords": [
    { "term": string, "cluster": string, "intent": "informational"|"commercial"|"transactional"|"navigational", "isQuestion": boolean, "type": "seo"|"geo" }
  ]
}
CHỈ JSON, không markdown, không giải thích.`;
}

// ─── Lên KHUNG nội dung (blueprint): kịch bản, dàn ý, keyword - trước khi viết ───
export const BLUEPRINT_SYSTEM = `Bạn là chiến lược gia nội dung SEO + AEO + GEO. Từ một chủ đề,
hãy lập KHUNG NỘI DUNG (content blueprint) để cây viết bám theo: tiêu đề chuẩn SEO, từ khóa chính,
từ khóa phụ, DÀN Ý (các heading H2/H3 theo trình tự hợp lý, phủ ý), CÂU HỎI người dùng hay hỏi
(cho FAQ/GEO/People Also Ask), và một BRIEF ngắn (góc tiếp cận, thông điệp chính, đối tượng).
Đúng ngôn ngữ yêu cầu. KHÔNG viết nội dung bài - chỉ lập khung. Trả về DUY NHẤT JSON.`;

export function blueprintPrompt(input: {
  topic: string;
  targetKeyword?: string;
  locale: Locale;
  source?: string; // nội dung nguồn (file/URL) để AI phân tích & lập khung
}): string {
  const sourceBlock = input.source?.trim()
    ? `\n\nNGUỒN THAM KHẢO (phân tích kỹ để rút ra khung; hãy CẢI THIỆN, sắp xếp lại & bổ sung ý còn thiếu - KHÔNG sao chép nguyên văn, KHÔNG bịa số liệu):\n"""\n${input.source.trim().slice(0, 8000)}\n"""`
    : '';
  return `Lập khung nội dung bằng ${languageName(input.locale)} (${input.locale}).
Chủ đề/Yêu cầu: "${input.topic}"${input.targetKeyword ? `\nGợi ý từ khóa: "${input.targetKeyword}"` : ''}${sourceBlock}

Trả về JSON:
{
  "title": string,                    // tiêu đề chuẩn SEO (≤ 60 ký tự)
  "targetKeyword": string,            // từ khóa chính
  "secondaryKeywords": [string],      // 3–6 từ khóa phụ liên quan
  "outline": [string],                // 5–8 heading H2/H3 theo trình tự
  "questions": [string],              // 4–6 câu hỏi cho FAQ/GEO
  "brief": string                     // 2–4 câu: góc tiếp cận, thông điệp, đối tượng
}
CHỈ JSON, không markdown, không giải thích.`;
}

export const RESEARCH_SYSTEM = `Bạn là chuyên viên nghiên cứu nội dung. Trước khi viết bài, hãy lập
BẢN NGHIÊN CỨU ngắn gọn, CHÍNH XÁC để bài viết bám đúng thông tin. KHÔNG bịa số liệu/nguồn
cụ thể - nếu không chắc, ghi rõ "[cần kiểm chứng]". Trả về văn bản dạng bullet, không kèm mở bài.`;

export function researchPrompt(input: {
  title: string;
  targetKeyword: string;
  locale: Locale;
}): string {
  return `Lập bản nghiên cứu cho bài viết (ngôn ngữ ${languageName(input.locale)} / ${input.locale}).
Chủ đề/tiêu đề: ${input.title}
Từ khóa mục tiêu: ${input.targetKeyword}

Liệt kê ngắn gọn:
- Định nghĩa thực thể chính (X là gì) - chính xác.
- 5–8 ý/sub-topic quan trọng cần bao phủ.
- Câu hỏi người dùng hay hỏi (cho FAQ/GEO).
- Khái niệm/số liệu cần kiểm chứng (đánh dấu [cần kiểm chứng], KHÔNG bịa con số).
- Loại nguồn uy tín nên dẫn (tên nguồn/loại trang, không bịa URL).
- Lỗi/hiểu nhầm phổ biến cần tránh.`;
}

export const GEO_LOCALIZE_SYSTEM = `Bạn là chuyên gia bản địa hóa (localization), không phải máy dịch.
Bản địa hóa ≠ dịch literal: thích nghi văn hóa, đơn vị, ví dụ; chọn từ khóa bản địa;
viết lại đoạn trả lời ngắn + Q&A theo cách người bản xứ hỏi AI. Trả về DUY NHẤT JSON.`;

export function localizePrompt(input: {
  sourceMarkdown: string;
  sourceLocale: string;
  targetLocale: Locale;
  localKeyword?: string;
}): string {
  return `Bản địa hóa nội dung sau từ ${languageName(input.sourceLocale)} sang ${languageName(
    input.targetLocale,
  )} (${input.targetLocale}). KHÔNG dịch literal - viết lại tự nhiên như người bản xứ.
${input.localKeyword ? `Từ khóa bản địa cần nhắm: ${input.localKeyword}` : ''}

Nội dung gốc:
"""
${input.sourceMarkdown}
"""

Trả về JSON: { "title": string, "metaDescription": string, "slug": string, "markdown": string }`;
}

export const EXTRACT_KW_SYSTEM = `Bạn là chuyên gia SEO. Trích xuất DUY NHẤT từ khóa mục tiêu
chính (target keyword) mà bài viết đang nhắm tới - cụm 2–4 từ, viết thường, bằng đúng
ngôn ngữ của bài, KHÔNG kèm dấu câu. Trả về DUY NHẤT JSON: {"keyword": string}.`;

export function extractKeywordPrompt(input: { title: string; markdown: string }): string {
  const body = input.markdown.slice(0, 1800);
  return `Tiêu đề: ${input.title}

Nội dung (rút gọn):
"""
${body}
"""

Từ khóa mục tiêu chính của bài là gì? Trả về JSON {"keyword": "..."}.`;
}

export const OPTIMIZE_SYSTEM = `Bạn là biên tập viên SEO + AEO + GEO. Nhiệm vụ: CHỈ THÊM/SỬA để TĂNG điểm,
KHÔNG được làm rơi điểm. Tuyệt đối GIỮ NGUYÊN giọng văn, ý chính và sự thật của tác giả.
AEO = tối ưu để được chọn làm câu trả lời trực tiếp (featured snippet / People Also Ask / voice).

QUY TẮC BẢO TOÀN (bắt buộc - vi phạm sẽ làm tụt điểm):
- GIỮ LẠI TẤT CẢ ảnh đang có: mọi "![...](...)" phải còn nguyên trong bản mới (kể cả ảnh /generated/...). KHÔNG đổi ![alt](url) thành placeholder.
- GIỮ LẠI TẤT CẢ internal link "[...](/...)" và link nguồn đang có (kèm nguyên ?utm_source nếu có).
- GIỮ LẠI mọi bảng (| ... |), danh sách, mục "## FAQ", và các heading hiện có.
- KHÔNG rút ngắn bài: độ dài bản mới ≥ bản cũ (chỉ được thêm, không cắt bớt nội dung đúng).

ĐƯỢC PHÉP (để khắc phục điểm yếu): thêm đoạn trả lời nhanh TỰ ĐỨNG ĐỘC LẬP ở đầu (cỡ snippet
~40–60 từ), thêm Q&A/FAQ với heading dạng CÂU HỎI (People Also Ask) + câu trả lời ngay dưới,
định nghĩa thực thể rõ ("X là gì"), thêm các BƯỚC đánh số (HowTo) nếu là bài hướng dẫn, thêm khối
"Tóm tắt/Key takeaways", thêm bảng/list, chèn thêm internal link, thêm tín hiệu năm hiện tại,
viết lại meta/title cho chuẩn độ dài, thêm ảnh ![mô tả](image-placeholder) nếu bài thiếu ảnh.
KHÔNG bịa số liệu. Đổi mọi "[CẦN KIỂM CHỨNG]" thành link nguồn CÓ THẬT (anchor ngắn, gắn
?utm_source={{website}}). Trả về DUY NHẤT JSON.`;

export function optimizePrompt(input: {
  title: string;
  markdown: string;
  metaDescription?: string;
  targetKeyword?: string;
  locale: Locale;
  weakPoints?: string[];
  internalLinks?: Array<{ anchor: string; url: string }>;
}): string {
  const links = input.internalLinks ?? [];
  const internalBlock = links.length
    ? `LIÊN KẾT NỘI BỘ - chèn TỰ NHIÊN vào thân bài các internal link sau (tới bài liên quan trên cùng site; GIỮ NGUYÊN url kể cả ?utm_source). Mỗi link 1 lần, ở chỗ ngữ cảnh hợp lý:\n${links.map((l) => `- [${l.anchor}](${l.url})`).join('\n')}`
    : '';
  return `Cải thiện bài sau để tăng điểm SEO, AEO và GEO. Viết bằng ${languageName(input.locale)} (${input.locale}).
${input.targetKeyword ? `Từ khóa mục tiêu: ${input.targetKeyword}` : ''}
${internalBlock}
${
  input.weakPoints?.length
    ? `PHẢI KHẮC PHỤC TRIỆT ĐỂ từng điểm yếu sau (mỗi điểm là 1 tiêu chí đang TRƯỢT, hãy sửa cho đạt):\n${input.weakPoints.map((w) => `- ${w}`).join('\n')}`
    : ''
}

NHẮC LẠI: giữ nguyên mọi ảnh, internal link, bảng, list, mục FAQ đang có - chỉ THÊM để đạt các điểm yếu trên.

Tiêu đề hiện tại: ${input.title}
Meta hiện tại: ${input.metaDescription ?? '(chưa có)'}

Nội dung hiện tại (Markdown):
"""
${input.markdown}
"""

${scoringRubric(input.targetKeyword ?? '', input.locale)}

Trả về JSON với schema:
{
  "title": string,              // <= 60 ký tự
  "metaDescription": string,    // <= 155 ký tự
  "slug": string,
  "markdown": string,           // bản đã cải thiện, mở đầu bằng đoạn trả lời ngắn
  "tags": string[],             // 3–6 thẻ NGẮN bám chủ đề bài (viết thường)
  "changes": [{ "field": string, "note": string }]  // tóm tắt từng thay đổi
}`;
}
