// Quản trị PROMPT (superadmin): liệt kê mọi prompt AI + template mặc định, lưu/khôi phục bản tùy chỉnh.
// Bản tùy chỉnh lưu toàn cục (prompt-store) → cả hệ thống dùng ngay.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuper } from '@/lib/admin/guard';
import { PROMPTS, defaultUserTemplate } from '@/lib/ai/prompt-registry';
import {
  getPromptOverrides,
  resetPromptOverride,
  savePromptOverride,
} from '@/lib/ai/prompt-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  const overrides = await getPromptOverrides();
  const prompts = PROMPTS.map((p) => ({
    id: p.id,
    group: p.group,
    label: p.label,
    desc: p.desc,
    image: !!p.image,
    hasSystem: !!p.system, // fragment/ảnh không có system
    vars: p.vars,
    defaultSystem: p.system,
    defaultUser: defaultUserTemplate(p),
    overrideSystem: overrides[p.id]?.system ?? '',
    overrideUser: overrides[p.id]?.user ?? '',
  }));
  return NextResponse.json({ prompts });
}

const SaveSchema = z.object({
  id: z.string().min(1),
  system: z.string().max(20000).optional(),
  user: z.string().max(40000).optional(),
});

export async function POST(req: Request) {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  const parsed = SaveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ', code: 'errInvalidParams' }, { status: 400 });
  }
  if (!PROMPTS.some((p) => p.id === parsed.data.id)) {
    return NextResponse.json({ error: 'Prompt không tồn tại', code: 'errNotFound' }, { status: 404 });
  }
  await savePromptOverride(parsed.data.id, { system: parsed.data.system, user: parsed.data.user });
  return NextResponse.json({ ok: true });
}

// Khôi phục 1 prompt về mặc định (xóa bản tùy chỉnh).
export async function DELETE(req: Request) {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Thiếu id', code: 'errIdMissing' }, { status: 400 });
  await resetPromptOverride(id);
  return NextResponse.json({ ok: true });
}
