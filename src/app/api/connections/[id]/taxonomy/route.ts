import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { adapterFromConnection } from '@/lib/store/connections';

export const dynamic = 'force-dynamic';

// GET /api/connections/[id]/taxonomy → categories + tags có sẵn trên site (WordPress).
// CMS không hỗ trợ (Wix/Shopify) → trả mảng rỗng + supported:false.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  const loaded = await adapterFromConnection(params.id);
  if (!loaded) {
    return NextResponse.json({ error: 'Không tìm thấy kết nối' }, { status: 404 });
  }

  const { adapter } = loaded;
  if (!adapter.listCategories || !adapter.listTags) {
    return NextResponse.json({ supported: false, categories: [], tags: [] });
  }

  try {
    const [categories, tags] = await Promise.all([adapter.listCategories(), adapter.listTags()]);
    return NextResponse.json({ supported: true, categories, tags });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi tải taxonomy', categories: [], tags: [] },
      { status: 502 },
    );
  }
}
