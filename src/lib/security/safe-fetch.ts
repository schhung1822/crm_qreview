// fetch có chắn SSRF cho MỌI request ra ngoài do người dùng kiểm soát (CMS, tải ảnh…).
// - Resolve DNS rồi kiểm IP nội bộ NGAY trước khi gọi (chống hostname trỏ IP nội bộ).
// - redirect: 'manual' + tự đi theo redirect, re-validate mỗi hop, và XÓA header
//   credential khi chuyển sang host khác / hạ cấp http (chống rò App Password/token).
// - Có timeout và giới hạn kích thước body.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { assertPublicHost, isBlockedIp } from './ssrf';

const MAX_REDIRECTS = 4;
const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024; // 20MB

// Header nhạy cảm (credential) - phải xóa khi redirect không an toàn.
const CRED_HEADERS = ['authorization', 'cookie', 'x-shopify-access-token', 'wix-account-id'];

export interface SafeFetchInit extends RequestInit {
  timeoutMs?: number;
}

async function assertResolvesPublic(hostname: string): Promise<void> {
  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) throw new Error('IP nội bộ bị chặn vì lý do bảo mật');
    return;
  }
  let addrs: Array<{ address: string }>;
  try {
    addrs = await lookup(hostname, { all: true });
  } catch {
    throw new Error('Không phân giải được tên miền của site');
  }
  if (!addrs.length) throw new Error('Không phân giải được tên miền của site');
  for (const a of addrs) {
    if (isBlockedIp(a.address)) {
      throw new Error('Tên miền trỏ tới IP nội bộ - chặn vì lý do bảo mật');
    }
  }
}

// Giữ credential chỉ khi cùng host VÀ đích là https (không bao giờ gửi creds qua http).
function keepCredentials(from: URL, to: URL): boolean {
  return to.hostname === from.hostname && to.protocol === 'https:';
}

export async function safeFetch(
  rawUrl: string,
  init: SafeFetchInit = {},
  _redirect = 0,
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers, redirect: _ignored, signal, ...rest } = init;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('URL không hợp lệ');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Chỉ hỗ trợ http/https');
  }
  assertPublicHost(url);
  await assertResolvesPublic(url.hostname);

  const res = await fetch(url, {
    ...rest,
    headers,
    redirect: 'manual',
    signal: signal ?? AbortSignal.timeout(timeoutMs),
  });

  // Tự xử lý redirect để re-validate + bảo vệ credential.
  if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
    if (_redirect >= MAX_REDIRECTS) throw new Error('Quá nhiều lần chuyển hướng');
    const loc = new URL(res.headers.get('location')!, url);
    const nextHeaders = new Headers(headers as HeadersInit | undefined);
    if (!keepCredentials(url, loc)) {
      for (const h of CRED_HEADERS) nextHeaders.delete(h);
    }
    // Cancel body của response redirect để khỏi rò tài nguyên.
    await res.body?.cancel().catch(() => {});
    return safeFetch(loc.toString(), { ...init, headers: nextHeaders }, _redirect + 1);
  }

  return res;
}

// Đọc body nhị phân có GIỚI HẠN kích thước (chống cạn RAM khi tải ảnh từ host lạ).
export async function safeFetchBuffer(
  rawUrl: string,
  init: SafeFetchInit = {},
  maxBytes = DEFAULT_MAX_BYTES,
): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await safeFetch(rawUrl, init);
  if (!res.ok) throw new Error(`Tải nội dung lỗi (${res.status})`);
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared && declared > maxBytes) throw new Error('Nội dung tải về quá lớn');

  const reader = res.body?.getReader();
  if (!reader) throw new Error('Phản hồi rỗng');
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error('Nội dung tải về quá lớn');
      }
      chunks.push(value);
    }
  }
  return {
    buffer: Buffer.concat(chunks),
    contentType: res.headers.get('content-type') || 'application/octet-stream',
  };
}
