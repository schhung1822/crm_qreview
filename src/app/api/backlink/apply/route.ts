import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { getScan, setSuggestionStatuses, updateSuggestion } from '@/lib/store/backlink';
import { processSuggestion } from '@/lib/backlink/apply';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BodySchema = z.object({
  action: z.enum(['apply', 'reject']).default('apply'),
  suggestionIds: z.array(z.string()).min(1),
  confirm: z.boolean().default(false), // chỉ dùng cho action 'apply'
});

// POST /api/backlink/apply
//  - action 'apply', confirm=false → PREVIEW: trả diff từng chiều, KHÔNG ghi CMS.
//  - action 'apply', confirm=true  → đi backlink thật (2 chiều), snapshot Revision trước khi ghi.
//  - action 'reject' → đánh dấu đề xuất bị bỏ (không đi link).
export async function POST(req: Request) {
  const g = await guard('content:publish');
  if ('response' in g) return g.response;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }
  const { action, suggestionIds, confirm } = parsed.data;

  const scan = await getScan();
  if (!scan) {
    return NextResponse.json({ error: 'Chưa có dữ liệu quét. Hãy quét backlink trước.' }, { status: 400 });
  }

  const idSet = new Set(suggestionIds);
  const targets = scan.suggestions.filter((s) => idSet.has(s.id));
  if (!targets.length) {
    return NextResponse.json({ error: 'Không tìm thấy đề xuất tương ứng.' }, { status: 404 });
  }

  if (action === 'reject') {
    for (const s of targets) await updateSuggestion(scan.id, s.id, { status: 'rejected' });
    return NextResponse.json({ ok: true, rejected: targets.map((s) => s.id) });
  }

  // apply (preview hoặc confirm)
  const results = [];
  for (const s of targets) {
    results.push(await processSuggestion(scan, s, confirm));
  }

  if (confirm) {
    const nowIso = new Date().toISOString();
    const updates = results
      .filter((r) => r.appliedCount > 0)
      .map((r) => ({ id: r.suggestionId, status: 'applied' as const, appliedAt: nowIso }));
    if (updates.length) await setSuggestionStatuses(scan.id, updates);
  }

  return NextResponse.json({ ok: true, confirm, results });
}
