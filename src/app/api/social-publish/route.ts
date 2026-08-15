import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { runWithBiz } from '@/lib/biz/context';
import { isSocialProvider, type SocialProvider } from '@/lib/connection-providers';
import { assertPublicUrl } from '@/lib/security/ssrf';
import { processSocialImageUrls } from '@/lib/social-publishing/image-processing';
import { graphPermissionMessage, publishSocial } from '@/lib/social-publishing';
import { getConnectionCreds, setConnectionStatus } from '@/lib/store/connections';
import { addSocialPosts, deleteSocialPost } from '@/lib/store/social-posts';
import { recordUserEvent } from '@/lib/tracking/events';
import { eventContext } from '@/lib/tracking/request';

export const dynamic = 'force-dynamic';

const Schema = z.object({
  connectionId: z.string().min(1).max(120).optional(),
  connectionIds: z.array(z.string().min(1).max(120)).max(20).optional(),
  text: z.string().max(10_000).default(''),
  title: z.string().max(300).optional(),
  mediaType: z.enum(['text', 'image', 'video']),
  mediaUrl: z.string().max(4000).optional(),
  mediaUrls: z.array(z.string().max(4000)).max(35).optional(),
  reviewPostIds: z.array(z.string().min(1).max(80)).max(35).optional(),
  linkUrl: z.string().max(4000).optional(),
  privacy: z.enum(['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY']).optional(),
  imageProcessing: z.object({
    enabled: z.boolean().optional(),
    cropSquare: z.boolean().optional(),
    scale: z.number().min(1).max(1.5).optional(),
    barColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    barHeight: z.number().min(0).max(320).optional(),
    showLogo: z.boolean().optional(),
    logoUrl: z.string().max(4000).optional(),
  }).optional(),
});

function providerErrorMessage(provider: string, message: string): string {
  const lower = message.toLowerCase();
  if (provider === 'instagram' && lower.includes('aspect ratio')) {
    return 'Instagram không nhận tỷ lệ ảnh này. Hãy dùng ảnh trong khoảng 4:5 đến 1.91:1, ví dụ 1080x1080, 1080x1350 hoặc 1080x566.';
  }
  return message;
}

function uniqueUrls(urls: Array<string | undefined>): string[] {
  return Array.from(new Set(urls.filter(Boolean).map((url) => url!.trim()).filter(Boolean)));
}

export async function POST(req: Request) {
  const g = await guard('content:publish');
  if ('response' in g) return g.response;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Nội dung gửi lên không hợp lệ' }, { status: 400 });

  const connectionIds = Array.from(
    new Set([...(parsed.data.connectionIds ?? []), parsed.data.connectionId].filter(Boolean)),
  ) as string[];
  if (connectionIds.length === 0) {
    return NextResponse.json({ error: 'Vui lòng chọn ít nhất một kết nối mạng xã hội' }, { status: 400 });
  }

  for (const url of [parsed.data.mediaUrl, ...(parsed.data.mediaUrls ?? []), parsed.data.linkUrl]) {
    if (!url) continue;
    if (!/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: 'Ảnh, video và liên kết phải dùng URL http(s) công khai' }, { status: 400 });
    }
    try {
      assertPublicUrl(url);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'URL không hợp lệ' }, { status: 400 });
    }
  }
  const originalMediaUrls = parsed.data.mediaType === 'image'
    ? uniqueUrls([...(parsed.data.mediaUrls ?? []), parsed.data.mediaUrl])
    : parsed.data.mediaType === 'video' && parsed.data.mediaUrl
      ? [parsed.data.mediaUrl.trim()]
      : [];
  const publishInput = { ...parsed.data };
  if (parsed.data.mediaType === 'image') {
    const rawImageUrls = originalMediaUrls;
    if (rawImageUrls.length === 0) {
      return NextResponse.json({ error: 'Vui lòng nhập ít nhất một URL ảnh' }, { status: 400 });
    }
    if (parsed.data.imageProcessing?.enabled === false) {
      publishInput.mediaUrl = rawImageUrls[0];
      publishInput.mediaUrls = rawImageUrls;
    } else {
      try {
        const processedUrls = await processSocialImageUrls(rawImageUrls, req, parsed.data.title || 'social-image', parsed.data.imageProcessing);
        publishInput.mediaUrl = processedUrls[0];
        publishInput.mediaUrls = processedUrls;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Không thể xử lý ảnh trước khi đăng';
        return NextResponse.json({ error: message }, { status: 502 });
      }
    }
  }

  const loadedConnections = await runWithBiz({ userId: g.user.id, bizId: g.bizId }, () =>
    Promise.all(connectionIds.map((id) => getConnectionCreds(id).then((loaded) => ({ id, loaded })))),
  );
  const missing = loadedConnections.find((item) => !item.loaded);
  if (missing) return NextResponse.json({ error: `Không tìm thấy kết nối ${missing.id}` }, { status: 404 });
  const socialConnections = loadedConnections.map((item) => item.loaded!);
  const invalid = socialConnections.find((item) => !isSocialProvider(item.record.provider));
  if (invalid) {
    return NextResponse.json({ error: `Kết nối ${invalid.record.label} không phải mạng xã hội` }, { status: 400 });
  }

  const eventBase = eventContext(req, { userId: g.user.id, bizId: g.bizId });
  const results = await Promise.all(
    socialConnections.map(async (loaded) => {
      try {
        const result = await publishSocial(loaded.record.provider as SocialProvider, loaded.credentials, publishInput);
        await runWithBiz({ userId: g.user.id, bizId: g.bizId }, () => setConnectionStatus(loaded.record.id, 'active'));
        recordUserEvent({
          eventName: 'social_publish',
          eventType: 'conversion',
          area: 'social-publish',
          entityType: loaded.record.provider,
          entityId: result.id,
          success: true,
          metadata: { connectionId: loaded.record.id, mediaType: parsed.data.mediaType, status: result.status },
          ...eventBase,
        });
        return {
          connectionId: loaded.record.id,
          provider: loaded.record.provider,
          label: loaded.record.label,
          ok: true,
          result,
        };
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : 'Không thể đăng nội dung';
        const message = providerErrorMessage(loaded.record.provider, graphPermissionMessage(loaded.record.provider, rawMessage));
        recordUserEvent({
          eventName: 'social_publish',
          eventType: 'conversion',
          area: 'social-publish',
          entityType: loaded.record.provider,
          success: false,
          errorCode: 'provider_error',
          metadata: { connectionId: loaded.record.id, mediaType: parsed.data.mediaType },
          ...eventBase,
        });
        return {
          connectionId: loaded.record.id,
          provider: loaded.record.provider,
          label: loaded.record.label,
          ok: false,
          error: message,
        };
      }
    }),
  );

  const successCount = results.filter((item) => item.ok).length;
  const failedCount = results.length - successCount;
  const finalMediaUrls = parsed.data.mediaType === 'image'
    ? publishInput.mediaUrls ?? []
    : parsed.data.mediaType === 'video' && publishInput.mediaUrl
      ? [publishInput.mediaUrl]
      : [];
  await runWithBiz({ userId: g.user.id, bizId: g.bizId }, () =>
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
      createdBy: g.user.id,
    }))),
  ).catch((error) => {
    console.error('[social-posts] save history failed:', error instanceof Error ? error.message : error);
  });
  if (successCount === 0) {
    return NextResponse.json({ error: results[0]?.error || 'Không thể đăng nội dung', results }, { status: 502 });
  }

  if (parsed.data.reviewPostIds?.length) {
    await runWithBiz({ userId: g.user.id, bizId: g.bizId }, async () => {
      for (const id of parsed.data.reviewPostIds ?? []) await deleteSocialPost(id);
    }).catch((error) => {
      console.error('[social-posts] cleanup reviewed drafts failed:', error instanceof Error ? error.message : error);
    });
  }

  return NextResponse.json({
    published: failedCount === 0 && results.every((item) => item.ok && item.result?.status === 'published'),
    partial: failedCount > 0,
    results,
    result: results.find((item) => item.ok)?.result,
  });
}
