import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { deleteKeywordSet, getKeywordSet, listKeywordSets } from '@/lib/store/keywordsets';

export const dynamic = 'force-dynamic';

// GET /api/keywordsets        → danh sách project từ khóa (rút gọn)
// GET /api/keywordsets?id=... → chi tiết 1 project (đầy đủ keywords)
export async function GET(req: Request) {
  const g = await guard();
  if ('response' in g) return g.response;

  const id = new URL(req.url).searchParams.get('id');
  if (id) {
    const set = await getKeywordSet(id);
    if (!set) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    return NextResponse.json({ keywordSet: set });
  }

  const sets = await listKeywordSets();
  return NextResponse.json({
    keywordSets: sets.map((s) => ({
      id: s.id,
      seed: s.seed,
      locale: s.locale,
      count: s.keywords.length,
      estimated: s.estimated,
      createdAt: s.createdAt,
    })),
  });
}

// DELETE /api/keywordsets?id=... → xóa bộ từ khóa (cần content:write).
export async function DELETE(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'thiếu id' }, { status: 400 });
  await deleteKeywordSet(id);
  return NextResponse.json({ ok: true });
}
