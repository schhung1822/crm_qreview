// POST /api/plans/generate-bulk → xếp HÀNG ĐỢI tạo bài cho các mục của 1 Kế hoạch.
// Bỏ qua mục đã có bài (theo locale|target) để khỏi tốn quota tạo lại. Worker: /api/gen-jobs/run.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { listArticles } from '@/lib/store/articles';
import { createGenJobs } from '@/lib/store/gen-jobs';
import { getPlan } from '@/lib/store/plans';

export const dynamic = 'force-dynamic';

const Body = z.object({
  planId: z.string().min(1),
  targets: z.array(z.string()).optional(), // chỉ tạo cho các target này; vắng = tất cả mục
});

export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });

  const plan = await getPlan(parsed.data.planId);
  if (!plan) return NextResponse.json({ error: 'Không tìm thấy kế hoạch' }, { status: 404 });

  const wanted = parsed.data.targets
    ? new Set(parsed.data.targets.map((s) => s.trim().toLowerCase()))
    : null;
  const items = plan.items.filter((it) => !wanted || wanted.has(it.target.trim().toLowerCase()));

  const existing = new Set(
    (await listArticles())
      .filter((a) => a.targetKeyword)
      .map((a) => `${a.locale}|${a.targetKeyword!.trim().toLowerCase()}`),
  );
  const toDo = items.filter(
    (it) => !existing.has(`${plan.locale}|${it.target.trim().toLowerCase()}`),
  );

  const jobs = await createGenJobs(
    toDo.map((it) => ({
      planId: plan.id,
      title: it.title,
      targetKeyword: it.target,
      locale: plan.locale,
    })),
  );
  return NextResponse.json({ ok: true, queued: jobs.length, skipped: items.length - toDo.length });
}
