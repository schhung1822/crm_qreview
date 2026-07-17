// Lớp GỬI EMAIL cấp thấp (nodemailer). Server-only. Toàn hệ thống dùng 1 SMTP nền tảng
// (store/platform-email.ts); nội dung + gửi theo sự kiện nằm ở đó (sendPlatformEvent/sendEventEmail).
import nodemailer from 'nodemailer';
import { requestBaseUrl } from '../base-url';
import type { GmailOAuthConfig, SmtpConfig } from '../store/email';

// URL đăng nhập dùng trong email: ƯU TIÊN APP_URL (env) → X-Forwarded-Host (sau proxy) → origin.
// Đặt APP_URL để chống Host header injection tạo link phishing (xem lib/base-url.ts).
export async function appLoginUrl(req: Request): Promise<string> {
  const base = requestBaseUrl(req);
  return `${base}/login`;
}

// Cổng chuẩn quyết định kiểu mã hóa → tránh lỗi "wrong version number" khi tick sai SSL/cổng:
//   465 = TLS ngầm (secure=true). 587/25 = STARTTLS (secure=false, nodemailer tự nâng cấp).
// Cổng khác: theo lựa chọn người dùng.
function effectiveSecure(c: SmtpConfig): boolean {
  if (c.port === 465) return true;
  if (c.port === 587 || c.port === 25) return false;
  return c.secure;
}

function buildTransport(c: SmtpConfig) {
  return nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: effectiveSecure(c),
    auth: { user: c.user, pass: c.pass },
    // Giới hạn thời gian → SMTP treo/độc hại không giữ request & socket vô hạn.
    connectionTimeout: 12_000,
    greetingTimeout: 8_000,
    socketTimeout: 15_000,
  });
}

// Chuyển lỗi SMTP kỹ thuật thành thông báo dễ hiểu cho người dùng.
export function humanizeSmtpError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('wrong version number')) {
    return 'Sai cấu hình mã hóa: dùng SSL/TLS cho cổng 465, hoặc tắt SSL (STARTTLS) cho cổng 587.';
  }
  if (m.includes('econnrefused') || m.includes('etimedout') || m.includes('enotfound') || m.includes('ehostunreach')) {
    return 'Không kết nối được máy chủ SMTP. Kiểm tra lại host và cổng.';
  }
  if (m.includes('invalid login') || m.includes('535') || m.includes('authentication') || m.includes('username and password')) {
    return 'Sai tài khoản hoặc mật khẩu SMTP. (Gmail: hãy dùng App Password, không dùng mật khẩu thường.)';
  }
  if (m.includes('self-signed') || m.includes('self signed') || m.includes('certificate')) {
    return 'Lỗi chứng chỉ TLS của máy chủ SMTP.';
  }
  return msg.slice(0, 200);
}

function fromHeader(c: SmtpConfig): string {
  const name = (c.fromName || 'SEO-GEO').replace(/["\\]/g, '');
  return `"${name}" <${c.fromEmail || c.user}>`;
}

// Escape HTML + xuống dòng → <br> (template là text thuần, tránh chèn HTML tùy ý).
function textToHtml(text: string): string {
  const esc = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<div style="font-family:system-ui,Arial,sans-serif;font-size:14px;line-height:1.6;white-space:pre-wrap">${esc}</div>`;
}

// Kiểm tra kết nối SMTP (dùng cho nút "Gửi thử"/xác thực cấu hình). Ném lỗi nếu sai.
export async function verifySmtp(config: SmtpConfig): Promise<void> {
  await buildTransport(config).verify();
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  config: SmtpConfig;
}): Promise<void> {
  const c = opts.config;
  await buildTransport(c).sendMail({
    from: fromHeader(c),
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: textToHtml(opts.text),
  });
}

// ─── Gmail OAuth2 (gửi qua SMTP XOAUTH2 của Google bằng refresh token) ───
function buildGmailTransport(g: GmailOAuthConfig) {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      type: 'OAuth2',
      user: g.senderEmail,
      clientId: g.clientId,
      clientSecret: g.clientSecret,
      refreshToken: g.refreshToken,
    },
    connectionTimeout: 12_000,
    greetingTimeout: 8_000,
    socketTimeout: 15_000,
  });
}

function gmailFrom(g: GmailOAuthConfig): string {
  const name = (g.fromName || 'SEO-GEO').replace(/["\\]/g, '');
  return `"${name}" <${g.senderEmail}>`;
}

// Chuyển lỗi OAuth Gmail thành thông báo dễ hiểu.
export function humanizeGmailError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid_grant')) {
    return 'Refresh token không còn hiệu lực. Hãy bấm "Kết nối Google" lại để cấp quyền mới.';
  }
  if (m.includes('invalid_client') || m.includes('unauthorized_client')) {
    return 'Sai Client ID/Client Secret, hoặc redirect URI chưa được đăng ký trong Google Cloud.';
  }
  if (m.includes('access_denied')) {
    return 'Bạn đã từ chối cấp quyền cho ứng dụng ở màn hình Google.';
  }
  return humanizeSmtpError(msg);
}

export async function verifyGmail(config: GmailOAuthConfig): Promise<void> {
  if (!config.refreshToken) throw new Error('Gmail chưa được kết nối (thiếu refresh token).');
  await buildGmailTransport(config).verify();
}

export async function sendMailGmail(opts: {
  to: string;
  subject: string;
  text: string;
  config: GmailOAuthConfig;
}): Promise<void> {
  const g = opts.config;
  await buildGmailTransport(g).sendMail({
    from: gmailFrom(g),
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: textToHtml(opts.text),
  });
}
