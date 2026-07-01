import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { adapterFromConnection } from '@/lib/store/connections';

export const dynamic = 'force-dynamic';

// GET /api/connections/[id]/resolve?url=... → tìm id bài trên CMS theo URL (để audit mở
// đúng bài cần sửa). Trả { postId } hoặc { postId: null }.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  const url = new URL(req.url).searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'thiếu url' }, { status: 400 });

  const loaded = await adapterFromConnection(params.id);
  if (!loaded) return NextResponse.json({ error: 'Không tìm thấy kết nối' }, { status: 404 });
  if (!loaded.adapter.findPostByUrl) return NextResponse.json({ postId: null });

  try {
    const postId = await loaded.adapter.findPostByUrl(url);
    return NextResponse.json({ postId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi tra cứu' },
      { status: 502 },
    );
  }
}
