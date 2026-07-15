// Giải quyết ENTITLEMENT (quyền lợi theo gói) cho một biz - theo gói của CHỦ biz. Server-only.
import { getMonthlyTokensForBiz } from '../ai/usage';
import { isSuperadminUser } from '../auth/superadmin';
import { getBiz, listBizesOwnedBy } from '../store/biz';
import { getSocialReportsUsedThisMonth } from '../store/social-report-usage';
import {
  TOKENS_PER_ARTICLE,
  isUnlimited,
  planTokenCap,
  providerAllowed,
  type Plan,
  type PlanFeatures,
  type PlanId,
} from './plans';
import { getPlan } from './plans-store';
import { getSubscription, type Subscription } from './subscription';

// Gói HIỆU LỰC của 1 tài khoản: superadmin → enterprise; còn lại theo subscription (đã tính trial).
export async function effectivePlanIdForUser(userId: string): Promise<PlanId> {
  if (await isSuperadminUser(userId)) return 'enterprise';
  return (await getSubscription(userId)).plan;
}

export interface BizEntitlement {
  ownerId: string;
  planId: PlanId;
  plan: Plan;
  sub: Subscription | null;
}

export async function entitlementsForBiz(bizId: string): Promise<BizEntitlement> {
  const biz = await getBiz(bizId);
  const ownerId = biz?.ownerId ?? '';
  const sub = ownerId ? await getSubscription(ownerId) : null;
  const planId = ownerId ? await effectivePlanIdForUser(ownerId) : 'free';
  return { ownerId, planId, plan: await getPlan(planId), sub };
}

// Entitlement theo tài khoản (không cần biz) - dùng khi tạo biz mới, hiển thị trang gói.
export async function entitlementsForUser(userId: string): Promise<BizEntitlement> {
  const sub = await getSubscription(userId);
  const planId = await effectivePlanIdForUser(userId);
  return { ownerId: userId, planId, plan: await getPlan(planId), sub };
}

// Tổng token tháng GỘP trên tất cả biz mà owner sở hữu.
async function ownerMonthlyTokens(ownerId: string): Promise<number> {
  const bizes = await listBizesOwnedBy(ownerId);
  let total = 0;
  for (const b of bizes) total += await getMonthlyTokensForBiz(b.id);
  return total;
}

export interface QuotaStatus {
  over: boolean;
  used: number; // token đã dùng trong tháng (gộp)
  cap: number; // token cap (gói + overage)
  planId: PlanId;
  articlesUsed: number;
  articlesCap: number;
}

// Trạng thái hạn mức theo tài khoản chủ của biz (dùng để chặn gọi AI khi vượt).
export async function ownerQuotaStatus(bizId: string): Promise<QuotaStatus> {
  const { ownerId, planId, plan, sub } = await entitlementsForBiz(bizId);
  const overageTokens = (sub?.overageArticles ?? 0) * TOKENS_PER_ARTICLE;
  // Superadmin cấp "không giới hạn" → cap tối đa (articlesCap = -1 = ∞, không bao giờ vượt).
  const cap = sub?.unlimitedArticles ? Number.MAX_SAFE_INTEGER : planTokenCap(plan) + overageTokens;
  const used = ownerId ? await ownerMonthlyTokens(ownerId) : 0;
  return {
    over: used >= cap,
    used,
    cap,
    planId,
    articlesUsed: Math.round(used / TOKENS_PER_ARTICLE),
    articlesCap: cap >= Number.MAX_SAFE_INTEGER ? -1 : Math.round(cap / TOKENS_PER_ARTICLE),
  };
}

// Hạn mức theo CHÍNH tài khoản (gộp các biz họ sở hữu) - cho trang Gói cước của người dùng.
export async function userQuotaStatus(userId: string): Promise<QuotaStatus> {
  const planId = await effectivePlanIdForUser(userId);
  const plan = await getPlan(planId);
  const sub = await getSubscription(userId);
  const overageTokens = (sub.overageArticles ?? 0) * TOKENS_PER_ARTICLE;
  const cap = sub.unlimitedArticles ? Number.MAX_SAFE_INTEGER : planTokenCap(plan) + overageTokens;
  const used = await ownerMonthlyTokens(userId);
  return {
    over: used >= cap,
    used,
    cap,
    planId,
    articlesUsed: Math.round(used / TOKENS_PER_ARTICLE),
    articlesCap: cap >= Number.MAX_SAFE_INTEGER ? -1 : Math.round(cap / TOKENS_PER_ARTICLE),
  };
}

export function providerAllowedForPlan(plan: Plan, provider: string): boolean {
  return providerAllowed(plan.models, provider);
}

// ─── Kiểm giới hạn số lượng theo gói (dùng ở các route tạo mới) ───
export async function canAddBiz(
  userId: string,
): Promise<{ ok: boolean; max: number; current: number }> {
  const planId = await effectivePlanIdForUser(userId);
  const max = (await getPlan(planId)).maxBiz;
  const current = (await listBizesOwnedBy(userId)).length;
  return { ok: current < max, max, current };
}

export async function canAddSeat(
  bizId: string,
): Promise<{ ok: boolean; max: number; current: number }> {
  const { plan } = await entitlementsForBiz(bizId);
  const biz = await getBiz(bizId);
  const current = biz?.members.length ?? 0;
  return { ok: current < plan.maxSeats, max: plan.maxSeats, current };
}

export async function canAddCms(
  bizId: string,
  currentCount: number,
): Promise<{ ok: boolean; max: number }> {
  const { plan } = await entitlementsForBiz(bizId);
  return { ok: currentCount < plan.maxCmsConnections, max: plan.maxCmsConnections };
}

export async function bizHasFeature(bizId: string, key: keyof PlanFeatures): Promise<boolean> {
  const { plan } = await entitlementsForBiz(bizId);
  return plan.features[key];
}

// ─── Hạn mức Báo cáo Social (lượt TẠO/tháng, gộp theo chủ tài khoản của biz) ───
export interface SocialReportQuota {
  ok: boolean; // còn lượt tạo
  used: number;
  cap: number; // -1 = không giới hạn
  allChannels: boolean; // false = gói chỉ được tạo báo cáo fanpage Facebook
  planId: PlanId;
}

export async function socialReportQuota(bizId: string): Promise<SocialReportQuota> {
  const { ownerId, planId, plan } = await entitlementsForBiz(bizId);
  const used = ownerId ? await getSocialReportsUsedThisMonth(ownerId) : 0;
  const unlimited = isUnlimited(plan.socialReportsPerMonth);
  return {
    ok: unlimited || used < plan.socialReportsPerMonth,
    used,
    cap: unlimited ? -1 : plan.socialReportsPerMonth,
    allChannels: plan.features.socialAllChannels,
    planId,
  };
}
