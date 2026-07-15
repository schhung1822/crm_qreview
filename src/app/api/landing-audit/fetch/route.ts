import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { safeFetch } from '@/lib/security/safe-fetch';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_HTML = 3_000_000; // 3MB - trùng ngưỡng của /api/landing-audit
const UA = 'Mozilla/5.0 (compatible; SEO-GEO-Audit/1.0; +https://noti.vn)';

const BodySchema = z.object({ url: z.string().min(3).max(2000) });

// Chuẩn hóa: thêm https:// nếu người dùng dán thiếu giao thức.
function normalizeUrl(raw: string): string {
  const t = raw.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

// POST /api/landing-audit/fetch → tải HTML của 1 URL landing (có chắn SSRF) rồi trả về cho client
// để xem trước + chấm điểm bằng luồng sẵn có. KHÔNG chấm ở đây (giữ /api/landing-audit thuần chuỗi).
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  // Gọi ra mạng ngoài → siết chặt hơn để chống lạm dụng.
  const rl = rateLimit(`landingfetch:${clientIp(req)}`, 12, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: `Thử lại sau ${rl.retryAfter}s.` }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Đường dẫn không hợp lệ.' }, { status: 400 });
  }

  const url = normalizeUrl(parsed.data.url);
  try {
    const res = await safeFetch(url, { headers: { 'user-agent': UA, accept: 'text/html,*/*' } });
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return NextResponse.json(
        { error: `Không tải được trang (mã ${res.status}).` },
        { status: 502 },
      );
    }
    // Chỉ nhận nội dung dạng HTML/text - từ chối ảnh, PDF, file nhị phân.
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct && !/(text\/html|application\/xhtml|text\/plain|\+xml)/.test(ct)) {
      await res.body?.cancel().catch(() => {});
      return NextResponse.json(
        { error: 'Đường dẫn không trả về trang HTML.' },
        { status: 415 },
      );
    }
    const cl = Number(res.headers.get('content-length') || 0);
    if (cl && cl > MAX_HTML) {
      await res.body?.cancel().catch(() => {});
      return NextResponse.json({ error: 'Trang quá lớn (tối đa 3MB).' }, { status: 413 });
    }
    const html = (await res.text()).slice(0, MAX_HTML);
    if (!html.trim()) {
      return NextResponse.json({ error: 'Trang không có nội dung.' }, { status: 422 });
    }
    const finalUrl = res.url || url;
    let host = finalUrl;
    try {
      host = new URL(finalUrl).host;
    } catch {
      /* giữ nguyên finalUrl nếu parse lỗi */
    }
    return NextResponse.json({ html, finalUrl, fileName: host });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Không tải được trang.' },
      { status: 502 },
    );
  }
}
