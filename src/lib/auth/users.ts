// Kho người dùng - lưu file .data/users.json. Mật khẩu băm scrypt + salt ngẫu nhiên.
// Server-only. KHÔNG bao giờ trả passwordHash/salt ra client.
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import path from 'node:path';
import { mutateJson, readJson } from '../data/json-store';
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
}

export type PublicUser = Pick<
  UserRecord,
  'id' | 'email' | 'name' | 'role' | 'active' | 'createdAt' | 'emailVerified' | 'permissions'
>;

// Vắng mặt = đã xác thực (tương thích ngược với user tạo trước tính năng xác thực email).
export function isEmailVerified(u: Pick<UserRecord, 'emailVerified'>): boolean {
  return u.emailVerified !== false;
}

const FILE = path.join(process.cwd(), '.data', 'users.json');

async function hashPassword(password: string, salt: string): Promise<string> {
  return (await scrypt(password, salt, 64)).toString('hex');
}

export function toPublic(u: UserRecord): PublicUser {
  const { passwordHash: _p, salt: _s, ...rest } = u;
  void _p;
  void _s;
  return rest;
}

async function readAll(): Promise<UserRecord[]> {
  return readJson<UserRecord[]>(FILE, []);
}

export async function userCount(): Promise<number> {
  return (await readAll()).length;
}

export async function listUsers(): Promise<PublicUser[]> {
  return (await readAll()).map(toPublic);
}

export async function findById(id: string): Promise<UserRecord | undefined> {
  return (await readAll()).find((u) => u.id === id);
}

export async function findByEmail(email: string): Promise<UserRecord | undefined> {
  const e = email.trim().toLowerCase();
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
  return mutateJson<UserRecord[], PublicUser | undefined>(FILE, [], (rows) => {
    const u = rows.find((x) => x.id === id);
    if (!u) return [rows, undefined];
    delete u.emailVerified; // vắng mặt = đã xác thực (đồng nhất với user cũ)
    return [rows, toPublic(u)];
  });
}

export async function deleteUser(id: string): Promise<void> {
  await mutateJson<UserRecord[], void>(FILE, [], (rows) => {
    const u = rows.find((x) => x.id === id);
    if (u?.role === 'owner') throw new Error('Không thể xóa chủ sở hữu');
    return [rows.filter((x) => x.id !== id), undefined];
  });
}
