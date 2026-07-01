import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fileRepositories as repo } from '@/lib/data/repos';
import type { ArticleRecord } from '@/lib/store/articles';

let dir: string;
const prev = process.env.DATA_DIR;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'repos-'));
  process.env.DATA_DIR = dir;
});
afterEach(async () => {
  process.env.DATA_DIR = prev;
  await fs.rm(dir, { recursive: true, force: true });
});

const art = (id: string, over: Partial<ArticleRecord> = {}): ArticleRecord => ({
  id,
  title: 't',
  slug: 's',
  metaDescription: '',
  markdown: 'm',
  locale: 'vi',
  source: 'new',
  seoScore: 0,
  aeoScore: 0,
  geoScore: 0,
  status: 'draft',
  updatedAt: new Date().toISOString(),
  ...over,
});

describe('fileRepositories — articles', () => {
  it('insert / get / list / update (whitelist) / remove', async () => {
    await repo.articles.insert(art('art_1', { title: 'A' }));
    await repo.articles.insert(art('art_2', { title: 'B' }));
    expect((await repo.articles.all()).length).toBe(2);
    expect((await repo.articles.get('art_1'))?.title).toBe('A');

    // update chỉ nhận field whitelist — id giả mạo bị bỏ qua
    const updated = await repo.articles.update('art_1', {
      title: 'A2',
      status: 'published',
      id: 'HACKED',
    } as Partial<ArticleRecord>);
    expect(updated?.title).toBe('A2');
    expect(updated?.status).toBe('published');
    expect(updated?.id).toBe('art_1'); // id không bị ghi đè

    await repo.articles.remove('art_1');
    expect(await repo.articles.get('art_1')).toBeNull();
    expect((await repo.articles.all()).length).toBe(1);
  });
});

describe('fileRepositories — users & sessions', () => {
  it('không cho insert trùng email', async () => {
    const u = {
      id: 'u1', email: 'a@b.c', name: 'A', role: 'viewer' as const,
      passwordHash: 'h', salt: 's', active: true, createdAt: new Date().toISOString(),
    };
    await repo.users.insert(u);
    await expect(repo.users.insert({ ...u, id: 'u2' })).rejects.toThrow('Email đã tồn tại');
    expect(await repo.users.count()).toBe(1);
    expect((await repo.users.getByEmail('A@B.C'))?.id).toBe('u1');
  });

  it('session: insert, tra cứu, hủy theo user', async () => {
    await repo.sessions.insert({ token: 'tok', userId: 'u1', expiresAt: Date.now() + 60_000 });
    expect(await repo.sessions.userIdFor('tok')).toBe('u1');
    await repo.sessions.removeByUser('u1');
    expect(await repo.sessions.userIdFor('tok')).toBeNull();
  });

  it('session hết hạn không tra cứu được', async () => {
    await repo.sessions.insert({ token: 'old', userId: 'u1', expiresAt: Date.now() - 1 });
    expect(await repo.sessions.userIdFor('old')).toBeNull();
  });
});

describe('fileRepositories — config', () => {
  it('get trả fallback rồi set/get', async () => {
    expect(await repo.config.get('image-config', { size: 'd' })).toEqual({ size: 'd' });
    await repo.config.set('image-config', { size: '1536x1024' });
    expect(await repo.config.get('image-config', { size: 'd' })).toEqual({ size: '1536x1024' });
  });
});
