// Cấu hình GÓI CƯỚC (SaaS) - THUẦN, không import node/fs → dùng được cả client (trang bảng giá)
// lẫn server (cưỡng chế). Subscription gắn với TÀI KHOẢN CHỦ; giới hạn áp trên các biz họ sở hữu.

export type PlanId = 'free' | 'starter' | 'pro' | 'agency' | 'enterprise';
export type ModelTier = 'economy' | 'standard' | 'premium' | 'all';

export interface PlanFeatures {
  approval: boolean; // quy trình duyệt bài
  brandVoice: boolean; // giọng thương hiệu
  api: boolean; // API token / webhook
  factCheck: boolean; // kiểm chứng dữ kiện (link chết / số liệu thiếu nguồn / giọng AI)
  humanize: boolean; // nhân hóa: viết lại bài cho tự nhiên hơn, bớt giọng AI
  whiteLabel: boolean; // gỡ thương hiệu (agency)
  clientReports: boolean; // báo cáo theo khách
  prioritySupport: boolean;
  myTasks: boolean; // "Việc của tôi" (được giao / chờ duyệt)
  internalLinks: boolean; // gợi ý internal link khi tối ưu
  backlinks: boolean; // đi backlink chéo site (giữa các CMS đã kết nối)
  videoScriptAnalysis: boolean; // phân tích kịch bản video/reels (TikTok/YouTube/Facebook) qua Apify + AI
  imageAlt: boolean; // tự điền alt ảnh trong trình soạn bài
  socialAllChannels: boolean; // Báo cáo Social đủ kênh (tắt = chỉ fanpage Facebook)
}

export interface Plan {
  id: PlanId;
  articlesPerMonth: number; // hạn mức bài AI/tháng (→ token cap)
  socialReportsPerMonth: number; // hạn mức LƯỢT TẠO Báo cáo Social/tháng (gộp theo chủ tài khoản)
  maxBiz: number; // số workspace được sở hữu
  maxSeats: number; // số ghế/thành viên mỗi biz
  maxCmsConnections: number; // số kết nối CMS mỗi biz
  models: ModelTier;
  features: PlanFeatures;
  overage: boolean; // được mua thêm bài khi vượt
  trialDays?: number;
  // Giá song ngữ - mốc tròn riêng từng đơn vị (KHÔNG quy đổi thô). 0 = miễn phí/liên hệ.
  priceVndMonthly: number;
  priceUsdMonthly: number;
  priceVndYearly: number;
  priceUsdYearly: number;
}

// Số token TRUNG BÌNH cho 1 "bài AI" (viết + research + tối ưu + ảnh). Dùng để quy hạn mức
// bài → token cap. HIỆU CHỈNH theo dữ liệu thực (đo từ ai-usage sau một thời gian chạy).
export const TOKENS_PER_ARTICLE = 40_000;

const UNLIMITED = 999_999; // "không giới hạn" dạng số hữu hạn (an toàn khi JSON hóa)

const NO_FEATURES: PlanFeatures = {
  approval: false,
  brandVoice: false,
  api: false,
  factCheck: false,
  humanize: false,
  whiteLabel: false,
  clientReports: false,
  prioritySupport: false,
  myTasks: false,
  internalLinks: false,
  backlinks: false,
  videoScriptAnalysis: false,
  imageAlt: false,
  socialAllChannels: false,
};

// Gói MẶC ĐỊNH (hạt giống). Giá trị THỰC do plans-store merge override từ .data/plans.json lên
// bộ này → admin sửa được. Đây vẫn là nguồn khi chưa có override + fallback an toàn.
export const DEFAULT_PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    articlesPerMonth: 10,
    socialReportsPerMonth: 1, // chỉ fanpage Facebook (socialAllChannels tắt)
    maxBiz: 1,
    maxSeats: 1,
    maxCmsConnections: 0,
    models: 'economy',
    features: { ...NO_FEATURES },
    overage: false,
    priceVndMonthly: 0,
    priceUsdMonthly: 0,
    priceVndYearly: 0,
    priceUsdYearly: 0,
  },
  starter: {
    id: 'starter',
    articlesPerMonth: 50,
    socialReportsPerMonth: 20,
    maxBiz: 1,
    maxSeats: 2,
    maxCmsConnections: 1,
    models: 'standard',
    features: { ...NO_FEATURES, socialAllChannels: true },
    overage: true,
    priceVndMonthly: 199_000,
    priceUsdMonthly: 9,
    priceVndYearly: 1_990_000,
    priceUsdYearly: 90,
  },
  pro: {
    id: 'pro',
    articlesPerMonth: 250,
    socialReportsPerMonth: 50,
    maxBiz: 1,
    maxSeats: 5,
    maxCmsConnections: 3,
    models: 'premium',
    features: {
      ...NO_FEATURES,
      approval: true,
      brandVoice: true,
      api: true,
      factCheck: true,
      humanize: true,
      prioritySupport: true,
      myTasks: true,
      internalLinks: true,
      backlinks: true,
      videoScriptAnalysis: true,
      imageAlt: true,
      socialAllChannels: true,
    },
    overage: true,
    trialDays: 14,
    priceVndMonthly: 699_000,
    priceUsdMonthly: 29,
    priceVndYearly: 6_990_000,
    priceUsdYearly: 290,
  },
  agency: {
    id: 'agency',
    articlesPerMonth: 1_000,
    socialReportsPerMonth: 100,
    maxBiz: 10,
    maxSeats: 20,
    maxCmsConnections: UNLIMITED,
    models: 'all',
    features: {
      approval: true,
      brandVoice: true,
      api: true,
      factCheck: true,
      humanize: true,
      whiteLabel: true,
      clientReports: true,
      prioritySupport: true,
      myTasks: true,
      internalLinks: true,
      backlinks: true,
      videoScriptAnalysis: true,
      imageAlt: true,
      socialAllChannels: true,
    },
    overage: true,
    priceVndMonthly: 2_490_000,
    priceUsdMonthly: 99,
    priceVndYearly: 24_900_000,
    priceUsdYearly: 990,
  },
  enterprise: {
    id: 'enterprise',
    articlesPerMonth: UNLIMITED,
    socialReportsPerMonth: UNLIMITED,
    maxBiz: UNLIMITED,
    maxSeats: UNLIMITED,
    maxCmsConnections: UNLIMITED,
    models: 'all',
    features: {
      approval: true,
      brandVoice: true,
      api: true,
      factCheck: true,
      humanize: true,
      whiteLabel: true,
      clientReports: true,
      prioritySupport: true,
      myTasks: true,
      internalLinks: true,
      backlinks: true,
      videoScriptAnalysis: true,
      imageAlt: true,
      socialAllChannels: true,
    },
    overage: true,
    priceVndMonthly: 0, // liên hệ
    priceUsdMonthly: 0,
    priceVndYearly: 0,
    priceUsdYearly: 0,
  },
};

export const PLAN_ORDER: PlanId[] = ['free', 'starter', 'pro', 'agency', 'enterprise'];

export function isUnlimited(n: number): boolean {
  return n >= UNLIMITED;
}

// Trần token/tháng của gói (chưa cộng overage).
export function planTokenCap(plan: Plan): number {
  return isUnlimited(plan.articlesPerMonth)
    ? Number.MAX_SAFE_INTEGER
    : plan.articlesPerMonth * TOKENS_PER_ARTICLE;
}

export function featureOn(plan: Plan, key: keyof PlanFeatures): boolean {
  return plan.features[key];
}

// Gating model theo NHÀ CUNG CẤP: mỗi provider mở từ 1 tier tối thiểu (bảo vệ biên lợi nhuận).
const PROVIDER_MIN_TIER: Record<string, ModelTier> = {
  gemini: 'economy',
  deepseek: 'economy',
  qwen: 'economy',
  minimax: 'economy',
  moonshot: 'economy',
  openai: 'standard',
  anthropic: 'premium',
};
const TIER_RANK: Record<ModelTier, number> = { economy: 0, standard: 1, premium: 2, all: 3 };

export function providerAllowed(planTier: ModelTier, provider: string): boolean {
  const need = PROVIDER_MIN_TIER[provider] ?? 'premium';
  return TIER_RANK[planTier] >= TIER_RANK[need];
}

// ─── Chu kỳ mua & chiết khấu bậc ───
// Khách chọn 3 / 6 / 12 tháng. Chiết khấu tăng dần theo 6 và 12 tháng (3 tháng = giá gốc).
export const CYCLE_MONTHS = [3, 6, 12] as const;
export type CycleMonths = (typeof CYCLE_MONTHS)[number];
export const CYCLE_DISCOUNT: Record<number, number> = { 3: 0, 6: 0.1, 12: 0.17 };

// Giá theo số tháng (từ đơn giá THÁNG), áp chiết khấu bậc, làm tròn tới nghìn VND cho gọn.
export function priceForMonths(monthlyPrice: number, months: number): number {
  const d = CYCLE_DISCOUNT[months] ?? 0;
  return Math.round((monthlyPrice * months * (1 - d)) / 1000) * 1000;
}

