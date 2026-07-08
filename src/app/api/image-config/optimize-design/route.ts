import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { optimizeDesignSystem } from '@/lib/ai/content';
import { aiReady } from '@/lib/ai/providers';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { AI_PROVIDERS } from '@/lib/secrets/store';
import { locales, type Locale } from '@/i18n/config';

export const dynamic = 'force-dynamic';

const Body = z.object({
  notes: z.string().max(8000).optional().default(''),
  locale: z.enum(locales).optional(),
  provider: z.enum(AI_PROVIDERS).optional(),
  model: z.string().max(120).optional(),
});

// POST /api/image-config/optimize-design → dùng AI viết lại "System Design" thành cấu trúc chuẩn
// (Visual Style, Color Palette, Typography, Hiệu ứng, Components, Layout, Quy tắc bắt buộc),
// thân thiện để làm prompt sinh ảnh.
export async function POST(req: Request) {
  // BẢO MẬT: đây là route gọi AI (tốn phí) → PHẢI có guard + rate-limit như mọi route AI khác.
  // Trước đây thiếu cả hai → người chưa đăng nhập cũng đốt được key AI nền tảng.
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  const rl = rateLimit(`ai:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: `Thử lại sau ${rl.retryAfter}s.` }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }
  if (!(await aiReady())) {
    return NextResponse.json({ ok: false, needsKey: true });
  }
  const { notes, locale, provider, model } = parsed.data;
  // Bắt buộc chọn AI cụ thể — KHÔNG chạy theo định tuyến mặc định.
  if (!provider) {
    return NextResponse.json({ ok: false, error: 'Hãy chọn AI để tối ưu.' });
  }
  const { design, error } = await optimizeDesignSystem({
    notes,
    locale: (locale ?? 'vi') as Locale,
    override: { provider, model },
  });
  if (!design) {
    return NextResponse.json({ ok: false, error: error ?? 'AI không trả về kết quả hợp lệ' });
  }
  return NextResponse.json({ ok: true, design });
}
