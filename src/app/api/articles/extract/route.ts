import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { extractFromBuffer, extractFromUrl, MAX_FILE_BYTES } from '@/lib/ingest/extract';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // cần Buffer + pdf-parse/mammoth

// POST /api/articles/extract
//  • multipart/form-data với field "file"  → trích text từ file (txt/md/pdf/docx/html).
//  • JSON { url }                           → trích text từ 1 bài viết trên web.
// Trả { text, title?, chars }.
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  // Chống lạm dụng (tải/parse tốn tài nguyên + gọi ra ngoài).
  const rl = rateLimit(`extract:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Quá nhiều yêu cầu. Thử lại sau ${rl.retryAfter}s.` },
      { status: 429 },
    );
  }

  const ctype = req.headers.get('content-type') || '';
  try {
    let result;
    if (ctype.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'Thiếu file.' }, { status: 400 });
      }
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: 'File quá lớn (tối đa 15MB).' }, { status: 400 });
      }
      const buf = Buffer.from(await file.arrayBuffer());
      result = await extractFromBuffer(file.name || 'file', buf);
    } else {
      const parsed = z
        .object({ url: z.string().url().max(2000) })
        .safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return NextResponse.json({ error: 'URL không hợp lệ.' }, { status: 400 });
      }
      result = await extractFromUrl(parsed.data.url);
    }

    if (!result.text.trim()) {
      return NextResponse.json(
        { error: 'Không trích được nội dung văn bản từ nguồn này.' },
        { status: 422 },
      );
    }
    return NextResponse.json({ text: result.text, title: result.title, chars: result.text.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi trích xuất nội dung.' },
      { status: 502 },
    );
  }
}
