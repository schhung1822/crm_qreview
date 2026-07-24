// Kho "biz" (tổ chức/không gian làm việc) - TOÀN CỤC ở .data/bizes.json.
// Biz là PHẠM VI LỚN NHẤT: mọi kết nối, API key, CMS, bài viết, cấu hình email, nhân viên
// đều thuộc về biz. Dữ liệu workspace của biz nằm ở .data/biz/<id>/.
// QUYỀN theo BIZ: mỗi thành viên có vai trò (owner/admin/editor/viewer) + quyền tùy chỉnh
// RIÊNG trong từng biz (cùng 1 tài khoản có thể là admin ở biz A, chỉ-xem ở biz B).
// Server-only.
import { promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { listUsers } from '../auth/users';
import {
  effectivePermissions,
  isFullAccessRole,
  type Permission,
  type Role,
  sanitizePermissions,
} from '../auth/permissions';
import { bizDir, globalFile } from '../data/biz-path';
import { mutateJson, readJson, withFileLock } from '../data/json-store';
import { storageDriver } from '../data/repos';

// Vai trò trong biz = vai trò ứng dụng (RBAC). Giữ tên BizRole cho tương thích chỗ gọi cũ.
export type BizRole = Role;

export interface BizMember {
  userId: string;
  role: Role;
  // Quyền tùy chỉnh (ghi đè mặc định vai trò) - chỉ áp cho editor/viewer TRONG biz này.
  permissions?: Permission[];
}
export interface BizRecord {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  members: BizMember[];
  // Hồ sơ biz (tùy chọn).
  phone?: string;
  email?: string;
  website?: string;
  description?: string;
  // Tạm khóa bởi quản trị NỀN TẢNG (superadmin) → chặn mọi truy cập vào biz cho tới khi mở lại.
  suspended?: boolean;
}
export interface BizPublic {
  id: string;
  name: string;
  role: Role; // vai trò của user hiện tại trong biz
  ownerId: string;
  memberCount: number;
  phone?: string;
  email?: string;
  website?: string;
  description?: string;
}

const FILE = globalFile('bizes.json');

function isPrismaDriver(): boolean {
  return storageDriver() === 'prisma';
}

// Migration CÓ PHIÊN BẢN: mỗi lần chuyển thêm store sang per-biz, tăng version + thêm file vào
// LEGACY_FILES. Marker .data/.biz-migrated lưu version đã chạy → dời nốt file mới vào biz mặc định
// dù đã migrate lần trước. CHỈ liệt kê file mà store TƯƠNG ỨNG đã dùng bizFile().
const MIGRATION_VERSION = 4;
const MARKER = globalFile('.biz-migrated');
// Tên biz mặc định (gom toàn bộ dữ liệu cũ). Theo yêu cầu người dùng.
const DEFAULT_BIZ_NAME = 'Admin';
const LEGACY_FILES = [
  // Kết nối & API key
  'connections.json',
  'ai-secrets.json',
  'integrations.json',
  'drive.json',
  'dataforseo.json',
  // Nội dung workspace
  'articles.json',
  'plans.json',
  'keywordsets.json',
  'revisions.json',
  'publish-jobs.json',
  'citations.json',
  'article-config.json',
  'image-config.json',
  'task-routing.json',
  'ai-usage.json',
  'ai-usage-series.json',
  // Cấu hình email/SMTP (v4: chuyển vào biz)
  'email.json',
];

async function prismaBizRows(): Promise<BizRecord[]> {
  const { prisma } = await import('../prisma');
  const rows = await prisma.biz.findMany({ include: { members: true } });
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    ownerId: b.ownerId,
    createdAt: b.createdAt.toISOString(),
    phone: b.phone ?? undefined,
    email: b.email ?? undefined,
    website: b.website ?? undefined,
    description: b.description ?? undefined,
    suspended: b.suspended || undefined,
    members: b.members.map((m) => ({
      userId: m.userId,
      role: m.role as Role,
      permissions: (m.permissions as Permission[] | null) ?? undefined,
    })),
  }));
}

async function readAll(): Promise<BizRecord[]> {
  if (storageDriver() === 'prisma') return prismaBizRows();
  return readJson<BizRecord[]>(FILE, []);
}

function genId(): string {
  return 'biz_' + randomBytes(8).toString('hex');
}

export class BizPlanLimitError extends Error {
  constructor(public max: number, public current: number) {
    super(`Goi hien tai chi cho phep ${max} biz.`);
    this.name = 'BizPlanLimitError';
  }
}

export async function getBiz(id: string): Promise<BizRecord | undefined> {
  return (await readAll()).find((b) => b.id === id);
}

// Các biz mà user LÀ CHỦ SỞ HỮU (ownerId). Dùng cho tính quota/hạn mức gói theo tài khoản chủ
// (subscription gắn với chủ tài khoản, gộp trên các biz họ sở hữu).
export async function listBizesOwnedBy(ownerId: string): Promise<BizRecord[]> {
  return (await readAll()).filter((b) => b.ownerId === ownerId);
}

// Đếm tổng số tài khoản chủ (owner) + toàn bộ biz - phục vụ superadmin thống kê nhanh.
export async function listAllBizes(): Promise<BizRecord[]> {
  return readAll();
}

// Tạm khóa / mở khóa biz (quản trị nền tảng).
export async function setBizSuspended(bizId: string, suspended: boolean): Promise<void> {
  if (isPrismaDriver()) {
    const { prisma } = await import('../prisma');
    await prisma.biz.update({ where: { id: bizId }, data: { suspended } }).catch(() => {});
    return;
  }
  await mutateJson<BizRecord[], void>(FILE, [], (rows) => {
    const b = rows.find((x) => x.id === bizId);
    if (b) b.suspended = suspended;
    return [rows, undefined];
  });
}

export async function memberOf(bizId: string, userId: string): Promise<BizMember | undefined> {
  const biz = await getBiz(bizId);
  return biz?.members.find((m) => m.userId === userId);
}

export async function memberRole(bizId: string, userId: string): Promise<Role | null> {
  return (await memberOf(bizId, userId))?.role ?? null;
}

// Quyền HIỆU LỰC của một thành viên trong biz (từ vai trò + tùy chỉnh). Không là thành viên → [].
export function memberPermissions(member: BizMember | undefined): Permission[] {
  if (!member) return [];
  return effectivePermissions(member.role, member.permissions ?? null);
}

export async function listBizesForUser(userId: string): Promise<BizPublic[]> {
  const all = await readAll();
  return all
    .filter((b) => b.members.some((m) => m.userId === userId))
    .map((b) => ({
      id: b.id,
      name: b.name,
      role: b.members.find((m) => m.userId === userId)!.role,
      ownerId: b.ownerId,
      memberCount: b.members.length,
      phone: b.phone,
      email: b.email,
      website: b.website,
      description: b.description,
    }));
}

export async function createBiz(
  name: string,
  ownerId: string,
  options: { maxOwnedBiz?: number } = {},
): Promise<BizRecord> {
  const record: BizRecord = {
    id: genId(),
    name: name.trim() || 'Biz mới',
    ownerId,
    createdAt: new Date().toISOString(),
    members: [{ userId: ownerId, role: 'owner' }],
  };
  if (isPrismaDriver()) {
    const { prisma } = await import('../prisma');
    await prisma.$transaction(async (tx) => {
      if (options.maxOwnedBiz !== undefined) {
        const current = await tx.biz.count({ where: { ownerId } });
        if (current >= options.maxOwnedBiz) throw new BizPlanLimitError(options.maxOwnedBiz, current);
      }
      await tx.biz.create({
        data: {
          id: record.id,
          name: record.name,
          ownerId: record.ownerId,
          createdAt: new Date(record.createdAt),
        },
      });
      await tx.bizMember.create({
        data: { bizId: record.id, userId: ownerId, role: 'owner' },
      });
    });
    return record;
  }
  await mutateJson<BizRecord[], void>(FILE, [], (rows) => {
    if (options.maxOwnedBiz !== undefined) {
      const current = rows.filter((b) => b.ownerId === ownerId).length;
      if (current >= options.maxOwnedBiz) throw new BizPlanLimitError(options.maxOwnedBiz, current);
    }
    return [[...rows, record], undefined];
  });
  await fs.mkdir(bizDir(record.id), { recursive: true });
  return record;
}

// Cập nhật hồ sơ biz (tên + thông tin liên hệ). Giá trị rỗng → xóa trường (trừ tên: giữ nguyên).
export async function updateBizProfile(
  bizId: string,
  patch: Partial<Pick<BizRecord, 'name' | 'phone' | 'email' | 'website' | 'description'>>,
): Promise<void> {
  if (isPrismaDriver()) {
    const { prisma } = await import('../prisma');
    const data: Record<string, string | null> = {};
    if (patch.name !== undefined) data.name = patch.name.trim();
    if (patch.phone !== undefined) data.phone = patch.phone.trim() || null;
    if (patch.email !== undefined) data.email = patch.email.trim() || null;
    if (patch.website !== undefined) data.website = patch.website.trim() || null;
    if (patch.description !== undefined) data.description = patch.description.trim() || null;
    if (Object.keys(data).length) await prisma.biz.update({ where: { id: bizId }, data }).catch(() => {});
    return;
  }
  await mutateJson<BizRecord[], void>(FILE, [], (rows) => {
    const b = rows.find((x) => x.id === bizId);
    if (b) {
      if (patch.name !== undefined) b.name = patch.name.trim() || b.name;
      if (patch.phone !== undefined) b.phone = patch.phone.trim() || undefined;
      if (patch.email !== undefined) b.email = patch.email.trim() || undefined;
      if (patch.website !== undefined) b.website = patch.website.trim() || undefined;
      if (patch.description !== undefined) b.description = patch.description.trim() || undefined;
    }
    return [rows, undefined];
  });
}

export async function addMember(
  bizId: string,
  userId: string,
  role: Role,
  permissions?: Permission[] | null,
): Promise<void> {
  if (isPrismaDriver()) {
    const { prisma } = await import('../prisma');
    const r: Role = role === 'owner' ? 'admin' : role;
    const member: { bizId: string; userId: string; role: string; permissions?: object } = { bizId, userId, role: r };
    if (!isFullAccessRole(r) && permissions != null) member.permissions = sanitizePermissions(permissions) as unknown as object;
    await prisma.bizMember.create({ data: member }).catch(() => {});
    return;
  }
  await mutateJson<BizRecord[], void>(FILE, [], (rows) => {
    const b = rows.find((x) => x.id === bizId);
    if (b && !b.members.some((m) => m.userId === userId)) {
      const r: Role = role === 'owner' ? 'admin' : role; // không tạo thêm owner qua đây
      const member: BizMember = { userId, role: r };
      if (!isFullAccessRole(r) && permissions != null) {
        member.permissions = sanitizePermissions(permissions);
      }
      b.members.push(member);
    }
    return [rows, undefined];
  });
}

export async function setMemberRole(bizId: string, userId: string, role: Role): Promise<void> {
  if (isPrismaDriver()) {
    const { prisma } = await import('../prisma');
    const b = await prisma.biz.findUnique({ where: { id: bizId } });
    if (b?.ownerId === userId) throw new Error('Khong the doi vai tro chu so huu biz.');
    const nextRole = role === 'owner' ? 'admin' : role;
    await prisma.bizMember.update({
      where: { bizId_userId: { bizId, userId } },
      data: { role: nextRole, ...(isFullAccessRole(nextRole) ? { permissions: undefined } : {}) },
    }).catch(() => {});
    return;
  }
  await mutateJson<BizRecord[], void>(FILE, [], (rows) => {
    const b = rows.find((x) => x.id === bizId);
    if (!b) return [rows, undefined];
    if (b.ownerId === userId) throw new Error('Không thể đổi vai trò chủ sở hữu biz.');
    const m = b.members.find((x) => x.userId === userId);
    if (m) {
      m.role = role === 'owner' ? 'admin' : role;
      if (isFullAccessRole(m.role)) delete m.permissions; // vai trò toàn quyền không dùng tùy chỉnh
    }
    return [rows, undefined];
  });
}

// Đặt quyền tùy chỉnh cho 1 thành viên TRONG biz. null = về mặc định vai trò.
export async function setMemberPermissions(
  bizId: string,
  userId: string,
  permissions: Permission[] | null,
): Promise<void> {
  if (isPrismaDriver()) {
    const { prisma } = await import('../prisma');
    const m = await prisma.bizMember.findUnique({ where: { bizId_userId: { bizId, userId } } });
    if (m && !isFullAccessRole(m.role as Role)) {
      await prisma.bizMember.update({
        where: { bizId_userId: { bizId, userId } },
        data: { permissions: permissions === null ? undefined : (sanitizePermissions(permissions) as unknown as object) },
      });
    }
    return;
  }
  await mutateJson<BizRecord[], void>(FILE, [], (rows) => {
    const b = rows.find((x) => x.id === bizId);
    if (!b) return [rows, undefined];
    const m = b.members.find((x) => x.userId === userId);
    if (m && !isFullAccessRole(m.role)) {
      if (permissions === null) delete m.permissions;
      else m.permissions = sanitizePermissions(permissions);
    }
    return [rows, undefined];
  });
}

// CHUYỂN QUYỀN SỞ HỮU biz cho user khác (superadmin). Chủ cũ hạ xuống 'admin' (vẫn là thành viên),
// chủ mới lên 'owner' (thêm vào thành viên nếu chưa có). Bỏ qua giới hạn ghế (thao tác quản trị).
export async function transferBizOwnership(bizId: string, newOwnerId: string): Promise<void> {
  if (isPrismaDriver()) {
    const { prisma } = await import('../prisma');
    await prisma.$transaction(async (tx) => {
      const b = await tx.biz.findUnique({ where: { id: bizId } });
      if (!b || b.ownerId === newOwnerId) return;
      await tx.biz.update({ where: { id: bizId }, data: { ownerId: newOwnerId } });
      await tx.bizMember.upsert({
        where: { bizId_userId: { bizId, userId: newOwnerId } },
        create: { bizId, userId: newOwnerId, role: 'owner' },
        update: { role: 'owner', permissions: undefined },
      });
      await tx.bizMember.update({ where: { bizId_userId: { bizId, userId: b.ownerId } }, data: { role: 'admin', permissions: undefined } }).catch(() => {});
    });
    return;
  }
  await mutateJson<BizRecord[], void>(FILE, [], (rows) => {
    const b = rows.find((x) => x.id === bizId);
    if (!b) return [rows, undefined];
    const oldOwnerId = b.ownerId;
    if (oldOwnerId === newOwnerId) return [rows, undefined];
    b.ownerId = newOwnerId;
    const old = b.members.find((m) => m.userId === oldOwnerId);
    if (old) {
      old.role = 'admin';
      delete old.permissions;
    }
    const next = b.members.find((m) => m.userId === newOwnerId);
    if (next) {
      next.role = 'owner';
      delete next.permissions;
    } else {
      b.members.push({ userId: newOwnerId, role: 'owner' });
    }
    return [rows, undefined];
  });
}

export async function removeMember(bizId: string, userId: string): Promise<void> {
  if (isPrismaDriver()) {
    const { prisma } = await import('../prisma');
    const b = await prisma.biz.findUnique({ where: { id: bizId } });
    if (b?.ownerId === userId) throw new Error('Khong the xoa chu so huu khoi biz.');
    await prisma.bizMember.delete({ where: { bizId_userId: { bizId, userId } } }).catch(() => {});
    return;
  }
  await mutateJson<BizRecord[], void>(FILE, [], (rows) => {
    const b = rows.find((x) => x.id === bizId);
    if (!b) return [rows, undefined];
    if (b.ownerId === userId) throw new Error('Không thể xóa chủ sở hữu khỏi biz.');
    b.members = b.members.filter((m) => m.userId !== userId);
    return [rows, undefined];
  });
}

// Xóa biz + TOÀN BỘ dữ liệu workspace của biz (.data/biz/<id>/). Chỉ owner được gọi (kiểm ở route).
export async function deleteBiz(bizId: string): Promise<void> {
  if (isPrismaDriver()) {
    const { prisma } = await import('../prisma');
    await prisma.biz.delete({ where: { id: bizId } }).catch(() => {});
    return;
  }
  await mutateJson<BizRecord[], void>(FILE, [], (rows) => [rows.filter((b) => b.id !== bizId), undefined]);
  await fs.rm(bizDir(bizId), { recursive: true, force: true }).catch(() => {});
}

// Chọn biz đang hoạt động: ưu tiên preferBizId NẾU user là thành viên; không thì biz đầu tiên.
// KHÔNG tự tạo biz (bản mới: tài khoản chưa có biz phải qua onboarding tạo biz trước).
// Trả về bizId undefined nếu user chưa thuộc biz nào.
export async function resolveActiveBiz(
  userId: string,
  preferBizId?: string,
): Promise<{ bizId?: string; role?: Role }> {
  const bizes = await listBizesForUser(userId);
  if (bizes.length === 0) return {};
  const pref = preferBizId ? bizes.find((b) => b.id === preferBizId) : undefined;
  const chosen = pref ?? bizes[0];
  return { bizId: chosen.id, role: chosen.role };
}

async function markerVersion(): Promise<number> {
  try {
    return Number(JSON.parse(await fs.readFile(MARKER, 'utf8')).version) || 0;
  } catch {
    return 0;
  }
}

async function writeMarker(): Promise<void> {
  await fs.writeFile(MARKER, JSON.stringify({ version: MIGRATION_VERSION }), { mode: 0o600 });
}

// Còn dữ liệu single-tenant CŨ ở .data gốc? (phân biệt "nâng cấp" với "cài mới").
async function anyLegacyDataExists(): Promise<boolean> {
  for (const name of LEGACY_FILES) {
    try {
      await fs.access(globalFile(name));
      return true;
    } catch {
      /* không có */
    }
  }
  return false;
}

// Migrate dữ liệu single-tenant CŨ sang biz mặc định. Idempotent + có phiên bản: khi thêm store
// per-biz mới, tăng MIGRATION_VERSION → lần chạy tới sẽ dời nốt file mới vào biz mặc định.
let migrated = false;
export async function ensureMigrated(): Promise<void> {
  if (migrated) return;
  if (isPrismaDriver()) {
    migrated = true;
    return;
  }
  await withFileLock(FILE, async () => {
    if ((await markerVersion()) >= MIGRATION_VERSION) {
      migrated = true;
      return;
    }
    const users = await listUsers();
    if (users.length === 0) {
      migrated = true; // cài mới, chưa có user → không có gì để migrate
      return;
    }
    let bizes = await readAll();
    // Chưa có biz nào:
    // - CÓ dữ liệu cũ (.data gốc) → nâng cấp: tạo biz mặc định gom mọi user + dữ liệu.
    // - KHÔNG có dữ liệu cũ → cài mới: để user tự tạo biz (onboarding), không tạo sẵn.
    if (bizes.length === 0) {
      if (!(await anyLegacyDataExists())) {
        await writeMarker();
        migrated = true;
        return;
      }
      const owner = users.find((u) => u.role === 'owner') ?? users[0];
      const record: BizRecord = {
        id: genId(),
        name: DEFAULT_BIZ_NAME,
        ownerId: owner.id,
        createdAt: new Date().toISOString(),
        members: users.map((u) => ({
          userId: u.id,
          role: u.id === owner.id ? ('owner' as Role) : u.role,
          ...(!isFullAccessRole(u.role) && u.permissions ? { permissions: u.permissions } : {}),
        })),
      };
      await fs.mkdir(bizDir(record.id), { recursive: true });
      await fs.writeFile(FILE, JSON.stringify([record], null, 2), { mode: 0o600 });
      bizes = [record];
    }
    // Biz mặc định = biz tạo SỚM NHẤT (trước các biz người dùng tự tạo) = nơi gom dữ liệu cũ.
    const def = bizes.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b));
    await fs.mkdir(bizDir(def.id), { recursive: true });
    // Dời MỌI file legacy còn ở .data gốc vào biz mặc định (rename lỗi nếu đã dời/không có → bỏ qua).
    for (const name of LEGACY_FILES) {
      try {
        await fs.rename(globalFile(name), path.join(bizDir(def.id), name));
      } catch {
        /* đã dời hoặc không tồn tại */
      }
    }
    // GHI TRỰC TIẾP (KHÔNG dùng mutateJson) vì cả khối này đang chạy TRONG withFileLock(FILE) -
    // mutateJson sẽ khóa lại chính FILE → DEADLOCK (treo app).
    const rows = await readAll();
    let changed = false;
    // Nâng cấp vai trò thành viên kiểu cũ ('member' của bản đa-tổ-chức đầu) → vai trò ứng dụng thật,
    // khôi phục từ vai trò/quyền TOÀN CỤC của user để không mất quyền khi chuyển sang per-biz.
    for (const biz of rows) {
      for (const m of biz.members) {
        if ((m.role as string) === 'member') {
          const gu = users.find((u) => u.id === m.userId);
          m.role = m.userId === biz.ownerId ? 'owner' : (gu?.role ?? 'viewer');
          if (gu?.permissions && !isFullAccessRole(m.role)) m.permissions = gu.permissions;
          changed = true;
        }
      }
    }
    // Đặt tên biz mặc định thành "Admin".
    const b = rows.find((x) => x.id === def.id);
    if (b && b.name !== DEFAULT_BIZ_NAME) {
      b.name = DEFAULT_BIZ_NAME;
      changed = true;
    }
    if (changed) await fs.writeFile(FILE, JSON.stringify(rows, null, 2), { mode: 0o600 });
    await writeMarker();
    migrated = true;
  });
}
