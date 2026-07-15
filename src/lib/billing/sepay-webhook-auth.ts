// Xác thực webhook Sepay: API Key HOẶC HMAC-SHA256. Hàm THUẦN (không đọc I/O) để dễ test và
// tái dùng. Route chỉ đọc cấu hình + raw body rồi gọi verifySepayWebhook().
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentConfig } from '../store/payment-config';

export type WebhookAuthResult = 'ok' | 'not-configured' | 'unauthorized';

// So sánh HẰNG THỜI GIAN (chống dò theo thời gian). Khác độ dài → false trước timingSafeEqual.
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

// Chữ ký HMAC-SHA256(secret, raw body) dạng hex thường.
export function computeSepayHmac(secret: string, rawBody: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}

// Tách token API key khỏi header Authorization: "Apikey <key>".
function extractApiKey(authorization: string | null): string {
  return /^Apikey\s+(.+)$/i.exec((authorization ?? '').trim())?.[1] ?? '';
}

// Chuẩn hóa chữ ký nhận được: bỏ tiền tố "sha256=", về hex thường.
function normalizeSignature(raw: string | null): string {
  return (raw ?? '').trim().replace(/^sha256=/i, '').toLowerCase();
}

// Đầu vào header cần cho xác thực (tách khỏi Request để test không cần dựng Request thật).
export interface WebhookHeaders {
  authorization: string | null; // cho API Key
  signature: string | null; // giá trị header chữ ký (cho HMAC)
}

// FAIL-CLOSED: chưa cấu hình secret cho phương thức đang chọn → 'not-configured'.
// Sai token/chữ ký → 'unauthorized'. Hợp lệ → 'ok'.
export function verifySepayWebhook(
  cfg: Pick<PaymentConfig, 'authMethod' | 'apiKey' | 'hmacSecret'>,
  headers: WebhookHeaders,
  rawBody: string,
): WebhookAuthResult {
  if (cfg.authMethod === 'hmac') {
    if (!cfg.hmacSecret) return 'not-configured';
    const provided = normalizeSignature(headers.signature);
    if (!provided) return 'unauthorized';
    return safeEqual(provided, computeSepayHmac(cfg.hmacSecret, rawBody)) ? 'ok' : 'unauthorized';
  }
  // Mặc định: API Key.
  if (!cfg.apiKey) return 'not-configured';
  const provided = extractApiKey(headers.authorization);
  return provided !== '' && safeEqual(provided, cfg.apiKey) ? 'ok' : 'unauthorized';
}
