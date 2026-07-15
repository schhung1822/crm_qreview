import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { AI_PROVIDERS, getRevealableKey } from '@/lib/secrets/store';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { appendAudit } from '@/lib/store/admin-audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ProviderEnum = z.enum(AI_PROVIDERS);

// GET /api/ai-keys/reveal?provider=openai → trả FULL key ĐÃ LƯU CỦA BIZ (chỉ cho người quản lý
// API key, để xem lại khóa của chính mình qua icon mắt). Không log GIÁ TRỊ key.
// BẢO MẬT: dùng getRevealableKey → KHÔNG lộ key nền tảng cấu hình qua ENV (dùng chung).
//   + rate-limit (chống trích xuất hàng loạt khi tài khoản bị chiếm) + ghi audit (để lại dấu vết
//   ai đã xem key nào, khi nào - hành động rất nhạy cảm).
export async function GET(req: Request) {
  const g = await guard('aikeys:manage');
  if ('response' in g) return g.response;

  // Giới hạn tần suất theo người dùng (hành động nhạy cảm) - chống trích xuất toàn bộ key liên tục.
  const rl = rateLimit(`reveal:${g.user.id}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Quá nhiều yêu cầu. Thử lại sau ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const parsed = ProviderEnum.safeParse(new URL(req.url).searchParams.get('provider'));
  if (!parsed.success) {
    return NextResponse.json({ error: 'provider không hợp lệ' }, { status: 400 });
  }
  const key = await getRevealableKey(parsed.data);
  if (!key) {
    return NextResponse.json({ error: 'Chưa có API key của biz' }, { status: 404 });
  }
  // Ghi audit: chỉ ghi AI xem provider nào, KHÔNG ghi giá trị key.
  await appendAudit({
    via: 'ui',
    actor: g.user.id,
    action: 'aikey.reveal',
    resource: 'aikey',
    resourceId: parsed.data,
    detail: { bizId: g.bizId },
    ok: true,
    ip: clientIp(req),
  });
  return NextResponse.json({ key });
}
