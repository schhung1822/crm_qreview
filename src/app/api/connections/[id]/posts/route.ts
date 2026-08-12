import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { adapterFromConnection, setConnectionStatus } from '@/lib/store/connections';

export const dynamic = 'force-dynamic';

// GET /api/connections/[id]/posts?search=&perPage= → list bài thật từ CMS để import.
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  const loaded = await adapterFromConnection(params.id);
  if (!loaded) {
    return NextResponse.json({ error: 'Không tìm thấy kết nối' }, { status: 404 });
  }
  const url = new URL(req.url);
  const mode = url.searchParams.get('mode'); // all | recent | search | range
  const after = url.searchParams.get('after');
  const before = url.searchParams.get('before');
  // Kẹp perPage trong [1,100], NaN → 50 (chống giá trị rác/khổng lồ gửi xuống CMS).
  const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get('perPage')) || 50));
  try {
    const posts = await loaded.adapter.listPosts({
      search: url.searchParams.get('search') ?? undefined,
      perPage,
      all: mode === 'all',
      after: after ? new Date(after).toISOString() : undefined,
      before: before ? new Date(`${before}T23:59:59`).toISOString() : undefined,
      // Danh sách quét chỉ cần id/tiêu đề/slug/ngày → lấy field NHẸ, tránh timeout do content nặng.
      summary: true,
    });
    await setConnectionStatus(params.id, 'active');
    return NextResponse.json({ posts });
  } catch (err) {
    await setConnectionStatus(params.id, 'error');
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi tải bài' },
      { status: 502 },
    );
  }
}
