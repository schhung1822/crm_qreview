// Kho người dùng - lưu file .data/users.json. Mật khẩu băm scrypt + salt ngẫu nhiên.
// Server-only. KHÔNG bao giờ trả passwordHash/salt ra client.
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { promisify } from 'node:util';
import path from 'node:path';
import { mutateJson, readJson } from '../data/json-store';
import { getRepos, storageDriver } from '../data/repos';
import { isFullAccessRole, type Permission, type Role, sanitizePermissions } from './permissions';

// scrypt BẤT ĐỒNG BỘ (không chặn event loop như scryptSync → tránh DoS khi nhiều
// request login/đăng ký cùng lúc). Giữ tham số mặc định để hash cũ vẫn verify được.
const scrypt = promisify(scryptCb) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
  salt: string;
  active: boolean;
  createdAt: string;
  // Đã xác thực email chưa. VẮNG MẶT = đã xác thực (tài khoản cũ trước tính năng, hoặc do admin
  // tạo). Chỉ false khi tự đăng ký và chưa bấm link kích hoạt → chưa đăng nhập được.
  emailVerified?: boolean;
  // Quyền tùy chỉnh (ghi đè mặc định vai trò). Vắng mặt = dùng mặc định của vai trò.
  permissions?: Permission[];
  firstTouchUtm?: unknown;
  lastTouchUtm?: unknown;
  fbp?: string | null;
  fbc?: string | null;
  ttclid?: string | null;
  ttp?: string | null;
  gclid?: string | null;
  gaClientId?: string | null;
  landingPage?: string | null;
  referrer?: string | null;
  signupIp?: Uint8Array | null;
  signupUserAgent?: string | null;
  lastIp?: Uint8Array | null;
  lastUserAgent?: string | null;
  lastSeenAt?: string | null;
}

export type PublicUser = Pick<
  UserRecord,
  'id' | 'email' | 'name' | 'role' | 'active' | 'createdAt' | 'emailVerified' | 'permissions'
>;

export interface UserTrackingInput {
  fbp?: string;
  fbc?: string;
  ttclid?: string;
  ttp?: string;
  gclid?: string;
  gaClientId?: string;
  landingPage?: string;
  referrer?: string;
  ip?: string;
  userAgent?: string;
  firstTouchUtm?: Record<string, string>;
  lastTouchUtm?: Record<string, string>;
}

// Vắng mặt = đã xác thực (tương thích ngược với user tạo trước tính năng xác thực email).
export function isEmailVerified(u: Pick<UserRecord, 'emailVerified'>): boolean {
  return u.emailVerified !== false;
}

const FILE = path.join(process.cwd(), '.data', 'users.json');

async function hashPassword(password: string, salt: string): Promise<string> {
  return (await scrypt(password, salt, 64)).toString('hex');
}

function ipToBytes(ip: string | undefined): Buffer | undefined {
  if (!ip || isIP(ip) !== 4) return undefined;
  return Buffer.from(ip.split('.').map((part) => Number(part)));
}

function cleanText(value: string | undefined, max = 255): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

export function toPublic(u: UserRecord): PublicUser {
  const {
    passwordHash: _p,
    salt: _s,
    firstTouchUtm: _ftu,
    lastTouchUtm: _ltu,
    fbp: _fbp,
    fbc: _fbc,
    ttclid: _ttclid,
    ttp: _ttp,
    gclid: _gclid,
    gaClientId: _gaClientId,
    landingPage: _landingPage,
    referrer: _referrer,
    signupIp: _signupIp,
    signupUserAgent: _signupUserAgent,
    lastIp: _lastIp,
    lastUserAgent: _lastUserAgent,
    lastSeenAt: _lastSeenAt,
    ...rest
  } = u;
  void _p;
  void _s;
  void _ftu;
  void _ltu;
  void _fbp;
  void _fbc;
  void _ttclid;
  void _ttp;
  void _gclid;
  void _gaClientId;
  void _landingPage;
  void _referrer;
  void _signupIp;
  void _signupUserAgent;
  void _lastIp;
  void _lastUserAgent;
  void _lastSeenAt;
  return rest;
}

async function readAll(): Promise<UserRecord[]> {
  if (storageDriver() === 'prisma') return (await getRepos()).users.all();
  return readJson<UserRecord[]>(FILE, []);
}

export async function userCount(): Promise<number> {
  if (storageDriver() === 'prisma') return (await getRepos()).users.count();
  return (await readAll()).length;
}

export async function listUsers(): Promise<PublicUser[]> {
  return (await readAll()).map(toPublic);
}

export async function findById(id: string): Promise<UserRecord | undefined> {
  if (storageDriver() === 'prisma') return (await (await getRepos()).users.getById(id)) ?? undefined;
  return (await readAll()).find((u) => u.id === id);
}

export async function findByEmail(email: string): Promise<UserRecord | undefined> {
  const e = email.trim().toLowerCase();
  if (storageDriver() === 'prisma') return (await (await getRepos()).users.getByEmail(e)) ?? undefined;
  return (await readAll()).find((u) => u.email.toLowerCase() === e);
}

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  role: Role;
  permissions?: Permission[] | null;
  // Nếu true: khi ĐÂY là user ĐẦU TIÊN (rows rỗng, quyết định TRONG lock) → ép vai trò 'owner'.
  // Đóng race "2 owner": trước đây route đọc userCount() ngoài lock nên 2 request đồng thời đều
  // thấy count=0 và đều thành owner.
  firstIsOwner?: boolean;
  // false = tài khoản phải kích hoạt qua email trước khi đăng nhập (luồng tự đăng ký).
  // Vắng mặt/true = đã xác thực (admin tạo, setup, hoặc email nền tảng chưa bật).
  emailVerified?: boolean;
  tracking?: UserTrackingInput;
}): Promise<PublicUser> {
  const email = input.email.trim().toLowerCase();
  const salt = randomBytes(16).toString('hex');
  // Chỉ áp quyền tùy chỉnh cho vai trò không toàn quyền (editor/viewer).
  const custom =
    !isFullAccessRole(input.role) && input.permissions != null
      ? sanitizePermissions(input.permissions)
      : undefined;
  const record: UserRecord = {
    id: 'usr_' + randomBytes(8).toString('hex'),
    email,
    name: input.name.trim() || email,
    role: input.role,
    salt,
    passwordHash: await hashPassword(input.password, salt),
    active: true,
    createdAt: new Date().toISOString(),
    // Chỉ ghi cờ khi CHƯA xác thực - user đã xác thực không mang field (như user cũ).
    ...(input.emailVerified === false ? { emailVerified: false } : {}),
    ...(custom ? { permissions: custom } : {}),
  };
  // Kiểm tra trùng email + quyết định owner-đầu-tiên + ghi trong CÙNG một lock → không còn race
  // (không tạo trùng email, không sinh 2 owner khi 2 request đăng ký đồng thời lúc hệ thống rỗng).
  if (storageDriver() === 'prisma') {
    const { prisma } = await import('../prisma');
    const created = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email } });
      if (existing) throw new Error('Email da ton tai');
      const count = await tx.user.count();
      if (input.firstIsOwner && count === 0) {
        record.role = 'owner';
        delete record.permissions;
        delete record.emailVerified;
      }
      await tx.user.create({
        data: {
          id: record.id,
          email: record.email,
          name: record.name,
          role: record.role,
          passwordHash: record.passwordHash,
          salt: record.salt,
          active: record.active,
          permissions: (record.permissions as object | undefined) ?? undefined,
          emailVerified: record.emailVerified !== false,
          firstTouchUtm: input.tracking?.firstTouchUtm ?? undefined,
          lastTouchUtm: input.tracking?.lastTouchUtm ?? undefined,
          fbp: cleanText(input.tracking?.fbp),
          fbc: cleanText(input.tracking?.fbc),
          ttclid: cleanText(input.tracking?.ttclid),
          ttp: cleanText(input.tracking?.ttp),
          gclid: cleanText(input.tracking?.gclid),
          gaClientId: cleanText(input.tracking?.gaClientId),
          landingPage: cleanText(input.tracking?.landingPage, 2000),
          referrer: cleanText(input.tracking?.referrer, 2000),
          signupIp: ipToBytes(input.tracking?.ip),
          signupUserAgent: cleanText(input.tracking?.userAgent, 2000),
          lastIp: ipToBytes(input.tracking?.ip),
          lastUserAgent: cleanText(input.tracking?.userAgent, 2000),
          lastSeenAt: new Date(),
          createdAt: new Date(record.createdAt),
        },
      });
      return record;
    });
    return toPublic(created);
  }
  return mutateJson<UserRecord[], PublicUser>(FILE, [], (rows) => {
    if (rows.some((u) => u.email.toLowerCase() === email)) {
      throw new Error('Email đã tồn tại');
    }
    if (input.firstIsOwner && rows.length === 0) {
      record.role = 'owner';
      delete record.permissions; // owner toàn quyền, không dùng tùy chỉnh
      // Tài khoản ĐẦU TIÊN (bootstrap chủ nền tảng) luôn kích hoạt sẵn: lúc này SMTP nền tảng
      // chưa thể cấu hình (chưa có ai vào /admin) nên không thể bắt xác thực email.
      delete record.emailVerified;
    }
    return [[...rows, record], toPublic(record)];
  });
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<UserRecord | null> {
  const user = await findByEmail(email);
  if (!user || !user.active) return null;
  const candidate = await hashPassword(password, user.salt);
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(user.passwordHash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return user;
}

export async function updateUser(
  id: string,
  patch: {
    role?: Role;
    active?: boolean;
    password?: string;
    name?: string;
    // undefined = không đổi; null = xóa tùy chỉnh (về mặc định vai trò); mảng = đặt tùy chỉnh.
    permissions?: Permission[] | null;
  },
): Promise<void> {
  // Băm mật khẩu mới TRƯỚC khi vào lock (scrypt chậm - không giữ lock lâu).
  let newSalt: string | undefined;
  let newHash: string | undefined;
  if (patch.password) {
    newSalt = randomBytes(16).toString('hex');
    newHash = await hashPassword(patch.password, newSalt);
  }
  if (storageDriver() === 'prisma') {
    const repo = (await getRepos()).users;
    const u = await repo.getById(id);
    if (!u) return;
    if (u.role === 'owner') {
      if (patch.role && patch.role !== 'owner') throw new Error('Kh?ng th? ??i vai tr? c?a ch? s? h?u');
      if (patch.active === false) throw new Error('Kh?ng th? v? hi?u h?a ch? s? h?u');
      if (patch.password) throw new Error('Kh?ng th? ??t l?i m?t kh?u c?a ch? s? h?u t? trang qu?n l?');
    }
    const next: Partial<UserRecord> = {};
    if (patch.role) next.role = patch.role;
    if (typeof patch.active === 'boolean') next.active = patch.active;
    if (patch.name) next.name = patch.name.trim();
    if (newSalt && newHash) {
      next.salt = newSalt;
      next.passwordHash = newHash;
    }
    if (patch.permissions !== undefined) {
      if (patch.permissions === null || isFullAccessRole(next.role ?? u.role)) next.permissions = undefined;
      else next.permissions = sanitizePermissions(patch.permissions);
    }
    if (next.role && isFullAccessRole(next.role)) next.permissions = undefined;
    await repo.update(id, next);
    return;
  }
  await mutateJson<UserRecord[], void>(FILE, [], (rows) => {
    const u = rows.find((x) => x.id === id);
    if (!u) return [rows, undefined];
    if (u.role === 'owner') {
      // Bảo vệ chủ sở hữu: không cho người khác đổi vai trò, vô hiệu hóa, hay
      // đặt lại mật khẩu (tránh khóa/chiếm tài khoản owner duy nhất).
      if (patch.role && patch.role !== 'owner') {
        throw new Error('Không thể đổi vai trò của chủ sở hữu');
      }
      if (patch.active === false) {
        throw new Error('Không thể vô hiệu hóa chủ sở hữu');
      }
      if (patch.password) {
        throw new Error('Không thể đặt lại mật khẩu của chủ sở hữu từ trang quản lý');
      }
    }
    if (patch.role) u.role = patch.role;
    if (typeof patch.active === 'boolean') u.active = patch.active;
    if (patch.name) u.name = patch.name.trim();
    if (newSalt && newHash) {
      u.salt = newSalt;
      u.passwordHash = newHash;
    }
    // Quyền tùy chỉnh: null → xóa (về mặc định); mảng → chuẩn hóa & đặt.
    if (patch.permissions !== undefined) {
      if (patch.permissions === null) delete u.permissions;
      else u.permissions = sanitizePermissions(patch.permissions);
    }
    // Vai trò toàn quyền (owner/admin) không dùng tùy chỉnh → dọn cho sạch dữ liệu.
    if (isFullAccessRole(u.role)) delete u.permissions;
    return [rows, undefined];
  });
}

// Đặt lại mật khẩu cho CHÍNH CHỦ (tự đổi mật khẩu / quên mật khẩu). KHÔNG áp guard bảo vệ
// owner như updateUser (guard đó chỉ dành cho trang quản lý nhân sự) - owner vẫn phải tự đổi
// được mật khẩu của mình. Trả về thông tin công khai của user (để gửi email thông báo).
export async function setPassword(id: string, newPassword: string): Promise<PublicUser | undefined> {
  const salt = randomBytes(16).toString('hex');
  const passwordHash = await hashPassword(newPassword, salt);
  if (storageDriver() === 'prisma') {
    const repo = (await getRepos()).users;
    const u = await repo.getById(id);
    if (!u) return undefined;
    await repo.update(id, { salt, passwordHash });
    return toPublic({ ...u, salt, passwordHash });
  }
  return mutateJson<UserRecord[], PublicUser | undefined>(FILE, [], (rows) => {
    const u = rows.find((x) => x.id === id);
    if (!u) return [rows, undefined];
    u.salt = salt;
    u.passwordHash = passwordHash;
    return [rows, toPublic(u)];
  });
}

// Kích hoạt tài khoản sau khi bấm link xác thực email. Trả thông tin công khai (để tạo phiên +
// gửi email chào mừng), undefined nếu user không tồn tại.
export async function markEmailVerified(id: string): Promise<PublicUser | undefined> {
  if (storageDriver() === 'prisma') {
    const repo = (await getRepos()).users;
    const u = await repo.getById(id);
    if (!u) return undefined;
    await repo.update(id, { emailVerified: true });
    return toPublic({ ...u, emailVerified: true });
  }
  return mutateJson<UserRecord[], PublicUser | undefined>(FILE, [], (rows) => {
    const u = rows.find((x) => x.id === id);
    if (!u) return [rows, undefined];
    delete u.emailVerified; // vắng mặt = đã xác thực (đồng nhất với user cũ)
    return [rows, toPublic(u)];
  });
}

export async function deleteUser(id: string): Promise<void> {
  if (storageDriver() === 'prisma') {
    const repo = (await getRepos()).users;
    const u = await repo.getById(id);
    if (u?.role === 'owner') throw new Error('Kh?ng th? x?a ch? s? h?u');
    await repo.remove(id);
    return;
  }
  await mutateJson<UserRecord[], void>(FILE, [], (rows) => {
    const u = rows.find((x) => x.id === id);
    if (u?.role === 'owner') throw new Error('Không thể xóa chủ sở hữu');
    return [rows.filter((x) => x.id !== id), undefined];
  });
}
