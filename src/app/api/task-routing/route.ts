import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { AI_PROVIDERS } from '@/lib/secrets/store';
import { AI_TASK_KEYS, getTaskRouting, saveTaskRouting } from '@/lib/store/task-routing';

export const dynamic = 'force-dynamic';

// GET /api/task-routing → AI/model mặc định cho từng tác vụ.
export async function GET() {
  const g = await guard();
  if ('response' in g) return g.response;
  return NextResponse.json(await getTaskRouting());
}

const TaskAiSchema = z.object({
  provider: z.union([z.enum(AI_PROVIDERS), z.literal('')]).default(''),
  model: z.string().max(120).default(''),
});
const BodySchema = z.object(
  Object.fromEntries(AI_TASK_KEYS.map((k) => [k, TaskAiSchema.optional()])),
);

// POST /api/task-routing → lưu định tuyến tác vụ. Đây là cấu hình NỘI DUNG (chọn AI/model
// mặc định cho từng bước tạo bài, có thể override khi chạy) nên dùng quyền content:write
// để khớp trang Cài đặt bài viết - không lộ/đổi API key.
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }
  return NextResponse.json(await saveTaskRouting(parsed.data));
}
