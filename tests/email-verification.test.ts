import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consumeVerifyToken, createVerifyToken } from '@/lib/auth/email-verification';

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'emailverify-'));
  file = path.join(dir, 'email-verifications.json');
});
afterEach(async () => {
  vi.useRealTimers();
  await fs.rm(dir, { recursive: true, force: true });
});

describe('email-verification token', () => {
  it('token hợp lệ đổi được ra userId, và chỉ dùng được MỘT lần', async () => {
    const token = await createVerifyToken('usr_1', file);
    expect(token).toMatch(/^[0-9a-f]{64}$/); // 256-bit hex
    expect(await consumeVerifyToken(token, file)).toBe('usr_1');
    // Một-lần: dùng lại phải fail.
    expect(await consumeVerifyToken(token, file)).toBeNull();
  });

  it('token sai / rỗng → null', async () => {
    await createVerifyToken('usr_1', file);
    expect(await consumeVerifyToken('deadbeef', file)).toBeNull();
    expect(await consumeVerifyToken(undefined, file)).toBeNull();
  });

  it('KHÔNG lưu token thô trong file (chỉ lưu sha256 hash)', async () => {
    const token = await createVerifyToken('usr_1', file);
    const raw = await fs.readFile(file, 'utf8');
    expect(raw).not.toContain(token);
  });

  it('tạo token mới vô hiệu token cũ của CÙNG user (gửi lại email)', async () => {
    const first = await createVerifyToken('usr_1', file);
    const second = await createVerifyToken('usr_1', file);
    expect(await consumeVerifyToken(first, file)).toBeNull(); // link cũ hết hiệu lực
    expect(await consumeVerifyToken(second, file)).toBe('usr_1');
  });

  it('token của user khác không bị ảnh hưởng khi gửi lại', async () => {
    const a = await createVerifyToken('usr_a', file);
    await createVerifyToken('usr_b', file);
    expect(await consumeVerifyToken(a, file)).toBe('usr_a');
  });

  it('token hết hạn sau 24 giờ → null', async () => {
    vi.useFakeTimers();
    const token = await createVerifyToken('usr_1', file);
    vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000 + 1000); // +24h1s
    expect(await consumeVerifyToken(token, file)).toBeNull();
  });
});
