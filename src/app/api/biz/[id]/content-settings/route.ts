import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { bizHasFeature } from '@/lib/billing/entitlement';
import { runWithBiz } from '@/lib/biz/context';
import { getArticleConfig, saveArticleConfig } from '@/lib/store/article-config';
import { memberRole } from '@/lib/store/biz';

export const dynamic = 'force-dynamic';

// Cấu hình nội dung theo biz: bật/tắt "bắt buộc duyệt" + "giọng thương hiệu" (brand voice).
// Chỉ chủ/quản trị mới xem/sửa. Dữ liệu nằm trong article-config.json của biz.
async function requireManager(bizId: string) {
  const g = await guard();
  if ('response' in g) return { error: g.response as NextResponse };
  const role = await memberRole(bizId, g.user.id);
  if (role !== 'owner' && role !== 'admin') {
    return { error: NextResponse.json({ error: 'Không đủ quyền.' }, { status: 403 }) };
  }
  return { userId: g.user.id };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const chk = await requireManager(params.id);
  if ('error' in chk) return chk.error;
  const cfg = await runWithBiz({ userId: chk.userId, bizId: params.id }, () => getArticleConfig());
  return NextResponse.json({ requireApproval: cfg.requireApproval, brandVoice: cfg.brandVoice });
}

const Schema = z.object({
  requireApproval: z.boolean().optional(),
  brandVoice: z.string().max(4000).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const chk = await requireManager(params.id);
  if ('error' in chk) return chk.error;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  // Bật duyệt bài / đặt brand voice cần gói có tính năng tương ứng (Pro trở lên).
  if (parsed.data.requireApproval === true && !(await bizHasFeature(params.id, 'approval'))) {
    return NextResponse.json(
      { error: 'Quy trình duyệt bài thuộc gói Pro trở lên.', code: 'plan_feature' },
      { status: 403 },
    );
  }
  if (parsed.data.brandVoice?.trim() && !(await bizHasFeature(params.id, 'brandVoice'))) {
    return NextResponse.json(
      { error: 'Giọng thương hiệu thuộc gói Pro trở lên.', code: 'plan_feature' },
      { status: 403 },
    );
  }
  const cfg = await runWithBiz({ userId: chk.userId, bizId: params.id }, () =>
    saveArticleConfig(parsed.data),
  );
  return NextResponse.json({
    ok: true,
    requireApproval: cfg.requireApproval,
    brandVoice: cfg.brandVoice,
  });
}
