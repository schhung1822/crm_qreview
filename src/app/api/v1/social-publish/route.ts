import { NextResponse } from 'next/server';
import { z } from 'zod';
import { bearerAuth } from '@/lib/auth/bearer';
import { runWithBiz } from '@/lib/biz/context';
import type { SocialProvider } from '@/lib/connection-providers';
import { assertPublicUrl } from '@/lib/security/ssrf';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { listConnections } from '@/lib/store/connections';
import { addSocialPosts, genSocialPostBatchId } from '@/lib/store/social-posts';

export const dynamic = 'force-dynamic';

const Schema = z.object({
  platform: z.union([z.string(), z.array(z.string())]).optional(),
  platforms: z.union([z.string(), z.array(z.string())]).optional(),
  connectionId: z.string().min(1).max(120).optional(),
  connectionIds: z.array(z.string().min(1).max(120)).max(20).optional(),
  text: z.string().min(1).max(10_000),
  title: z.string().max(300).optional(),
  mediaType: z.enum(['text', 'image', 'video']),
  mediaUrl: z.string().max(4000).optional(),
  mediaUrls: z.array(z.string().max(4000)).max(35).optional(),
  linkUrl: z.string().max(4000).optional(),
  privacy: z.enum(['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY']).optional(),
  imageProcessing: z.object({
    enabled: z.boolean().optional(),
    scale: z.number().min(1).max(1.5).optional(),
    barHeight: z.number().min(0).max(80).optional(),
    showLogo: z.boolean().optional(),
    logoUrl: z.string().max(4000).optional(),
  }).optional(),
});

const PLATFORM_ALIASES: Record<string, SocialProvider> = {
  fb: 'facebook',
  facebook: 'facebook',
  ig: 'instagram',
  instagram: 'instagram',
  th: 'threads',
  threads: 'threads',
  tk: 'tiktok',
  tiktok: 'tiktok',
  yt: 'youtube',
  youtube: 'youtube',
};

function allowedOrigins(): string[] {
  return (process.env.SOCIAL_PUBLISH_ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function requestOrigin(req: Request): string | null {
  const origin = req.headers.get('origin');
  if (origin) return origin.replace(/\/+$/, '');
  const referer = req.headers.get('referer');
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function corsHeaders(origin: string | null): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin || 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Vary': 'Origin',
  };
}

function domainAllowed(req: Request): { ok: true; origin: string } | { ok: false; response: NextResponse } {
  const origin = requestOrigin(req);
  const allowed = allowedOrigins();
  if (!origin || !allowed.includes(origin)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Domain khong duoc phep goi API dang mang xa hoi.',
          allowedEnv: 'SOCIAL_PUBLISH_ALLOWED_ORIGINS',
        },
        { status: 403, headers: corsHeaders(origin) },
      ),
    };
  }
  return { ok: true, origin };
}

function json(data: unknown, status: number, origin: string) {
  return NextResponse.json(data, { status, headers: corsHeaders(origin) });
}

function uniqueUrls(urls: Array<string | undefined>): string[] {
  return Array.from(new Set(urls.filter(Boolean).map((url) => url!.trim()).filter(Boolean)));
}

function splitPlatforms(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  return (value ?? '').split(/[\s,]+/);
}

function requestedProviders(input: z.infer<typeof Schema>): SocialProvider[] {
  const raw = [...splitPlatforms(input.platforms), ...splitPlatforms(input.platform)];
  return Array.from(new Set(raw.map((item) => PLATFORM_ALIASES[item.trim().toLowerCase()]).filter(Boolean)));
}

export async function OPTIONS(req: Request) {
  const origin = requestOrigin(req);
  if (!origin || !allowedOrigins().includes(origin)) {
    return new NextResponse(null, { status: 403, headers: corsHeaders(origin) });
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: Request) {
  const d = domainAllowed(req);
  if (!d.ok) return d.response;

  const a = await bearerAuth(req);
  if ('response' in a) {
    return json(await a.response.json().catch(() => ({ error: 'Unauthorized' })), a.response.status, d.origin);
  }
  const rl = rateLimit(`apiv1-social:${a.token.id}:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) return json({ error: `Qua nhieu yeu cau. Thu lai sau ${rl.retryAfter}s.` }, 429, d.origin);

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Tham so khong hop le', issues: parsed.error.flatten() }, 400, d.origin);

  const providers = requestedProviders(parsed.data);
  if (!providers.length) {
    return json({
      error: 'Vui long truyen platforms bang ten viet tat: fb, ig, th, tk, yt',
      aliases: { facebook: 'fb', instagram: 'ig', threads: 'th', tiktok: 'tk', youtube: 'yt' },
    }, 400, d.origin);
  }

  for (const url of [parsed.data.mediaUrl, ...(parsed.data.mediaUrls ?? []), parsed.data.linkUrl]) {
    if (!url) continue;
    if (!/^https?:\/\//i.test(url)) return json({ error: 'Anh, video va lien ket phai la URL http(s) cong khai' }, 400, d.origin);
    try {
      assertPublicUrl(url);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'URL khong hop le' }, 400, d.origin);
    }
  }

  const mediaUrls = parsed.data.mediaType === 'image'
    ? uniqueUrls([...(parsed.data.mediaUrls ?? []), parsed.data.mediaUrl])
    : parsed.data.mediaType === 'video' && parsed.data.mediaUrl
      ? [parsed.data.mediaUrl.trim()]
      : [];
  if (parsed.data.mediaType === 'image' && !mediaUrls.length) return json({ error: 'Vui long truyen it nhat mot URL anh' }, 400, d.origin);
  if (parsed.data.mediaType === 'video' && !mediaUrls.length) return json({ error: 'Vui long truyen URL video' }, 400, d.origin);

  const connections = await runWithBiz({ userId: a.token.createdBy, bizId: 'global' }, () => listConnections());
  const selectedConnections = providers.map((provider) => connections.find((item) => item.kind === 'social' && item.provider === provider)).filter(Boolean);
  const missingProviders = providers.filter((provider) => !selectedConnections.some((item) => item?.provider === provider));
  if (missingProviders.length) {
    return json({ error: `Chua co ket noi cho nen tang: ${missingProviders.join(', ')}` }, 404, d.origin);
  }

  const batchId = genSocialPostBatchId();
  const posts = await runWithBiz({ userId: a.token.createdBy, bizId: 'global' }, () =>
    addSocialPosts(selectedConnections.map((item) => ({
      batchId,
      connectionId: item!.id,
      provider: item!.provider as SocialProvider,
      connectionLabel: item!.label,
      title: parsed.data.title,
      text: parsed.data.text,
      mediaType: parsed.data.mediaType,
      mediaUrls,
      originalMediaUrls: parsed.data.mediaType === 'image' ? mediaUrls : undefined,
      linkUrl: parsed.data.linkUrl,
      status: 'pending_review',
      createdBy: a.token.createdBy,
      source: 'external_api',
    }))),
  );

  return json({
    status: 'pending_review',
    message: 'Da tao bai cho duyet. Nguoi dung can vao app de chinh sua/duyet truoc khi dang.',
    batchId,
    reviewUrl: `/social-publish?review=${encodeURIComponent(posts[0]?.id ?? '')}`,
    posts: posts.map((post) => ({
      id: post.id,
      connectionId: post.connectionId,
      platform: post.provider,
      label: post.connectionLabel,
      status: post.status,
    })),
  }, 202, d.origin);
}
