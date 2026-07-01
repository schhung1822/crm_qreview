// Phân quyền (RBAC). File thuần - KHÔNG import node/fs để dùng được cả ở client (gạn nav).
export const ROLES = ['owner', 'admin', 'editor', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'view', // xem các trang nội dung/báo cáo
  'content:write', // viết / tối ưu bài bằng AI, lưu nháp
  'content:publish', // đăng / cập nhật lên CMS
  'connections:manage', // thêm/xóa kết nối CMS
  'aikeys:manage', // nhập/đổi API key AI
  'users:manage', // quản lý nhân viên
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MATRIX: Record<Role, Permission[]> = {
  owner: [...PERMISSIONS],
  admin: [...PERMISSIONS],
  editor: ['view', 'content:write', 'content:publish'],
  viewer: ['view'],
};

export function can(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX[role]?.includes(permission) ?? false;
}

// ─── Phân quyền chi tiết theo từng nhân viên ───
// owner/admin LUÔN toàn quyền (không tùy chỉnh). editor/viewer có thể được admin/owner
// gán một tập quyền tùy chỉnh - ghi đè mặc định của vai trò.
export function isFullAccessRole(role: Role): boolean {
  return role === 'owner' || role === 'admin';
}

// Các quyền được phép tùy chỉnh cho nhân viên. KHÔNG gồm 'users:manage' để tránh leo thang
// đặc quyền (chỉ admin/owner mới quản lý nhân viên). 'view' là nền tảng, luôn bật.
export const CUSTOMIZABLE_PERMISSIONS: Permission[] = [
  'view',
  'content:write',
  'content:publish',
  'connections:manage',
  'aikeys:manage',
];

// Vai trò có thể phân quyền chi tiết (owner/admin toàn quyền nên không nằm ở đây).
export const CUSTOMIZABLE_ROLES: Role[] = ['editor', 'viewer'];

// Chuẩn hóa danh sách quyền tùy chỉnh: chỉ giữ quyền hợp lệ + luôn kèm 'view'.
export function sanitizePermissions(perms: readonly Permission[]): Permission[] {
  const set = new Set<Permission>(perms.filter((p) => CUSTOMIZABLE_PERMISSIONS.includes(p)));
  set.add('view');
  // Giữ đúng thứ tự khai báo để so sánh/hiển thị ổn định.
  return CUSTOMIZABLE_PERMISSIONS.filter((p) => set.has(p));
}

// Quyền HIỆU LỰC của một user. custom == null → theo mặc định vai trò; custom là mảng
// (kể cả rỗng) → dùng tập tùy chỉnh (đã kèm 'view').
export function effectivePermissions(role: Role, custom?: readonly Permission[] | null): Permission[] {
  if (isFullAccessRole(role)) return [...PERMISSIONS];
  if (custom != null) return sanitizePermissions(custom);
  return [...MATRIX[role]];
}

// Kiểm tra quyền dựa trên tập quyền hiệu lực (thay cho can() khi đã có sẵn danh sách).
export function canWith(perms: readonly Permission[], permission: Permission): boolean {
  return perms.includes(permission);
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Chủ sở hữu',
  admin: 'Quản trị',
  editor: 'Biên tập viên',
  viewer: 'Chỉ xem',
};

// Vai trò có thể gán cho nhân viên mới (không cho tạo thêm owner).
export const ASSIGNABLE_ROLES: Role[] = ['admin', 'editor', 'viewer'];
