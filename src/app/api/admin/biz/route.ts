import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuper } from '@/lib/admin/guard';
import { listUsers } from '@/lib/auth/users';
import { listOrders, type Order } from '@/lib/billing/orders';
import { listSubscriptions } from '@/lib/billing/subscription';
import { deleteBiz, listAllBizes, setBizSuspended, transferBizOwnership } from '@/lib/store/biz';

export const dynamic = 'force-dynamic';

// GET → tất cả biz kèm THÔNG TIN GÓI CƯỚC + ĐƠN HÀNG của tài khoản chủ (gói/đơn gắn theo tài khoản
// chủ, không theo từng biz; 1 chủ nhiều biz sẽ thấy cùng gói/đơn). Đọc-thuần, không tạo bản ghi mới.
export async function GET() {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  const [bizes, users, subs, orders] = await Promise.all([
    listAllBizes(),
    listUsers(),
    listSubscriptions(),
    listOrders(),
  ]);
  const byId = new Map(users.map((u) => [u.id, u]));
  const subByUser = new Map(subs.map((s) => [s.userId, s]));
  const ordersByUser = new Map<string, Order[]>();
  for (const o of orders) {
    const arr = ordersByUser.get(o.userId);
    if (arr) arr.push(o);
    else ordersByUser.set(o.userId, [o]);
  }
  const rows = bizes
    .map((b) => {
      const s = subByUser.get(b.ownerId);
      const os = (ordersByUser.get(b.ownerId) ?? [])
        .slice()
        .sort((a, c) => (a.createdAt < c.createdAt ? 1 : -1))
        .map((o) => ({
          id: o.id,
          payCode: o.payCode,
          userEmail: o.userEmail,
          phone: o.phone ?? null,
          type: o.type,
          plan: o.plan ?? null,
          months: o.months ?? null,
          overageArticles: o.overageArticles ?? null,
          amount: o.amount,
          discount: o.discount,
          total: o.total,
          currency: o.currency,
          couponCode: o.couponCode ?? null,
          status: o.status,
          note: o.note ?? null,
          utm: o.utm ?? null,
          createdAt: o.createdAt,
          paidAt: o.paidAt ?? null,
        }));
      return {
        id: b.id,
        name: b.name,
        ownerId: b.ownerId,
        ownerEmail: byId.get(b.ownerId)?.email ?? null,
        members: b.members.length,
        suspended: !!b.suspended,
        createdAt: b.createdAt,
        plan: s?.plan ?? null, // null = chưa có bản ghi (mặc định dùng thử Pro khi dùng lần đầu)
        subStatus: s?.status ?? null,
        trialEndsAt: s?.trialEndsAt ?? null,
        currentPeriodEnd: s?.currentPeriodEnd ?? null,
        overageArticles: s?.overageArticles ?? 0,
        unlimitedArticles: s?.unlimitedArticles === true,
        orders: os,
      };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return NextResponse.json({ bizes: rows });
}

const Schema = z.object({
  bizId: z.string().min(1).max(64),
  action: z.enum(['suspend', 'activate', 'delete', 'transfer']),
  newOwnerId: z.string().min(1).max(64).optional(), // với action='transfer'
});

// POST → khóa / mở khóa / xóa / CHUYỂN QUYỀN SỞ HỮU biz.
export async function POST(req: Request) {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ', code: 'errInvalidParams' }, { status: 400 });
  const { bizId, action, newOwnerId } = parsed.data;
  try {
    if (action === 'suspend') await setBizSuspended(bizId, true);
    else if (action === 'activate') await setBizSuspended(bizId, false);
    else if (action === 'transfer') {
      if (!newOwnerId) return NextResponse.json({ error: 'Thiếu người nhận', code: 'errRecipientMissing' }, { status: 400 });
      const exists = (await listUsers()).some((u) => u.id === newOwnerId);
      if (!exists) return NextResponse.json({ error: 'Người nhận không tồn tại', code: 'errRecipientNotFound' }, { status: 400 });
      await transferBizOwnership(bizId, newOwnerId);
    } else await deleteBiz(bizId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Lỗi thao tác' },
      { status: 400 },
    );
  }
}
