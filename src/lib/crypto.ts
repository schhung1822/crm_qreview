// Mã hóa bằng AES-256-GCM. Dùng cho credential CMS và API key AI.
// Key 32 bytes: ưu tiên ENCRYPTION_KEY (base64); nếu chưa có, dùng key cục bộ
// tự sinh ở .data/.localkey (xem ./secrets/key). Sinh key: openssl rand -base64 32
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Mã hóa với một key cụ thể (Buffer 32 bytes). Trả "iv.tag.ciphertext" (base64).
export function encryptWith(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

export function decryptWith(key: Buffer, payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

// API tiện dụng dùng key đã resolve sẵn (env hoặc cục bộ).
import { resolveEncryptionKey } from './secrets/key';

export const encrypt = (plaintext: string): string =>
  encryptWith(resolveEncryptionKey(), plaintext);

export const decrypt = (payload: string): string =>
  decryptWith(resolveEncryptionKey(), payload);
