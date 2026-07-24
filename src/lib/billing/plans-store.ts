// Kho gói cước ĐỘNG - .data/plans.json (override lên DEFAULT_PLANS). Cho phép admin sửa giá/hạn
// mức/tính năng từng gói. Server-only. Có cache ngắn để tránh đọc file mỗi request.
import { mutateGlobalConfig, readGlobalConfig } from '../data/config-store';
import { DEFAULT_PLANS, type Plan, type PlanFeatures, type PlanId } from './plans';

// Override lưu được TỪNG PHẦN (kể cả features từng cờ) - merge lên DEFAULT_PLANS khi đọc.
export type PlanPatch = Partial<Omit<Plan, 'id' | 'features'>> & {
  features?: Partial<PlanFeatures>;
};
type Overrides = Partial<Record<PlanId, PlanPatch>>;

let cache: { at: number; plans: Record<PlanId, Plan> } | null = null;
const TTL = 10_000;

function merge(overrides: Overrides): Record<PlanId, Plan> {
  const out = {} as Record<PlanId, Plan>;
  for (const id of Object.keys(DEFAULT_PLANS) as PlanId[]) {
    const base = DEFAULT_PLANS[id];
    const ov = overrides[id] ?? {};
    out[id] = {
      ...base,
      ...ov,
      id, // KHÔNG cho override đổi id
      features: { ...base.features, ...(ov.features ?? {}) },
    };
  }
  return out;
}

export async function readPlans(): Promise<Record<PlanId, Plan>> {
  const now = Date.now();
  if (cache && now - cache.at < TTL) return cache.plans;
  const overrides = await readGlobalConfig<Overrides>('plans.json', {});
  const plans = merge(overrides);
  cache = { at: now, plans };
  return plans;
}

export async function getPlan(id: PlanId): Promise<Plan> {
  return (await readPlans())[id];
}

// Lưu override cho 1 gói (patch nông + features gộp). Xóa cache để lần đọc sau thấy giá trị mới.
export async function savePlan(id: PlanId, patch: PlanPatch): Promise<Record<PlanId, Plan>> {
  await mutateGlobalConfig<Overrides, void>('plans.json', {}, (cur) => {
    const prev = cur[id] ?? {};
    cur[id] = {
      ...prev,
      ...patch,
      ...(patch.features ? { features: { ...(prev.features ?? {}), ...patch.features } } : {}),
    };
    return [cur, undefined];
  });
  cache = null;
  return readPlans();
}

// Khôi phục 1 gói về mặc định (xóa override).
export async function resetPlan(id: PlanId): Promise<Record<PlanId, Plan>> {
  await mutateGlobalConfig<Overrides, void>('plans.json', {}, (cur) => {
    delete cur[id];
    return [cur, undefined];
  });
  cache = null;
  return readPlans();
}
