import { describe, expect, it, vi } from 'vitest';

// Giả lập next/headers để cookies().get('sg_biz') trả về 1 bizId → kiểm bizFile trỏ đúng thư mục biz.
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (k: string) => (k === 'sg_biz' ? { value: 'biz_mock123' } : undefined),
  }),
}));

import { bizFile, globalFile } from '../src/lib/data/biz-path';

describe('bizFile reads active biz from sg_biz cookie', () => {
  it('resolves to per-biz dir from cookie when no ALS context', () => {
    // Không có ngữ cảnh ALS (giống store gọi trong route handler) → phải lấy từ cookie sg_biz.
    expect(bizFile('connections.json')).toMatch(/[\\/]biz[\\/]biz_mock123[\\/]connections\.json$/);
    expect(bizFile('articles.json')).toMatch(/[\\/]biz[\\/]biz_mock123[\\/]articles\.json$/);
  });

  it('globalFile stays at .data root (không theo biz)', () => {
    expect(globalFile('users.json')).toMatch(/[\\/]\.data[\\/]users\.json$/);
    expect(globalFile('users.json')).not.toMatch(/biz/);
  });
});
