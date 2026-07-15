// Runner QUÉT BACKLINK: tải bài từ NHIỀU site đã kết nối → dò backlink đã có (cạnh) → gọi AI lọc
// cặp KHÁC SITE thật sự liên quan → sinh đề xuất backlink 2 chiều (kèm cụm neo có sẵn trong bài).
// Chạy nền trong runWithBiz (route fire-and-forget), poll tiến độ qua store. Server-only.
import type { ConnectionPublic } from '../store/connections';
import { adapterFromConnection } from '../store/connections';
import { suggestBacklinks } from '../ai/content';
import { insertContextualLink } from '../content/link-insert';
import { patchScan } from '../store/backlink';
import { BACKLINK_MIN_SCORE, type BacklinkEdge, type BacklinkNode, type BacklinkSuggestion } from './types';
import type { Locale } from '@/i18n/config';
import type { AiProviderId } from '../secrets/store';

const PER_SITE_CAP = 60; // tối đa bài lấy mỗi site (giữ sơ đồ đọc được + kiểm soát tải)
const AI_CAP = 50; // tối đa bài gửi AI 1 lần (kiểm soát token/độ trễ)
const EXCERPT_CHARS = 1200; // độ dài trích nội dung gửi AI (đủ để AI chọn cụm neo có trong bài)

function stripHtml(html: string): string {
  return (html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function hrefs(html: string): string[] {
  return [...(html || '').matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]);
}
// Chuẩn hóa URL để so cạnh: host+path viết thường, bỏ query/hash/"/" cuối. So được chéo site.
function normUrl(u: string): string {
  try {
    const x = new URL(u);
    return (x.host + x.pathname).toLowerCase().replace(/^www\./, '').replace(/\/+$/, '');
  } catch {
    return (u || '').split(/[?#]/)[0].toLowerCase().replace(/\/+$/, '');
  }
}

interface LoadedPost {
  node: BacklinkNode;
  html: string;
  text: string; // đã strip, cắt cho AI
}

// Tải bài từ mọi connection, cập nhật tiến độ. Trả danh sách bài + lỗi từng site.
async function loadAllPosts(
  scanId: string,
  connections: ConnectionPublic[],
): Promise<{ posts: LoadedPost[]; siteErrors: Array<{ connectionId: string; siteLabel: string; error: string }> }> {
  const posts: LoadedPost[] = [];
  const siteErrors: Array<{ connectionId: string; siteLabel: string; error: string }> = [];
  let sitesDone = 0;
  let postsFound = 0;

  for (const conn of connections) {
    try {
      const loaded = await adapterFromConnection(conn.id);
      if (!loaded) throw new Error('Không tải được kết nối');
      const list = await loaded.adapter.listPosts({ perPage: 100 });
      for (const p of list.slice(0, PER_SITE_CAP)) {
        const html = p.contentHtml ?? '';
        posts.push({
          node: {
            id: `${conn.id}::${p.id}`,
            connectionId: conn.id,
            siteLabel: conn.label,
            postId: p.id,
            title: p.title,
            url: p.url,
            inLinks: 0,
            outLinks: 0,
          },
          html,
          text: stripHtml(html).slice(0, EXCERPT_CHARS),
        });
        postsFound++;
      }
    } catch (err) {
      siteErrors.push({
        connectionId: conn.id,
        siteLabel: conn.label,
        error: err instanceof Error ? err.message : 'Lỗi tải bài',
      });
    }
    sitesDone++;
    await patchScan(scanId, { sitesDone, postsFound });
  }
  return { posts, siteErrors };
}

// Dò cạnh backlink ĐÃ CÓ: A → B khi trong HTML bài A có href trỏ tới URL bài B ở SITE KHÁC.
function detectEdges(posts: LoadedPost[]): BacklinkEdge[] {
  const byUrl = new Map<string, LoadedPost>();
  for (const p of posts) if (p.node.url) byUrl.set(normUrl(p.node.url), p);
  const edges: BacklinkEdge[] = [];
  const seen = new Set<string>();
  for (const a of posts) {
    for (const href of hrefs(a.html)) {
      const b = byUrl.get(normUrl(href));
      if (!b || b.node.id === a.node.id) continue;
      if (b.node.connectionId === a.node.connectionId) continue; // cùng site = internal, không tính
      const key = `${a.node.id}|${b.node.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: a.node.id, to: b.node.id });
    }
  }
  return edges;
}

export interface RunScanOptions {
  provider?: string;
  model?: string;
  locale?: string;
}

// Chạy toàn bộ quá trình quét cho 1 scanId đã tạo. Cập nhật store theo từng bước.
export async function runBacklinkScan(
  scanId: string,
  connections: ConnectionPublic[],
  opts: RunScanOptions = {},
): Promise<void> {
  try {
    await patchScan(scanId, { phase: 'fetching' });
    const { posts, siteErrors } = await loadAllPosts(scanId, connections);

    const edges = detectEdges(posts);
    // Bậc vào/ra để vẽ sơ đồ (kích thước điểm).
    const inDeg = new Map<string, number>();
    const outDeg = new Map<string, number>();
    for (const e of edges) {
      outDeg.set(e.from, (outDeg.get(e.from) ?? 0) + 1);
      inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
    }
    const nodes: BacklinkNode[] = posts.map((p) => ({
      ...p.node,
      inLinks: inDeg.get(p.node.id) ?? 0,
      outLinks: outDeg.get(p.node.id) ?? 0,
    }));

    await patchScan(scanId, { phase: 'analyzing', nodes, edges, siteErrors });

    // Cần ≥2 site có bài để có backlink chéo.
    const siteSet = new Set(posts.map((p) => p.node.connectionId));
    if (posts.length < 2 || siteSet.size < 2) {
      await patchScan(scanId, { phase: 'done', status: 'done', suggestions: [] });
      return;
    }

    // Gửi AI: cắt còn AI_CAP bài. Map chỉ số AI → bài thật.
    const aiPosts = posts.slice(0, AI_CAP);
    const r = await suggestBacklinks({
      posts: aiPosts.map((p) => ({ site: p.node.siteLabel, title: p.node.title, excerpt: p.text })),
      locale: (opts.locale || 'vi') as Locale,
      override: opts.provider
        ? { provider: opts.provider as AiProviderId, model: opts.model || undefined }
        : undefined,
    });

    if (!r.pairs) {
      const aiError = r.noKey
        ? 'Provider được chọn chưa có API key. Thêm key trong Cài đặt AI hoặc chọn provider khác.'
        : r.error ?? 'Lỗi gọi AI.';
      await patchScan(scanId, { phase: 'done', status: 'done', suggestions: [], aiError });
      return;
    }

    // Tập cạnh đã có (theo chiều) để bỏ chiều đã link.
    const edgeSet = new Set(edges.map((e) => `${e.from}|${e.to}`));
    const suggestions: BacklinkSuggestion[] = [];
    const perSource = new Map<string, number>();
    const seenPair = new Set<string>();

    for (const pr of r.pairs) {
      const a = aiPosts[pr.a];
      const b = aiPosts[pr.b];
      if (!a || !b || a.node.id === b.node.id) continue;
      if (a.node.connectionId === b.node.connectionId) continue; // BẮT BUỘC khác site
      if ((pr.score ?? 0) < BACKLINK_MIN_SCORE) continue; // chống đi link bừa
      const key = [a.node.id, b.node.id].sort().join('|');
      if (seenPair.has(key)) continue;
      // Bỏ nếu ĐÃ link đủ 2 chiều.
      if (edgeSet.has(`${a.node.id}|${b.node.id}`) && edgeSet.has(`${b.node.id}|${a.node.id}`)) continue;

      // Xác thực cụm neo THẬT SỰ chèn được vào bài (có trong văn bản, ngoài heading/link).
      const anchorA = pr.anchorA && insertContextualLink(a.html, pr.anchorA, 'https://x.example').inserted ? pr.anchorA : '';
      const anchorB = pr.anchorB && insertContextualLink(b.html, pr.anchorB, 'https://x.example').inserted ? pr.anchorB : '';
      if (!anchorA && !anchorB) continue; // không neo được chiều nào → bỏ (không đi link ép)

      if ((perSource.get(a.node.id) ?? 0) >= 3) continue; // tối đa 3 backlink/bài nguồn
      seenPair.add(key);
      perSource.set(a.node.id, (perSource.get(a.node.id) ?? 0) + 1);
      suggestions.push({
        id: `bl_${suggestions.length}_${a.node.postId}_${b.node.postId}`.replace(/[^a-zA-Z0-9_]/g, ''),
        aId: a.node.id,
        bId: b.node.id,
        score: Math.round(pr.score),
        reason: (pr.reason || '').slice(0, 200),
        anchorA,
        anchorB,
        status: 'suggested',
      });
    }

    await patchScan(scanId, { phase: 'done', status: 'done', suggestions, aiError: null });
  } catch (err) {
    await patchScan(scanId, {
      phase: 'error',
      status: 'error',
      error: err instanceof Error ? err.message : 'Lỗi quét backlink',
    });
  }
}
