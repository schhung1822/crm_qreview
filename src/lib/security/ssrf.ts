// Chặn SSRF: không cho server fetch tới host nội bộ/loopback/metadata.
// Gồm: kiểm tra ở mức chuỗi (assertPublicUrl) + phân loại IP mạnh (isBlockedIp) dùng
// sau khi resolve DNS trong safe-fetch.ts (chống cả hostname trỏ ra IP nội bộ + rebinding).
import { isIP } from 'node:net';

function v4Blocked(ip: string): boolean {
  const o = ip.split('.').map(Number);
  if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = o;
  return (
    a === 0 || // 0.0.0.0/8 "this host"
    a === 127 || // loopback
    a === 10 || // private
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 169 && b === 254) || // link-local + cloud metadata 169.254.169.254
    (a === 192 && b === 0) || // 192.0.0/24, 192.0.2/24 test
    (a === 198 && (b === 18 || b === 19)) || // benchmark 198.18/15
    a >= 224 // multicast 224/4 + reserved 240/4 + 255.255.255.255
  );
}

function v6Blocked(ip: string): boolean {
  const h = ip.toLowerCase().replace(/^\[|\]$/g, '');
  // IPv4-mapped / -compatible (::ffff:127.0.0.1, ::ffff:7f00:1, ::127.0.0.1) → kiểm phần v4.
  const dotted = h.match(/(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (dotted) return v4Blocked(dotted[1]);
  const hexMapped = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const a = parseInt(hexMapped[1], 16);
    const b = parseInt(hexMapped[2], 16);
    return v4Blocked(`${(a >> 8) & 255}.${a & 255}.${(b >> 8) & 255}.${b & 255}`);
  }
  // NAT64 (64:ff9b::/96 well-known + 64:ff9b:1::/48 local) nhúng IPv4 ở 32 bit cuối. Nếu KHÔNG
  // bóc ra kiểm, attacker trỏ bản ghi AAAA tới 64:ff9b::a9fe:a9fe (=169.254.169.254 metadata) để
  // lách khi host có gateway NAT64. Dạng dotted (64:ff9b::1.2.3.4) đã bị nhánh `dotted` bắt phía trên;
  // ở đây bắt dạng hex. Chỉ chặn nếu IPv4 nhúng là nội bộ (NAT64 tới IP public vẫn hợp lệ).
  const nat64 = h.match(/^64:ff9b:(?:1:)?:?[0-9a-f:]*?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (nat64) {
    const a = parseInt(nat64[1], 16);
    const b = parseInt(nat64[2], 16);
    return v4Blocked(`${(a >> 8) & 255}.${a & 255}.${(b >> 8) & 255}.${b & 255}`);
  }
  return (
    h === '::1' || // loopback
    h === '::' || // unspecified
    /^fe[89ab]/.test(h) || // link-local fe80::/10
    /^f[cd]/.test(h) || // unique-local fc00::/7
    /^ff/.test(h) // multicast
  );
}

// True nếu IP (đã chuẩn hóa) thuộc dải nội bộ/loopback/link-local/metadata… → phải chặn.
export function isBlockedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return v4Blocked(ip);
  if (v === 6) return v6Blocked(ip);
  return true; // không phải IP hợp lệ → chặn cho an toàn
}

// Kiểm tra ở mức chuỗi/URL (trước khi resolve). Chặn hostname đặc biệt + IP-literal nội bộ.
export function assertPublicHost(url: URL): void {
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === 'metadata.google.internal' ||
    host.endsWith('.internal')
  ) {
    throw new Error('Địa chỉ nội bộ bị chặn vì lý do bảo mật');
  }
  // Nếu host là IP-literal (kể cả IPv6 trong []), kiểm ngay.
  if (isIP(host) && isBlockedIp(host)) {
    throw new Error('IP nội bộ bị chặn vì lý do bảo mật');
  }
}

// Dùng cho luồng tạo/test kết nối (kiểm sớm, mức chuỗi). Việc resolve DNS + chặn IP
// nội bộ thực sự diễn ra ở safeFetch lúc gọi đi.
export function assertPublicUrl(raw: string): void {
  const trimmed = raw.trim();
  // Scheme tường minh "xxx://" không phải http/https → chặn (file://, ftp://, gopher://…).
  const schemed = trimmed.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  if (schemed && !/^https?$/i.test(schemed[1])) {
    throw new Error('Chỉ hỗ trợ http/https');
  }
  // Scheme nguy hiểm dạng "xxx:" (không có //) - file:, data:, javascript:…
  if (/^(file|data|javascript|vbscript|gopher|ftp|ftps|dict|ldap|tftp|blob|mailto):/i.test(trimmed)) {
    throw new Error('Chỉ hỗ trợ http/https');
  }
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error('Địa chỉ site không hợp lệ');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Chỉ hỗ trợ http/https');
  }
  assertPublicHost(url);
}
