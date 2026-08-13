import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { runWithBiz } from '@/lib/biz/context';
import { deleteSocialPost, getSocialPostBatch, listSocialPosts } from '@/lib/store/social-posts';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const g = await guard('content:publish');
  if ('response' in g) return g.response;
  const id = new URL(req.url).searchParams.get('id');
  if (id) {
    const batch = await runWithBiz({ userId: g.user.id, bizId: g.bizId }, () => getSocialPostBatch(id));
    if (!batch.length) return NextResponse.json({ error: 'Khong tim thay bai cho duyet' }, { status: 404 });
    return NextResponse.json({ post: batch[0], posts: batch });
  }
  const posts = await runWithBiz({ userId: g.user.id, bizId: g.bizId }, () => listSocialPosts());
  return NextResponse.json({ posts });
}

export async function DELETE(req: Request) {
  const g = await guard('content:publish');
  if ('response' in g) return g.response;

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Thieu id' }, { status: 400 });

  await runWithBiz({ userId: g.user.id, bizId: g.bizId }, () => deleteSocialPost(id));
  const posts = await runWithBiz({ userId: g.user.id, bizId: g.bizId }, () => listSocialPosts());
  return NextResponse.json({ posts });
}
