import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuper } from '@/lib/admin/guard';
import { listUsers } from '@/lib/auth/users';
import { PLAN_ORDER } from '@/lib/billing/plans';
import { listSubscriptions, setSubscription } from '@/lib/billing/subscription';
import { listAllBizes } from '@/lib/store/biz';

export const dynamic = 'force-dynamic';

// GET → danh sách tài khoản + gói + trạng thái + số biz sở hữu (cho console quản trị nền tảng).
export async function GET() {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  const [users, subs, bizes] = await Promise.all([
    listUsers(),
    listSubscriptions(),
    listAllBizes(),
  ]);
  const subById = new Map(subs.map((s) => [s.userId, s]));
  const owned = new Map<string, number>();
  for (const b of bizes) owned.set(b.ownerId, (owned.get(b.ownerId) ?? 0) + 1);
  const accounts = users.map((u) => {
    const s = subById.get(u.id);
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      active: u.active,
      createdAt: u.createdAt,
      plan: s?.plan ?? null, // null = chưa có bản ghi (mặc định dùng thử Pro khi dùng lần đầu)
      status: s?.status ?? null,
      trialEndsAt: s?.trialEndsAt ?? null,
      overageArticles: s?.overageArticles ?? 0,
      ownedBiz: owned.get(u.id) ?? 0,
    };
  });
  return NextResponse.json({ accounts, plans: PLAN_ORDER });
}

const SetSchema = z.object({
  userId: z.string().min(1).max(64),
  plan: z.enum(['free', 'starter', 'pro', 'agency', 'enterprise']),
  status: z.enum(['trialing', 'active', 'past_due', 'canceled', 'free']).optional(),
  overageArticles: z.number().int().min(0).max(100000).optional(),
});

// POST → gán/đổi gói cho 1 tài khoản (thủ công khi chưa nối cổng thanh toán).
export async function POST(req: Request) {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  const parsed = SetSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ', code: 'errInvalidParams' }, { status: 400 });
  const { userId, plan, status, overageArticles } = parsed.data;
  const sub = await setSubscription(userId, {
    plan,
    status: status ?? (plan === 'free' ? 'free' : 'active'),
    ...(overageArticles !== undefined ? { overageArticles } : {}),
  });
  return NextResponse.json({ ok: true, sub });
}
