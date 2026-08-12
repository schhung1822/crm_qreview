import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { runWithBiz } from '@/lib/biz/context';
import { isSocialProvider } from '@/lib/connection-providers';
import { assertPublicUrl } from '@/lib/security/ssrf';
import { publishSocial } from '@/lib/social-publishing';
import { getConnectionCreds, setConnectionStatus } from '@/lib/store/connections';
import { recordUserEvent } from '@/lib/tracking/events';
import { eventContext } from '@/lib/tracking/request';

export const dynamic = 'force-dynamic';

const Schema = z.object({
  connectionId: z.string().min(1).max(120),
  text: z.string().max(10_000).default(''),
  title: z.string().max(300).optional(),
  mediaType: z.enum(['text', 'image', 'video']),
  mediaUrl: z.string().max(4000).optional(),
  linkUrl: z.string().max(4000).optional(),
  privacy: z.enum(['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY']).optional(),
});

export async function POST(req: Request) {
  const g = await guard('content:publish');
  if ('response' in g) return g.response;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Nội dung gửi lên không hợp lệ' }, { status: 400 });

  for (const url of [parsed.data.mediaUrl, parsed.data.linkUrl]) {
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

  const loaded = await runWithBiz({ userId: g.user.id, bizId: g.bizId }, () => getConnectionCreds(parsed.data.connectionId));
  if (!loaded) return NextResponse.json({ error: 'Không tìm thấy kết nối' }, { status: 404 });
  if (!isSocialProvider(loaded.record.provider)) {
    return NextResponse.json({ error: 'Kết nối đã chọn không phải mạng xã hội' }, { status: 400 });
  }

  try {
    const result = await publishSocial(loaded.record.provider, loaded.credentials, parsed.data);
    await runWithBiz({ userId: g.user.id, bizId: g.bizId }, () => setConnectionStatus(loaded.record.id, 'active'));
    recordUserEvent({
      eventName: 'social_publish',
      eventType: 'conversion',
      area: 'social-publish',
      entityType: loaded.record.provider,
      entityId: result.id,
      success: true,
      metadata: { connectionId: loaded.record.id, mediaType: parsed.data.mediaType, status: result.status },
      ...eventContext(req, { userId: g.user.id, bizId: g.bizId }),
    });
    return NextResponse.json({ published: result.status === 'published', result });
  } catch (error) {
    await runWithBiz({ userId: g.user.id, bizId: g.bizId }, () => setConnectionStatus(loaded.record.id, 'error')).catch(() => {});
    const message = error instanceof Error ? error.message : 'Không thể đăng nội dung';
    recordUserEvent({
      eventName: 'social_publish',
      eventType: 'conversion',
      area: 'social-publish',
      entityType: loaded.record.provider,
      success: false,
      errorCode: 'provider_error',
      metadata: { connectionId: loaded.record.id, mediaType: parsed.data.mediaType },
      ...eventContext(req, { userId: g.user.id, bizId: g.bizId }),
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
