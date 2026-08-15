import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { runWithBiz } from '@/lib/biz/context';
import { isSocialProvider } from '@/lib/connection-providers';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  deleteSocialPost,
  getSocialPostBatch,
  listSocialPostPage,
  listSocialPostSources,
  NO_SOURCE_KEY,
  type SocialPostFilter,
} from '@/lib/store/social-posts';

export const dynamic = 'force-dynamic';

const STATUSES = ['pending_review', 'published', 'processing', 'failed'];

// Lọc + phân trang chạy Ở SERVER: trước đây route trả TOÀN BỘ lịch sử rồi để trình duyệt tự lọc.
function readFilter(url: URL): SocialPostFilter {
  const provider = url.searchParams.get('provider') || '';
  const status = url.searchParams.get('status') || '';
  const source = url.searchParams.get('source') || '';
  return {
    provider: isSocialProvider(provider) ? provider : undefined,
    status: STATUSES.includes(status) ? status : undefined,
    sourceKey: source === NO_SOURCE_KEY ? NO_SOURCE_KEY : source || undefined,
    search: (url.searchParams.get('q') || '').slice(0, 200) || undefined,
  };
}

function readNumber(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export async function GET(req: Request) {
  const g = await guard('content:publish');
  if ('response' in g) return g.response;
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (id) {
    const batch = await runWithBiz({ userId: g.user.id, bizId: g.bizId }, () => getSocialPostBatch(id));
    if (!batch.length) return NextResponse.json({ error: 'Khong tim thay bai cho duyet' }, { status: 404 });
    return NextResponse.json({ post: batch[0], posts: batch });
  }

  const limit = readNumber(url.searchParams.get('limit'), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const offset = readNumber(url.searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
  const { posts, totalBatches, sources, missingSource } = await runWithBiz(
    { userId: g.user.id, bizId: g.bizId },
    async () => {
      const [page, sourceList] = await Promise.all([
        listSocialPostPage(readFilter(url), limit, offset),
        listSocialPostSources(),
      ]);
      return { ...page, sources: sourceList.sources, missingSource: sourceList.missing };
    },
  );

  return NextResponse.json({ posts, totalBatches, limit, offset, sources, missingSource });
}

export async function DELETE(req: Request) {
  const g = await guard('content:publish');
  if ('response' in g) return g.response;

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Thieu id' }, { status: 400 });

  await runWithBiz({ userId: g.user.id, bizId: g.bizId }, () => deleteSocialPost(id));
  // Không trả lại toàn bộ danh sách nữa — client tự tải lại đúng trang đang xem.
  return NextResponse.json({ ok: true });
}
