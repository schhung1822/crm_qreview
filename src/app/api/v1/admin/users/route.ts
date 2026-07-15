// API QUẢN TRỊ NỀN TẢNG — NGƯỜI DÙNG.
//   GET   /api/v1/admin/users?limit=&q=   → danh sách user (không lộ mật khẩu/salt)
//   GET   /api/v1/admin/users/{id}        → chi tiết 1 user + gói cước (route [id])
//   PATCH /api/v1/admin/users             → cập nhật user (discriminated theo 'action'):
//         update | activate | suspend | setPassword | setPlan | cancelSubscription |
//         addOverage | setUnlimited
// Xác thực: Bearer sga_... (scope 'users'). Tái dùng service layer (updateUser/setSubscription/...)
// nên bảo vệ owner + mọi side-effect giữ nguyên.
// EMAIL: action 'cancelSubscription' gửi email 'subscriptionCanceled' (giống chokepoint UI khác).
import { z } from 'zod';
import { platformApiAuth } from '@/lib/admin/api-auth';
import { apiErr, apiOk } from '@/lib/admin/api-response';
import { findById, listUsers, setPassword, updateUser } from '@/lib/auth/users';
import { isSuperadminEmail } from '@/lib/auth/superadmin';
import { addOverageArticles, getSubscription, setSubscription } from '@/lib/billing/subscription';
import { sendEventEmail } from '@/lib/store/platform-email';
import { appendAudit } from '@/lib/store/admin-audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const loginUrl = () => (process.env.APP_URL ? `${process.env.APP_URL}/login` : '');
const PLAN_IDS = ['free', 'starter', 'pro', 'agency', 'enterprise'] as const;

export async function GET(req: Request) {
  const a = await platformApiAuth(req, 'users');
  if ('response' in a) return a.response;
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  const limit = Math.min(Math.max(1, Number(url.searchParams.get('limit')) || 500), 2000);
  let users = await listUsers(); // đã là PublicUser (không có passwordHash/salt)
  if (q) users = users.filter((u) => `${u.email} ${u.name}`.toLowerCase().includes(q));
  return apiOk({ users: users.slice(0, limit), total: users.length });
}

const uid = z.string().min(1).max(64);
const Schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('update'), userId: uid, name: z.string().min(1).max(120) }),
  z.object({ action: z.literal('activate'), userId: uid }),
  z.object({ action: z.literal('suspend'), userId: uid }),
  z.object({ action: z.literal('setPassword'), userId: uid, password: z.string().min(8).max(200) }),
  z.object({ action: z.literal('addOverage'), userId: uid, overage: z.number().int().min(1).max(100000) }),
  z.object({ action: z.literal('setUnlimited'), userId: uid, unlimited: z.boolean() }),
  z.object({
    action: z.literal('setPlan'),
    userId: uid,
    plan: z.enum(PLAN_IDS),
    months: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]).optional(),
  }),
  z.object({ action: z.literal('cancelSubscription'), userId: uid }),
]);

const DAY = 86_400_000;

export async function PATCH(req: Request) {
  const a = await platformApiAuth(req, 'users');
  if ('response' in a) return a.response;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErr('invalid_params', 'Tham số không hợp lệ.', 400);
  const d = parsed.data;

  const user = await findById(d.userId);
  if (!user) return apiErr('not_found', 'Không tìm thấy người dùng.', 404);

  // BẢO MẬT (chống chiếm quyền khi token scope 'users' bị lộ): KHÔNG cho ĐẶT LẠI MẬT KHẨU hoặc VÔ
  // HIỆU HÓA tài khoản CHỦ SỞ HỮU / SUPERADMIN nền tảng qua API. setPassword ở service layer không có
  // owner-guard như updateUser → phải chặn tại đây, nếu không token hẹp có thể chiếm tài khoản cấp cao.
  const targetProtected = user.role === 'owner' || isSuperadminEmail(user.email);
  if (targetProtected && (d.action === 'setPassword' || d.action === 'suspend')) {
    await appendAudit({ via: 'api', tokenId: a.token.id, actor: a.token.name, action: `user.${d.action}`, resource: 'user', resourceId: d.userId, ok: false, error: 'protected_account', ip: a.ip });
    return apiErr('forbidden', 'Không thể thao tác này lên tài khoản chủ sở hữu hoặc quản trị nền tảng.', 403);
  }

  try {
    let extra: Record<string, unknown> = {};
    if (d.action === 'update') { await updateUser(d.userId, { name: d.name }); extra = { name: d.name }; }
    else if (d.action === 'activate') await updateUser(d.userId, { active: true });
    else if (d.action === 'suspend') await updateUser(d.userId, { active: false });
    else if (d.action === 'setPassword') await setPassword(d.userId, d.password);
    else if (d.action === 'addOverage') await addOverageArticles(d.userId, d.overage);
    else if (d.action === 'setUnlimited') await setSubscription(d.userId, { unlimitedArticles: d.unlimited });
    else if (d.action === 'setPlan') {
      const months = d.months ?? 1;
      await setSubscription(d.userId, {
        plan: d.plan,
        status: 'active',
        billingCycle: months >= 12 ? 'yearly' : 'monthly',
        currentPeriodEnd: new Date(Date.now() + months * 30 * DAY).toISOString(),
      });
      extra = { plan: d.plan, months };
    } else if (d.action === 'cancelSubscription') {
      const sub = await getSubscription(d.userId);
      await setSubscription(d.userId, { status: 'canceled' });
      // EMAIL huỷ gói (tận dụng template 'subscriptionCanceled'). An toàn: sendEventEmail không ném.
      void sendEventEmail('subscriptionCanceled', user.email, {
        name: user.name,
        plan: sub.plan,
        loginUrl: loginUrl(),
      });
      extra = { plan: sub.plan, emailed: 'subscriptionCanceled' };
    }
    await appendAudit({ via: 'api', tokenId: a.token.id, actor: a.token.name, action: `user.${d.action}`, resource: 'user', resourceId: d.userId, detail: extra, ok: true, ip: a.ip });
    const updated = await findById(d.userId);
    return apiOk({ user: updated ? { id: updated.id, email: updated.email, name: updated.name, role: updated.role, active: updated.active } : null });
  } catch (e) {
    const error = e instanceof Error ? e.message : 'error';
    await appendAudit({ via: 'api', tokenId: a.token.id, actor: a.token.name, action: `user.${d.action}`, resource: 'user', resourceId: d.userId, ok: false, error, ip: a.ip });
    return apiErr('operation_failed', error, 400);
  }
}
