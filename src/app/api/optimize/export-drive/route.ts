import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { htmlToMarkdown } from '@/lib/content/markdown';
import { extractKeywordHeuristic } from '@/lib/content/keyword-extract';
import {
  DRIVE_FOLDER_NAME,
  ensureFolder,
  refreshAccessToken,
  uploadFile,
} from '@/lib/drive/client';
import { buildExport, EXPORT_MIME, exportFileName } from '@/lib/export/article-file';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { getDriveCreds, getFolderId, getRefreshToken, setFolderId } from '@/lib/store/drive';
import { adapterFromConnection, setConnectionStatus } from '@/lib/store/connections';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_POSTS = 200;
const BodySchema = z.object({
  connectionId: z.string().min(1),
  postIds: z.array(z.string().min(1)).min(1).max(MAX_POSTS),
  format: z.enum(['txt', 'doc']).default('doc'),
});

// POST /api/optimize/export-drive → tải nhiều bài từ CMS rồi xuất lên Drive; STREAM tiến trình
// từng bài (NDJSON) để client vẽ progress + Dừng được. 1 request cho cả lô (1 lần refresh token).
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  const creds = await getDriveCreds();
  if (creds.source === 'none') {
    return NextResponse.json({ error: 'Chưa cấu hình Google Drive.' }, { status: 400 });
  }
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return NextResponse.json({ needsConnect: true });

  // 1 request/lô → giới hạn nhẹ để chống spam nhiều lô liên tiếp.
  const rl = rateLimit(`driveexport:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: `Thử lại sau ${rl.retryAfter}s.` }, { status: 429 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ.' }, { status: 400 });
  const { connectionId, postIds, format } = parsed.data;

  const loaded = await adapterFromConnection(connectionId);
  if (!loaded) return NextResponse.json({ error: 'Không tìm thấy kết nối.' }, { status: 404 });

  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream({
    cancel() {
      // Client ngắt kết nối (bấm Dừng) → dừng vòng lặp.
      cancelled = true;
    },
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
        } catch {
          /* stream đã đóng */
        }
      };
      let okAny = false;
      try {
        const accessToken = await refreshAccessToken(creds, refreshToken);
        const folderId = await ensureFolder(accessToken, DRIVE_FOLDER_NAME, await getFolderId());
        await setFolderId(folderId);
        send({
          type: 'meta',
          total: postIds.length,
          folder: DRIVE_FOLDER_NAME,
          folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
        });

        for (let i = 0; i < postIds.length; i++) {
          if (cancelled || req.signal.aborted) break;
          const id = postIds[i];
          let result: { postId: string; title: string; ok: boolean; webViewLink?: string; error?: string };
          try {
            const post = await loaded.adapter.getPost(id);
            const markdown = htmlToMarkdown(post.contentHtml);
            const keyword = extractKeywordHeuristic(post.title, markdown);
            const content = buildExport(
              {
                title: post.title,
                metaDescription: post.metaDescription || post.excerpt || '',
                slug: post.slug,
                targetKeyword: keyword,
                tags: post.tags ?? [],
                markdown,
              },
              format,
            );
            const file = await uploadFile(accessToken, {
              name: exportFileName(post.title || post.slug || id, format),
              mimeType: EXPORT_MIME[format],
              content,
              folderId,
            });
            okAny = true;
            result = { postId: id, title: post.title || post.slug || id, ok: true, webViewLink: file.webViewLink };
          } catch (err) {
            result = { postId: id, title: id, ok: false, error: err instanceof Error ? err.message.slice(0, 160) : 'Lỗi' };
          }
          send({ type: 'progress', done: i + 1, result });
        }
        send({ type: 'done' });
      } catch (err) {
        send({ type: 'error', error: err instanceof Error ? err.message.slice(0, 200) : 'Lỗi Google Drive.' });
      } finally {
        await setConnectionStatus(connectionId, okAny ? 'active' : 'error').catch(() => {});
        try {
          controller.close();
        } catch {
          /* đã đóng */
        }
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
