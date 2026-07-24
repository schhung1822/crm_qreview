// Cấu hình chi phí/hạn mức token theo biz - lưu .data/biz/<bizId>/cost-config.json. Server-only.
import { mutateBizConfig, readBizConfig } from '../data/config-store';

export interface CostConfig {
  // Trần token (in+out) mỗi THÁNG cho cả biz. 0 = không giới hạn. Vượt trần → chặn gọi AI.
  monthlyTokenBudget: number;
}

const NAME = 'cost-config.json';

// Chuẩn hóa trần: số nguyên không âm; <=0 → 0 (không giới hạn).
function normBudget(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0;
  return n > 0 ? n : 0;
}

export async function getCostConfig(): Promise<CostConfig> {
  const saved = await readBizConfig<Partial<CostConfig>>(NAME, {});
  return { monthlyTokenBudget: normBudget(saved.monthlyTokenBudget) };
}

export async function saveCostConfig(patch: Partial<CostConfig>): Promise<CostConfig> {
  return mutateBizConfig<Partial<CostConfig>, CostConfig>(NAME, {}, (cur) => {
    const next: CostConfig = {
      monthlyTokenBudget: normBudget(patch.monthlyTokenBudget ?? cur.monthlyTokenBudget),
    };
    return [next, next];
  });
}
