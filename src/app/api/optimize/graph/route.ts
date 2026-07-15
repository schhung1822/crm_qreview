import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { suggestRelatedLinks } from '@/lib/ai/content';
import { titleTokens } from '@/lib/content/tokens';
import type { AiProviderId } from '@/lib/secrets/store';
import type { Locale } from '@/i18n/config';
import { adapterFromConnection } from '@/lib/store/connections';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  connectionId: z.string(),
  mode: z.enum(['recent', 'all', 'time', 'keyword']).optional(),
  after: z.string().optional(),
  before: z.string().optional(),
  search: z.string().optional(),
  // Bật gợi ý bằng AI (đọc nội dung). Khi tắt → dựng sơ đồ nhanh + gợi ý tạm theo tiêu đề.
  aiSuggest: z.boolean().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});

function hrefs(html: string): string[] {
  return [...(html || '').matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]);
}

// Bỏ thẻ HTML → văn bản thuần (để AI đọc nội dung, không lẫn markup).
function stripHtml(html: string): string {
  return (html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// POST /api/optimize/graph → quét bài + dựng mạng liên kết nội bộ + gợi ý internal link.
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }
  const { connectionId, mode, after, before, search, aiSuggest, provider, model } = parsed.data;

  // Chỉ chặn tần suất khi bật gợi ý AI (đọc nội dung nhiều bài → tốn token). Dựng sơ đồ thường thì không.
  if (aiSuggest) {
    const rl = rateLimit(`ai:${clientIp(req)}`, 20, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Quá nhiều yêu cầu AI. Thử lại sau ${rl.retryAfter}s.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      );
    }
  }

  const loaded = await adapterFromConnection(connectionId);
  if (!loaded) return NextResponse.json({ error: 'Không tìm thấy kết nối' }, { status: 404 });

  let posts;
  try {
    posts = await loaded.adapter.listPosts({
      all: mode === 'all',
      perPage: 100,
      search: search || undefined,
      after: after ? new Date(after).toISOString() : undefined,
      before: before ? new Date(`${before}T23:59:59`).toISOString() : undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi tải bài' },
      { status: 502 },
    );
  }

  // Giới hạn để sơ đồ còn đọc được + tránh tính nặng.
  const list = posts.slice(0, 120).map((p) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    url: p.url,
    html: p.contentHtml ?? '',
  }));

  const bySlug = new Map(list.map((p) => [p.slug, p]));

  // Cạnh liên kết: A → B nếu trong bài A có href trỏ tới slug/url của B.
  // BỎ query string (?utm_source=...) và trailing slash trước khi so → bắt đúng cả
  // link vừa chèn có kèm utm.
  const stripUrl = (u: string) => u.split(/[?#]/)[0].replace(/\/+$/, '');
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const edges: Array<{ from: string; to: string }> = [];
  const linkedPairs = new Set<string>(); // "from|to"
  for (const a of list) {
    const links = hrefs(a.html).map(stripUrl);
    const targets = new Set<string>();
    for (const href of links) {
      for (const b of list) {
        if (b.id === a.id) continue;
        const cleanUrl = b.url ? stripUrl(b.url) : '';
        const urlHit = !!cleanUrl && (href === cleanUrl || href.endsWith(cleanUrl));
        const slugHit = !!b.slug && new RegExp(`/${escapeRe(b.slug)}(/|$)`).test(href);
        if (urlHit || slugHit) targets.add(b.id);
      }
    }
    for (const to of targets) {
      edges.push({ from: a.id, to });
      linkedPairs.add(`${a.id}|${to}`);
    }
  }

  // Gợi ý internal link. Mặc định (dựng sơ đồ) → gợi ý nhanh theo từ khóa tiêu đề.
  // Khi người dùng bấm "Chạy gợi ý bằng AI" (aiSuggest=true) → AI đọc NỘI DUNG bài.
  const suggestions: Array<{ from: string; to: string; reason: string }> = [];
  let suggestBy: 'ai' | 'keyword' = 'keyword';
  let aiError: string | null = null;

  // Fallback theo từ khóa tiêu đề (cũng dùng khi AI lỗi để vẫn có gợi ý tạm).
  const keywordSuggest = () => {
    const tok = new Map(list.map((p) => [p.id, new Set(titleTokens(p.title))]));
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const ta = tok.get(a.id)!;
      const cands: Array<{ to: string; shared: string[]; score: number }> = [];
      for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        const b = list[j];
        const tb = tok.get(b.id)!;
        const shared = [...ta].filter((w) => tb.has(w));
        if (shared.length < 2) continue;
        if (linkedPairs.has(`${a.id}|${b.id}`)) continue; // đã link rồi
        cands.push({ to: b.id, shared, score: shared.length });
      }
      cands.sort((x, y) => y.score - x.score);
      for (const c of cands.slice(0, 3)) {
        suggestions.push({ from: a.id, to: c.to, reason: c.shared.slice(0, 4).join(', ') });
      }
    }
  };

  if (aiSuggest) {
    // Giới hạn số bài gửi AI để kiểm soát token/độ trễ; ưu tiên theo thứ tự quét.
    const aiCap = list.slice(0, 60);
    const r = await suggestRelatedLinks({
      posts: aiCap.map((p) => ({ title: p.title, excerpt: stripHtml(p.html).slice(0, 400) })),
      locale: (loaded.record.locale || 'vi') as Locale,
      override: provider ? { provider: provider as AiProviderId, model: model || undefined } : undefined,
    });
    if (r.pairs) {
      suggestBy = 'ai';
      const perFrom = new Map<string, number>();
      const seenPair = new Set<string>();
      for (const pr of r.pairs) {
        const a = aiCap[pr.from];
        const b = aiCap[pr.to];
        if (!a || !b || a.id === b.id) continue;
        const key = `${a.id}|${b.id}`;
        if (seenPair.has(key)) continue;
        if (linkedPairs.has(key)) continue; // đã link rồi
        if ((perFrom.get(a.id) ?? 0) >= 3) continue; // tối đa 3 gợi ý / bài nguồn
        seenPair.add(key);
        perFrom.set(a.id, (perFrom.get(a.id) ?? 0) + 1);
        suggestions.push({ from: a.id, to: b.id, reason: (pr.reason || '').slice(0, 160) });
      }
    } else {
      // AI không chạy được → báo lý do thật + vẫn đưa gợi ý tạm theo tiêu đề.
      aiError = r.noKey
        ? 'Provider được chọn chưa có API key. Thêm key trong Cài đặt AI hoặc chọn provider khác.'
        : r.error ?? 'Lỗi gọi AI.';
      keywordSuggest();
    }
  } else {
    keywordSuggest();
  }

  const inDeg = new Map<string, number>();
  const outDeg = new Map<string, number>();
  for (const e of edges) {
    outDeg.set(e.from, (outDeg.get(e.from) ?? 0) + 1);
    inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
  }

  const nodes = list.map((p) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    url: p.url,
    outLinks: outDeg.get(p.id) ?? 0,
    inLinks: inDeg.get(p.id) ?? 0,
  }));

  return NextResponse.json({
    nodes,
    edges,
    suggestions,
    suggestBy,
    aiError,
    total: posts.length,
    shown: list.length,
  });
}
