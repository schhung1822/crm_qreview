// Kho lưu credential DataForSEO (Basic auth: login + password) - file .data/dataforseo.json (gitignored).
// login lưu thô (không nhạy cảm - thường là email), password mã hóa AES-GCM. Server-only.
// Ưu tiên credential người dùng nhập ở UI; fallback biến môi trường DATAFORSEO_LOGIN/PASSWORD.
import { decryptWith, encryptWith } from '../crypto';
import { readBizConfig, writeBizConfig } from '../data/config-store';
import { env } from '../env';
import { resolveEncryptionKey } from '../secrets/key';

interface DataForSeoData {
  login?: string; // email đăng nhập (không nhạy cảm)
  password?: string; // đã mã hóa
  connectedAt?: string;
}

const NAME = 'dataforseo.json'; // CÔ LẬP THEO BIZ

async function read(): Promise<DataForSeoData> {
  return readBizConfig<DataForSeoData>(NAME, {});
}

async function write(d: DataForSeoData): Promise<void> {
  await writeBizConfig(NAME, d);
}

function safeDecrypt(payload: string): string | undefined {
  try {
    return decryptWith(resolveEncryptionKey(), payload);
  } catch {
    return undefined;
  }
}

export interface DataForSeoCreds {
  login?: string;
  password?: string;
  source: 'store' | 'env' | 'none';
}

// Credential dùng được: ưu tiên do người dùng nhập (giải mã) → env → none.
export async function getDataForSeoCreds(): Promise<DataForSeoCreds> {
  const d = await read();
  if (d.login && d.password) {
    const password = safeDecrypt(d.password);
    if (password) return { login: d.login, password, source: 'store' };
  }
  if (env.dataForSeoLogin && env.dataForSeoPassword) {
    return { login: env.dataForSeoLogin, password: env.dataForSeoPassword, source: 'env' };
  }
  return { source: 'none' };
}

export async function setDataForSeoCreds(login: string, password: string): Promise<void> {
  const d = await read();
  d.login = login.trim();
  d.password = encryptWith(resolveEncryptionKey(), password.trim());
  d.connectedAt = new Date().toISOString();
  await write(d);
}

export async function clearDataForSeoCreds(): Promise<void> {
  await write({});
}

// Đã cấu hình được DataForSEO (store hoặc env)?
export async function dataForSeoReady(): Promise<boolean> {
  return (await getDataForSeoCreds()).source !== 'none';
}

// Trạng thái công khai (an toàn để trả ra client - KHÔNG lộ password).
export async function getDataForSeoState(): Promise<{
  configured: boolean;
  credSource: 'store' | 'env' | 'none';
  login?: string;
}> {
  const creds = await getDataForSeoCreds();
  return {
    configured: creds.source !== 'none',
    credSource: creds.source,
    login: creds.login,
  };
}
