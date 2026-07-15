// Áp dụng BACKLINK: với mỗi đề xuất, đi link 2 CHIỀU (A→B và B→A) — chèn cụm neo vào GIỮA nội dung
// bài nguồn, gắn utm_source theo domain site nguồn, snapshot Revision TRƯỚC khi ghi (rollback được).
// Hỗ trợ preview (chỉ tính diff, không ghi) và confirm (ghi thật). Bỏ qua an toàn khi: không đọc
// được nội dung (vd Wix), không tìm được cụm neo, hoặc link đã tồn tại. Server-only.
import { adapterFromConnection, setConnectionStatus } from '../store/connections';
import { saveRevision } from '../store/revisions';
import { diffWords, type DiffSeg } from '../content/diff';
import { insertContextualLink } from '../content/link-insert';
import { safeUrl, utmHost, withUtm } from '../content/utm';
import type { BacklinkNode, BacklinkScan, BacklinkSuggestion } from './types';

export type DirectionSkip =
  | 'no-anchor'
  | 'no-content'
  | 'no-connection'
  | 'bad-target-url'
  | 'already-linked'
  | 'anchor-not-found';

export interface DirectionResult {
  direction: 'a2b' | 'b2a';
  sourceLabel: string;
  targetLabel: string;
  targetTitle: string;
  anchor: string;
  targetUrl?: string;
  applied: boolean;
  skipped?: DirectionSkip;
  diff?: DiffSeg[]; // chỉ ở preview
  error?: string;
}

export interface SuggestionResult {
  suggestionId: string;
  directions: DirectionResult[];
  appliedCount: number;
}

function normUrl(u: string): string {
  try {
    const x = new URL(u);
    return (x.host + x.pathname).toLowerCase().replace(/^www\./, '').replace(/\/+$/, '');
  } catch {
    return (u || '').split(/[?#]/)[0].toLowerCase().replace(/\/+$/, '');
  }
}
function htmlLinksTo(html: string, targetUrl: string): boolean {
  const target = normUrl(targetUrl);
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    if (normUrl(m[1]) === target) return true;
  }
  return false;
}

// Thử lại nhẹ khi CMS trả 429/5xx (chưa có backoff sẵn ở lớp CMS). 3 lần, chờ tăng dần.
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      const retryable = /\b(429|500|502|503|504|rate|timeout| etimedout|econnreset)\b/i.test(msg);
      if (!retryable || attempt === 2) break;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`${label} thất bại`);
}

const nodeById = (scan: BacklinkScan, id: string): BacklinkNode | undefined =>
  scan.nodes.find((n) => n.id === id);

// Xử lý 1 chiều: chèn link từ bài NGUỒN sang bài ĐÍCH. confirm=false → chỉ trả diff.
async function runDirection(
  direction: 'a2b' | 'b2a',
  source: BacklinkNode,
  target: BacklinkNode,
  anchor: string,
  confirm: boolean,
): Promise<DirectionResult> {
  const base: DirectionResult = {
    direction,
    sourceLabel: source.siteLabel,
    targetLabel: target.siteLabel,
    targetTitle: target.title,
    anchor,
    applied: false,
  };
  if (!anchor) return { ...base, skipped: 'no-anchor' };

  const targetSafe = target.url ? safeUrl(target.url) : null;
  if (!targetSafe) return { ...base, skipped: 'bad-target-url' };

  try {
    const loaded = await adapterFromConnection(source.connectionId);
    if (!loaded) return { ...base, skipped: 'no-connection' };

    const post = await withRetry(() => loaded.adapter.getPost(source.postId), 'getPost');
    const html = post.contentHtml ?? '';
    if (!html) return { ...base, skipped: 'no-content' }; // vd Wix không trả nội dung → không chèn ép

    const utmSite = utmHost(loaded.record.baseUrl);
    const targetUrl = withUtm(targetSafe, utmSite);
    if (htmlLinksTo(html, targetSafe)) return { ...base, targetUrl, skipped: 'already-linked' };

    const ins = insertContextualLink(html, anchor, targetUrl);
    if (!ins.inserted) return { ...base, targetUrl, skipped: 'anchor-not-found' };

    if (!confirm) {
      return { ...base, targetUrl, applied: false, diff: diffWords(html, ins.html) };
    }

    // Snapshot TRƯỚC khi ghi (rollback), rồi cập nhật bài.
    await saveRevision({
      connectionId: source.connectionId,
      cmsPostId: source.postId,
      title: post.title,
      contentHtml: html,
      metaDescription: post.metaDescription ?? post.excerpt,
      snapshotOk: !!html,
      reason: 'pre-backlink',
    });
    await withRetry(() => loaded.adapter.updatePost(source.postId, { contentHtml: ins.html }), 'updatePost');
    return { ...base, targetUrl, applied: true };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : 'lỗi' };
  }
}

// Áp dụng (hoặc preview) 1 đề xuất: cả 2 chiều A↔B.
export async function processSuggestion(
  scan: BacklinkScan,
  s: BacklinkSuggestion,
  confirm: boolean,
): Promise<SuggestionResult> {
  const a = nodeById(scan, s.aId);
  const b = nodeById(scan, s.bId);
  const directions: DirectionResult[] = [];
  if (a && b) {
    directions.push(await runDirection('a2b', a, b, s.anchorA, confirm));
    directions.push(await runDirection('b2a', b, a, s.anchorB, confirm));
    // Sau khi ghi thật, đánh dấu connection nguồn theo kết quả.
    if (confirm) {
      for (const cid of new Set([a.connectionId, b.connectionId])) {
        const ok = directions.filter((d) => !d.error).length > 0;
        await setConnectionStatus(cid, ok ? 'active' : 'error');
      }
    }
  }
  return {
    suggestionId: s.id,
    directions,
    appliedCount: directions.filter((d) => d.applied).length,
  };
}
