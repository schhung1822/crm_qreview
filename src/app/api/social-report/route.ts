import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { locales } from '@/i18n/config';
import { entitlementsForBiz, socialReportQuota } from '@/lib/billing/entitlement';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { getApifyPool } from '@/lib/social/apify-keys';
import { incrSocialReportsUsed } from '@/lib/store/social-report-usage';
import { createSocialReport, listSocialReports } from '@/lib/store/social-reports';
import {
  lazadaProductId,
  lazadaSlugKeyword,
  shopeeIds,
  taobaoItemId,
  TTS_REGIONS,
  ttsProductId,
  validateApifyToken,
} from '@/lib/social/apify';
import { ECOM_SEARCH_KINDS, SOCIAL_CHANNEL_KINDS, type SocialChannelKind } from '@/lib/social/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// URL kênh hợp lệ theo từng nền tảng.
const URL_RE: Record<SocialChannelKind, RegExp> = {
  facebook: /^https?:\/\/((www|m|web|vi-vn|en-gb)\.)?(facebook|fb)\.com\/.+/i,
  // Nhận URL profile hoặc @handle/handle trần (2-24 ký tự chữ số . _ -).
  tiktok: /^(https?:\/\/(www\.)?tiktok\.com\/@[\w.-]+.*|@?[\w.-]{2,24})$/i,
  youtube: /^https?:\/\/(www\.)?youtube\.com\/(@|channel\/|c\/|user\/)[\w@.%-]+.*$/i,
  // Nhóm Facebook: bắt buộc đường dẫn /groups/ (chỉ nhóm công khai phân tích được).
  fbgroup: /^https?:\/\/((www|m|web)\.)?(facebook|fb)\.com\/groups\/.+/i,
  // Facebook CÁ NHÂN: link profile (facebook.com/<username> hoặc /profile.php?id=), KHÔNG phải /groups/.
  // Chỉ phân tích được bài CÔNG KHAI của nick.
  fbprofile: /^https?:\/\/((www|m|web|vi-vn|en-gb)\.)?(facebook|fb)\.com\/(?!groups\/).+/i,
  // Instagram/Threads: URL profile hoặc @handle/handle trần.
  instagram: /^(https?:\/\/(www\.)?instagram\.com\/[\w.]+\/?.*|@?[\w.]{2,30})$/i,
  threads: /^(https?:\/\/(www\.)?threads\.(net|com)\/@?[\w.]+.*|@?[\w.]{2,30})$/i,
  // Shopee: URL SẢN PHẨM (chứa -i.SHOPID.ITEMID hoặc product/SHOPID/ITEMID - kể cả ngay
  // đầu path), HOẶC link rút gọn chia sẻ từ app (s.shopee.vn/<mã>) - server tự giải khi tạo.
  shopee: /^https?:\/\/((\w+\.)?shopee\.(vn|co\.id|co\.th|com\.my|sg|ph|com\.br|tw|com\.mx)\/(\S*-i\.\d+\.\d+|(\S*\/)?product\/\d+\/\d+)|s\.shopee\.(vn|co\.id|co\.th|com\.my|sg|ph|com\.br|tw|com\.mx)\/\S+)/i,
  // Shop Shopee: URL shop (shopee.vn/<username> hoặc /shop/<id>) hoặc username trần.
  // Username chỉ gồm chữ số . _ nên KHÔNG khớp nhầm URL sản phẩm (slug có dấu '-').
  shopeeshop: /^(https?:\/\/(\w+\.)?shopee\.(vn|co\.id|co\.th|com\.my|sg|ph|com\.br|tw|com\.mx)\/(shop\/\d+|[\w.]+)\/?(\?\S*)?$|@?[\w.]{2,30})$/i,
  // Sản phẩm TikTok Shop: link chứa ID 15-20 số (view/product | pdp/<slug>/ID | <cc>/pdp/ID
  // không slug), link rút gọn chia sẻ từ app (vt/vm.tiktok.com - server tự giải) hoặc ID trần.
  tiktokshop:
    /^(https?:\/\/(www\.|shop\.)?tiktok\.com\/\S*(\/product\/|\/pdp\/([^/?#]*\/)?)\d{15,20}\S*|https?:\/\/(vt|vm)\.tiktok\.com\/\S+|\d{15,20})$/i,
  // Shop TikTok Shop: TÊN shop hiển thị trên TikTok Shop (chữ tự do 2-80 ký tự - VN không
  // có URL shop công khai trên web nên nhập tên; server search rồi lọc theo seller).
  tiktokshopshop: /^.{2,80}$/,
  // Sản phẩm Lazada: link PHẢI có slug tên sản phẩm (.../products/<slug>-iID.html - trang
  // PDP bị Lazada chặn nên hệ thống tìm lại sản phẩm bằng từ khóa rút từ slug; dạng
  // pdp-iID.html KHÔNG có slug → không dùng được), hoặc link rút gọn s.lazada (server giải).
  lazada:
    /^https?:\/\/((www\.)?lazada\.(vn|co\.id|co\.th|com\.my|sg|com\.ph)\/products\/(?!pdp-i)\S+-i\d{6,16}(-s\d+)?\.html\S*|s\.lazada\.(vn|co\.id|co\.th|com\.my|sg|com\.ph)\/\S+)$/i,
  // Shop Lazada: URL shop dạng lazada.<tld>/shop/<slug>.
  lazadashop:
    /^https?:\/\/(www\.)?lazada\.(vn|co\.id|co\.th|com\.my|sg|com\.ph)\/shop\/[\w.-]+\/?(\?\S*)?$/i,
  // Sản phẩm Taobao/Tmall: link có ?id=<số> (item.taobao.com / detail.tmall.com /
  // main.m.taobao.com...), dạng world.taobao.com/item/<số>.htm, link rút gọn chia sẻ từ app
  // (e.tb.cn / m.tb.cn - server tự giải) hoặc ID sản phẩm trần.
  taobao:
    /^(https?:\/\/([\w-]+\.)*(taobao|tmall)\.(com|hk)\/\S*[?&]id=\d{8,16}\S*|https?:\/\/([\w-]+\.)*taobao\.com\/item\/\d{8,16}(\.htm)?\S*|https?:\/\/(e|m)\.tb\.cn\/\S+|\d{8,16})$/i,
  // Shop Taobao: TÊN shop hiển thị trên Taobao (chữ tự do 2-80 ký tự - server search theo tên
  // rồi chốt seller khớp nhất), hoặc URL shop dạng store.taobao.com/...user_number_id=<số>.
  taobaoshop: /^(https?:\/\/\S*user_number_id=\d{5,15}\S*|.{2,80})$/i,
};

// Link rút gọn Shopee/TikTok → theo redirect tới link đầy đủ (host cố định s.shopee.* /
// vt|vm.tiktok.com nên không có rủi ro SSRF; đích cuối vẫn bị kiểm tra mẫu trước khi dùng).
async function resolveShopeeShortUrl(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10_000) });
    if (res.url && res.url !== url) return res.url;
    // Một số môi trường không theo redirect → đọc Location thủ công.
    const loc = res.headers.get('location');
    return loc ?? undefined;
  } catch {
    return undefined;
  }
}

const OptionsSchema = z
  .object({
    postsLimit: z.number().int().min(3).max(50).default(10),
    reelsLimit: z.number().int().min(3).max(50).default(10),
    adsLimit: z.number().int().min(3).max(50).default(10),
    commentsLimit: z.number().int().min(5).max(100).default(30),
    includeReels: z.boolean().default(true),
    includeAds: z.boolean().default(true),
    includeComments: z.boolean().default(true),
    groupSort: z.enum(['top', 'new']).default('top'),
    // Khu vực TikTok Shop (giao vùng 3 actor đều hỗ trợ).
    ttsRegion: z.enum(TTS_REGIONS).default('VN'),
  })
  .default({});

const CreateSchema = z
  .object({
    platform: z.enum([
      'facebook', 'tiktok', 'youtube', 'fbgroup', 'fbprofile', 'instagram', 'threads',
      'shopee', 'shopeeshop', 'tiktokshop', 'tiktokshopshop', 'lazada', 'lazadashop', 'taobao', 'taobaoshop',
      'overall', 'ecom',
    ]),
    locale: z.string().refine((v) => (locales as readonly string[]).includes(v)),
    options: OptionsSchema,
    keyword: z.string().max(200).optional(),
    // Tên báo cáo tự đặt (tuỳ chọn) - giữ nguyên, không bị ghi đè bằng tên kênh/sản phẩm.
    title: z.string().max(120).optional(),
    channels: z
      .array(
        z.object({
          kind: z.enum([
            'facebook', 'tiktok', 'youtube', 'fbgroup', 'fbprofile', 'instagram', 'threads',
            'shopee', 'shopeeshop', 'tiktokshop', 'tiktokshopshop', 'lazada', 'lazadashop', 'taobao', 'taobaoshop',
          ]),
          url: z.string().max(500),
        }),
      )
      .max(5)
      .default([]),
  })
  .superRefine((v, ctx) => {
    if (v.platform === 'ecom') {
      // Tổng thể E-COMMERCE: chỉ cần keyword; 3 kênh sàn sinh tự động phía server.
      if (!v.keyword?.trim())
        ctx.addIssue({ code: 'custom', message: 'từ khóa là bắt buộc với tổng thể e-commerce' });
      return;
    }
    if (v.platform === 'overall') {
      const hasKeyword = !!v.keyword?.trim();
      if (!hasKeyword && v.channels.length === 0)
        ctx.addIssue({ code: 'custom', message: 'keyword hoặc channels là bắt buộc' });
      if (hasKeyword) return; // keyword mode: channels sinh tự động
      const kinds = v.channels.map((c) => c.kind);
      if (
        kinds.some((k) =>
          ['fbgroup', 'shopee', 'shopeeshop', 'tiktokshop', 'tiktokshopshop', 'lazada', 'lazadashop', 'taobao', 'taobaoshop'].includes(k),
        )
      )
        ctx.addIssue({ code: 'custom', message: 'nhóm Facebook/kênh e-commerce không tham gia báo cáo tổng thể social' });
      if (new Set(kinds).size !== kinds.length)
        ctx.addIssue({ code: 'custom', message: 'mỗi nền tảng chỉ 1 kênh' });
      for (const c of v.channels)
        if (!URL_RE[c.kind].test(c.url.trim()))
          ctx.addIssue({ code: 'custom', message: `URL kênh ${c.kind} không hợp lệ` });
    } else {
      // Sản phẩm Taobao theo TÊN: chỉ cần keyword (kênh sinh tự động phía server, url rỗng).
      if (v.platform === 'taobao' && v.keyword?.trim() && v.channels.length === 0) return;
      if (v.channels.length !== 1 || v.channels[0].kind !== v.platform)
        ctx.addIssue({ code: 'custom', message: 'cần đúng 1 kênh trùng nền tảng' });
      if (!URL_RE[v.platform].test(v.channels[0]?.url.trim() ?? ''))
        ctx.addIssue({
          code: 'custom',
          message:
            v.platform === 'shopee'
              ? 'link sản phẩm Shopee không hợp lệ - dùng link sản phẩm (dạng ...-i.SHOPID.ITEMID hoặc /product/SHOPID/ITEMID) hoặc link chia sẻ s.shopee.vn từ app'
              : v.platform === 'tiktokshop'
                ? 'link sản phẩm TikTok Shop không hợp lệ - dùng link sản phẩm (dạng .../view/product/ID), link chia sẻ vt.tiktok.com từ app hoặc ID sản phẩm'
                : v.platform === 'lazada'
                  ? 'link sản phẩm Lazada không hợp lệ - dùng link sản phẩm ĐẦY ĐỦ có tên trong đường dẫn (dạng lazada.vn/products/ten-san-pham-i123456.html) hoặc link chia sẻ s.lazada.vn từ app'
                  : v.platform === 'lazadashop'
                    ? 'link shop Lazada không hợp lệ - dùng link shop (dạng lazada.vn/shop/tenshop)'
                    : v.platform === 'taobao'
                      ? 'link sản phẩm Taobao/Tmall không hợp lệ - dùng link sản phẩm có ?id= (dạng item.taobao.com/item.htm?id=123456), link chia sẻ e.tb.cn/m.tb.cn từ app hoặc ID sản phẩm'
                      : 'URL kênh không hợp lệ',
        });
    }
  });

// GET /api/social-report → danh sách báo cáo (bản tóm tắt) của biz hiện tại.
export async function GET() {
  const g = await guard();
  if ('response' in g) return g.response;
  return NextResponse.json({ reports: await listSocialReports() });
}

// POST /api/social-report → tạo báo cáo mới (trạng thái running, client gọi /step để chạy).
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  const rl = rateLimit(`socialreport:${clientIp(req)}`, 10, 60_000);
  if (!rl.ok)
    return NextResponse.json(
      { error: `Thử lại sau ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: `Tham số không hợp lệ: ${parsed.error.issues[0]?.message ?? ''}` },
      { status: 400 },
    );

  // ── Cưỡng chế GÓI CƯỚC (quota gộp theo chủ tài khoản, kiểm TRƯỚC khi động tới Apify) ──
  const quota = await socialReportQuota(g.bizId);
  if (parsed.data.platform !== 'facebook' && !quota.allChannels)
    return NextResponse.json(
      {
        error:
          'Gói hiện tại chỉ tạo được báo cáo cho fanpage Facebook. Nâng cấp gói để phân tích nhóm Facebook, Instagram, Threads, TikTok, YouTube, Shopee, TikTok Shop, Lazada, Taobao và báo cáo tổng thể.',
        planLimited: true,
      },
      { status: 403 },
    );
  if (!quota.ok)
    return NextResponse.json(
      {
        error: `Đã dùng hết ${quota.used}/${quota.cap} lượt tạo Báo cáo Social trong tháng của gói hiện tại. Nâng cấp gói để có thêm lượt.`,
        planLimited: true,
      },
      { status: 403 },
    );

  const pool = await getApifyPool();
  if (!pool.length)
    return NextResponse.json(
      { error: 'Chưa cấu hình kết nối thu thập dữ liệu trong Quản lý kết nối.', needApify: true },
      { status: 400 },
    );
  // Key trong pool đã được kiểm tra lúc thêm; chỉ validate lại khi dùng key ĐƠN fallback (store/env cũ).
  if (pool.length === 1 && pool[0].id === 'default') {
    const valid = await validateApifyToken(pool[0].token);
    if (!valid.ok)
      return NextResponse.json({ error: valid.error, needApify: true }, { status: 400 });
  }

  const v = parsed.data;

  // Shopee: link rút gọn chia sẻ từ app (s.shopee.*) → giải về link sản phẩm đầy đủ
  // TRƯỚC khi tạo (bước product/reviews cần shopId+itemId trong URL).
  if (v.platform === 'shopee') {
    let url = v.channels[0].url.trim();
    if (/^https?:\/\/s\.shopee\./i.test(url)) {
      const resolved = await resolveShopeeShortUrl(url);
      if (resolved) url = resolved;
    }
    if (!shopeeIds(url))
      return NextResponse.json(
        {
          error:
            'Không đọc được link sản phẩm từ link rút gọn. Mở sản phẩm trên trình duyệt và dán link đầy đủ (dạng ...-i.SHOPID.ITEMID).',
        },
        { status: 400 },
      );
    v.channels[0].url = url;
  }

  // TikTok Shop: link rút gọn chia sẻ từ app (vt/vm.tiktok.com) → giải về link đầy đủ
  // TRƯỚC khi tạo (bước product/reviews cần ID sản phẩm trong link).
  if (v.platform === 'tiktokshop') {
    let url = v.channels[0].url.trim();
    if (/^https?:\/\/(vt|vm)\.tiktok\.com\//i.test(url)) {
      const resolved = await resolveShopeeShortUrl(url);
      if (resolved) url = resolved;
    }
    if (!ttsProductId(url))
      return NextResponse.json(
        {
          error:
            'Không đọc được ID sản phẩm từ link. Mở sản phẩm TikTok Shop trên trình duyệt và dán link đầy đủ (dạng .../view/product/ID) hoặc dán thẳng ID sản phẩm.',
        },
        { status: 400 },
      );
    v.channels[0].url = url;
  }

  // Lazada: link rút gọn s.lazada.* → giải về link đầy đủ; link cuối PHẢI có slug tên
  // sản phẩm (nguồn từ khóa để tìm lại sản phẩm - PDP bị Lazada chặn trực tiếp).
  if (v.platform === 'lazada') {
    let url = v.channels[0].url.trim();
    if (/^https?:\/\/s\.lazada\./i.test(url)) {
      const resolved = await resolveShopeeShortUrl(url);
      if (resolved) url = resolved.split('?')[0];
    }
    if (!lazadaProductId(url) || !lazadaSlugKeyword(url))
      return NextResponse.json(
        {
          error:
            'Không đọc được sản phẩm từ link. Mở sản phẩm Lazada trên trình duyệt và dán link ĐẦY ĐỦ có tên sản phẩm trong đường dẫn (dạng lazada.vn/products/ten-san-pham-i123456.html).',
        },
        { status: 400 },
      );
    v.channels[0].url = url;
  }

  // Taobao/Tmall: link rút gọn chia sẻ từ app (e.tb.cn / m.tb.cn) → giải về link đầy đủ
  // TRƯỚC khi tạo (bước product/reviews cần ?id= trong link). Chỉ áp cho chế độ DÁN LINK -
  // chế độ nhập TÊN sản phẩm (keyword) không có channels.
  if (v.platform === 'taobao' && v.channels.length) {
    let url = v.channels[0].url.trim();
    if (/^https?:\/\/(e|m)\.tb\.cn\//i.test(url)) {
      const resolved = await resolveShopeeShortUrl(url);
      if (resolved) url = resolved;
    }
    if (!taobaoItemId(url))
      return NextResponse.json(
        {
          error:
            'Không đọc được ID sản phẩm từ link. Mở sản phẩm Taobao/Tmall trên trình duyệt và dán link đầy đủ có ?id= (dạng item.taobao.com/item.htm?id=123456) hoặc dán thẳng ID sản phẩm.',
        },
        { status: 400 },
      );
    v.channels[0].url = url;
  }

  // Overall SOCIAL theo keyword: tự sinh kênh "kết quả tìm kiếm" trên từng nền tảng.
  // Tổng thể E-COMMERCE: tự sinh 3 kênh sàn (Shopee/TikTok Shop/Lazada).
  const channels =
    v.platform === 'ecom'
      ? ECOM_SEARCH_KINDS.map((kind) => ({ kind, url: '' }))
      : v.platform === 'overall' && v.keyword?.trim()
        ? SOCIAL_CHANNEL_KINDS.map((kind) => ({ kind, url: '' }))
        : v.platform === 'taobao' && v.channels.length === 0
          ? [{ kind: 'taobao' as const, url: '' }] // chế độ nhập TÊN sản phẩm
          : v.channels.map((c) => ({ kind: c.kind, url: c.url.trim() }));

  const report = await createSocialReport({
    platform: v.platform,
    locale: v.locale,
    options: v.options,
    keyword: v.keyword,
    title: v.title,
    channels,
  });
  // Trừ lượt theo CHỦ tài khoản của biz (xóa báo cáo không hoàn lượt - phí thu thập đã tốn).
  const { ownerId } = await entitlementsForBiz(g.bizId);
  if (ownerId) await incrSocialReportsUsed(ownerId);
  return NextResponse.json({ id: report.id, report });
}
