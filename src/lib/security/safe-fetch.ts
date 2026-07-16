// fetch có chắn SSRF cho MỌI request ra ngoài do người dùng kiểm soát (CMS, tải ảnh…).
// - GHIM IP chống DNS-rebinding (TOCTOU): mọi kết nối đi qua undici Agent với custom
//   `lookup` — chính hàm này cấp địa chỉ cho socket connect, và nó LỌC từng address qua
//   isBlockedIp trước khi trả về. IP dùng để kết nối luôn là IP đã kiểm, không có lần
//   resolve thứ hai để attacker tráo câu trả lời DNS. TLS/SNI + kiểm cert vẫn theo
//   hostname của URL (chỉ thay tầng lookup, không đổi URL) nên HTTPS không vỡ.
// - assertResolvesPublic giữ lại làm lớp kiểm SỚM (fail nhanh, thông báo đẹp) — chốt
//   chặn thật sự là pinnedLookup bên dưới.
// - redirect: 'manual' + tự đi theo redirect, re-validate mỗi hop, và XÓA header
//   credential khi chuyển sang host khác / hạ cấp http (chống rò App Password/token).
// - Có timeout và giới hạn kích thước body.
import { lookup } from 'node:dns/promises';
import { lookup as dnsLookup } from 'node:dns';
import { isIP, type LookupFunction } from 'node:net';
import {
  fetch as undiciFetch,
  Agent,
  FormData as UndiciFormData,
  type RequestInit as UndiciRequestInit,
  type Response as UndiciResponse,
} from 'undici';
import { assertPublicHost, isBlockedIp } from './ssrf';

const MAX_REDIRECTS = 4;
const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024; // 20MB

// User-Agent giống trình duyệt: nhiều WAF/CDN (Cloudflare) và plugin bảo mật WordPress (Wordfence...)
// CHẶN/THÁCH THỨC request từ server nếu UA là "node" mặc định → treo tới timeout. Đặt UA trình duyệt
// để request từ máy chủ được đối xử như truy cập bình thường (trình duyệt người dùng vẫn vào được).
const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Header nhạy cảm (credential) - phải xóa khi redirect không an toàn.
const CRED_HEADERS = ['authorization', 'cookie', 'x-shopify-access-token', 'wix-account-id'];

const BLOCKED_MSG = 'Tên miền trỏ tới IP nội bộ - chặn vì lý do bảo mật';

// Lỗi đánh dấu "IP bị chặn" từ pinnedLookup — undici bọc lỗi connect trong
// TypeError('fetch failed') nên cần class riêng để nhận ra khi bóc cause.
class BlockedIpError extends Error {}

// Lookup GHIM IP: undici Agent gọi hàm này thay dns.lookup mặc định khi mở socket.
// Vì địa chỉ trả về ở đây chính là địa chỉ net/tls.connect dùng để kết nối, việc kiểm
// isBlockedIp ngay tại đây đóng khe TOCTOU: không tồn tại lần resolve nào khác sau kiểm tra.
// Chặn CẢ danh sách nếu có bất kỳ address nội bộ (chống trò trộn A-record public + nội bộ,
// đồng bộ với assertResolvesPublic). Xử lý cả hai dạng callback của dns.lookup:
// options.all=true → (err, [{address,family}…]); ngược lại → (err, address, family).
const pinnedLookup: LookupFunction = (hostname, options, callback) => {
  // Luôn resolve all:true để kiểm ĐỦ mọi địa chỉ ứng viên, rồi trả theo dạng caller cần.
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const list = Array.isArray(addresses)
      ? addresses
      : [{ address: String(addresses), family: isIP(String(addresses)) || 4 }];
    if (!list.length) {
      return callback(
        Object.assign(new Error(`ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' }),
        [],
      );
    }
    for (const a of list) {
      if (isBlockedIp(a.address)) return callback(new BlockedIpError(BLOCKED_MSG), []);
    }
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

// Agent dùng CHUNG toàn module (keep-alive, tái dùng socket giữa các request cùng origin).
// Socket tái dùng vẫn an toàn: nó được mở bằng IP đã qua pinnedLookup; kết nối MỚI nào
// cũng đi qua pinnedLookup lại. headersTimeout/bodyTimeout là trần cứng để server độc hại
// không giữ socket vô hạn (AbortSignal.timeout mỗi request vẫn là giới hạn chính; để 60s
// vì PageSpeed API có thể mất tới ~60s mới trả header).
const pinnedAgent = new Agent({
  connect: { lookup: pinnedLookup, timeout: 10_000 },
  headersTimeout: 60_000,
  bodyTimeout: 60_000,
  // Tắt HTTP/2 để giữ parity với fetch global (bản cũ) — nhiều WAF/CDN/CMS hành xử khác khi bị
  // ép h2; giữ h1 cho ổn định, không đổi hành vi mạng khi chuyển sang undici.
  allowH2: false,
});

// Bóc chuỗi e.cause (undici bọc lỗi connect/timeout vài lớp) tìm lỗi khớp điều kiện.
function findInCauseChain(e: unknown, pred: (x: unknown) => boolean): Error | undefined {
  let cur: unknown = e;
  for (let i = 0; i < 6 && cur; i++) {
    if (pred(cur)) return cur as Error;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

function isTimeoutLike(e: unknown): boolean {
  return !!findInCauseChain(e, (x) => {
    const err = x as { name?: string; code?: string };
    return (
      err?.name === 'TimeoutError' ||
      err?.name === 'AbortError' ||
      err?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
      err?.code === 'UND_ERR_HEADERS_TIMEOUT' ||
      err?.code === 'UND_ERR_BODY_TIMEOUT'
    );
  });
}

// Kiểu init giữ theo lib.dom (Headers/body/signal chuẩn DOM) để caller hiện tại compile như cũ;
// khi gọi undici fetch mới cast sang RequestInit của undici. Headers/Blob global tương thích runtime;
// riêng FormData global được chuyển sang FormData undici ngay trước khi gọi (xem safeFetch).
export interface SafeFetchInit extends RequestInit {
  timeoutMs?: number;
}

// Lớp kiểm SỚM: resolve + chặn IP nội bộ để fail nhanh với thông báo rõ ràng trước khi
// mở kết nối. KHÔNG phải chốt chặn (DNS có thể đổi ngay sau đó) — chốt chặn là pinnedLookup.
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
      throw new Error(BLOCKED_MSG);
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

  // Chuẩn hóa headers + thêm User-Agent trình duyệt nếu caller chưa đặt (tránh bị WAF chặn).
  const hdrs = new Headers(headers as HeadersInit | undefined);
  if (!hdrs.has('user-agent')) hdrs.set('user-agent', DEFAULT_UA);

  // FormData GLOBAL của Node là instance khác với FormData của package undici. undici 6 nhận
  // diện qua duck-typing (chạy được), nhưng bản mới brand-check chặt → gửi sai thành chuỗi
  // "[object FormData]" (mất multipart, hỏng upload ảnh Shopify). Chủ động sao chép sang FormData
  // của undici để đúng với MỌI phiên bản Node/undici. Blob/File global vẫn được undici chấp nhận;
  // giữ nguyên tên file khi entry là Blob/File.
  let body = rest.body;
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const uf = new UndiciFormData();
    for (const [k, v] of body as unknown as Iterable<[string, unknown]>) {
      if (typeof v === 'object' && v !== null && 'arrayBuffer' in v) {
        uf.append(k, v as Blob, (v as { name?: string }).name);
      } else {
        uf.append(k, v as string);
      }
    }
    body = uf as unknown as typeof rest.body;
  }

  let res: UndiciResponse;
  try {
    // Dùng fetch của undici với dispatcher ghim IP (fetch global không cho thay tầng lookup).
    res = await undiciFetch(url, {
      ...rest,
      body,
      headers: hdrs,
      redirect: 'manual',
      signal: signal ?? AbortSignal.timeout(timeoutMs),
      dispatcher: pinnedAgent,
    } as unknown as UndiciRequestInit);
  } catch (e) {
    // Lỗi chặn IP từ pinnedLookup bị undici bọc trong TypeError('fetch failed') → bóc ra
    // để caller nhận đúng thông báo tiếng Việt thay vì lỗi kỹ thuật.
    const blocked = findInCauseChain(e, (x) => x instanceof BlockedIpError);
    if (blocked) throw new Error(blocked.message);
    // Timeout (AbortSignal.timeout / connect / headers / body) → thông báo rõ thay vì lỗi khó hiểu.
    if (isTimeoutLike(e)) {
      throw new Error(
        'Website phản hồi quá chậm hoặc chặn kết nối từ máy chủ (timeout). Thường do tường lửa/CDN ' +
          '(Cloudflare) hoặc plugin bảo mật chặn truy cập tự động - hãy cho phép IP máy chủ hoặc tắt ' +
          'chế độ chặn bot cho REST API.',
      );
    }
    throw e;
  }

  // Tự xử lý redirect để re-validate + bảo vệ credential.
  if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
    if (_redirect >= MAX_REDIRECTS) throw new Error('Quá nhiều lần chuyển hướng');
    const loc = new URL(res.headers.get('location')!, url);
    const nextHeaders = new Headers(hdrs);
    if (!keepCredentials(url, loc)) {
      for (const h of CRED_HEADERS) nextHeaders.delete(h);
    }
    // Cancel body của response redirect để khỏi rò tài nguyên.
    await res.body?.cancel().catch(() => {});
    return safeFetch(loc.toString(), { ...init, headers: nextHeaders }, _redirect + 1);
  }

  // Response của undici spec-compliant (headers.get, json, body.getReader/cancel…) —
  // trả về dưới kiểu Response của lib.dom để caller hiện tại dùng như cũ.
  return res as unknown as Response;
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
