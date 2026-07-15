import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { runWithBiz } from '@/lib/biz/context';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { canAddSeat } from '@/lib/billing/entitlement';
import {
  addMember,
  getBiz,
  memberRole,
  removeMember,
  setMemberPermissions,
  setMemberRole,
} from '@/lib/store/biz';
import { createUser, findByEmail, listUsers } from '@/lib/auth/users';
import { appLoginUrl } from '@/lib/email/mailer';
import { sendEventEmail } from '@/lib/store/platform-email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Vai trò có thể gán cho nhân viên trong biz (không tạo thêm owner).
const RoleEnum = z.enum(['admin', 'editor', 'viewer']);
const PermsSchema = z.array(z.enum(PERMISSIONS)).optional();

async function requireManager(bizId: string, userId: string): Promise<boolean> {
  const role = await memberRole(bizId, userId);
  return role === 'owner' || role === 'admin';
}

const ROLE_VI: Record<string, string> = { admin: 'Quản trị', editor: 'Biên tập viên', viewer: 'Chỉ xem' };

// GET /api/biz/[id]/members → danh sách thành viên kèm thông tin user (chỉ thành viên biz xem).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await guard();
  if ('response' in g) return g.response;
  const biz = await getBiz(params.id);
  if (!biz) return NextResponse.json({ error: 'Không tìm thấy biz.' }, { status: 404 });
  if (!(await memberRole(params.id, g.user.id))) {
    return NextResponse.json({ error: 'Không đủ quyền.' }, { status: 403 });
  }
  const users = await listUsers();
  const members = biz.members.map((m) => {
    const u = users.find((x) => x.id === m.userId);
    return {
      userId: m.userId,
      role: m.role,
      permissions: m.permissions ?? null,
      email: u?.email ?? '(đã xóa)',
      name: u?.name ?? '',
      active: u?.active ?? false,
      isOwner: m.userId === biz.ownerId,
    };
  });
  return NextResponse.json({ members, canManage: await requireManager(params.id, g.user.id) });
}

const AddSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('existing'),
    email: z.string().email().max(254),
    role: RoleEnum,
    permissions: PermsSchema,
  }),
  z.object({
    mode: z.literal('new'),
    email: z.string().email().max(254),
    name: z.string().min(1).max(120),
    password: z.string().min(8).max(128),
    role: RoleEnum,
    permissions: PermsSchema,
  }),
]);

// POST /api/biz/[id]/members → thêm thành viên: user đã có (email) hoặc tạo tài khoản mới.
// Vai trò + quyền (tùy chỉnh) áp RIÊNG trong biz này (per-biz).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await guard();
  if ('response' in g) return g.response;
  if (!(await requireManager(params.id, g.user.id))) {
    return NextResponse.json({ error: 'Chỉ chủ/quản trị biz mới thêm được thành viên.' }, { status: 403 });
  }
  // Giới hạn số ghế theo gói.
  const seat = await canAddSeat(params.id);
  if (!seat.ok) {
    return NextResponse.json(
      { error: `Gói hiện tại chỉ cho phép ${seat.max} ghế/biz. Nâng cấp gói để thêm thành viên.`, code: 'plan_limit' },
      { status: 403 },
    );
  }
  const parsed = AddSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ.' }, { status: 400 });
  const d = parsed.data;

  // BẢO MẬT: CHỈ CHỦ SỞ HỮU được cấp vai trò 'admin' (admin không tự nhân bản thêm admin).
  if (d.role === 'admin' && (await memberRole(params.id, g.user.id)) !== 'owner') {
    return NextResponse.json({ error: 'Chỉ chủ sở hữu mới thêm được quản trị viên.' }, { status: 403 });
  }

  try {
    if (d.mode === 'existing') {
      const user = await findByEmail(d.email);
      if (!user) return NextResponse.json({ error: 'Email chưa đăng ký tài khoản.' }, { status: 404 });
      await addMember(params.id, user.id, d.role, d.permissions ?? null);
    } else {
      // Tạo TÀI KHOẢN toàn cục (vai trò toàn cục 'viewer' - không cấp quyền; quyền thật theo BIZ)
      // + thêm vào biz với vai trò/quyền được chọn + gửi email thông tin đăng nhập.
      const user = await createUser({ email: d.email, name: d.name, password: d.password, role: 'viewer' });
      await addMember(params.id, user.id, d.role, d.permissions ?? null);
      // Gửi email TRONG ngữ cảnh BIZ ĐÍCH (params.id) để đọc đúng SMTP + appUrl của biz đó, không
      // phụ thuộc cookie sg_biz (có thể là biz khác khi quản lý biz mình không đứng trong).
      void runWithBiz({ userId: g.user.id, bizId: params.id }, async () => {
        const loginUrl = await appLoginUrl(req);
        await sendEventEmail('userCreated', user.email, {
          name: user.name,
          email: user.email,
          password: d.password,
          role: ROLE_VI[d.role] ?? d.role,
          loginUrl,
        });
      });
    }
    const biz = await getBiz(params.id);
    return NextResponse.json({ ok: true, memberCount: biz?.members.length ?? 0 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Không thêm được thành viên.' },
      { status: 400 },
    );
  }
}

// PATCH /api/biz/[id]/members → đổi vai trò và/hoặc quyền tùy chỉnh của thành viên (per-biz).
const PatchSchema = z.object({
  userId: z.string().min(1),
  role: RoleEnum.optional(),
  // undefined = không đổi; null = về mặc định vai trò; mảng = đặt quyền tùy chỉnh.
  permissions: z.union([z.array(z.enum(PERMISSIONS)), z.null()]).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await guard();
  if ('response' in g) return g.response;
  if (!(await requireManager(params.id, g.user.id))) {
    return NextResponse.json({ error: 'Không đủ quyền.' }, { status: 403 });
  }
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ.' }, { status: 400 });

  // BẢO MẬT: chỉ CHỦ SỞ HỮU được đụng tới vai trò 'admin' (cấp mới HOẶC sửa/hạ 1 admin khác - kể cả
  // chính mình). Admin không được hạ bệ/nhân bản admin ngang hàng.
  if (parsed.data.role) {
    const isOwner = (await memberRole(params.id, g.user.id)) === 'owner';
    const targetRole = await memberRole(params.id, parsed.data.userId);
    if (!isOwner && (parsed.data.role === 'admin' || targetRole === 'admin')) {
      return NextResponse.json({ error: 'Chỉ chủ sở hữu mới đổi vai trò của quản trị viên.' }, { status: 403 });
    }
  }
  try {
    if (parsed.data.role) await setMemberRole(params.id, parsed.data.userId, parsed.data.role);
    if (parsed.data.permissions !== undefined) {
      await setMemberPermissions(params.id, parsed.data.userId, parsed.data.permissions);
    }
    // Đổi VAI TRÒ → báo email cho thành viên (sự kiện roleChanged), đọc SMTP/appUrl của biz đích.
    if (parsed.data.role) {
      const role = parsed.data.role;
      const target = (await listUsers()).find((u) => u.id === parsed.data.userId);
      if (target) {
        void runWithBiz({ userId: g.user.id, bizId: params.id }, async () => {
          const loginUrl = await appLoginUrl(req);
          await sendEventEmail('roleChanged', target.email, {
            name: target.name,
            email: target.email,
            role: ROLE_VI[role] ?? role,
            loginUrl,
          });
        });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lỗi.' }, { status: 400 });
  }
}

// DELETE /api/biz/[id]/members?userId=... → xóa thành viên khỏi biz.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const g = await guard();
  if ('response' in g) return g.response;
  const userId = new URL(req.url).searchParams.get('userId') ?? '';
  const targetRole = await memberRole(params.id, userId);

  // CHỦ SỞ HỮU không bao giờ bị xóa (kể cả tự rời) - biz phải luôn có chủ.
  if (targetRole === 'owner') {
    return NextResponse.json({ error: 'Không thể xóa chủ sở hữu biz.' }, { status: 403 });
  }
  // Cho phép tự rời biz; ngoài ra cần quyền quản trị (owner/admin).
  if (userId !== g.user.id && !(await requireManager(params.id, g.user.id))) {
    return NextResponse.json({ error: 'Không đủ quyền.' }, { status: 403 });
  }
  // Chỉ CHỦ SỞ HỮU mới được xóa QUẢN TRỊ VIÊN (admin không xóa admin ngang hàng) - đối xứng với PATCH.
  if (userId !== g.user.id && targetRole === 'admin') {
    const callerIsOwner = (await memberRole(params.id, g.user.id)) === 'owner';
    if (!callerIsOwner) {
      return NextResponse.json(
        { error: 'Chỉ chủ sở hữu mới xóa được quản trị viên.' },
        { status: 403 },
      );
    }
  }
  try {
    await removeMember(params.id, userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lỗi.' }, { status: 400 });
  }
}
