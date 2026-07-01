import { describe, expect, it } from 'vitest';
import {
  canWith,
  effectivePermissions,
  isFullAccessRole,
  PERMISSIONS,
  sanitizePermissions,
} from '@/lib/auth/permissions';

describe('effectivePermissions', () => {
  it('owner/admin luôn TOÀN QUYỀN, bỏ qua custom', () => {
    expect(effectivePermissions('owner', null)).toEqual([...PERMISSIONS]);
    expect(effectivePermissions('admin', null)).toEqual([...PERMISSIONS]);
    // custom rỗng cũng không hạ quyền owner/admin
    expect(effectivePermissions('admin', [])).toEqual([...PERMISSIONS]);
  });

  it('editor/viewer dùng mặc định vai trò khi custom == null', () => {
    expect(effectivePermissions('editor', null)).toEqual(['view', 'content:write', 'content:publish']);
    expect(effectivePermissions('viewer', null)).toEqual(['view']);
  });

  it('custom (kể cả rỗng) ghi đè mặc định — luôn kèm view', () => {
    // Mảng rỗng → chỉ còn 'view' (nền tảng bắt buộc)
    expect(effectivePermissions('editor', [])).toEqual(['view']);
    // Chọn publish nhưng bỏ write → có view + publish, KHÔNG có write
    const eff = effectivePermissions('viewer', ['content:publish']);
    expect(eff).toContain('view');
    expect(eff).toContain('content:publish');
    expect(eff).not.toContain('content:write');
  });
});

describe('sanitizePermissions', () => {
  it('loại bỏ users:manage (chống leo thang) và quyền không hợp lệ, luôn thêm view', () => {
    const s = sanitizePermissions(['users:manage', 'content:write', 'bogus' as never]);
    expect(s).toContain('view');
    expect(s).toContain('content:write');
    expect(s).not.toContain('users:manage');
    expect(s).not.toContain('bogus');
  });
});

describe('canWith & isFullAccessRole', () => {
  it('canWith kiểm tra theo tập quyền hiệu lực', () => {
    const eff = effectivePermissions('editor', null);
    expect(canWith(eff, 'content:write')).toBe(true);
    expect(canWith(eff, 'users:manage')).toBe(false);
  });
  it('chỉ owner/admin là vai trò toàn quyền', () => {
    expect(isFullAccessRole('owner')).toBe(true);
    expect(isFullAccessRole('admin')).toBe(true);
    expect(isFullAccessRole('editor')).toBe(false);
    expect(isFullAccessRole('viewer')).toBe(false);
  });
});
