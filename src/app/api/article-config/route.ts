import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { getArticleConfig, saveArticleConfig } from '@/lib/store/article-config';

export const dynamic = 'force-dynamic';

// GET /api/article-config → cấu hình bài viết (quy tắc thay thế).
export async function GET() {
  const g = await guard();
  if ('response' in g) return g.response;
  return NextResponse.json(await getArticleConfig());
}

const RuleSchema = z.object({
  from: z.string().max(200),
  to: z.string().max(200),
  wholeWord: z.boolean().optional(),
  caseSensitive: z.boolean().optional(),
});

const JsonLdSchema = z.object({
  enabled: z.boolean().optional(),
  organizationName: z.string().max(200).optional(),
  authorName: z.string().max(200).optional(),
  logoUrl: z.string().max(2000).optional(),
});

const BodySchema = z.object({
  replacements: z.array(RuleSchema).max(200).optional(),
  pipelineEnabled: z.boolean().optional(),
  jsonLd: JsonLdSchema.optional(),
  // Trần token đầu ra: 0 = tự động; ngược lại store tự kẹp về [2000, 16000].
  maxTokens: z.number().int().min(0).max(100000).optional(),
});

// POST /api/article-config → lưu cấu hình bài viết (quy tắc thay thế, bật/tắt quy trình).
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }
  const patch: Parameters<typeof saveArticleConfig>[0] = {};
  if (parsed.data.replacements) {
    patch.replacements = parsed.data.replacements.filter((r) => r.from.trim());
  }
  if (parsed.data.pipelineEnabled !== undefined) patch.pipelineEnabled = parsed.data.pipelineEnabled;
  if (parsed.data.jsonLd !== undefined) {
    patch.jsonLd = { enabled: true, ...parsed.data.jsonLd };
  }
  if (parsed.data.maxTokens !== undefined) patch.maxTokens = parsed.data.maxTokens;
  return NextResponse.json(await saveArticleConfig(patch));
}
