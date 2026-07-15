// Cấu hình SMTP + gửi email cấp NỀN TẢNG (SaaS) - .data/platform-email.json (toàn cục, gitignored).
// Khác email theo-biz: dùng cho email hệ thống (biên nhận đơn, thông báo nền tảng...). Mật khẩu
// mã hóa AES-GCM như store email theo-biz. Server-only.
import { decryptWith, encryptWith } from '../crypto';
import { globalFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';
import { sendMail, sendMailGmail } from '../email/mailer';
import {
  PLATFORM_EMAIL_EVENTS,
  defaultPlatformTemplate,
  type PlatformEmailEvent,
} from '../email/platform-templates';
import { renderTemplate, type EmailTemplate } from '../email/templates';
import { resolveEncryptionKey } from '../secrets/key';
import { recordEmailSent } from './email-stats';
import type { GmailOAuthConfig, MailTransport, SmtpConfig } from './email';

// Gmail lưu trong file: clientSecret + refreshToken đã MÃ HÓA (như pass của SMTP).
interface StoredGmail {
  clientId: string;
  clientSecret: string; // mã hóa
  senderEmail: string;
  fromName: string;
  refreshToken?: string; // mã hóa
}

interface Data {
  transport?: MailTransport; // phương thức đang chọn (mặc định 'smtp' để tương thích ngược)
  smtp?: Omit<SmtpConfig, 'pass'> & { pass: string }; // pass đã mã hóa
  gmail?: StoredGmail;
  enabled?: boolean;
  events?: Partial<Record<PlatformEmailEvent, boolean>>; // bật/tắt từng loại (mặc định bật)
  templates?: Partial<Record<PlatformEmailEvent, EmailTemplate>>; // ghi đè nội dung
}

const FILE = globalFile('platform-email.json');

// Đọc/ghi qua json-store: KHÓA theo file + ghi ATOMIC (chống mất mật khẩu SMTP đã mã hóa / cấu hình).
async function read(): Promise<Data> {
  return readJson<Data>(FILE, {});
}
function safeDecrypt(payload: string): string | undefined {
  try {
    return decryptWith(resolveEncryptionKey(), payload);
  } catch {
    return undefined;
  }
}

export async function getPlatformSmtp(): Promise<{ config?: SmtpConfig; source: 'store' | 'none' }> {
  const d = await read();
  if (d.smtp?.host && d.smtp.user && d.smtp.pass) {
    const pass = safeDecrypt(d.smtp.pass);
    if (pass) return { config: { ...d.smtp, pass }, source: 'store' };
  }
  return { source: 'none' };
}

export async function setPlatformSmtp(config: SmtpConfig): Promise<void> {
  await mutateJson<Data, void>(FILE, {}, (d) => {
    // pass rỗng = giữ mật khẩu cũ.
    const encPass = config.pass
      ? encryptWith(resolveEncryptionKey(), config.pass)
      : (d.smtp?.pass ?? '');
    d.smtp = { ...config, pass: encPass };
    return [d, undefined];
  });
}

export async function clearPlatformSmtp(): Promise<void> {
  await mutateJson<Data, void>(FILE, {}, (d) => {
    delete d.smtp;
    return [d, undefined];
  });
}

// ─── Gmail OAuth2 ───

// Cấu hình Gmail đầy đủ (đã giải mã) để GỬI. Thiếu trường bắt buộc / giải mã lỗi → undefined.
export async function getPlatformGmail(): Promise<GmailOAuthConfig | undefined> {
  const d = await read();
  const g = d.gmail;
  if (!g?.clientId || !g.senderEmail || !g.clientSecret) return undefined;
  const clientSecret = safeDecrypt(g.clientSecret);
  if (!clientSecret) return undefined;
  const refreshToken = g.refreshToken ? safeDecrypt(g.refreshToken) : undefined;
  return {
    clientId: g.clientId,
    clientSecret,
    senderEmail: g.senderEmail,
    fromName: g.fromName || 'SEO-GEO',
    refreshToken,
  };
}

// Client ID/Secret cho luồng OAuth (auth + callback). senderEmail để login_hint.
export async function getPlatformGmailCreds(): Promise<
  { clientId: string; clientSecret: string; senderEmail: string } | undefined
> {
  const d = await read();
  const g = d.gmail;
  if (!g?.clientId || !g.clientSecret) return undefined;
  const clientSecret = safeDecrypt(g.clientSecret);
  if (!clientSecret) return undefined;
  return { clientId: g.clientId, clientSecret, senderEmail: g.senderEmail };
}

// Lưu cấu hình Gmail. clientSecret rỗng = giữ cũ. Nếu ĐỔI clientId hoặc senderEmail thì XÓA
// refreshToken (phải "Kết nối Google" lại - token cũ không còn hợp lệ cho client/tài khoản mới).
export async function setPlatformGmail(input: {
  clientId: string;
  clientSecret?: string;
  senderEmail: string;
  fromName?: string;
}): Promise<void> {
  await mutateJson<Data, void>(FILE, {}, (d) => {
    const prev = d.gmail;
    const encSecret = input.clientSecret
      ? encryptWith(resolveEncryptionKey(), input.clientSecret)
      : (prev?.clientSecret ?? '');
    const changed =
      !prev || prev.clientId !== input.clientId || prev.senderEmail !== input.senderEmail;
    d.gmail = {
      clientId: input.clientId,
      clientSecret: encSecret,
      senderEmail: input.senderEmail,
      fromName: input.fromName || prev?.fromName || 'SEO-GEO',
      refreshToken: changed ? undefined : prev?.refreshToken,
    };
    return [d, undefined];
  });
}

// Lưu refresh token (đã lấy từ callback OAuth) - mã hóa trước khi ghi.
export async function setPlatformGmailRefreshToken(refreshToken: string): Promise<void> {
  await mutateJson<Data, void>(FILE, {}, (d) => {
    if (!d.gmail) return [d, undefined];
    d.gmail.refreshToken = encryptWith(resolveEncryptionKey(), refreshToken);
    return [d, undefined];
  });
}

export async function clearPlatformGmail(): Promise<void> {
  await mutateJson<Data, void>(FILE, {}, (d) => {
    delete d.gmail;
    return [d, undefined];
  });
}

// Phương thức gửi đang chọn (mặc định 'smtp').
export async function getPlatformTransport(): Promise<MailTransport> {
  return (await read()).transport ?? 'smtp';
}
export async function setPlatformTransport(transport: MailTransport): Promise<void> {
  await mutateJson<Data, void>(FILE, {}, (d) => {
    d.transport = transport;
    return [d, undefined];
  });
}

// Gửi bằng phương thức ĐANG CHỌN. Ném lỗi nếu chưa cấu hình/kết nối (dùng cho test); luồng sự kiện
// bọc try/catch ở sendPlatformEvent nên vẫn an toàn.
async function sendActive(opts: { to: string; subject: string; text: string }): Promise<void> {
  const transport = await getPlatformTransport();
  if (transport === 'gmail_oauth2') {
    const g = await getPlatformGmail();
    if (!g) throw new Error('Chưa cấu hình Gmail OAuth2.');
    if (!g.refreshToken) throw new Error('Gmail chưa được kết nối. Hãy bấm "Kết nối Google".');
    await sendMailGmail({ ...opts, config: g });
    return;
  }
  const { config } = await getPlatformSmtp();
  if (!config) throw new Error('Chưa cấu hình SMTP nền tảng.');
  await sendMail({ ...opts, config });
}

// Tên hiển thị người gửi của phương thức đang chọn (cho biến {appName} trong template).
async function activeFromName(): Promise<string> {
  const transport = await getPlatformTransport();
  if (transport === 'gmail_oauth2') return (await getPlatformGmail())?.fromName || 'Noti';
  return (await getPlatformSmtp()).config?.fromName || 'Noti';
}

export async function setPlatformEmailEnabled(enabled: boolean): Promise<void> {
  await mutateJson<Data, void>(FILE, {}, (d) => {
    d.enabled = enabled;
    return [d, undefined];
  });
}

// ─── Nội dung email theo trạng thái khách hàng ───
export async function isPlatformEventEnabled(event: PlatformEmailEvent): Promise<boolean> {
  return (await read()).events?.[event] !== false; // mặc định bật
}
export async function setPlatformEventEnabled(
  event: PlatformEmailEvent,
  enabled: boolean,
): Promise<void> {
  await mutateJson<Data, void>(FILE, {}, (d) => {
    d.events = { ...(d.events ?? {}), [event]: enabled };
    return [d, undefined];
  });
}
export async function getPlatformTemplate(event: PlatformEmailEvent): Promise<EmailTemplate> {
  return (await read()).templates?.[event] ?? defaultPlatformTemplate(event);
}
export async function setPlatformTemplate(
  event: PlatformEmailEvent,
  tpl: EmailTemplate,
): Promise<void> {
  await mutateJson<Data, void>(FILE, {}, (d) => {
    d.templates = { ...(d.templates ?? {}), [event]: tpl };
    return [d, undefined];
  });
}
export async function resetPlatformTemplate(event: PlatformEmailEvent): Promise<void> {
  await mutateJson<Data, void>(FILE, {}, (d) => {
    if (d.templates) delete d.templates[event];
    return [d, undefined];
  });
}

// Trạng thái công khai cho UI (KHÔNG trả pass / clientSecret / refreshToken) + nội dung email.
export interface PlatformEmailState {
  transport: MailTransport; // phương thức đang chọn
  configured: boolean; // SMTP đã cấu hình
  smtpReady: boolean; // SMTP đủ để gửi
  gmailReady: boolean; // Gmail đã cấu hình + đã kết nối (có refresh token)
  gmail: {
    configured: boolean; // đã nhập clientId + senderEmail
    connected: boolean; // đã có refresh token
    clientId?: string; // hiện để đối chiếu (KHÔNG phải bí mật)
    senderEmail?: string;
    fromName?: string;
  };
  enabled: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  fromName?: string;
  fromEmail?: string;
  events: Record<string, boolean>;
  templates: Record<string, EmailTemplate>;
}

export async function getPlatformEmailState(): Promise<PlatformEmailState> {
  const d = await read();
  const events: Record<string, boolean> = {};
  const templates: Record<string, EmailTemplate> = {};
  for (const ev of PLATFORM_EMAIL_EVENTS) {
    events[ev] = d.events?.[ev] !== false;
    templates[ev] = d.templates?.[ev] ?? defaultPlatformTemplate(ev);
  }
  const smtpReady = !!(d.smtp?.host && d.smtp.user && d.smtp.pass);
  const gmailConfigured = !!(d.gmail?.clientId && d.gmail.senderEmail && d.gmail.clientSecret);
  const gmailConnected = gmailConfigured && !!d.gmail?.refreshToken;
  return {
    transport: d.transport ?? 'smtp',
    configured: !!(d.smtp?.host && d.smtp.user),
    smtpReady,
    gmailReady: gmailConnected,
    gmail: {
      configured: gmailConfigured,
      connected: gmailConnected,
      clientId: d.gmail?.clientId,
      senderEmail: d.gmail?.senderEmail,
      fromName: d.gmail?.fromName,
    },
    enabled: d.enabled ?? false,
    host: d.smtp?.host,
    port: d.smtp?.port,
    secure: d.smtp?.secure,
    user: d.smtp?.user,
    fromName: d.smtp?.fromName,
    fromEmail: d.smtp?.fromEmail,
    events,
    templates,
  };
}

// Phương thức đang chọn đã sẵn sàng gửi chưa (đủ cấu hình + đã kết nối nếu là Gmail).
async function activeReady(): Promise<boolean> {
  const transport = await getPlatformTransport();
  if (transport === 'gmail_oauth2') {
    const g = await getPlatformGmail();
    return !!(g && g.refreshToken);
  }
  return !!(await getPlatformSmtp()).config;
}

// Gửi email bằng phương thức NỀN TẢNG đang chọn (biên nhận đơn, thông báo hệ thống...).
export async function sendPlatformMail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  await sendActive(opts);
}

// Gửi email theo SỰ KIỆN (render template + thay biến). KHÔNG ném lỗi (an toàn cho luồng đơn hàng).
export async function sendPlatformEvent(
  event: PlatformEmailEvent,
  to: string,
  vars: Record<string, string | undefined>,
): Promise<{ sent: boolean; skipped?: string; error?: string }> {
  try {
    if (!to) return { sent: false, skipped: 'no-recipient' };
    const d = await read();
    if (d.enabled === false || !d.enabled) return { sent: false, skipped: 'disabled' };
    if (d.events?.[event] === false) return { sent: false, skipped: 'disabled' };
    if (!(await activeReady())) return { sent: false, skipped: 'not-configured' };
    const tpl = d.templates?.[event] ?? defaultPlatformTemplate(event);
    const merged = { appName: await activeFromName(), ...vars };
    await sendActive({
      to,
      subject: renderTemplate(tpl.subject, merged),
      text: renderTemplate(tpl.body, merged),
    });
    void recordEmailSent(event); // đếm cho tab Tổng quan (không chặn luồng gửi)
    return { sent: true };
  } catch (e) {
    console.error('[sendPlatformEvent]', e instanceof Error ? e.message : e);
    return { sent: false, error: e instanceof Error ? e.message : 'error' };
  }
}

// Alias cho luồng auth (đăng ký/tạo user/đổi vai trò/quên mật khẩu). Trước đây gửi qua SMTP theo-biz;
// nay TOÀN HỆ THỐNG dùng SMTP + nội dung email nền tảng. An toàn: không ném lỗi.
export function sendEventEmail(
  event: PlatformEmailEvent,
  to: string,
  vars: Record<string, string | undefined>,
): Promise<{ sent: boolean; skipped?: string; error?: string }> {
  return sendPlatformEvent(event, to, vars);
}
