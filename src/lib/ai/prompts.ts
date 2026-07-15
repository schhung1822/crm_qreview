// Builder prompt: tính các BIẾN từ input rồi giao cho registry/override resolve (prompt-store).
// Mặc định (không ghi đè) → dùng chính build() trong registry ⇒ giữ NGUYÊN VĂN như trước.
// Mỗi builder trả { system, user } để nơi gọi truyền thẳng vào complete().
import { localeNames, type Locale } from '../../i18n/config';
import { renderPrompt, renderUser } from './prompt-store';

const languageName = (locale: string) =>
  (localeNames as Record<string, { native: string }>)[locale]?.native ?? locale;

// Khối "giọng thương hiệu": rỗng nếu không có; nếu có → qua fragment (admin sửa được).
async function brandVoiceVar(bv?: string): Promise<string> {
  const v = bv?.trim();
  return v ? renderUser('brand_voice', { noi_dung_giong: v.slice(0, 4000) }) : '';
}

// Rubric chấm điểm (fragment dùng chung, admin sửa được).
function rubricVar(targetKeyword: string, locale: Locale): Promise<string> {
  return renderUser('scoring_rubric', { tu_khoa: targetKeyword, ngon_ngu: languageName(locale) });
}

export async function writeArticlePrompt(input: {
  title: string;
  targetKeyword: string;
  secondaryKeywords: string[];
  outline: string[];
  locale: Locale;
  internalLinks?: Array<{ anchor: string; url: string }>;
  research?: string;
  brandVoice?: string;
}): Promise<{ system: string; user: string }> {
  const links = input.internalLinks ?? [];
  const internalBlock = links.length
    ? `LIÊN KẾT NỘI BỘ - chèn TỰ NHIÊN CHÍNH XÁC các internal link sau vào thân bài (đúng cú pháp Markdown, GIỮ NGUYÊN url kể cả phần ?utm_source={{website}}), mỗi link đúng 1 lần ở chỗ ngữ cảnh hợp lý. Đây là mô hình Pillar–Cluster nối bài trụ ↔ bài vệ tinh (chỉ gồm các bài ĐÃ ĐĂNG, tồn tại thật). KHÔNG thêm bất kỳ internal link nào KHÁC ngoài danh sách này:
${links.map((l) => `- [${l.anchor}](${l.url})`).join('\n')}`
    : 'LIÊN KẾT NỘI BỘ: (không có bài nội bộ nào đã đăng để liên kết) → KHÔNG chèn bất kỳ internal link nội bộ nào. Chỉ được dùng OUTBOUND link ra nguồn ngoài uy tín có thật.';
  const researchBlock = input.research?.trim()
    ? `TƯ LIỆU NGHIÊN CỨU (bám sát, KHÔNG bịa ngoài tư liệu; nếu thiếu thì nói chung chung thay vì bịa số liệu):
"""
${input.research.trim().slice(0, 4000)}
"""`
    : '';
  const titleLine = input.title.trim()
    ? `Tiêu đề: ${input.title}`
    : 'Tiêu đề: (CHƯA CÓ — TỰ ĐẶT một tiêu đề chuẩn SEO, hấp dẫn, <= 60 ký tự, bám YÊU CẦU/TƯ LIỆU bên dưới. KHÔNG chép nguyên văn câu yêu cầu thành tiêu đề.)';
  const kwLine = input.targetKeyword.trim()
    ? `Target keyword: ${input.targetKeyword}`
    : 'Target keyword: (CHƯA CÓ — TỰ CHỌN 1 cụm từ khóa chính 2–4 từ, ngắn gọn, đúng chủ đề bài.)';
  return renderPrompt('write_article', {
    ngon_ngu: languageName(input.locale),
    ma_ngon_ngu: input.locale,
    dong_tieu_de: titleLine,
    dong_tu_khoa: kwLine,
    tu_khoa_phu: input.secondaryKeywords.join(', ') || '(không có)',
    dan_y: input.outline.join(' | ') || '(tự đề xuất)',
    tu_lieu_nghien_cuu: researchBlock,
    lien_ket_noi_bo: internalBlock,
    giong_thuong_hieu: await brandVoiceVar(input.brandVoice),
    rubric_cham_diem: await rubricVar(input.targetKeyword || 'từ khóa chính bạn tự chọn ở trên', input.locale),
  });
}

export async function contentPlanPrompt(input: {
  seed: string;
  locale: Locale;
  keywords: Array<{ term: string; cluster: string; volume: number; difficulty: number; intent: string; type: string }>;
}): Promise<{ system: string; user: string }> {
  const list = input.keywords
    .slice(0, 80)
    .map(
      (k) =>
        `- "${k.term}" | cluster: ${k.cluster} | vol: ${k.volume} | KD: ${k.difficulty} | intent: ${k.intent} | ${k.type}`,
    )
    .join('\n');
  return renderPrompt('content_plan', {
    ngon_ngu: languageName(input.locale),
    ma_ngon_ngu: input.locale,
    seed: input.seed,
    danh_sach_tu_khoa: list,
  });
}

export async function keywordResearchPrompt(input: { seed: string; locale: Locale }): Promise<{ system: string; user: string }> {
  return renderPrompt('keyword_research', {
    ngon_ngu: languageName(input.locale),
    ma_ngon_ngu: input.locale,
    seed: input.seed,
  });
}

export async function blueprintPrompt(input: {
  topic: string;
  targetKeyword?: string;
  locale: Locale;
  source?: string;
}): Promise<{ system: string; user: string }> {
  const sourceBlock = input.source?.trim()
    ? `\n\nNGUỒN THAM KHẢO (phân tích kỹ để rút ra khung; hãy CẢI THIỆN, sắp xếp lại & bổ sung ý còn thiếu - KHÔNG sao chép nguyên văn, KHÔNG bịa số liệu):\n"""\n${input.source.trim().slice(0, 8000)}\n"""`
    : '';
  return renderPrompt('blueprint', {
    ngon_ngu: languageName(input.locale),
    ma_ngon_ngu: input.locale,
    chu_de: input.topic,
    dong_goi_y_tu_khoa: input.targetKeyword ? `\nGợi ý từ khóa: "${input.targetKeyword}"` : '',
    khoi_nguon: sourceBlock,
  });
}

export async function researchPrompt(input: {
  title: string;
  targetKeyword: string;
  locale: Locale;
}): Promise<{ system: string; user: string }> {
  return renderPrompt('research', {
    ngon_ngu: languageName(input.locale),
    ma_ngon_ngu: input.locale,
    tieu_de: input.title,
    tu_khoa: input.targetKeyword,
  });
}

export async function localizePrompt(input: {
  sourceMarkdown: string;
  sourceLocale: string;
  targetLocale: Locale;
  localKeyword?: string;
  brandVoice?: string;
}): Promise<{ system: string; user: string }> {
  return renderPrompt('localize', {
    ngon_ngu_nguon: languageName(input.sourceLocale),
    ngon_ngu_dich: languageName(input.targetLocale),
    ma_ngon_ngu_dich: input.targetLocale,
    dong_tu_khoa_ban_dia: input.localKeyword ? `Từ khóa bản địa cần nhắm: ${input.localKeyword}` : '',
    giong_thuong_hieu: await brandVoiceVar(input.brandVoice),
    noi_dung_goc: input.sourceMarkdown,
  });
}

export async function extractKeywordPrompt(input: { title: string; markdown: string }): Promise<{ system: string; user: string }> {
  return renderPrompt('extract_keyword', {
    tieu_de: input.title,
    noi_dung: input.markdown.slice(0, 1800),
  });
}

export async function optimizePrompt(input: {
  title: string;
  markdown: string;
  metaDescription?: string;
  targetKeyword?: string;
  locale: Locale;
  weakPoints?: string[];
  internalLinks?: Array<{ anchor: string; url: string }>;
  brandVoice?: string;
}): Promise<{ system: string; user: string }> {
  const links = input.internalLinks ?? [];
  const internalBlock = links.length
    ? `LIÊN KẾT NỘI BỘ - chèn TỰ NHIÊN vào thân bài các internal link sau (tới bài liên quan trên cùng site; GIỮ NGUYÊN url kể cả ?utm_source). Mỗi link 1 lần, ở chỗ ngữ cảnh hợp lý:\n${links.map((l) => `- [${l.anchor}](${l.url})`).join('\n')}`
    : '';
  return renderPrompt('optimize', {
    ngon_ngu: languageName(input.locale),
    ma_ngon_ngu: input.locale,
    dong_tu_khoa: input.targetKeyword ? `Từ khóa mục tiêu: ${input.targetKeyword}` : '',
    lien_ket_noi_bo: internalBlock,
    diem_yeu: input.weakPoints?.length
      ? `PHẢI KHẮC PHỤC TRIỆT ĐỂ từng điểm yếu sau (mỗi điểm là 1 tiêu chí đang TRƯỢT, hãy sửa cho đạt):\n${input.weakPoints.map((w) => `- ${w}`).join('\n')}`
      : '',
    giong_thuong_hieu: await brandVoiceVar(input.brandVoice),
    tieu_de: input.title,
    meta: input.metaDescription ?? '(chưa có)',
    noi_dung: input.markdown,
    rubric_cham_diem: await rubricVar(input.targetKeyword || 'từ khóa mục tiêu', input.locale),
  });
}

export async function factCheckPrompt(input: { markdown: string; locale: Locale }): Promise<{ system: string; user: string }> {
  return renderPrompt('fact_check', {
    ngon_ngu: languageName(input.locale),
    noi_dung: input.markdown.slice(0, 16000),
  });
}

export async function humanizePrompt(input: { markdown: string; locale: Locale }): Promise<{ system: string; user: string }> {
  return renderPrompt('humanize', {
    ngon_ngu: languageName(input.locale),
    noi_dung: input.markdown,
  });
}
