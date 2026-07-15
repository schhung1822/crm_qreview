// Pipeline phân tích AI cho Báo cáo Social - 3 bước (thương hiệu → chiến thuật → tổng kết).
// Prompt sống ở prompt-registry (social_brand / social_tactics / social_summary) → admin
// tùy chỉnh được ở tab Prompt. Gọi qua completeJson → tự hưởng định tuyến provider,
// cưỡng chế gói/hạn mức và ghi nhận token. Người dùng chọn AI/model ở pha phân tích →
// truyền vào qua AiOverride. Output validate bằng Zod KHOAN DUNG (field lỗi → giá trị
// rỗng rồi lọc bỏ, chỉ fail khi rỗng toàn phần) + dedash.
import { z } from 'zod';
import { localeNames } from '../../i18n/config';
import { dedash } from '../content/dedash';
import { renderPrompt } from '../ai/prompt-store';
import { BudgetError, PlanError, complete, type AiOverride } from '../ai/providers';
import { extractJson } from '../ai/json';
import { canonicalUrl, mergePosts } from './metrics';
import type {
  AnalyzedItem,
  SocialBrandAnalysis,
  SocialCompareAnalysis,
  SocialEcomCompetitorsAnalysis,
  SocialEcomMarketAnalysis,
  SocialEcomSummaryAnalysis,
  SocialGroupAudienceAnalysis,
  SocialGroupSummaryAnalysis,
  SocialGroupTopicsAnalysis,
  SocialReportRecord,
  SocialShopCatalogAnalysis,
  SocialShopeeProductAnalysis,
  SocialShopeeReviewsAnalysis,
  SocialShopeeSummaryAnalysis,
  SocialShopSummaryAnalysis,
  SocialStyleProfile,
  SocialSummaryAnalysis,
  SocialTacticsAnalysis,
} from './types';

const languageName = (locale: string) =>
  (localeNames as Record<string, { native: string }>)[locale]?.native ?? locale;

const cut = (s: string | undefined, n: number) => (s ? s.slice(0, n) : undefined);

// Override từ lựa chọn AI của người dùng lưu trong báo cáo ('' = Tự động → undefined).
export function overrideFromReport(r: SocialReportRecord): AiOverride | undefined {
  if (!r.ai?.provider) return undefined;
  return { provider: r.ai.provider as AiOverride['provider'], model: r.ai.model || undefined };
}

// Rút gọn dữ liệu báo cáo thành digest JSON đưa vào prompt (kiểm soát độ dài).
// Đa kênh: mảng channels[] - mỗi kênh có kind (facebook/tiktok/youtube), bài đăng đánh số
// "i" RIÊNG theo kênh → AI tham chiếu "Bài N (kênh)".
export function buildDigest(r: SocialReportRecord): string {
  const perChannelPosts = r.channels.length > 1 ? 8 : 12;
  const digest = {
    keyword: r.keyword, // báo cáo tổng thể theo keyword (nếu có)
    channels: r.channels.map((c) => ({
      kind: c.kind,
      page: c.page
        ? {
            name: c.page.name,
            likes: c.page.likes,
            followers: c.page.followers,
            categories: c.page.categories,
            rating: c.page.rating,
            intro: cut(c.page.intro, 400),
          }
        : undefined,
      posts: mergePosts(c.posts, c.reels)
        .slice(0, perChannelPosts)
        .map((p, idx) => ({
          i: idx + 1, // tham chiếu "Bài N" (kèm tên kênh khi nhiều kênh)
          type: p.type,
          time: p.time?.slice(0, 10),
          reactions: p.reactions,
          comments: p.comments,
          shares: p.shares,
          views: p.views,
          text: cut(p.text, 500),
          transcript: cut(p.transcript, 1200),
        })),
      ads: c.ads.slice(0, 10).map((a, idx) => ({
        i: idx + 1, // "Quảng cáo N"
        text: cut(a.text, 400),
        cta: a.cta,
        format: a.format,
      })),
      topComments: c.comments.slice(0, 20).map((cm) => ({
        text: cut(cm.text, 160),
        likes: cm.likes,
      })),
      metrics: c.metrics,
    })),
    totalMetrics: r.channels.length > 1 ? r.metrics : undefined,
  };
  return JSON.stringify(digest, null, 1);
}

// ── Zod schemas KHOAN DUNG: field sai kiểu/thiếu → giá trị rỗng (không fail cả batch),
// item rỗng bị lọc; chỉ báo lỗi khi kết quả rỗng toàn phần (thường do JSON cắt cụt). ──

const s = (def = '') => z.string().catch(def).default(def);
const so = () => z.string().optional().catch(undefined);

const ItemSchema = z
  .object({
    name: s(),
    // vài model trả "title" thay vì "name" → nhận cả hai
    title: so(),
    desc: s(),
    effectiveness: so(),
    posts: so(),
    reason: so(),
  })
  .catch({ name: '', title: undefined, desc: '', effectiveness: undefined, posts: undefined, reason: undefined });

type RawItem = z.infer<typeof ItemSchema>;

function toItems(raw: RawItem[], max = 8): AnalyzedItem[] {
  return raw
    .map((it) => ({
      name: dedash(it.name || it.title || ''),
      desc: dedash(it.desc || ''),
      effectiveness: it.effectiveness ? dedash(it.effectiveness) : undefined,
      posts: it.posts ? dedash(it.posts) : undefined,
    }))
    .filter((it) => it.name || it.desc)
    .slice(0, max);
}

const items = () => z.array(ItemSchema).catch([]).default([]);

const BrandSchema = z.object({
  positioning: s(),
  voice: s(),
  targetAudience: s(),
  contentPillars: items(),
  contentFormulas: items(),
});

const TacticsSchema = z.object({
  hooks: items(),
  leading: items(),
  ctas: items(),
  adStrategy: z
    .object({ objective: s(), formulas: items(), angles: items() })
    .catch({ objective: '', formulas: [], angles: [] })
    .default({ objective: '', formulas: [], angles: [] }),
  funnel: z
    .object({ tofu: s(), mofu: s(), bofu: s() })
    .catch({ tofu: '', mofu: '', bofu: '' })
    .default({ tofu: '', mofu: '', bofu: '' }),
});

const SummarySchema = z.object({
  summary: s(),
  strengths: items(),
  weaknesses: items(),
  avoid: items(),
  learnFrom: items(),
  contentIdeas: items(),
});

const CompareSchema = z.object({
  overview: s(),
  channels: items(),
  bestFormats: items(),
  allocation: s(),
});

const dd = (v: string) => dedash(v);

// Gọi AI + parse; báo lỗi dễ hiểu (kèm log chẩn đoán) khi không dùng được.
async function callAnalysis<S extends z.ZodTypeAny>(
  promptId: string,
  vars: Record<string, string>,
  schema: S,
  override: AiOverride | undefined,
  maxTokens: number,
  stepLabel: string,
): Promise<z.output<S>> {
  const p = await renderPrompt(promptId, vars);
  // Gọi trực tiếp complete() (thay vì completeJson nuốt lỗi) để SURFACE lý do thật khi hỏng:
  // model sai/không tồn tại, hết credit (402), quá tải (429), context tràn... - giúp user chẩn đoán.
  let result: Awaited<ReturnType<typeof complete>>;
  try {
    result = await complete(
      'analysis',
      { system: p.system, prompt: p.user, maxTokens, json: true },
      'writer',
      override,
    );
  } catch (e) {
    if (e instanceof BudgetError || e instanceof PlanError) throw e; // lớp trên hiện đúng thông báo gói
    const msg = e instanceof Error ? e.message : 'unknown';
    throw new Error(
      `Bước ${stepLabel}: gọi AI lỗi - ${msg}. Kiểm tra API key/model AI trong Quản lý kết nối, hoặc chọn AI/model khác.`,
    );
  }
  if (!result)
    throw new Error(
      `Bước ${stepLabel}: chưa có API key AI khả dụng. Thêm hoặc bật một API key AI trong Quản lý kết nối.`,
    );
  const raw = extractJson(result.text);
  if (raw == null)
    throw new Error(
      `AI (${result.provider}) không trả về JSON hợp lệ cho bước ${stepLabel} - output có thể bị cắt cụt hoặc kèm chữ thừa. Bấm Thử lại hoặc chọn model mạnh hơn.`,
    );
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    console.error(`[social:${promptId}] output không khớp schema:`, parsed.error.issues.slice(0, 5));
    throw new Error(
      `AI trả về dữ liệu không đúng cấu trúc cho bước ${stepLabel}. Bấm Thử lại hoặc chọn model mạnh hơn.`,
    );
  }
  return parsed.data;
}

// ── 3 bước phân tích ──

export async function analyzeBrand(r: SocialReportRecord): Promise<SocialBrandAnalysis> {
  const v = await callAnalysis(
    'social_brand',
    { ngon_ngu: languageName(r.locale), ma_ngon_ngu: r.locale, du_lieu_kenh: buildDigest(r) },
    BrandSchema,
    overrideFromReport(r),
    5000,
    'phân tích thương hiệu',
  );
  const out: SocialBrandAnalysis = {
    positioning: dd(v.positioning),
    voice: dd(v.voice),
    targetAudience: dd(v.targetAudience),
    contentPillars: toItems(v.contentPillars),
    contentFormulas: toItems(v.contentFormulas),
  };
  if (!out.positioning && !out.voice && !out.contentPillars.length)
    throw new Error(
      'AI trả về phân tích thương hiệu rỗng (thường do output bị cắt cụt). Bấm Thử lại hoặc chọn model mạnh hơn.',
    );
  return out;
}

export async function analyzeTactics(r: SocialReportRecord): Promise<SocialTacticsAnalysis> {
  const v = await callAnalysis(
    'social_tactics',
    { ngon_ngu: languageName(r.locale), ma_ngon_ngu: r.locale, du_lieu_kenh: buildDigest(r) },
    TacticsSchema,
    overrideFromReport(r),
    5000,
    'phân tích chiến thuật',
  );
  return {
    hooks: toItems(v.hooks),
    leading: toItems(v.leading),
    ctas: toItems(v.ctas),
    adStrategy: {
      objective: dd(v.adStrategy.objective),
      formulas: toItems(v.adStrategy.formulas),
      angles: toItems(v.adStrategy.angles).map((a) => ({ name: a.name, desc: a.desc })),
    },
    funnel: { tofu: dd(v.funnel.tofu), mofu: dd(v.funnel.mofu), bofu: dd(v.funnel.bofu) },
  };
}

export async function analyzeSummary(r: SocialReportRecord): Promise<SocialSummaryAnalysis> {
  const prior = JSON.stringify({ brand: r.analysis.brand, tactics: r.analysis.tactics }, null, 1);
  const v = await callAnalysis(
    'social_summary',
    {
      ngon_ngu: languageName(r.locale),
      ma_ngon_ngu: r.locale,
      du_lieu_kenh: buildDigest(r),
      ket_qua_phan_tich: prior,
    },
    SummarySchema,
    overrideFromReport(r),
    6000,
    'tổng kết & đề xuất',
  );
  const out: SocialSummaryAnalysis = {
    summary: dd(v.summary),
    strengths: toItems(v.strengths),
    weaknesses: toItems(v.weaknesses),
    avoid: toItems(v.avoid),
    learnFrom: toItems(v.learnFrom),
    contentIdeas: v.contentIdeas
      .map((i) => ({
        title: dd(i.title || i.name || ''),
        desc: dd(i.desc || ''),
        reason: dd(i.reason || i.effectiveness || ''),
      }))
      .filter((i) => i.title || i.desc)
      .slice(0, 6),
  };
  if (!out.summary && !out.strengths.length && !out.contentIdeas.length)
    throw new Error(
      'AI trả về phần tổng kết rỗng (thường do output bị cắt cụt). Bấm Thử lại hoặc chọn model mạnh hơn.',
    );
  return out;
}

// Digest RIÊNG cho phân tích style: ưu tiên CHỮ (caption dài + lời thoại + nội dung quảng cáo),
// bỏ chỉ số/bình luận - style là giọng của thương hiệu, không phải của khán giả.
export function buildStyleDigest(r: SocialReportRecord): string {
  const digest = {
    brand: r.title,
    channels: r.channels.map((c) => ({
      kind: c.kind,
      name: c.page?.name,
      intro: cut(c.page?.intro, 400),
      posts: mergePosts(c.posts, c.reels)
        .slice(0, 15)
        .map((p) => ({
          type: p.type,
          text: cut(p.text, 900),
          transcript: cut(p.transcript, 1800),
        }))
        .filter((p) => p.text || p.transcript),
      ads: c.ads
        .slice(0, 8)
        .map((a) => ({ text: cut(a.text, 500), cta: a.cta }))
        .filter((a) => a.text),
    })),
  };
  return JSON.stringify(digest, null, 1);
}

const StyleSchema = z.object({
  summary: s(),
  toneOfVoice: s(),
  addressing: s(),
  vocabulary: s(),
  sentencePatterns: s(),
  argumentation: s(),
  contentFormulas: s(),
  storytelling: s(),
  signatureTraits: s(),
  signaturePhrases: z.array(z.string().catch('')).catch([]).default([]),
  doList: z.array(z.string().catch('')).catch([]).default([]),
  dontList: z.array(z.string().catch('')).catch([]).default([]),
});

// Rút hồ sơ style thương hiệu từ nội dung đã thu (chạy theo yêu cầu, 1 lần gọi AI).
export async function analyzeStyle(
  r: SocialReportRecord,
  ai?: { provider: string; model?: string },
): Promise<SocialStyleProfile> {
  const override: AiOverride | undefined = ai?.provider
    ? { provider: ai.provider as AiOverride['provider'], model: ai.model || undefined }
    : undefined;
  const v = await callAnalysis(
    'social_style',
    { ngon_ngu: languageName(r.locale), ma_ngon_ngu: r.locale, du_lieu_kenh: buildStyleDigest(r) },
    StyleSchema,
    override,
    5000,
    'xuất style thương hiệu',
  );
  const list = (xs: string[], max: number) => xs.map(dd).filter(Boolean).slice(0, max);
  const out: SocialStyleProfile = {
    summary: dd(v.summary),
    toneOfVoice: dd(v.toneOfVoice),
    addressing: dd(v.addressing),
    vocabulary: dd(v.vocabulary),
    sentencePatterns: dd(v.sentencePatterns),
    argumentation: dd(v.argumentation),
    contentFormulas: dd(v.contentFormulas),
    storytelling: dd(v.storytelling),
    signatureTraits: dd(v.signatureTraits),
    signaturePhrases: list(v.signaturePhrases, 10),
    doList: list(v.doList, 8),
    dontList: list(v.dontList, 8),
  };
  if (!out.summary && !out.toneOfVoice && !out.vocabulary)
    throw new Error(
      'AI trả về hồ sơ style rỗng (thường do output bị cắt cụt). Thử lại hoặc chọn model mạnh hơn.',
    );
  return out;
}

// ── Báo cáo NHÓM Facebook: digest + 3 bước phân tích góc nhìn CỘNG ĐỒNG ──

// Digest riêng cho nhóm: BÌNH LUẬN LỒNG THEO TỪNG BÀI (khớp qua postUrl chuẩn hóa) để AI
// phân tích bài + phản hồi của thành viên như một thể thống nhất; kèm info nhóm + chỉ số
// (có topContributors). Bài có author (người đăng) - đặc thù nhóm nhiều người đăng.
export function buildGroupDigest(r: SocialReportRecord): string {
  const ch = r.channels[0];
  if (!ch) return '{}';
  const byPost = new Map<string, Array<{ text?: string; likes?: number }>>();
  for (const c of ch.comments) {
    if (!c.postUrl) continue;
    const k = canonicalUrl(c.postUrl);
    const arr = byPost.get(k) ?? [];
    arr.push({ text: cut(c.text, 180), likes: c.likes });
    byPost.set(k, arr);
  }
  const digest = {
    group: ch.page
      ? {
          name: ch.page.name,
          members: ch.page.followers,
          privacy: ch.page.categories?.[0],
          intro: cut(ch.page.intro, 400),
        }
      : undefined,
    posts: mergePosts(ch.posts, ch.reels)
      .slice(0, 15)
      .map((p, idx) => ({
        i: idx + 1, // tham chiếu "Bài N"
        type: p.type,
        time: p.time?.slice(0, 10),
        author: p.author,
        reactions: p.reactions,
        comments: p.comments,
        shares: p.shares,
        text: cut(p.text, 600),
        transcript: cut(p.transcript, 900),
        // Bình luận CỦA CHÍNH BÀI NÀY - phân tích bài + phản hồi như một thể.
        topComments: (byPost.get(canonicalUrl(p.url)) ?? []).slice(0, 8),
      })),
    metrics: ch.metrics,
  };
  return JSON.stringify(digest, null, 1);
}

const GroupTopicsSchema = z.object({
  overview: s(),
  hotTopics: items(),
  formats: items(),
  engagementDrivers: items(),
});

const GroupAudienceSchema = z.object({
  memberProfile: s(),
  needs: items(),
  painPoints: items(),
  questions: items(),
  language: s(),
});

const GroupSummarySchema = z.object({
  summary: s(),
  opportunities: items(),
  engagementTips: items(),
  avoid: items(),
  contentIdeas: items(),
});

export async function analyzeGroupTopics(r: SocialReportRecord): Promise<SocialGroupTopicsAnalysis> {
  const v = await callAnalysis(
    'social_group_topics',
    { ngon_ngu: languageName(r.locale), ma_ngon_ngu: r.locale, du_lieu_nhom: buildGroupDigest(r) },
    GroupTopicsSchema,
    overrideFromReport(r),
    5000,
    'phân tích chủ đề nhóm',
  );
  const out: SocialGroupTopicsAnalysis = {
    overview: dd(v.overview),
    hotTopics: toItems(v.hotTopics),
    formats: toItems(v.formats),
    engagementDrivers: toItems(v.engagementDrivers),
  };
  if (!out.overview && !out.hotTopics.length)
    throw new Error(
      'AI trả về phân tích chủ đề nhóm rỗng (thường do output bị cắt cụt). Bấm Thử lại hoặc chọn model mạnh hơn.',
    );
  return out;
}

export async function analyzeGroupAudience(
  r: SocialReportRecord,
): Promise<SocialGroupAudienceAnalysis> {
  const v = await callAnalysis(
    'social_group_audience',
    { ngon_ngu: languageName(r.locale), ma_ngon_ngu: r.locale, du_lieu_nhom: buildGroupDigest(r) },
    GroupAudienceSchema,
    overrideFromReport(r),
    5000,
    'phân tích thành viên nhóm',
  );
  const out: SocialGroupAudienceAnalysis = {
    memberProfile: dd(v.memberProfile),
    needs: toItems(v.needs),
    painPoints: toItems(v.painPoints),
    questions: toItems(v.questions),
    language: dd(v.language),
  };
  if (!out.memberProfile && !out.needs.length && !out.painPoints.length)
    throw new Error(
      'AI trả về insight thành viên rỗng (thường do output bị cắt cụt). Bấm Thử lại hoặc chọn model mạnh hơn.',
    );
  return out;
}

export async function analyzeGroupSummary(
  r: SocialReportRecord,
): Promise<SocialGroupSummaryAnalysis> {
  const prior = JSON.stringify(
    { topics: r.analysis.groupTopics, audience: r.analysis.groupAudience },
    null,
    1,
  );
  const v = await callAnalysis(
    'social_group_summary',
    {
      ngon_ngu: languageName(r.locale),
      ma_ngon_ngu: r.locale,
      du_lieu_nhom: buildGroupDigest(r),
      ket_qua_phan_tich: prior,
    },
    GroupSummarySchema,
    overrideFromReport(r),
    6000,
    'tổng kết nhóm & cơ hội',
  );
  const out: SocialGroupSummaryAnalysis = {
    summary: dd(v.summary),
    opportunities: toItems(v.opportunities),
    engagementTips: toItems(v.engagementTips),
    avoid: toItems(v.avoid),
    contentIdeas: v.contentIdeas
      .map((i) => ({
        title: dd(i.title || i.name || ''),
        desc: dd(i.desc || ''),
        reason: dd(i.reason || i.effectiveness || ''),
      }))
      .filter((i) => i.title || i.desc)
      .slice(0, 6),
  };
  if (!out.summary && !out.opportunities.length && !out.contentIdeas.length)
    throw new Error(
      'AI trả về phần tổng kết nhóm rỗng (thường do output bị cắt cụt). Bấm Thử lại hoặc chọn model mạnh hơn.',
    );
  return out;
}

// ── Báo cáo FACEBOOK CÁ NHÂN: 3 bước phân tích (tái dùng schema + digest của nhóm; prompt riêng
// khung "trang cá nhân + tệp người theo dõi/tương tác"). Kết quả lưu ở profileTopics/Audience/Summary.
export async function analyzeProfileTopics(r: SocialReportRecord): Promise<SocialGroupTopicsAnalysis> {
  const v = await callAnalysis(
    'social_profile_topics',
    { ngon_ngu: languageName(r.locale), ma_ngon_ngu: r.locale, du_lieu_trang: buildGroupDigest(r) },
    GroupTopicsSchema,
    overrideFromReport(r),
    5000,
    'phân tích chủ đề trang cá nhân',
  );
  const out: SocialGroupTopicsAnalysis = {
    overview: dd(v.overview),
    hotTopics: toItems(v.hotTopics),
    formats: toItems(v.formats),
    engagementDrivers: toItems(v.engagementDrivers),
  };
  if (!out.overview && !out.hotTopics.length)
    throw new Error(
      'AI trả về phân tích chủ đề rỗng (thường do output bị cắt cụt). Bấm Thử lại hoặc chọn model mạnh hơn.',
    );
  return out;
}

export async function analyzeProfileAudience(
  r: SocialReportRecord,
): Promise<SocialGroupAudienceAnalysis> {
  const v = await callAnalysis(
    'social_profile_audience',
    { ngon_ngu: languageName(r.locale), ma_ngon_ngu: r.locale, du_lieu_trang: buildGroupDigest(r) },
    GroupAudienceSchema,
    overrideFromReport(r),
    5000,
    'phân tích tệp người theo dõi',
  );
  const out: SocialGroupAudienceAnalysis = {
    memberProfile: dd(v.memberProfile),
    needs: toItems(v.needs),
    painPoints: toItems(v.painPoints),
    questions: toItems(v.questions),
    language: dd(v.language),
  };
  if (!out.memberProfile && !out.needs.length && !out.painPoints.length)
    throw new Error(
      'AI trả về insight người theo dõi rỗng (thường do output bị cắt cụt). Bấm Thử lại hoặc chọn model mạnh hơn.',
    );
  return out;
}

export async function analyzeProfileSummary(
  r: SocialReportRecord,
): Promise<SocialGroupSummaryAnalysis> {
  const prior = JSON.stringify(
    { topics: r.analysis.profileTopics, audience: r.analysis.profileAudience },
    null,
    1,
  );
  const v = await callAnalysis(
    'social_profile_summary',
    {
      ngon_ngu: languageName(r.locale),
      ma_ngon_ngu: r.locale,
      du_lieu_trang: buildGroupDigest(r),
      ket_qua_phan_tich: prior,
    },
    GroupSummarySchema,
    overrideFromReport(r),
    6000,
    'tổng kết trang cá nhân',
  );
  const out: SocialGroupSummaryAnalysis = {
    summary: dd(v.summary),
    opportunities: toItems(v.opportunities),
    engagementTips: toItems(v.engagementTips),
    avoid: toItems(v.avoid),
    contentIdeas: v.contentIdeas
      .map((i) => ({
        title: dd(i.title || i.name || ''),
        desc: dd(i.desc || ''),
        reason: dd(i.reason || i.effectiveness || ''),
      }))
      .filter((i) => i.title || i.desc)
      .slice(0, 6),
  };
  if (!out.summary && !out.opportunities.length && !out.contentIdeas.length)
    throw new Error(
      'AI trả về phần tổng kết rỗng (thường do output bị cắt cụt). Bấm Thử lại hoặc chọn model mạnh hơn.',
    );
  return out;
}

// ── Báo cáo SẢN PHẨM Shopee: digest + 3 bước phân tích góc nhìn E-COMMERCE ──

// Digest sản phẩm: info + chỉ số đánh giá tổng hợp + mẫu đánh giá đánh số "Đánh giá 1..N"
// (kèm sao khía cạnh, phân loại đã mua, phản hồi shop) - AI tham chiếu "Đánh giá N".
export function buildShopeeDigest(r: SocialReportRecord): string {
  const ch = r.channels[0];
  if (!ch) return '{}';
  const p = ch.product;
  const digest = {
    product: p
      ? {
          name: p.name,
          description: cut(p.description, 1500),
          currency: p.currency,
          priceMin: p.priceMin,
          priceMax: p.priceMax,
          discount: p.discount,
          ratingStar: p.ratingStar,
          ratingCount: p.ratingCount,
          sold: p.sold,
          stock: p.stock,
          variants: p.variants?.slice(0, 15),
          categories: p.categories,
          attributes: p.attributes,
          shop: { name: p.shopName, rating: p.shopRating, location: p.shopLocation },
        }
      : undefined,
    metrics: ch.productMetrics,
    reviews: (ch.productReviews ?? []).slice(0, 40).map((rv, idx) => ({
      i: idx + 1, // tham chiếu "Đánh giá N"
      rating: rv.rating,
      time: rv.time?.slice(0, 10),
      variant: rv.variant,
      text: cut(rv.text, 400),
      aspects: rv.aspects,
      sellerReply: cut(rv.sellerReply, 200),
      likes: rv.likes,
    })),
  };
  return JSON.stringify(digest, null, 1);
}

const ShopeeProductSchema = z.object({
  overview: s(),
  listingStrengths: items(),
  listingGaps: items(),
  pricingPosition: s(),
});

const ShopeeReviewsSchema = z.object({
  sentiment: s(),
  praises: items(),
  complaints: items(),
  customerNeeds: items(),
  language: s(),
});

const ShopeeSummarySchema = z.object({
  summary: s(),
  improvements: items(),
  contentIdeas: items(),
  faq: items(),
});

// Kênh sản phẩm/shop TikTok Shop + Lazada tái dùng pipeline Shopee - chỉ khác PROMPT (đăng
// ký riêng trong registry để admin tùy chỉnh độc lập và AI hiểu đúng ngữ cảnh nền tảng).
const PRODUCT_PROMPT_PREFIX: Record<string, string> = {
  tiktokshop: 'social_tiktokshop',
  lazada: 'social_lazada',
};
const SHOP_PROMPT_PREFIX: Record<string, string> = {
  tiktokshopshop: 'social_tiktokshopshop',
  lazadashop: 'social_lazadashop',
};
const productPrompt = (r: SocialReportRecord, suffix: string) =>
  `${PRODUCT_PROMPT_PREFIX[r.platform] ?? 'social_shopee'}_${suffix}`;
const shopPrompt = (r: SocialReportRecord, suffix: string) =>
  `${SHOP_PROMPT_PREFIX[r.platform] ?? 'social_shopeeshop'}_${suffix}`;

export async function analyzeShopeeProduct(
  r: SocialReportRecord,
): Promise<SocialShopeeProductAnalysis> {
  const v = await callAnalysis(
    productPrompt(r, 'product'),
    { ngon_ngu: languageName(r.locale), ma_ngon_ngu: r.locale, du_lieu_san_pham: buildShopeeDigest(r) },
    ShopeeProductSchema,
    overrideFromReport(r),
    5000,
    'phân tích sản phẩm & listing',
  );
  const out: SocialShopeeProductAnalysis = {
    overview: dd(v.overview),
    listingStrengths: toItems(v.listingStrengths),
    listingGaps: toItems(v.listingGaps),
    pricingPosition: dd(v.pricingPosition),
  };
  if (!out.overview && !out.listingStrengths.length && !out.listingGaps.length)
    throw new Error(
      'AI trả về phân tích sản phẩm rỗng (thường do output bị cắt cụt). Bấm Thử lại hoặc chọn model mạnh hơn.',
    );
  return out;
}

export async function analyzeShopeeReviews(
  r: SocialReportRecord,
): Promise<SocialShopeeReviewsAnalysis> {
  const v = await callAnalysis(
    productPrompt(r, 'reviews'),
    { ngon_ngu: languageName(r.locale), ma_ngon_ngu: r.locale, du_lieu_san_pham: buildShopeeDigest(r) },
    ShopeeReviewsSchema,
    overrideFromReport(r),
    5000,
    'phân tích đánh giá của khách',
  );
  const out: SocialShopeeReviewsAnalysis = {
    sentiment: dd(v.sentiment),
    praises: toItems(v.praises),
    complaints: toItems(v.complaints),
    customerNeeds: toItems(v.customerNeeds),
    language: dd(v.language),
  };
  if (!out.sentiment && !out.praises.length && !out.complaints.length)
    throw new Error(
      'AI trả về insight đánh giá rỗng (thường do output bị cắt cụt). Bấm Thử lại hoặc chọn model mạnh hơn.',
    );
  return out;
}

export async function analyzeShopeeSummary(
  r: SocialReportRecord,
): Promise<SocialShopeeSummaryAnalysis> {
  const prior = JSON.stringify(
    { product: r.analysis.shopeeProduct, reviews: r.analysis.shopeeReviews },
    null,
    1,
  );
  const v = await callAnalysis(
    productPrompt(r, 'summary'),
    {
      ngon_ngu: languageName(r.locale),
      ma_ngon_ngu: r.locale,
      du_lieu_san_pham: buildShopeeDigest(r),
      ket_qua_phan_tich: prior,
    },
    ShopeeSummarySchema,
    overrideFromReport(r),
    6000,
    'tổng kết sản phẩm & đề xuất',
  );
  const out: SocialShopeeSummaryAnalysis = {
    summary: dd(v.summary),
    improvements: toItems(v.improvements),
    contentIdeas: v.contentIdeas
      .map((i) => ({
        title: dd(i.title || i.name || ''),
        desc: dd(i.desc || ''),
        reason: dd(i.reason || i.effectiveness || ''),
      }))
      .filter((i) => i.title || i.desc)
      .slice(0, 6),
    faq: toItems(v.faq),
  };
  if (!out.summary && !out.improvements.length && !out.contentIdeas.length)
    throw new Error(
      'AI trả về phần tổng kết sản phẩm rỗng (thường do output bị cắt cụt). Bấm Thử lại hoặc chọn model mạnh hơn.',
    );
  return out;
}

// ── Báo cáo SHOP Shopee: digest + 3 bước phân tích góc nhìn VẬN HÀNH SHOP ──

// Digest shop: info shop + danh mục sản phẩm đánh số "Sản phẩm 1..N" (giá/giảm/sao) +
// chỉ số danh mục + đánh giá của top sản phẩm (kèm ofProduct - "đánh giá đi theo sản phẩm").
export function buildShopDigest(r: SocialReportRecord): string {
  const ch = r.channels[0];
  if (!ch) return '{}';
  const digest = {
    shop: ch.shopInfo
      ? {
          name: ch.shopInfo.name,
          rating: ch.shopInfo.rating,
          followers: ch.shopInfo.followers,
          itemCount: ch.shopInfo.itemCount,
          responseRatePct: ch.shopInfo.responseRate,
          location: ch.shopInfo.location,
          isOfficialShop: ch.shopInfo.isOfficialShop,
          // Riêng shop TikTok Shop (chuỗi hiển thị từ nguồn analytics).
          totalSold: ch.shopInfo.totalSold,
          gmv: ch.shopInfo.gmv,
        }
      : undefined,
    catalogMetrics: ch.shopMetrics,
    products: (ch.shopProducts ?? []).slice(0, 40).map((p, idx) => ({
      i: idx + 1, // tham chiếu "Sản phẩm N"
      name: cut(p.name, 120),
      price: p.priceMin,
      currency: p.currency,
      discount: p.discount,
      rating: p.ratingStar,
      ratingCount: p.ratingCount,
      sold: p.sold,
    })),
    reviewMetrics: ch.productMetrics,
    reviews: (ch.productReviews ?? []).slice(0, 40).map((rv, idx) => ({
      i: idx + 1, // tham chiếu "Đánh giá N"
      ofProduct: cut(rv.ofProduct, 80),
      rating: rv.rating,
      time: rv.time?.slice(0, 10),
      variant: rv.variant,
      text: cut(rv.text, 300),
      aspects: rv.aspects,
      sellerReply: cut(rv.sellerReply, 150),
    })),
  };
  return JSON.stringify(digest, null, 1);
}

const ShopCatalogSchema = z.object({
  overview: s(),
  priceStrategy: s(),
  strongProducts: items(),
  gaps: items(),
});

const ShopSummarySchema = z.object({
  summary: s(),
  opportunities: items(),
  improvements: items(),
  contentIdeas: items(),
});

export async function analyzeShopCatalog(r: SocialReportRecord): Promise<SocialShopCatalogAnalysis> {
  const v = await callAnalysis(
    shopPrompt(r, 'catalog'),
    { ngon_ngu: languageName(r.locale), ma_ngon_ngu: r.locale, du_lieu_shop: buildShopDigest(r) },
    ShopCatalogSchema,
    overrideFromReport(r),
    5000,
    'phân tích danh mục & giá của shop',
  );
  const out: SocialShopCatalogAnalysis = {
    overview: dd(v.overview),
    priceStrategy: dd(v.priceStrategy),
    strongProducts: toItems(v.strongProducts),
    gaps: toItems(v.gaps),
  };
  if (!out.overview && !out.strongProducts.length)
    throw new Error(
      'AI trả về phân tích danh mục rỗng (thường do output bị cắt cụt). Bấm Thử lại hoặc chọn model mạnh hơn.',
    );
  return out;
}

// Insight khách hàng XUYÊN SẢN PHẨM - tái dùng cấu trúc insight đánh giá của báo cáo sản phẩm.
export async function analyzeShopCustomers(
  r: SocialReportRecord,
): Promise<SocialShopeeReviewsAnalysis> {
  const v = await callAnalysis(
    shopPrompt(r, 'customers'),
    { ngon_ngu: languageName(r.locale), ma_ngon_ngu: r.locale, du_lieu_shop: buildShopDigest(r) },
    ShopeeReviewsSchema,
    overrideFromReport(r),
    5000,
    'phân tích khách hàng của shop',
  );
  const out: SocialShopeeReviewsAnalysis = {
    sentiment: dd(v.sentiment),
    praises: toItems(v.praises),
    complaints: toItems(v.complaints),
    customerNeeds: toItems(v.customerNeeds),
    language: dd(v.language),
  };
  if (!out.sentiment && !out.praises.length && !out.complaints.length)
    throw new Error(
      'AI trả về insight khách hàng rỗng (thường do output bị cắt cụt). Bấm Thử lại hoặc chọn model mạnh hơn.',
    );
  return out;
}

export async function analyzeShopSummary(r: SocialReportRecord): Promise<SocialShopSummaryAnalysis> {
  const prior = JSON.stringify(
    { catalog: r.analysis.shopCatalog, customers: r.analysis.shopCustomers },
    null,
    1,
  );
  const v = await callAnalysis(
    shopPrompt(r, 'summary'),
    {
      ngon_ngu: languageName(r.locale),
      ma_ngon_ngu: r.locale,
      du_lieu_shop: buildShopDigest(r),
      ket_qua_phan_tich: prior,
    },
    ShopSummarySchema,
    overrideFromReport(r),
    6000,
    'tổng kết shop & đề xuất',
  );
  const out: SocialShopSummaryAnalysis = {
    summary: dd(v.summary),
    opportunities: toItems(v.opportunities),
    improvements: toItems(v.improvements),
    contentIdeas: v.contentIdeas
      .map((i) => ({
        title: dd(i.title || i.name || ''),
        desc: dd(i.desc || ''),
        reason: dd(i.reason || i.effectiveness || ''),
      }))
      .filter((i) => i.title || i.desc)
      .slice(0, 6),
  };
  if (!out.summary && !out.opportunities.length && !out.improvements.length)
    throw new Error(
      'AI trả về phần tổng kết shop rỗng (thường do output bị cắt cụt). Bấm Thử lại hoặc chọn model mạnh hơn.',
    );
  return out;
}

// ── TỔNG THỂ E-COMMERCE: digest + 3 bước phân tích NGHIÊN CỨU THỊ TRƯỜNG ──

// Digest thị trường: mỗi sàn là 1 mảng "Sản phẩm 1..N" (giá/giảm/đã bán/sao/seller) + chỉ số
// danh mục thuần (dải giá, giá TB) → AI tham chiếu "Sản phẩm N (tên sàn)".
export function buildEcomDigest(r: SocialReportRecord): string {
  const PLATFORM_NAME: Record<string, string> = {
    shopee: 'Shopee',
    tiktokshop: 'TikTok Shop',
    lazada: 'Lazada',
  };
  const digest = {
    keyword: r.keyword,
    region: r.options.ttsRegion ?? 'VN',
    platforms: r.channels.map((c) => ({
      platform: PLATFORM_NAME[c.kind] ?? c.kind,
      catalogMetrics: c.shopMetrics,
      products: (c.shopProducts ?? []).slice(0, 20).map((p, idx) => ({
        i: idx + 1, // tham chiếu "Sản phẩm N (sàn)"
        name: cut(p.name, 120),
        price: p.priceMin,
        currency: p.currency,
        discount: p.discount,
        rating: p.ratingStar,
        ratingCount: p.ratingCount,
        sold: p.sold,
        sold7d: p.sold7d, // TikTok Shop: nhịp bán gần đây → AI nhận định tăng/giảm
        sold30d: p.sold30d,
        seller: p.shopName,
        sellerLocation: p.shopLocation,
      })),
    })),
  };
  return JSON.stringify(digest, null, 1);
}

const EcomMarketSchema = z.object({
  overview: s(),
  platforms: items(),
  pricing: s(),
  demand: items(),
});

const EcomCompetitorsSchema = z.object({
  overview: s(),
  competitors: items(),
  strategies: items(),
});

const EcomSummarySchema = z.object({
  summary: s(),
  opportunities: items(),
  risks: items(),
  entryPlan: s(),
  contentIdeas: items(),
});

export async function analyzeEcomMarket(r: SocialReportRecord): Promise<SocialEcomMarketAnalysis> {
  const v = await callAnalysis(
    'social_ecom_market',
    { ngon_ngu: languageName(r.locale), ma_ngon_ngu: r.locale, du_lieu_thi_truong: buildEcomDigest(r) },
    EcomMarketSchema,
    overrideFromReport(r),
    5000,
    'phân tích thị trường',
  );
  const out: SocialEcomMarketAnalysis = {
    overview: dd(v.overview),
    platforms: toItems(v.platforms),
    pricing: dd(v.pricing),
    demand: toItems(v.demand),
  };
  if (!out.overview && !out.platforms.length && !out.demand.length)
    throw new Error(
      'AI trả về phân tích thị trường rỗng (thường do output bị cắt cụt). Bấm Thử lại hoặc chọn model mạnh hơn.',
    );
  return out;
}

export async function analyzeEcomCompetitors(
  r: SocialReportRecord,
): Promise<SocialEcomCompetitorsAnalysis> {
  const v = await callAnalysis(
    'social_ecom_competitors',
    { ngon_ngu: languageName(r.locale), ma_ngon_ngu: r.locale, du_lieu_thi_truong: buildEcomDigest(r) },
    EcomCompetitorsSchema,
    overrideFromReport(r),
    5000,
    'phân tích đối thủ',
  );
  const out: SocialEcomCompetitorsAnalysis = {
    overview: dd(v.overview),
    competitors: toItems(v.competitors),
    strategies: toItems(v.strategies),
  };
  if (!out.overview && !out.competitors.length)
    throw new Error(
      'AI trả về phân tích đối thủ rỗng (thường do output bị cắt cụt). Bấm Thử lại hoặc chọn model mạnh hơn.',
    );
  return out;
}

export async function analyzeEcomSummary(r: SocialReportRecord): Promise<SocialEcomSummaryAnalysis> {
  const prior = JSON.stringify(
    { market: r.analysis.ecomMarket, competitors: r.analysis.ecomCompetitors },
    null,
    1,
  );
  const v = await callAnalysis(
    'social_ecom_summary',
    {
      ngon_ngu: languageName(r.locale),
      ma_ngon_ngu: r.locale,
      du_lieu_thi_truong: buildEcomDigest(r),
      ket_qua_phan_tich: prior,
    },
    EcomSummarySchema,
    overrideFromReport(r),
    6000,
    'tổng kết thị trường & kế hoạch',
  );
  const out: SocialEcomSummaryAnalysis = {
    summary: dd(v.summary),
    opportunities: toItems(v.opportunities),
    risks: toItems(v.risks),
    entryPlan: dd(v.entryPlan),
    contentIdeas: v.contentIdeas
      .map((i) => ({
        title: dd(i.title || i.name || ''),
        desc: dd(i.desc || ''),
        reason: dd(i.reason || i.effectiveness || ''),
      }))
      .filter((i) => i.title || i.desc)
      .slice(0, 6),
  };
  if (!out.summary && !out.opportunities.length && !out.entryPlan)
    throw new Error(
      'AI trả về phần tổng kết thị trường rỗng (thường do output bị cắt cụt). Bấm Thử lại hoặc chọn model mạnh hơn.',
    );
  return out;
}

// So sánh xuyên kênh - chỉ chạy cho báo cáo tổng thể (≥2 kênh).
export async function analyzeCompare(r: SocialReportRecord): Promise<SocialCompareAnalysis> {
  const prior = JSON.stringify(
    { brand: r.analysis.brand, tactics: r.analysis.tactics, summary: r.analysis.summary },
    null,
    1,
  );
  const v = await callAnalysis(
    'social_compare',
    {
      ngon_ngu: languageName(r.locale),
      ma_ngon_ngu: r.locale,
      du_lieu_kenh: buildDigest(r),
      ket_qua_phan_tich: prior,
    },
    CompareSchema,
    overrideFromReport(r),
    5000,
    'so sánh kênh',
  );
  return {
    overview: dd(v.overview),
    channels: toItems(v.channels),
    bestFormats: toItems(v.bestFormats),
    allocation: dd(v.allocation),
  };
}
