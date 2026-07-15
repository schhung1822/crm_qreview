import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '../src/lib/auth/permissions';
import { memberPermissions } from '../src/lib/store/biz';

// Quyền là THEO BIZ: suy ra từ vai trò + tùy chỉnh của thành viên TRONG biz đang hoạt động.
describe('memberPermissions (quyền theo biz)', () => {
  it('không là thành viên → không có quyền nào', () => {
    expect(memberPermissions(undefined)).toEqual([]);
  });

  it('owner/admin → toàn quyền', () => {
    expect(memberPermissions({ userId: 'u', role: 'owner' })).toEqual([...PERMISSIONS]);
    expect(memberPermissions({ userId: 'u', role: 'admin' })).toEqual([...PERMISSIONS]);
  });

  it('viewer mặc định → chỉ "view"', () => {
    expect(memberPermissions({ userId: 'u', role: 'viewer' })).toEqual(['view']);
  });

  it('editor có quyền tùy chỉnh → dùng tập tùy chỉnh (luôn kèm "view")', () => {
    const perms = memberPermissions({
      userId: 'u',
      role: 'editor',
      permissions: ['content:write'],
    });
    expect(perms).toContain('view');
    expect(perms).toContain('content:write');
    expect(perms).not.toContain('content:publish');
  });
});
