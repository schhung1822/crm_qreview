import { NextResponse } from 'next/server';
import { z } from 'zod';
import { bearerAuth } from '@/lib/auth/bearer';
import { runWithBiz } from '@/lib/biz/context';
import { isSocialProvider, type SocialProvider } from '@/lib/connection-providers';
import { assertPublicUrl } from '@/lib/security/ssrf';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { graphPermissionMessage, publishSocial } from '@/lib/social-publishing';
import { processSocialImageUrls } from '@/lib/social-publishing/image-processing';
import { getConnectionCreds, setConnectionStatus } from '@/lib/store/connections';
import { addSocialPosts } from '@/lib/store/social-posts';

export const dynamic = 'force-dynamic';

const Schema = z.object({
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

function providerErrorMessage(provider: string, message: string): string {
  const lower = message.toLowerCase();
  if (provider === 'instagram' && lower.includes('aspect ratio')) {
    return 'Instagram khong nhan ty le anh nay. Hay dung anh trong khoang 4:5 den 1.91:1, vi du 1080x1080, 1080x1350 hoac 1080x566.';
  }
  return graphPermissionMessage(provider, message);
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

  const connectionIds = Array.from(
    new Set([...(parsed.data.connectionIds ?? []), parsed.data.connectionId].filter(Boolean)),
  ) as string[];
  if (!connectionIds.length) return json({ error: 'Vui long truyen connectionId hoac connectionIds' }, 400, d.origin);

  for (const url of [parsed.data.mediaUrl, ...(parsed.data.mediaUrls ?? []), parsed.data.linkUrl]) {
    if (!url) continue;
    if (!/^https?:\/\//i.test(url)) return json({ error: 'Anh, video va lien ket phai la URL http(s) cong khai' }, 400, d.origin);
    try {
      assertPublicUrl(url);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'URL khong hop le' }, 400, d.origin);
    }
  }

  const originalMediaUrls = parsed.data.mediaType === 'image'
    ? uniqueUrls([...(parsed.data.mediaUrls ?? []), parsed.data.mediaUrl])
    : parsed.data.mediaType === 'video' && parsed.data.mediaUrl
      ? [parsed.data.mediaUrl.trim()]
      : [];
  const publishInput = { ...parsed.data };
  if (parsed.data.mediaType === 'image') {
    if (!originalMediaUrls.length) return json({ error: 'Vui long truyen it nhat mot URL anh' }, 400, d.origin);
    if (parsed.data.imageProcessing?.enabled === false) {
      publishInput.mediaUrl = originalMediaUrls[0];
      publishInput.mediaUrls = originalMediaUrls;
    } else {
      try {
        const processedUrls = await processSocialImageUrls(
          originalMediaUrls,
          req,
          parsed.data.title || 'external-social-image',
          parsed.data.imageProcessing,
        );
        publishInput.mediaUrl = processedUrls[0];
        publishInput.mediaUrls = processedUrls;
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Khong the xu ly anh truoc khi dang' }, 502, d.origin);
      }
    }
  }

  const loadedConnections = await runWithBiz({ userId: a.token.createdBy, bizId: 'global' }, () =>
    Promise.all(connectionIds.map((id) => getConnectionCreds(id).then((loaded) => ({ id, loaded })))),
  );
  const missing = loadedConnections.find((item) => !item.loaded);
  if (missing) return json({ error: `Khong tim thay ket noi ${missing.id}` }, 404, d.origin);
  const socialConnections = loadedConnections.map((item) => item.loaded!);
  const invalid = socialConnections.find((item) => !isSocialProvider(item.record.provider));
  if (invalid) return json({ error: `Ket noi ${invalid.record.label} khong phai mang xa hoi` }, 400, d.origin);

  const results = await Promise.all(
    socialConnections.map(async (loaded) => {
      try {
        const result = await publishSocial(loaded.record.provider as SocialProvider, loaded.credentials, publishInput);
        await runWithBiz({ userId: a.token.createdBy, bizId: 'global' }, () => setConnectionStatus(loaded.record.id, 'active'));
        return { connectionId: loaded.record.id, provider: loaded.record.provider, label: loaded.record.label, ok: true, result };
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : 'Khong the dang noi dung';
        return {
          connectionId: loaded.record.id,
          provider: loaded.record.provider,
          label: loaded.record.label,
          ok: false,
          error: providerErrorMessage(loaded.record.provider, rawMessage),
        };
      }
    }),
  );

  const finalMediaUrls = parsed.data.mediaType === 'image'
    ? publishInput.mediaUrls ?? []
    : parsed.data.mediaType === 'video' && publishInput.mediaUrl
      ? [publishInput.mediaUrl]
      : [];
  await runWithBiz({ userId: a.token.createdBy, bizId: 'global' }, () =>
    addSocialPosts(results.map((item) => ({
      connectionId: item.connectionId,
      provider: item.provider as SocialProvider,
      connectionLabel: item.label,
      title: parsed.data.title,
      text: parsed.data.text,
      mediaType: parsed.data.mediaType,
      mediaUrls: finalMediaUrls,
      originalMediaUrls,
      linkUrl: parsed.data.linkUrl,
      providerPostId: item.ok ? item.result?.id : undefined,
      publishedUrl: item.ok ? item.result?.url : undefined,
      status: item.ok ? item.result?.status ?? 'published' : 'failed',
      error: item.ok ? undefined : item.error,
      createdBy: a.token.createdBy,
    }))),
  ).catch((error) => {
    console.error('[api/v1/social-publish] save history failed:', error instanceof Error ? error.message : error);
  });

  const successCount = results.filter((item) => item.ok).length;
  if (!successCount) return json({ error: results[0]?.error || 'Khong the dang noi dung', results }, 502, d.origin);

  return json({
    published: results.every((item) => item.ok && item.result?.status === 'published'),
    partial: successCount < results.length,
    results,
  }, 200, d.origin);
}
