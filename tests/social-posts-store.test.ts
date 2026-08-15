import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NO_SOURCE_KEY } from '@/lib/data/repos/types';
import {
  addSocialPosts,
  deleteSocialPost,
  getSocialPostBatch,
  listSocialPostPage,
  listSocialPostSources,
  listSocialPostsSince,
  countSocialPosts,
  type SocialPostInput,
} from '@/lib/store/social-posts';

let dir: string;
const prevData = process.env.DATA_DIR;
const prevDriver = process.env.STORAGE_DRIVER;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'social-posts-'));
  process.env.DATA_DIR = dir;
  process.env.STORAGE_DRIVER = 'file';
});
afterEach(async () => {
  process.env.DATA_DIR = prevData;
  process.env.STORAGE_DRIVER = prevDriver;
  await fs.rm(dir, { recursive: true, force: true });
});

const post = (over: Partial<SocialPostInput> = {}): SocialPostInput => ({
  connectionId: 'conn_1',
  provider: 'facebook',
  connectionLabel: 'Fanpage',
  text: 'Noi dung',
  mediaType: 'text',
  status: 'published',
  ...over,
});

describe('kho bài đăng mạng xã hội', () => {
  it('một lần gọi = một batchId dùng chung cho mọi kênh', async () => {
    const records = await addSocialPosts([
      post({ provider: 'facebook', connectionId: 'c1' }),
      post({ provider: 'instagram', connectionId: 'c2' }),
    ]);
    expect(records[0].batchId).toBe(records[1].batchId);
    expect(records[0].id).not.toBe(records[1].id);
  });

  it('hai lần gọi khác nhau sinh hai batchId khác nhau', async () => {
    const first = await addSocialPosts([post()]);
    const second = await addSocialPosts([post()]);
    expect(first[0].batchId).not.toBe(second[0].batchId);
  });

  it('KHÔNG cắt bớt khi vượt 1000 bản ghi (trần MAX_ROWS cũ đã bỏ)', async () => {
    for (let i = 0; i < 12; i++) {
      await addSocialPosts(Array.from({ length: 100 }, () => post()));
    }
    expect(await countSocialPosts()).toBe(1200);
  });

  it('phân trang theo LẦN ĐĂNG, không xé đôi nhóm nhiều kênh', async () => {
    for (let i = 0; i < 5; i++) {
      await addSocialPosts([
        post({ provider: 'facebook', connectionId: 'c1', text: `bai ${i}` }),
        post({ provider: 'instagram', connectionId: 'c2', text: `bai ${i}` }),
        post({ provider: 'threads', connectionId: 'c3', text: `bai ${i}` }),
      ]);
    }
    const page = await listSocialPostPage({}, 2, 0);
    expect(page.totalBatches).toBe(5);
    // 2 lần đăng × 3 kênh = 6 hàng, và mỗi nhóm về đủ 3 hàng.
    expect(page.posts).toHaveLength(6);
    const byBatch = new Map<string, number>();
    for (const row of page.posts) byBatch.set(row.batchId, (byBatch.get(row.batchId) ?? 0) + 1);
    expect([...byBatch.values()]).toEqual([3, 3]);
  });

  it('trang sau không lặp lại lần đăng của trang trước', async () => {
    for (let i = 0; i < 4; i++) await addSocialPosts([post({ text: `bai ${i}` })]);
    const first = await listSocialPostPage({}, 2, 0);
    const second = await listSocialPostPage({}, 2, 2);
    const firstIds = new Set(first.posts.map((row) => row.id));
    expect(second.posts.some((row) => firstIds.has(row.id))).toBe(false);
    expect(second.totalBatches).toBe(4);
  });

  it('lọc theo nền tảng, trạng thái và từ khóa', async () => {
    await addSocialPosts([
      post({ provider: 'facebook', text: 'khuyen mai thang 8', status: 'published' }),
      post({ provider: 'instagram', text: 'noi dung khac', status: 'failed' }),
    ]);
    expect((await listSocialPostPage({ provider: 'instagram' })).posts).toHaveLength(1);
    expect((await listSocialPostPage({ status: 'failed' })).posts[0].provider).toBe('instagram');
    expect((await listSocialPostPage({ search: 'KHUYEN MAI' })).posts[0].provider).toBe('facebook');
  });

  it('lọc theo nguồn gom nhiều URL cùng domain vào một khóa', async () => {
    await addSocialPosts([post({ articleSource: 'https://vnexpress.net/bai-1' })]);
    await addSocialPosts([post({ articleSource: 'https://www.vnexpress.net/bai-2?utm=x' })]);
    await addSocialPosts([post({ articleSource: 'Báo Tuổi Trẻ' })]);
    await addSocialPosts([post()]);

    const { sources, missing } = await listSocialPostSources();
    expect(missing).toBe(1);
    expect(sources.map((row) => `${row.key}:${row.count}`)).toEqual(['báo tuổi trẻ:1', 'vnexpress.net:2']);

    expect((await listSocialPostPage({ sourceKey: 'vnexpress.net' })).totalBatches).toBe(2);
    expect((await listSocialPostPage({ sourceKey: NO_SOURCE_KEY })).totalBatches).toBe(1);
  });

  it('lấy trọn nhóm theo id của một bản ghi bất kỳ trong nhóm', async () => {
    const records = await addSocialPosts([
      post({ provider: 'facebook', connectionId: 'c1' }),
      post({ provider: 'instagram', connectionId: 'c2' }),
    ]);
    const batch = await getSocialPostBatch(records[1].id);
    expect(batch).toHaveLength(2);
    expect(new Set(batch.map((row) => row.provider))).toEqual(new Set(['facebook', 'instagram']));
  });

  it('since chỉ trả bài từ mốc thời gian trở lại đây', async () => {
    await addSocialPosts([post()]);
    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(await listSocialPostsSince(future)).toHaveLength(0);
    expect(await listSocialPostsSince(past)).toHaveLength(1);
  });

  it('xóa theo id', async () => {
    const records = await addSocialPosts([post(), post({ connectionId: 'c2' })]);
    await deleteSocialPost(records[0].id);
    expect(await countSocialPosts()).toBe(1);
  });
});
