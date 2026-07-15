import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { compressImage, OUT_FORMATS, type OutFormat } from '@/lib/images/compress';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 25 * 1024 * 1024; // 25MB / ảnh

// POST /api/images/compress (multipart) → nén 1 ảnh, trả về data URL + số liệu before/after.
// Không lưu trữ: xử lý trong bộ nhớ rồi trả thẳng cho client tải xuống.
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  const rl = rateLimit(`imgc:${clientIp(req)}`, 60, 60_000); // 60 ảnh / phút / IP
  if (!rl.ok) {
    return NextResponse.json({ error: `Quá nhiều yêu cầu. Thử lại sau ${rl.retryAfter}s.` }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Thiếu ảnh.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Ảnh quá lớn (tối đa 25MB).' }, { status: 413 });
  if (file.type && !file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'File không phải ảnh.' }, { status: 415 });
  }

  const fmtRaw = String(form.get('format') || 'webp');
  const format: OutFormat = (OUT_FORMATS as string[]).includes(fmtRaw) ? (fmtRaw as OutFormat) : 'webp';
  const quality = Number(form.get('quality') || 80);
  const maxWidthRaw = Number(form.get('maxWidth') || 0);
  const keepMeta = String(form.get('keepMeta') || '0') === '1';

  const input = Buffer.from(await file.arrayBuffer());
  try {
    const r = await compressImage(input, {
      format,
      quality,
      maxWidth: Number.isFinite(maxWidthRaw) && maxWidthRaw > 0 ? maxWidthRaw : undefined,
      keepMeta,
    });
    const base = (file.name || 'image').replace(/\.[^.]+$/, '') || 'image';
    return NextResponse.json({
      ok: true,
      name: `${base}.${r.ext}`,
      format: r.format,
      mime: r.mime,
      dataUrl: `data:${r.mime};base64,${r.buffer.toString('base64')}`,
      originalBytes: file.size,
      outputBytes: r.buffer.length,
      width: r.width,
      height: r.height,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Không xử lý được ảnh.' },
      { status: 400 },
    );
  }
}
