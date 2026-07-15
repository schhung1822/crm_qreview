// Kho lưu kết nối Google Drive - refresh token mã hóa AES-GCM, file .data/drive.json (gitignored).
// Server-only. KHÔNG bao giờ trả token ra client.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { decryptWith, encryptWith } from '../crypto';
import { bizFile } from '../data/biz-path';
import { env } from '../env';
import { resolveEncryptionKey } from '../secrets/key';

interface DriveData {
  refreshToken?: string; // đã mã hóa
  email?: string;
  folderId?: string;
  connectedAt?: string;
  clientId?: string; // OAuth client id do người dùng nhập (không nhạy cảm)
  clientSecret?: string; // OAuth client secret - đã mã hóa
}

const NAME = 'drive.json'; // CÔ LẬP THEO BIZ

async function read(): Promise<DriveData> {
  try {
    return JSON.parse(await fs.readFile(bizFile(NAME), 'utf8')) as DriveData;
  } catch {
    return {};
  }
}

async function write(d: DriveData): Promise<void> {
  const file = bizFile(NAME);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(d, null, 2), { mode: 0o600 });
}

function safeDecrypt(payload: string): string | undefined {
  try {
    return decryptWith(resolveEncryptionKey(), payload);
  } catch {
    return undefined;
  }
}

// OAuth credential: ưu tiên do người dùng nhập (lưu mã hóa), fallback env server.
export async function getDriveCreds(): Promise<{
  clientId?: string;
  clientSecret?: string;
  source: 'store' | 'env' | 'none';
}> {
  const d = await read();
  if (d.clientId && d.clientSecret) {
    return { clientId: d.clientId, clientSecret: safeDecrypt(d.clientSecret), source: 'store' };
  }
  if (env.googleClientId && env.googleClientSecret) {
    return { clientId: env.googleClientId, clientSecret: env.googleClientSecret, source: 'env' };
  }
  return { source: 'none' };
}

export async function setDriveCreds(clientId: string, clientSecret: string): Promise<void> {
  const d = await read();
  d.clientId = clientId.trim();
  d.clientSecret = encryptWith(resolveEncryptionKey(), clientSecret.trim());
  await write(d);
}

// Xóa credential người dùng nhập (đồng thời ngắt kết nối để không kẹt token cũ).
export async function clearDriveCreds(): Promise<void> {
  await write({});
}

// Trạng thái công khai (an toàn để trả ra client).
export async function getDriveState(): Promise<{
  connected: boolean;
  email?: string;
  configured: boolean;
  credSource: 'store' | 'env' | 'none';
}> {
  const d = await read();
  const creds = await getDriveCreds();
  return {
    connected: Boolean(d.refreshToken),
    email: d.email,
    configured: creds.source !== 'none',
    credSource: creds.source,
  };
}

export async function getRefreshToken(): Promise<string | undefined> {
  const d = await read();
  return d.refreshToken ? safeDecrypt(d.refreshToken) : undefined;
}

export async function saveDriveConnection(refreshToken: string, email?: string): Promise<void> {
  const d = await read();
  d.refreshToken = encryptWith(resolveEncryptionKey(), refreshToken);
  if (email) d.email = email;
  d.connectedAt = new Date().toISOString();
  await write(d);
}

export async function getFolderId(): Promise<string | undefined> {
  return (await read()).folderId;
}

export async function setFolderId(id: string): Promise<void> {
  const d = await read();
  d.folderId = id;
  await write(d);
}

// Ngắt kết nối: xóa token/email/folder nhưng GIỮ credential (để kết nối lại không phải nhập lại).
export async function disconnectDrive(): Promise<void> {
  const d = await read();
  delete d.refreshToken;
  delete d.email;
  delete d.folderId;
  delete d.connectedAt;
  await write(d);
}
