// Kiểm quy đổi path .data → (scope, name) cho JsonBlob (storage Postgres blob-backend).
// scope quyết định tenant → phải đúng tuyệt đối, kể cả separator Windows.
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { blobKeyForPath } from '../src/lib/data/json-store';

describe('blobKeyForPath', () => {
  const base = path.join('/app', '.data');
  const bizBase = path.join('C:', 'app', '.data'); // mô phỏng Windows base

  it('file gốc → scope _global', () => {
    expect(blobKeyForPath(path.join(base, 'users.json'), base)).toEqual({
      scope: '_global',
      name: 'users.json',
    });
    expect(blobKeyForPath(path.join(base, 'bizes.json'), base)).toEqual({
      scope: '_global',
      name: 'bizes.json',
    });
  });

  it('file thuộc biz → scope = bizId', () => {
    expect(blobKeyForPath(path.join(base, 'biz', 'biz_abc123', 'articles.json'), base)).toEqual({
      scope: 'biz_abc123',
      name: 'articles.json',
    });
  });

  it('hoạt động với separator Windows (backslash)', () => {
    const file = `${bizBase}\\biz\\biz_win99\\connections.json`;
    expect(blobKeyForPath(file, bizBase)).toEqual({
      scope: 'biz_win99',
      name: 'connections.json',
    });
  });

  it('path ngoài base → _global theo basename (không vỡ)', () => {
    expect(blobKeyForPath('/somewhere/else/foo.json', base)).toEqual({
      scope: '_global',
      name: 'foo.json',
    });
  });

  it('KHÔNG nhầm 2 biz khác nhau (cô lập)', () => {
    const a = blobKeyForPath(path.join(base, 'biz', 'biz_a', 'articles.json'), base);
    const b = blobKeyForPath(path.join(base, 'biz', 'biz_b', 'articles.json'), base);
    expect(a.scope).not.toBe(b.scope);
    expect(a.name).toBe(b.name); // cùng tên file, khác scope → 2 hàng JsonBlob riêng
  });
});
