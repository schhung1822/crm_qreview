// Resolve key mã hóa 32 bytes.
// 1) ENCRYPTION_KEY (base64, 32 bytes) nếu có - khuyến nghị cho production.
// 2) Nếu chưa có: tự sinh & lưu .data/.localkey (gitignored) để chạy ngay khi dev.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { env } from '../env';

let cached: Buffer | null = null;

export function resolveEncryptionKey(): Buffer {
  if (cached) return cached;

  if (env.encryptionKey) {
    const k = Buffer.from(env.encryptionKey, 'base64');
    if (k.length === 32) {
      cached = k;
      return k;
    }
  }

  const dir = path.join(process.cwd(), '.data');
  const file = path.join(dir, '.localkey');
  if (existsSync(file)) {
    const k = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64');
    if (k.length === 32) {
      cached = k;
      return k;
    }
  }

  mkdirSync(dir, { recursive: true });
  const key = randomBytes(32);
  writeFileSync(file, key.toString('base64'), { mode: 0o600 });
  cached = key;
  return key;
}
