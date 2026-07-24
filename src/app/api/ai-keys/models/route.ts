import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { runWithBiz } from '@/lib/biz/context';
import { friendlyProviderError, listProviderModels } from '@/lib/ai/providers';
import { AI_PROVIDERS, getActiveKey } from '@/lib/secrets/store';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  key: z.string().optional(), // nếu gửi → dùng key này; không → key đã lưu
  kind: z.enum(['text', 'image']).optional(), // lọc model viết bài / tạo ảnh
});

// POST /api/ai-keys/models → danh sách model khả dụng của provider (qua API thật).
// - Truyền key thô (test key mới) → cần quyền quản lý key (aikeys:manage).
// - Dùng key đã lưu (vd chọn model ở trình soạn thảo) → chỉ cần content:write.
export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }

  const rawKey = parsed.data.key?.trim();
  const g = await guard(rawKey ? 'aikeys:manage' : 'content:write');
  if ('response' in g) return g.response;

  const ctx = { userId: g.user.id, bizId: g.bizId };
  const key = rawKey || (await runWithBiz(ctx, () => getActiveKey(parsed.data.provider)));
  if (!key) {
    return NextResponse.json({ error: 'Chưa có API key' }, { status: 400 });
  }

  try {
    const models = await listProviderModels(parsed.data.provider, key, parsed.data.kind ?? 'text');
    return NextResponse.json({ models });
  } catch (err) {
    return NextResponse.json(
      { error: friendlyProviderError(parsed.data.provider, err) },
      { status: 502 },
    );
  }
}
