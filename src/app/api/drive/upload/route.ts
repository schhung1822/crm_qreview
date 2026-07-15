import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import {
  DRIVE_FOLDER_NAME,
  ensureFolder,
  refreshAccessToken,
  uploadFile,
} from '@/lib/drive/client';
import { buildExport, EXPORT_MIME, exportFileName } from '@/lib/export/article-file';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { getDriveCreds, getFolderId, getRefreshToken, setFolderId } from '@/lib/store/drive';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const BodySchema = z.object({
  title: z.string().max(300).default(''),
  metaDescription: z.string().max(2000).optional(),
  slug: z.string().max(300).optional(),
  targetKeyword: z.string().max(200).optional(),
  tags: z.array(z.string().max(120)).max(50).optional(),
  markdown: z.string().max(200_000),
  format: z.enum(['txt', 'doc']).default('doc'),
});

// POST /api/drive/upload → dựng file .txt/.doc từ bài rồi tải lên Google Drive (thư mục app tạo).
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  const creds = await getDriveCreds();
  if (creds.source === 'none') {
    return NextResponse.json({ error: 'Chưa cấu hình Google Drive.' }, { status: 400 });
  }
  const rl = rateLimit(`driveup:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: `Thử lại sau ${rl.retryAfter}s.` }, { status: 429 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ.' }, { status: 400 });

  const refreshToken = await getRefreshToken();
  if (!refreshToken) return NextResponse.json({ needsConnect: true }, { status: 200 });

  const { format, ...a } = parsed.data;
  const content = buildExport(a, format);
  const name = exportFileName(a.title, format);

  try {
    const accessToken = await refreshAccessToken(creds, refreshToken);
    const folderId = await ensureFolder(accessToken, DRIVE_FOLDER_NAME, await getFolderId());
    await setFolderId(folderId);
    const file = await uploadFile(accessToken, {
      name,
      mimeType: EXPORT_MIME[format],
      content,
      folderId,
    });
    return NextResponse.json({ ok: true, name, webViewLink: file.webViewLink, folder: DRIVE_FOLDER_NAME });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi tải lên Google Drive.' },
      { status: 502 },
    );
  }
}
