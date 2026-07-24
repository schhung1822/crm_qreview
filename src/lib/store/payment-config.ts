// Cấu hình PHƯƠNG THỨC THANH TOÁN cấp nền tảng (Sepay) - .data/payment-config.json (toàn cục,
// gitignored). API key Sepay mã hóa AES-GCM. Server-only.
import { decryptWith, encryptWith } from '../crypto';
import { mutateGlobalConfig, readGlobalConfig } from '../data/config-store';
import { resolveEncryptionKey } from '../secrets/key';

// Cách webhook Sepay tự xác thực: API Key (header Authorization: Apikey) HOẶC HMAC-SHA256
// (ký raw body bằng secret dùng chung, gửi kèm chữ ký ở 1 header).
export type PaymentAuthMethod = 'apikey' | 'hmac';
const DEFAULT_SIG_HEADER = 'X-Signature';

export interface PaymentConfig {
  provider: 'sepay';
  enabled: boolean;
  bankAccount: string; // STK
  bankCode: string; // mã/short-name ngân hàng theo chuẩn Sepay (VCB, TCB, MB...)
  accountHolder: string; // chủ tài khoản
  authMethod: PaymentAuthMethod; // phương thức xác thực webhook
  apiKey: string; // API key webhook Sepay (đã giải mã ở getPaymentConfig)
  hmacSecret: string; // secret ký HMAC-SHA256 (đã giải mã ở getPaymentConfig)
  signatureHeader: string; // tên header chứa chữ ký HMAC (mặc định X-Signature)
  contentPrefix: string; // tiền tố nội dung CK để khớp đơn (vd "NOTI")
}

interface Data {
  provider?: 'sepay';
  enabled?: boolean;
  bankAccount?: string;
  bankCode?: string;
  accountHolder?: string;
  authMethod?: PaymentAuthMethod;
  apiKey?: string; // đã mã hóa
  hmacSecret?: string; // đã mã hóa
  signatureHeader?: string;
  contentPrefix?: string;
}

function normMethod(m?: string): PaymentAuthMethod {
  return m === 'hmac' ? 'hmac' : 'apikey';
}

const FILE = 'payment-config.json';

// Đọc/ghi qua json-store: có KHÓA theo file (chống mất ghi khi lưu đồng thời) + ghi ATOMIC
// (file tạm rồi rename, mode 0600) → không bao giờ để lại file cụt làm MẤT apiKey đã mã hóa.
async function read(): Promise<Data> {
  return readGlobalConfig<Data>(FILE, {});
}
function safeDecrypt(payload?: string): string {
  if (!payload) return '';
  try {
    return decryptWith(resolveEncryptionKey(), payload);
  } catch {
    return '';
  }
}

// Cấu hình đầy đủ (giải mã apiKey + hmacSecret) - dùng server (webhook verify, sinh QR).
export async function getPaymentConfig(): Promise<PaymentConfig> {
  const d = await read();
  return {
    provider: 'sepay',
    enabled: d.enabled ?? false,
    bankAccount: d.bankAccount ?? '',
    bankCode: d.bankCode ?? '',
    accountHolder: d.accountHolder ?? '',
    authMethod: normMethod(d.authMethod),
    apiKey: safeDecrypt(d.apiKey),
    hmacSecret: safeDecrypt(d.hmacSecret),
    signatureHeader: d.signatureHeader?.trim() || DEFAULT_SIG_HEADER,
    contentPrefix: d.contentPrefix ?? 'NOTI',
  };
}

// Trạng thái công khai cho UI (KHÔNG trả secret, chỉ báo đã đặt hay chưa).
export async function getPaymentConfigPublic(): Promise<
  Omit<PaymentConfig, 'apiKey' | 'hmacSecret'> & { apiKeySet: boolean; hmacSecretSet: boolean }
> {
  const d = await read();
  return {
    provider: 'sepay',
    enabled: d.enabled ?? false,
    bankAccount: d.bankAccount ?? '',
    bankCode: d.bankCode ?? '',
    accountHolder: d.accountHolder ?? '',
    authMethod: normMethod(d.authMethod),
    signatureHeader: d.signatureHeader?.trim() || DEFAULT_SIG_HEADER,
    contentPrefix: d.contentPrefix ?? 'NOTI',
    apiKeySet: !!d.apiKey,
    hmacSecretSet: !!d.hmacSecret,
  };
}

export async function savePaymentConfig(
  patch: Partial<Omit<PaymentConfig, 'provider'>>,
): Promise<void> {
  await mutateGlobalConfig<Data, void>(FILE, {}, (d) => {
    d.provider = 'sepay';
    if (patch.enabled !== undefined) d.enabled = patch.enabled;
    if (patch.bankAccount !== undefined) d.bankAccount = patch.bankAccount.trim();
    if (patch.bankCode !== undefined) d.bankCode = patch.bankCode.trim();
    if (patch.accountHolder !== undefined) d.accountHolder = patch.accountHolder.trim();
    if (patch.authMethod !== undefined) d.authMethod = normMethod(patch.authMethod);
    if (patch.signatureHeader !== undefined)
      d.signatureHeader = patch.signatureHeader.trim().slice(0, 64) || DEFAULT_SIG_HEADER;
    if (patch.contentPrefix !== undefined)
      d.contentPrefix = patch.contentPrefix.trim().toUpperCase().slice(0, 12) || 'NOTI';
    // Secret rỗng = giữ giá trị cũ (không ghi đè bằng chuỗi trống).
    if (patch.apiKey) d.apiKey = encryptWith(resolveEncryptionKey(), patch.apiKey);
    if (patch.hmacSecret) d.hmacSecret = encryptWith(resolveEncryptionKey(), patch.hmacSecret);
    return [d, undefined];
  });
}

// URL ảnh VietQR theo chuẩn Sepay cho 1 lần thanh toán.
export function sepayQrUrl(cfg: PaymentConfig, amount: number, content: string): string {
  const q = new URLSearchParams({
    acc: cfg.bankAccount,
    bank: cfg.bankCode,
    amount: String(Math.max(0, Math.round(amount))),
    des: content,
    template: 'compact',
  });
  return `https://qr.sepay.vn/img?${q.toString()}`;
}
