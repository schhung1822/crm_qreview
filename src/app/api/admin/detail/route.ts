import { NextResponse } from 'next/server';
import { requireSuper } from '@/lib/admin/guard';
import { listUsers } from '@/lib/auth/users';
import { listOrders, type Order } from '@/lib/billing/orders';
import { listSubscriptions } from '@/lib/billing/subscription';
import { listAllBizes } from '@/lib/store/biz';

export const dynamic = 'force-dynamic';

// Bản gọn của đơn cho các màn CHI TIẾT (dùng lại ở user & biz).
function compactOrder(o: Order) {
  return {
    id: o.id,
    payCode: o.payCode,
    type: o.type,
    plan: o.plan ?? null,
    months: o.months ?? null,
    overageArticles: o.overageArticles ?? null,
    total: o.total,
    currency: o.currency,
    couponCode: o.couponCode ?? null,
    status: o.status,
    createdAt: o.createdAt,
    paidAt: o.paidAt ?? null,
  };
}

// GET /api/admin/detail?kind=user|biz&id=... → gom mọi dữ liệu LIÊN QUAN của 1 thực thể để màn chi
// tiết liên kết chéo (user ↔ biz ↔ gói ↔ đơn). Đọc-thuần, không tạo bản ghi mới.
export async function GET(req: Request) {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;

  const sp = new URL(req.url).searchParams;
  const kind = sp.get('kind');
  const id = sp.get('id') ?? '';
  if ((kind !== 'user' && kind !== 'biz') || !id) {
    return NextResponse.json({ error: 'Tham số không hợp lệ', code: 'errInvalidParams' }, { status: 400 });
  }

  const [users, subs, orders, bizes] = await Promise.all([
    listUsers(),
    listSubscriptions(),
    listOrders(),
    listAllBizes(),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const subByUser = new Map(subs.map((s) => [s.userId, s]));
  const ordersByUser = new Map<string, Order[]>();
  for (const o of orders) {
    const arr = ordersByUser.get(o.userId);
    if (arr) arr.push(o);
    else ordersByUser.set(o.userId, [o]);
  }
  const ownerOrders = (uid: string) =>
    (ordersByUser.get(uid) ?? [])
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map(compactOrder);
  const subInfo = (uid: string) => {
    const s = subByUser.get(uid);
    return {
      plan: s?.plan ?? null,
      status: s?.status ?? null,
      trialEndsAt: s?.trialEndsAt ?? null,
      currentPeriodEnd: s?.currentPeriodEnd ?? null,
      overageArticles: s?.overageArticles ?? 0,
    };
  };

  if (kind === 'user') {
    const u = userById.get(id);
    if (!u) return NextResponse.json({ error: 'Không tìm thấy tài khoản', code: 'errAccountNotFound' }, { status: 404 });
    const owned = bizes
      .filter((b) => b.ownerId === id)
      .map((b) => ({ id: b.id, name: b.name, members: b.members.length, suspended: !!b.suspended, role: 'owner' as const }));
    const member = bizes
      .filter((b) => b.ownerId !== id && b.members.some((m) => m.userId === id))
      .map((b) => ({
        id: b.id,
        name: b.name,
        members: b.members.length,
        suspended: !!b.suspended,
        role: b.members.find((m) => m.userId === id)?.role ?? 'member',
        ownerEmail: userById.get(b.ownerId)?.email ?? null,
      }));
    return NextResponse.json({
      kind: 'user',
      user: { id: u.id, email: u.email, name: u.name, role: u.role, active: u.active, createdAt: u.createdAt },
      sub: subInfo(id),
      orders: ownerOrders(id),
      ownedBizes: owned,
      memberBizes: member,
    });
  }

  // kind === 'biz'
  const b = bizes.find((x) => x.id === id);
  if (!b) return NextResponse.json({ error: 'Không tìm thấy biz', code: 'errBizNotFound' }, { status: 404 });
  const owner = userById.get(b.ownerId);
  const members = b.members.map((m) => {
    const mu = userById.get(m.userId);
    return { userId: m.userId, email: mu?.email ?? null, name: mu?.name ?? null, role: m.role };
  });
  return NextResponse.json({
    kind: 'biz',
    biz: { id: b.id, name: b.name, suspended: !!b.suspended, createdAt: b.createdAt },
    owner: owner ? { id: owner.id, email: owner.email, name: owner.name } : null,
    members,
    sub: subInfo(b.ownerId), // gói/đơn theo tài khoản CHỦ
    orders: ownerOrders(b.ownerId),
  });
}
