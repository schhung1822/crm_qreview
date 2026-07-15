import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuper } from '@/lib/admin/guard';
import {
  humanizeGmailError,
  humanizeSmtpError,
  sendMail,
  sendMailGmail,
  verifyGmail,
  verifySmtp,
} from '@/lib/email/mailer';
import { PLATFORM_EMAIL_EVENTS } from '@/lib/email/platform-templates';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import type { SmtpConfig } from '@/lib/store/email';
import {
  clearPlatformGmail,
  clearPlatformSmtp,
  getPlatformEmailState,
  getPlatformGmail,
  getPlatformSmtp,
  getPlatformTransport,
  resetPlatformTemplate,
  setPlatformEmailEnabled,
  setPlatformEventEnabled,
  setPlatformGmail,
  setPlatformSmtp,
  setPlatformTemplate,
  setPlatformTransport,
} from '@/lib/store/platform-email';

export const dynamic = 'force-dynamic';

export async function GET() {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  return NextResponse.json(await getPlatformEmailState());
}

const SmtpSchema = z.object({
  action: z.literal('smtp'),
  host: z.string().min(1).max(200),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().min(1).max(200),
  pass: z.string().max(500).optional(), // rỗng = giữ mật khẩu cũ
  fromName: z.string().max(120).optional(),
  fromEmail: z.string().email().max(254),
});
const EnabledSchema = z.object({ action: z.literal('enabled'), enabled: z.boolean() });
// Lưu cấu hình Gmail OAuth2. clientSecret rỗng = giữ cũ.
const GmailSchema = z.object({
  action: z.literal('gmail'),
  clientId: z.string().min(1).max(300),
  clientSecret: z.string().max(500).optional(),
  senderEmail: z.string().email().max(254),
  fromName: z.string().max(120).optional(),
});
// Chọn phương thức gửi đang dùng.
const TransportSchema = z.object({
  action: z.literal('transport'),
  transport: z.enum(['smtp', 'gmail_oauth2']),
});
const ClearGmailSchema = z.object({ action: z.literal('clearGmail') });
const TestSchema = z.object({
  action: z.literal('test'),
  mode: z.enum(['smtp', 'gmail']).optional(), // vắng = theo phương thức đang chọn
  to: z.string().email().max(254), // email NHẬN thử — người dùng tự nhập (không dùng email tài khoản)
  host: z.string().max(200).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  secure: z.boolean().optional(),
  user: z.string().max(200).optional(),
  pass: z.string().max(500).optional(),
  fromName: z.string().max(120).optional(),
  fromEmail: z.string().max(254).optional(),
});
// Dùng danh sách CHUNG từ platform-templates (trước đây hardcode 5 sự kiện → UI sửa template các
// sự kiện tài khoản như registered/forgotPassword bị 400 dù form hiển thị được).
const EVENTS = PLATFORM_EMAIL_EVENTS;
const EventSchema = z.object({ action: z.literal('event'), event: z.enum(EVENTS), enabled: z.boolean() });
const TemplateSchema = z.object({
  action: z.literal('template'),
  event: z.enum(EVENTS),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(8000),
});
const ResetTemplateSchema = z.object({ action: z.literal('resetTemplate'), event: z.enum(EVENTS) });
const Body = z.discriminatedUnion('action', [
  SmtpSchema,
  GmailSchema,
  TransportSchema,
  ClearGmailSchema,
  EnabledSchema,
  TestSchema,
  EventSchema,
  TemplateSchema,
  ResetTemplateSchema,
]);

export async function POST(req: Request) {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ', code: 'errInvalidParams' }, { status: 400 });
  const d = parsed.data;

  if (d.action === 'enabled') {
    await setPlatformEmailEnabled(d.enabled);
    return NextResponse.json({ ok: true });
  }
  if (d.action === 'event') {
    await setPlatformEventEnabled(d.event, d.enabled);
    return NextResponse.json({ ok: true });
  }
  if (d.action === 'template') {
    await setPlatformTemplate(d.event, { subject: d.subject, body: d.body });
    return NextResponse.json({ ok: true });
  }
  if (d.action === 'resetTemplate') {
    await resetPlatformTemplate(d.event);
    return NextResponse.json({ ok: true });
  }

  if (d.action === 'smtp') {
    const cfg: SmtpConfig = {
      host: d.host,
      port: d.port,
      secure: d.secure,
      user: d.user,
      pass: d.pass ?? '', // rỗng → store giữ mật khẩu cũ
      fromName: d.fromName || 'Noti SaaS',
      fromEmail: d.fromEmail,
    };
    await setPlatformSmtp(cfg);
    await setPlatformTransport('smtp'); // lưu SMTP → dùng SMTP
    return NextResponse.json({ ok: true });
  }

  if (d.action === 'gmail') {
    await setPlatformGmail({
      clientId: d.clientId,
      clientSecret: d.clientSecret, // rỗng → giữ secret cũ
      senderEmail: d.senderEmail,
      fromName: d.fromName,
    });
    // KHÔNG tự đổi transport ở đây: Gmail chỉ gửi được sau khi "Kết nối Google" (có refresh token).
    // Callback OAuth sẽ setPlatformTransport('gmail_oauth2') khi kết nối thành công.
    return NextResponse.json({ ok: true });
  }

  if (d.action === 'transport') {
    await setPlatformTransport(d.transport);
    return NextResponse.json({ ok: true });
  }

  if (d.action === 'clearGmail') {
    await clearPlatformGmail();
    await setPlatformTransport('smtp'); // gỡ Gmail → về SMTP
    return NextResponse.json({ ok: true });
  }

  // action === 'test': gửi email thử tới email của chính superadmin, theo phương thức chỉ định
  // (mode) hoặc phương thức đang chọn.
  const rl = rateLimit(`email-test:${clientIp(req)}`, 6, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: `Thử quá nhiều lần. Đợi ${rl.retryAfter}s.` },
      { status: 429 },
    );
  }
  // Email nhận thử do người dùng tự nhập (Zod đã validate là email hợp lệ).
  const to = d.to.trim();

  const mode = d.mode ?? (await getPlatformTransport() === 'gmail_oauth2' ? 'gmail' : 'smtp');

  if (mode === 'gmail') {
    const g = await getPlatformGmail();
    if (!g) return NextResponse.json({ ok: false, error: 'Chưa cấu hình Gmail OAuth2.', code: 'errNoGmail' }, { status: 400 });
    if (!g.refreshToken) return NextResponse.json({ ok: false, error: 'Gmail chưa được kết nối. Bấm "Kết nối Google" trước.', code: 'errGmailNotConnected' }, { status: 400 });
    try {
      await verifyGmail(g);
      await sendMailGmail({ to, subject: '[Thử] Gmail OAuth2 nền tảng', text: 'Đây là email thử qua Gmail OAuth2. Nếu bạn nhận được, cấu hình đã hoạt động.', config: g });
      return NextResponse.json({ ok: true, to });
    } catch (e) {
      return NextResponse.json({ ok: false, error: humanizeGmailError(e instanceof Error ? e.message : 'Lỗi gửi thử') }, { status: 400 });
    }
  }

  // mode === 'smtp'
  const stored = (await getPlatformSmtp()).config;
  const config: SmtpConfig | undefined = d.host
    ? {
        host: d.host,
        port: d.port ?? 587,
        secure: d.secure ?? d.port === 465,
        user: d.user ?? '',
        pass: d.pass || stored?.pass || '',
        fromName: d.fromName || stored?.fromName || 'Noti SaaS',
        fromEmail: d.fromEmail || stored?.fromEmail || d.user || '',
      }
    : stored;
  if (!config) return NextResponse.json({ ok: false, error: 'Chưa cấu hình SMTP.', code: 'errNoSmtp' }, { status: 400 });
  try {
    await verifySmtp(config);
    await sendMail({
      to,
      subject: '[Thử] SMTP nền tảng Noti',
      text: 'Đây là email thử từ SMTP nền tảng. Nếu bạn nhận được, cấu hình đã hoạt động.',
      config,
    });
    return NextResponse.json({ ok: true, to });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: humanizeSmtpError(e instanceof Error ? e.message : 'Lỗi gửi thử') },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  await clearPlatformSmtp();
  return NextResponse.json({ ok: true });
}
