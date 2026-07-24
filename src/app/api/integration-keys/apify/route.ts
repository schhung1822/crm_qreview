import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { runWithBiz } from '@/lib/biz/context';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { validateApifyToken } from '@/lib/social/apify';
import {
  addApifyKey,
  deleteApifyKey,
  getApifyPool,
  listApifyKeys,
  migrateLegacyApifyKey,
} from '@/lib/social/apify-keys';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Danh sách pool key + cờ đang dùng key đơn cũ (store/env) làm fallback.
async function poolPayload() {
  const keys = await listApifyKeys();
  const usingFallback = keys.length === 0 && (await getApifyPool()).some((m) => m.id === 'default');
  return { keys, usingFallback };
}

// GET /api/integration-keys/apify → danh sách key Apify (đã che) + cờ fallback của biz.
// Cho MỌI user đăng nhập (chỉ masked, không lộ key thô) để trang Báo cáo Social biết đã có kết nối
// hay chưa (editor tạo báo cáo nhưng không có quyền aikeys:manage). Thêm/xóa vẫn cần aikeys:manage.
export async function GET() {
  const g = await guard();
  if ('response' in g) return g.response;
  // Chỉ migrate key đơn cũ vào pool khi người xem CÓ quyền quản lý key (tránh ghi dữ liệu bởi editor).
  const ctx = { userId: g.user.id, bizId: g.bizId };
  if (g.permissions.includes('aikeys:manage')) await runWithBiz(ctx, () => migrateLegacyApifyKey());
  return NextResponse.json(await runWithBiz(ctx, () => poolPayload()));
}

const BodySchema = z.object({
  value: z.string().min(10).max(500),
  test: z.boolean().optional(), // true = chỉ kiểm tra, KHÔNG lưu
});

// POST /api/integration-keys/apify → kiểm tra key; nếu hợp lệ (và không phải test) thì THÊM vào pool.
// Bắt buộc key phải khả dụng mới cho lưu (test-before-save).
export async function POST(req: Request) {
  const g = await guard('aikeys:manage');
  if ('response' in g) return g.response;

  // Kiểm tra gọi API ngoài → rate-limit chống lạm dụng.
  const rl = rateLimit(`apifykey:${g.user.id}`, 20, 60_000);
  if (!rl.ok)
    return NextResponse.json(
      { error: `Thử lại sau ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });

  // Luôn KIỂM TRA token trước (gọi /users/me của Apify - rất rẻ).
  const check = await validateApifyToken(parsed.data.value.trim());
  if (parsed.data.test) {
    // Chỉ kiểm tra (nút "Kiểm tra") - không lưu.
    return NextResponse.json({ ok: check.ok, error: check.error });
  }
  if (!check.ok) {
    return NextResponse.json({ ok: false, error: check.error ?? 'Key không khả dụng.' }, { status: 400 });
  }
  const ctx = { userId: g.user.id, bizId: g.bizId };
  const { duplicate } = await runWithBiz(ctx, () => addApifyKey(parsed.data.value));
  return NextResponse.json({ ok: true, duplicate, ...(await runWithBiz(ctx, () => poolPayload())) });
}

// DELETE /api/integration-keys/apify?id=... → xóa 1 key khỏi pool.
export async function DELETE(req: Request) {
  const g = await guard('aikeys:manage');
  if ('response' in g) return g.response;
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });
  const ctx = { userId: g.user.id, bizId: g.bizId };
  await runWithBiz(ctx, () => deleteApifyKey(id));
  return NextResponse.json(await runWithBiz(ctx, () => poolPayload()));
}
