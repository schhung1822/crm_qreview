// Client Apify cho Báo cáo Social - server-only. Chạy actor theo kiểu BẤT ĐỒNG BỘ
// (start run → poll → lấy dataset) để không bị giới hạn 300s của run-sync.
// Key lấy từ Quản lý kết nối (integrations 'apify') hoặc env APIFY_API_TOKEN.
// Luôn đặt maxItems khi start run để KHÓA chi phí (actor trả phí theo kết quả).
import type {
  ShopeeProduct,
  ShopeeReview,
  ShopeeShopInfo,
  SocialAd,
  SocialChannelKind,
  SocialComment,
  SocialPageInfo,
  SocialPost,
  SocialPostType,
  SocialReportOptions,
} from './types';
import { safeFetch } from '../security/safe-fetch';

const API = 'https://api.apify.com/v2';

// Actor cho từng kênh (id dạng username~actor-name).
// Facebook: bộ chính thức của Apify. TikTok: clockworks. YouTube: streamers.
// Facebook search theo keyword: actor cộng đồng (best-effort - lỗi thì báo cáo vẫn chạy tiếp).
export const APIFY_ACTORS = {
  pages: 'apify~facebook-pages-scraper',
  posts: 'apify~facebook-posts-scraper',
  reels: 'apify~facebook-reels-scraper',
  ads: 'apify~facebook-ads-scraper',
  comments: 'apify~facebook-comments-scraper',
  fbSearch: 'scrapeforge~facebook-search-posts',
  tiktokProfile: 'clockworks~tiktok-profile-scraper',
  tiktokSearch: 'clockworks~tiktok-scraper',
  tiktokComments: 'clockworks~tiktok-comments-scraper',
  youtube: 'streamers~youtube-scraper',
  youtubeComments: 'streamers~youtube-comments-scraper',
  // Actor transcript CHUYÊN DỤNG - bù lời thoại cho video còn thiếu sau bước thu chính:
  // YouTube: captions batch rẻ; TikTok: chính chủ clockworks CÓ speech-to-text khi video
  // không phụ đề; Facebook Reels/video: AI speech-to-text (sian.agency).
  ytTranscripts: 'scrape-creators~best-youtube-transcripts-scraper',
  tiktokTranscripts: 'clockworks~tiktok-transcript-extractor',
  fbTranscripts: 'sian.agency~facebook-ai-transcript-extractor',
  // NHÓM Facebook công khai: bài viết (chính thức của Apify, kèm topComments inline);
  // info nhóm (tên/thành viên/quyền riêng tư) là actor cộng đồng best-effort - lỗi thì báo
  // cáo vẫn chạy. KHÔNG dùng igview-owner~facebook-group-details-scraper: đã thử thực tế
  // 07-2026, actor đó trả item lỗi cho nhóm thật + kèm DỮ LIỆU MẪU của nhóm khác (nguy hiểm).
  groupPosts: 'apify~facebook-groups-scraper',
  groupInfo: 'scraper-engine~facebook-groups-search-scraper',
  // Instagram: trọn bộ chính thức của Apify (không cần login, dữ liệu công khai).
  // Reels bật includeTranscript → lời thoại inline (không cần bước transcript riêng).
  // Search theo keyword: hashtag-scraper với keywordSearch=true.
  igProfile: 'apify~instagram-profile-scraper',
  igPosts: 'apify~instagram-post-scraper',
  igReels: 'apify~instagram-reel-scraper',
  igComments: 'apify~instagram-comment-scraper',
  igSearch: 'apify~instagram-hashtag-scraper',
  // Threads: automation-lab (posts kèm profile inline + search, không login);
  // replies qua pro100chok (URL bài dạng threads.net/@user/post/CODE - đã xác minh).
  threads: 'automation-lab~threads-scraper',
  threadsReplies: 'pro100chok~threads-scraper-usage',
  // Shopee (sản phẩm + đánh giá). Detail = XTRACTO (input shopId+itemId+country - KHỚP với
  // shopeeProductInput; zen-studio detail hay kẹt "temporarily unavailable" nên không dùng).
  // Reviews = zen-studio (startUrls dạng [{url}]). KHÔNG dùng gio21~*: đòi gói Apify trả phí,
  // tài khoản Free chỉ nhận DỮ LIỆU MẪU (_mock=true - đã dính thực tế 07-2026).
  shopeeDetail: 'xtracto~shopee-product-detail',
  shopeeReviews: 'zen-studio~shopee-product-reviews-scraper',
  // SHOP Shopee: danh mục sản phẩm của shop (cùng nhà xtracto - chạy được gói Apify Free).
  shopeeShop: 'xtracto~shopee-shop-scraper',
  // TikTok Shop (sản phẩm + shop). Đã xác minh bằng run thật 07-2026 với sản phẩm VN:
  // - Detail: cunning_soil (mobile API, đủ vùng kể cả VN; trả giá/giảm/ĐÃ BÁN/tồn kho/seller/
  //   sao + review_count). KHÔNG dùng unseenuser (backend chỉ US dù schema ghi VN),
  //   bovi/sentry/supreme_coder (gói Free bị cap 5 item / đòi số dư / đòi proxy riêng).
  // - Reviews: web_wanderer (9 vùng có VN, nhận product_ids, ~$0.6/1k).
  // - Search (danh mục shop qua tên): pratikdani (limit TỐI ĐA 10/lượt → chạy nhiều trang).
  ttsDetail: 'cunning_soil~tiktok-shop-product-scraper-mobile-api',
  ttsReviews: 'web_wanderer~tiktok-reviews-scraper',
  ttsSearch: 'pratikdani~tiktok-shop-search-scraper',
  // Lazada: fatihtahta all-in-one (đã xác minh run thật 07-2026, gói Apify Free): search theo
  // keyword + URL SHOP + đánh giá inline (getReviews) đều chạy; riêng trang sản phẩm (PDP)
  // bị Lazada CHẶN mọi lần thử → báo cáo sản phẩm đi đường search-theo-slug + khớp product_id.
  // Các actor Lazada khác (abotapi/dtrungtin/hello.datawizards/getdataforme-reviews) ĐÒI
  // proxy Residential - gói Free không có → 0 kết quả. gio21~lazada thuộc họ đã cấm (mock).
  lazada: 'fatihtahta~lazada-scraper',
  // Search Shopee theo keyword (tổng thể e-commerce): cùng nhà xtracto; fetchDetail=true trả
  // detail đầy đủ TỪNG sản phẩm (kèm shop{} có TÊN shop - search thường bị Shopee chặn field
  // sold/rating_count/shop_name). ~$0.012/sản phẩm khi bật fetchDetail.
  shopeeSearch: 'xtracto~shopee-search',
} as const;

interface ApifyErrorBody {
  error?: { type?: string; message?: string };
}

async function apifyFetch(token: string, path: string, init?: RequestInit): Promise<Response> {
  const sep = path.includes('?') ? '&' : '?';
  return fetch(`${API}${path}${sep}token=${encodeURIComponent(token)}`, init);
}

// Lỗi request Apify có kèm HTTP status → lớp trên quyết định có ĐỔI KEY (fallback) hay không.
export class ApifyRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApifyRequestError';
    this.status = status;
  }
}

// Có nên ĐỔI SANG KEY KHÁC khi gặp lỗi này? CÓ với: token hỏng (401), hết hạn mức/chưa thanh toán
// (402), quá tải (429), lỗi máy chủ (5xx), hoặc lỗi mạng (không phải ApifyRequestError → thử key khác).
// KHÔNG với 400/403/404 (lỗi input/actor - đổi key vô ích).
export function shouldRotateApifyKey(err: unknown): boolean {
  if (err instanceof ApifyRequestError)
    return err.status === 401 || err.status === 402 || err.status === 429 || err.status >= 500;
  return true;
}

// Thông điệp lỗi CHUNG CHUNG (không lộ tên nhà cung cấp thu thập dữ liệu cho người dùng cuối).
async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as ApifyErrorBody | null;
  const msg = body?.error?.message || `HTTP ${res.status}`;
  // 401/402 là lỗi người dùng sửa được → thông điệp rõ ràng.
  if (res.status === 401) return `Thu thập dữ liệu: token không hợp lệ - kiểm tra trong Quản lý kết nối (${msg})`;
  if (res.status === 402) return `Thu thập dữ liệu: tài khoản hết hạn mức/chưa thanh toán (${msg})`;
  return `Thu thập dữ liệu: ${msg}`;
}

// Kiểm tra token (dùng cho nút test / trước khi tạo báo cáo). GET /users/me rất rẻ.
export async function validateApifyToken(token: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await apifyFetch(token, '/users/me');
    if (res.ok) return { ok: true };
    return { ok: false, error: await readError(res) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}

export interface StartedRun {
  runId: string;
  datasetId: string;
}

// Bắt đầu 1 run actor; maxItems chặn chi phí theo số kết quả.
// maxChargeUsd: BẮT BUỘC với actor tính phí theo SỰ KIỆN (pay-per-event) - nếu chỉ đặt
// maxItems, Apify tự suy trần tiền quá thấp và ABORT run trước khi trả kết quả
// (đã dính với actor info nhóm: "Aborted automatically after reaching the maximum cost").
export async function startActorRun(
  token: string,
  actorId: string,
  input: Record<string, unknown>,
  maxItems: number,
  maxChargeUsd?: number,
): Promise<StartedRun> {
  const charge = maxChargeUsd ? `&maxTotalChargeUsd=${maxChargeUsd}` : '';
  const res = await apifyFetch(
    token,
    `/acts/${actorId}/runs?maxItems=${Math.max(1, Math.floor(maxItems))}${charge}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  if (!res.ok) throw new ApifyRequestError(res.status, await readError(res));
  const body = (await res.json()) as { data?: { id?: string; defaultDatasetId?: string } };
  const runId = body.data?.id;
  const datasetId = body.data?.defaultDatasetId;
  if (!runId || !datasetId) throw new Error('Thu thập dữ liệu: phản hồi start run thiếu id/datasetId.');
  return { runId, datasetId };
}

// Tải file phụ đề/transcript (.vtt/.srt/.txt) - URL ký tên CÓ HẠN nên phải tải ngay sau khi run.
// - File trên storage Apify (api.apify.com/...) cần ?token= → nhận apifyToken để tự gắn.
// - CDN nền tảng (TikTok/Facebook) hay chặn fetch không có User-Agent → giả UA trình duyệt.
// Trả text thô (caller parse); lỗi/timeout → undefined (best-effort).
export async function fetchSubtitleFile(url: string, apifyToken?: string): Promise<string | undefined> {
  try {
    let host = '';
    try {
      host = new URL(url).host.toLowerCase();
    } catch {
      /* giữ url gốc */
    }
    let target = url;
    if (apifyToken && (host === 'api.apify.com' || host.endsWith('.apify.com')) && !/[?&]token=/.test(url)) {
      target = url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(apifyToken);
    }
    // URL phụ đề đến TỪ kết quả actor Apify (nội dung bên thứ ba scrape) → đi qua safeFetch để
    // chặn SSRF (kẻ tấn công có thể nhét link phụ đề trỏ IP nội bộ). safeFetch tự gắn UA trình duyệt.
    const res = await safeFetch(target, {
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: '*/*' },
    });
    if (!res.ok) return undefined;
    const text = await res.text();
    return text.slice(0, 800_000); // chặn file bất thường
  } catch {
    return undefined;
  }
}

export type RunState = 'running' | 'succeeded' | 'failed';

// Poll trạng thái run; waitForFinish giữ kết nối tối đa N giây để giảm số lần gọi.
export async function pollRun(
  token: string,
  runId: string,
  waitSeconds = 20,
): Promise<{ state: RunState; statusText: string }> {
  const res = await apifyFetch(token, `/actor-runs/${runId}?waitForFinish=${waitSeconds}`);
  if (!res.ok) throw new ApifyRequestError(res.status, await readError(res));
  const body = (await res.json()) as { data?: { status?: string } };
  const status = body.data?.status ?? 'UNKNOWN';
  if (status === 'SUCCEEDED') return { state: 'succeeded', statusText: status };
  if (['READY', 'RUNNING', 'TIMING-OUT', 'ABORTING'].includes(status))
    return { state: 'running', statusText: status };
  return { state: 'failed', statusText: status };
}

export async function fetchDatasetItems(
  token: string,
  datasetId: string,
  limit: number,
): Promise<unknown[]> {
  const res = await apifyFetch(
    token,
    `/datasets/${datasetId}/items?clean=true&format=json&limit=${Math.max(1, limit)}`,
  );
  if (!res.ok) throw new ApifyRequestError(res.status, await readError(res));
  const items = (await res.json()) as unknown;
  return Array.isArray(items) ? items : [];
}

// ── Helpers đọc field an toàn từ output actor (schema có thể lệch nhẹ giữa version) ──

type Raw = Record<string, unknown>;

function asRaw(v: unknown): Raw {
  return v && typeof v === 'object' ? (v as Raw) : {};
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}
function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[,\s]/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}
function iso(v: unknown): string | undefined {
  if (typeof v === 'number' && v > 1_000_000_000) {
    // epoch giây hoặc mili giây
    const ms = v > 1_000_000_000_000 ? v : v * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const s = str(v);
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
function firstStr(r: Raw, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = str(r[k]);
    if (v) return v;
  }
  return undefined;
}
function firstNum(r: Raw, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = num(r[k]);
    if (v !== undefined) return v;
  }
  return undefined;
}

// ── Input builder + normalizer cho từng actor ──

export function pageInfoInput(pageUrl: string): Record<string, unknown> {
  return { startUrls: [{ url: pageUrl }] };
}

export function normalizePageInfo(items: unknown[], pageUrl: string): SocialPageInfo | undefined {
  const r = asRaw(items[0]);
  if (!Object.keys(r).length) return undefined;
  const info = asRaw(r.info);
  const ratingNum = firstStr(r, ['rating']) ?? firstStr(info, ['rating']);
  const ratingCount = firstNum(r, ['ratingCount', 'reviews_count', 'reviewsCount']);
  const categories = Array.isArray(r.categories)
    ? (r.categories as unknown[]).map((c) => str(c) ?? '').filter(Boolean)
    : str(r.category)
      ? [String(r.category)]
      : undefined;
  return {
    name: firstStr(r, ['title', 'name', 'pageName']) ?? pageUrl,
    url: firstStr(r, ['pageUrl', 'url', 'facebookUrl']) ?? pageUrl,
    likes: firstNum(r, ['likes', 'likesCount']),
    followers: firstNum(r, ['followers', 'followersCount', 'followedBy']),
    categories,
    rating: ratingNum
      ? ratingCount
        ? `${ratingNum} (${ratingCount})`
        : String(ratingNum)
      : undefined,
    intro: firstStr(r, ['intro', 'about', 'about_me', 'description']),
    profilePicture: firstStr(r, ['profilePictureUrl', 'profilePhoto', 'profilePicture']),
  };
}

export function postsInput(pageUrl: string, limit: number): Record<string, unknown> {
  // captionText: yêu cầu actor kèm transcript video (nếu Facebook có).
  return { startUrls: [{ url: pageUrl }], resultsLimit: limit, captionText: true };
}

function detectPostType(r: Raw, url: string): SocialPostType {
  const t = (firstStr(r, ['type', 'postType', 'media_type']) ?? '').toLowerCase();
  if (t.includes('reel') || /\/reel\//.test(url)) return 'reel';
  if (t.includes('video')) return 'video';
  if (t.includes('photo') || t.includes('image')) return 'image';
  if (t.includes('event') || /\/events\//.test(url)) return 'event';
  if (t.includes('status') || t.includes('text')) return 'text';
  const media = r.media;
  if (Array.isArray(media) && media.length) {
    const m0 = asRaw(media[0]);
    const mt = (firstStr(m0, ['__typename', 'type']) ?? '').toLowerCase();
    if (mt.includes('video')) return 'video';
    if (mt.includes('photo') || mt.includes('image')) return 'image';
  }
  return 'other';
}

export function normalizePost(v: unknown): SocialPost | undefined {
  const r = asRaw(v);
  const url = firstStr(r, ['url', 'postUrl', 'topLevelUrl', 'facebookUrl']) ?? '';
  const id = firstStr(r, ['postId', 'id', 'legacyId']) ?? url;
  if (!id && !url) return undefined;
  const media = Array.isArray(r.media) ? (r.media as unknown[]).map(asRaw) : [];
  const thumb =
    firstStr(r, ['thumbnail', 'thumbnailUrl', 'previewImage']) ??
    (media.length
      ? firstStr(media[0], ['thumbnail', 'photo_image', 'url', 'image']) ??
        firstStr(asRaw(media[0].image), ['uri', 'url'])
      : undefined);
  // Transcript: text sẵn (captionText: true) HOẶC URL file .srt trong playback_video/media
  // (Reels và video post trả captions_url - URL ký tên có hạn → runner tải ngay sau run).
  const pv = asRaw(r.playback_video);
  const transcriptUrl =
    firstStr(pv, ['captions_url', 'captionsUrl']) ??
    media
      .map((m) => firstStr(m, ['captions_url', 'captionsUrl']) ?? firstStr(asRaw(m.video), ['captions_url', 'captionsUrl']))
      .find(Boolean);
  return {
    id: id || url,
    type: detectPostType(r, url),
    url,
    time: iso(r.time ?? r.timestamp ?? r.date ?? r.publishedAt ?? r.creation_time),
    text: firstStr(r, ['text', 'message', 'caption', 'description']),
    reactions: firstNum(r, ['likes', 'reactions', 'reactionsCount', 'likesCount', 'topReactionsCount']),
    comments: firstNum(r, ['comments', 'commentsCount']),
    shares: firstNum(r, ['shares', 'sharesCount']),
    views: firstNum(r, ['viewsCount', 'views', 'playCount', 'videoViewCount']),
    thumbnail: thumb,
    transcript: firstStr(r, ['transcript', 'videoTranscript', 'captionsText', 'caption_text']),
    transcriptUrl,
  };
}

// FACEBOOK CÁ NHÂN: profile không có bước 'page' riêng đáng tin → suy thông tin trang (tên chủ
// trang, follower nếu công khai) từ chính output actor bài đăng (facebook-posts-scraper). Best-effort.
export function fbProfileInfoFromPosts(items: unknown[], url: string): SocialPageInfo | undefined {
  for (const it of items) {
    const r = asRaw(it);
    const user = asRaw(r.user);
    const name =
      firstStr(user, ['name']) ||
      firstStr(asRaw(r.author), ['name']) ||
      firstStr(asRaw(r.from), ['name']) ||
      firstStr(r, ['pageName', 'authorName', 'userName', 'ownerName', 'facebookName']);
    if (name) {
      const followers =
        firstNum(user, ['followers', 'followersCount']) ?? firstNum(r, ['followersCount', 'followers']);
      return { name, url, followers };
    }
  }
  // fallback: username từ URL (facebook.com/<username>) - profile.php?id thì bỏ.
  const m = url.match(/facebook\.com\/(?!profile\.php)([^/?#]+)/i);
  const uname = m?.[1] ? decodeURIComponent(m[1]).replace(/[._]+/g, ' ').trim() : undefined;
  return uname ? { name: uname, url } : undefined;
}

export function reelsInput(pageUrl: string, limit: number): Record<string, unknown> {
  return { startUrls: [{ url: pageUrl }], resultsLimit: limit };
}

export function normalizeReel(v: unknown): SocialPost | undefined {
  const p = normalizePost(v);
  if (!p) return undefined;
  return { ...p, type: 'reel' };
}

export function adsInput(pageUrl: string, limit: number): Record<string, unknown> {
  return {
    startUrls: [{ url: pageUrl }],
    resultsLimit: limit,
    activeStatus: 'active',
    isDetailsPerAd: true,
  };
}

export function normalizeAd(v: unknown): SocialAd | undefined {
  const r = asRaw(v);
  const snapshot = asRaw(r.snapshot);
  const id = firstStr(r, ['adArchiveID', 'adArchiveId', 'adId', 'id', 'archiveId']);
  if (!id) return undefined;
  const cards = Array.isArray(snapshot.cards) ? (snapshot.cards as unknown[]).map(asRaw) : [];
  const body = asRaw(snapshot.body);
  const text =
    firstStr(r, ['text', 'adText', 'bodyText']) ??
    firstStr(body, ['text', 'markup']) ??
    (cards.length ? firstStr(cards[0], ['body', 'text']) : undefined);
  const cta =
    firstStr(r, ['ctaText', 'cta', 'callToAction']) ??
    firstStr(snapshot, ['cta_text', 'ctaText']) ??
    (cards.length ? firstStr(cards[0], ['cta_text', 'ctaText']) : undefined);
  const format =
    firstStr(r, ['displayFormat', 'format', 'adFormat']) ?? firstStr(snapshot, ['display_format']);
  return {
    id,
    text,
    cta,
    format,
    status: firstStr(r, ['status', 'isActive', 'activeStatus']),
    startDate: iso(r.startDate ?? r.start_date ?? r.adDeliveryStartTime),
    url: firstStr(r, ['url', 'adUrl']),
  };
}

export function commentsInput(postUrls: string[], limitPerPost: number): Record<string, unknown> {
  return {
    startUrls: postUrls.map((url) => ({ url })),
    resultsLimit: limitPerPost,
    includeNestedComments: false,
    viewOption: 'RANKED_THREADED', // "bình luận hàng đầu" - phù hợp phân tích tương tác
  };
}

export function normalizeComment(v: unknown): SocialComment | undefined {
  const r = asRaw(v);
  const text = firstStr(r, ['text', 'commentText', 'message']);
  if (!text) return undefined;
  return {
    postUrl: firstStr(r, ['postUrl', 'facebookUrl', 'inputUrl', 'url']) ?? '',
    text,
    likes: firstNum(r, ['likesCount', 'likes', 'reactionsCount']),
    author: firstStr(r, ['profileName', 'authorName', 'name']),
  };
}

// ═══ TikTok (clockworks) ═══

// Lấy username từ URL profile/@handle/handle trần.
export function tiktokUsername(input: string): string {
  const m = input.match(/tiktok\.com\/@([\w.-]+)/i);
  if (m) return m[1];
  return input.replace(/^@/, '').trim();
}

export function tiktokProfileInput(profileUrl: string, limit: number): Record<string, unknown> {
  return {
    profiles: [tiktokUsername(profileUrl)],
    resultsPerPage: limit,
    profileSorting: 'latest',
    excludePinnedPosts: false,
  };
}

export function tiktokSearchInput(keyword: string, limit: number): Record<string, unknown> {
  return { searchQueries: [keyword], searchSection: '/video', resultsPerPage: limit };
}

// Chọn link phụ đề tốt nhất từ videoMeta.subtitleLinks: ưu tiên đúng ngôn ngữ mong muốn,
// rồi bản KHÔNG phải machine-translation (giữ nguyên lời thoại gốc), rồi link đầu tiên.
function pickSubtitleLink(meta: Raw, preferLang?: string): string | undefined {
  const links = Array.isArray(meta.subtitleLinks) ? (meta.subtitleLinks as unknown[]).map(asRaw) : [];
  if (!links.length) return undefined;
  const dl = (l: Raw) => firstStr(l, ['downloadLink', 'tiktokLink']);
  if (preferLang) {
    const match = links.find((l) => (firstStr(l, ['language']) ?? '').toLowerCase().startsWith(preferLang.toLowerCase()));
    if (match) return dl(match);
  }
  const original = links.find((l) => (firstStr(l, ['source']) ?? '') !== 'MT');
  return dl(original ?? links[0]);
}

// 1 item = 1 video, thông tin kênh nhúng trong authorMeta của từng item.
// preferLang: ngôn ngữ phụ đề ưu tiên (mã locale báo cáo) khi video có nhiều bản.
export function normalizeTiktokVideos(
  items: unknown[],
  preferLang?: string,
): {
  page?: SocialPageInfo;
  posts: SocialPost[];
} {
  const posts: SocialPost[] = [];
  let page: SocialPageInfo | undefined;
  for (const v of items) {
    const r = asRaw(v);
    const url = firstStr(r, ['webVideoUrl', 'url']);
    if (!url) continue;
    const meta = asRaw(r.videoMeta);
    posts.push({
      id: firstStr(r, ['id']) ?? url,
      type: 'video',
      url,
      time: iso(r.createTimeISO ?? r.createTime),
      text: firstStr(r, ['text', 'desc']),
      reactions: firstNum(r, ['diggCount', 'likes']),
      comments: firstNum(r, ['commentCount']),
      shares: firstNum(r, ['shareCount']),
      views: firstNum(r, ['playCount', 'views']),
      thumbnail: firstStr(meta, ['coverUrl', 'cover', 'originalCoverUrl']),
      // Link file WebVTT (URL ký tên có hạn) → runner tải + parse ngay sau run.
      transcriptUrl: pickSubtitleLink(meta, preferLang),
    });
    if (!page) {
      const a = asRaw(r.authorMeta);
      const name = firstStr(a, ['nickName', 'name', 'uniqueId']);
      if (name) {
        page = {
          name,
          url: `https://www.tiktok.com/@${firstStr(a, ['name', 'uniqueId']) ?? ''}`,
          followers: firstNum(a, ['fans', 'followers']),
          // hearts (profile-scraper) / heart (tiktok-scraper) - nhận cả hai.
          likes: firstNum(a, ['hearts', 'heart']),
          intro: firstStr(a, ['signature']),
          profilePicture: firstStr(a, ['avatar']),
        };
      }
    }
  }
  return { page, posts };
}

export function tiktokCommentsInput(postUrls: string[], perPost: number): Record<string, unknown> {
  return { postURLs: postUrls, commentsPerPost: perPost, maxRepliesPerComment: 0 };
}

export function normalizeTiktokComment(v: unknown): SocialComment | undefined {
  const r = asRaw(v);
  const text = firstStr(r, ['text', 'comment']);
  if (!text) return undefined;
  return {
    postUrl: firstStr(r, ['videoWebUrl', 'postUrl', 'inputUrl']) ?? '',
    text,
    likes: firstNum(r, ['diggCount', 'likesCount']),
    author: firstStr(r, ['uniqueId', 'nickname', 'author']),
  };
}

// ═══ YouTube (streamers) ═══

// Bật lấy phụ đề: actor trả TEXT SRT inline trong dataset (subtitles[].srt) - đủ nhất
// trong các nền tảng. 'any' = lấy ngôn ngữ nào có; ưu tiên phụ đề tự sinh khi kênh không up.
const YT_SUBTITLE_OPTS = {
  downloadSubtitles: true,
  subtitlesLanguage: 'any',
  subtitlesFormat: 'srt',
  preferAutoGeneratedSubtitles: true,
  saveSubsToKVS: false,
} as const;

export function youtubeChannelInput(channelUrl: string, limit: number): Record<string, unknown> {
  return {
    startUrls: [{ url: channelUrl }],
    maxResults: limit,
    maxResultsShorts: 0,
    maxResultStreams: 0,
    sortVideosBy: 'NEWEST',
    ...YT_SUBTITLE_OPTS,
  };
}

export function youtubeSearchInput(keyword: string, limit: number): Record<string, unknown> {
  // KHÔNG ép sortVideosBy NEWEST khi search theo keyword - để mặc định (độ liên quan)
  // rồi phía ta chọn TOP TƯƠNG TÁC từ pool kết quả (lấy dư → lọc top).
  return { searchQueries: [keyword], maxResults: limit, ...YT_SUBTITLE_OPTS };
}

// Lấy phụ đề YouTube từ output: subtitles[] có TEXT inline (key theo format: srt/vtt/plaintext).
// Ưu tiên đúng ngôn ngữ mong muốn, rồi bản đầu tiên. Trả text THÔ (SRT/VTT) - caller parse.
function pickYoutubeSubtitle(r: Raw, preferLang?: string): { raw?: string; url?: string } {
  const subs = Array.isArray(r.subtitles) ? (r.subtitles as unknown[]).map(asRaw) : [];
  if (!subs.length) return {};
  let chosen = subs[0];
  if (preferLang) {
    const match = subs.find((s) =>
      (firstStr(s, ['language']) ?? '').toLowerCase().startsWith(preferLang.toLowerCase()),
    );
    if (match) chosen = match;
  }
  return {
    raw: firstStr(chosen, ['srt', 'vtt', 'plaintext', 'text', 'xml']),
    url: firstStr(chosen, ['srtUrl', 'vttUrl', 'url']),
  };
}

// 1 item = 1 video, thông tin kênh (channelName/numberOfSubscribers...) nhúng từng item.
export function normalizeYoutubeVideos(
  items: unknown[],
  preferLang?: string,
): {
  page?: SocialPageInfo;
  posts: SocialPost[];
} {
  const posts: SocialPost[] = [];
  let page: SocialPageInfo | undefined;
  for (const v of items) {
    const r = asRaw(v);
    const url = firstStr(r, ['url']);
    if (!url) continue;
    const sub = pickYoutubeSubtitle(r, preferLang);
    posts.push({
      id: firstStr(r, ['id']) ?? url,
      type: 'video',
      url,
      time: iso(r.date ?? r.uploadDate),
      text: firstStr(r, ['title']),
      reactions: firstNum(r, ['likes', 'likeCount']),
      comments: firstNum(r, ['commentsCount']),
      views: firstNum(r, ['viewCount', 'views']),
      thumbnail: firstStr(r, ['thumbnailUrl']),
      // Text phụ đề inline (SRT thô) - runner parse thành lời thoại thuần; URL KVS làm dự phòng.
      transcript: sub.raw,
      transcriptUrl: sub.raw ? undefined : sub.url,
    });
    if (!page) {
      const name = firstStr(r, ['channelName']);
      if (name) {
        page = {
          name,
          url: firstStr(r, ['channelUrl']) ?? '',
          followers: firstNum(r, ['numberOfSubscribers', 'subscriberCount']),
          intro: firstStr(r, ['channelDescription']),
        };
      }
    }
  }
  return { page, posts };
}

export function youtubeCommentsInput(postUrls: string[], maxComments: number): Record<string, unknown> {
  return {
    startUrls: postUrls.map((url) => ({ url })),
    maxComments,
    sortCommentsBy: 'TOP_COMMENTS',
  };
}

export function normalizeYoutubeComment(v: unknown): SocialComment | undefined {
  const r = asRaw(v);
  const text = firstStr(r, ['comment', 'text']);
  if (!text) return undefined;
  return {
    postUrl: firstStr(r, ['videoUrl', 'inputUrl', 'url']) ?? '',
    text,
    likes: firstNum(r, ['voteCount', 'likesCount']),
    author: firstStr(r, ['author', 'authorName']),
  };
}

// ═══ Actor transcript chuyên dụng (bước 'transcript' - bù lời thoại video còn thiếu) ═══

export function transcriptInput(kind: SocialChannelKind, urls: string[]): Record<string, unknown> {
  if (kind === 'youtube') return { videoUrls: urls };
  if (kind === 'tiktok')
    // STT cho video KHÔNG có phụ đề; video có phụ đề dùng lại phụ đề (rẻ hơn transcribe all).
    return { postURLs: urls, downloadSubtitlesOptions: 'DOWNLOAD_AND_TRANSCRIBE_VIDEOS_WITHOUT_SUBTITLES' };
  return { bulkUrls: urls.map((url) => ({ url })) };
}

export interface TranscriptItem {
  url: string; // URL video để khớp lại với bài đã thu
  text?: string; // transcript text sẵn (plain hoặc VTT/SRT thô - caller parse nếu cần)
  fileUrl?: string; // URL file phụ đề/transcript phải tải thêm (TikTok)
}

// Chuẩn hóa output của 3 actor transcript về {url, text|fileUrl}.
export function normalizeTranscriptItems(kind: SocialChannelKind, items: unknown[]): TranscriptItem[] {
  const out: TranscriptItem[] = [];
  for (const v of items) {
    const r = asRaw(v);
    const url = firstStr(r, ['url', 'webVideoUrl', 'facebookUrl', 'videoUrl', 'inputUrl', 'input']);
    if (!url) continue;
    if (kind === 'youtube') {
      // transcript_only_text = plain text; fallback ghép segments.
      let text = firstStr(r, ['transcript_only_text', 'transcriptOnlyText', 'text']);
      if (!text && Array.isArray(r.transcript))
        text = (r.transcript as unknown[])
          .map((s) => firstStr(asRaw(s), ['text']) ?? '')
          .filter(Boolean)
          .join(' ');
      if (text) out.push({ url, text });
      continue;
    }
    if (kind === 'tiktok') {
      const meta = asRaw(r.videoMeta);
      // transcriptionLink = file .txt (STT); nếu không có → link phụ đề .vtt.
      const fileUrl = firstStr(meta, ['transcriptionLink']) ?? pickSubtitleLink(meta);
      if (fileUrl) out.push({ url, fileUrl });
      continue;
    }
    // facebook: transcript plain text inline (kèm vtt/srt dự phòng).
    const text = firstStr(r, ['transcript']) ?? firstStr(r, ['vttSubtitles', 'srtSubtitles']);
    if (text) out.push({ url, text });
  }
  return out;
}

// ═══ Shopee (báo cáo SẢN PHẨM: xtracto detail + zen-studio reviews) ═══

// Tách shopId/itemId từ URL sản phẩm: dạng slug "-i.SHOPID.ITEMID" hoặc "/product/SHOPID/ITEMID".
export function shopeeIds(url: string): { shopId: string; itemId: string } | undefined {
  const m = url.match(/-i\.(\d+)\.(\d+)/) ?? url.match(/\/product\/(\d+)\/(\d+)/);
  if (!m) return undefined;
  return { shopId: m[1], itemId: m[2] };
}

// Mã quốc gia cho actor xtracto - suy từ domain (mặc định vn).
export function shopeeCountry(url: string): string {
  const m = url.match(/shopee\.(vn|co\.id|co\.th|com\.my|sg|ph|com\.br|tw|com\.mx)/i);
  const map: Record<string, string> = {
    vn: 'vn', 'co.id': 'id', 'co.th': 'th', 'com.my': 'my', sg: 'sg',
    ph: 'ph', 'com.br': 'br', tw: 'tw', 'com.mx': 'mx',
  };
  return map[(m?.[1] ?? 'vn').toLowerCase()] ?? 'vn';
}

// Info sản phẩm qua xtracto (nhận shopId+itemId; đã xác minh chạy được cả gói Apify Free).
export function shopeeProductInput(productUrl: string): Record<string, unknown> | undefined {
  const ids = shopeeIds(productUrl);
  if (!ids) return undefined;
  return { country: shopeeCountry(productUrl), shopId: ids.shopId, itemId: ids.itemId };
}

// Đánh giá qua zen-studio: startUrls PHẢI là mảng OBJECT {url} (chuỗi trần bị từ chối -
// đã thử); ưu tiên review CÓ LỜI ('with comments') để AI có chữ để phân tích.
export function shopeeReviewsInput(productUrl: string, limit: number): Record<string, unknown> {
  const ids = shopeeIds(productUrl);
  const url = ids
    ? `https://shopee.${productUrl.match(/shopee\.([a-z.]+)\//i)?.[1] ?? 'vn'}/product/${ids.shopId}/${ids.itemId}`
    : productUrl;
  return { startUrls: [{ url }], maxReviewsPerProduct: limit, contentFilter: 'with comments' };
}

// Output xtracto (snake_case, đã xác minh 07-2026): title/description/price_min/price_max/
// rating_star/total_ratings/historical_sold/models/tier_variations/shop{...}.
// Giá là số THẬT theo đơn vị tiền (không phải micro-units).
export function normalizeShopeeProduct(items: unknown[], productUrl: string): ShopeeProduct | undefined {
  for (const v of items) {
    const r = asRaw(v);
    if (r._warning !== undefined) continue; // item cảnh báo "temporarily unavailable"
    const name = firstStr(r, ['title', 'name']);
    const priceMin = firstNum(r, ['price_min', 'price', 'priceMin']);
    if (!name && priceMin === undefined) continue;
    const shop = asRaw(r.shop);
    const models = Array.isArray(r.models) ? (r.models as unknown[]).map(asRaw) : [];
    const cats = Array.isArray(r.categories)
      ? (r.categories as unknown[])
          .map((c) => (typeof c === 'string' ? c : firstStr(asRaw(c), ['name', 'display_name']) ?? ''))
          .filter(Boolean)
      : undefined;
    const attrs: Record<string, string> = {};
    if (Array.isArray(r.attributes))
      for (const a of (r.attributes as unknown[]).map(asRaw)) {
        const k = firstStr(a, ['name']);
        const val = firstStr(a, ['value']);
        if (k && val) attrs[k] = val;
      }
    return {
      name: name ?? productUrl,
      url: firstStr(r, ['url']) ?? productUrl,
      itemId: firstStr(r, ['item_id', 'itemId']) ?? String(firstNum(r, ['item_id', 'itemId']) ?? ''),
      shopId: firstStr(r, ['shop_id', 'shopId']) ?? String(firstNum(r, ['shop_id', 'shopId']) ?? ''),
      description: firstStr(r, ['description']),
      currency: firstStr(r, ['currency']),
      priceMin,
      priceMax: firstNum(r, ['price_max', 'priceMax']),
      discount: firstStr(r, ['discount_pct', 'discountPercent']) ??
        (firstNum(r, ['discount_pct', 'discountPercent']) !== undefined
          ? `${firstNum(r, ['discount_pct', 'discountPercent'])}%`
          : undefined),
      ratingStar: firstNum(r, ['rating_star', 'rating']),
      ratingCount: firstNum(r, ['total_ratings', 'rating_count', 'ratingCount']),
      sold: firstNum(r, ['historical_sold', 'sold']),
      stock: firstNum(r, ['stock']),
      images: Array.isArray(r.images)
        ? (r.images as unknown[]).map((x) => str(x) ?? '').filter(Boolean).slice(0, 5)
        : undefined,
      variants: models.length
        ? models
            .map((m) => ({
              name: firstStr(m, ['name']) ?? '',
              price: firstNum(m, ['price']),
              stock: firstNum(m, ['stock']),
            }))
            .filter((m) => m.name)
            .slice(0, 20)
        : undefined,
      categories: cats?.length ? cats.slice(0, 5) : undefined,
      attributes: Object.keys(attrs).length ? attrs : undefined,
      shopName: firstStr(shop, ['name', 'username']),
      shopRating: firstNum(shop, ['rating_star', 'rating']),
      shopLocation: firstStr(shop, ['location']),
    };
  }
  return undefined;
}

// Output zen-studio reviews (đã xác minh): ratingStar/comment/createdAt/author/likeCount/
// variations[{name}]/detailedRating{productQuality...}/images/videos/shopReply.
export function normalizeShopeeReview(v: unknown): ShopeeReview | undefined {
  const r = asRaw(v);
  const rating = firstNum(r, ['ratingStar', 'rating']);
  const text = firstStr(r, ['comment', 'text']);
  if (rating === undefined && !text) return undefined;
  const variations = Array.isArray(r.variations) ? (r.variations as unknown[]).map(asRaw) : [];
  const detailed = asRaw(r.detailedRating);
  const aspects: Record<string, string> = {};
  for (const [k, val] of Object.entries(detailed))
    if (typeof val === 'number') aspects[k] = String(val);
  const reply = r.shopReply;
  const sellerReply =
    typeof reply === 'string' ? reply : firstStr(asRaw(reply), ['text', 'comment', 'content']);
  const imgs = Array.isArray(r.images) ? r.images.length : 0;
  const vids = Array.isArray(r.videos) ? r.videos.length : 0;
  const itemId = firstNum(r, ['itemId', 'item_id']);
  return {
    rating,
    text,
    author: firstStr(r, ['author', 'authorName']),
    time: iso(r.createdAt ?? r.time),
    variant: variations.length ? firstStr(variations[0], ['name']) : undefined,
    likes: firstNum(r, ['likeCount', 'likesCount']),
    mediaCount: imgs + vids > 0 ? imgs + vids : undefined,
    sellerReply,
    aspects: Object.keys(aspects).length ? aspects : undefined,
    itemId: itemId !== undefined ? String(itemId) : firstStr(r, ['itemId', 'item_id']),
  };
}

// ═══ SHOP Shopee (báo cáo shop: xtracto shop-scraper + detail lấy info shop) ═══

// Tách định danh shop từ input: URL /shop/<id>, URL /<username>, hoặc username/id trần.
export function shopeeShopIdent(input: string): string {
  const byId = input.match(/shopee\.[a-z.]+\/shop\/(\d+)/i);
  if (byId) return byId[1];
  const byUser = input.match(/shopee\.[a-z.]+\/([\w.]+)/i);
  if (byUser) return byUser[1];
  return input.replace(/^@/, '').trim();
}

const SHOPEE_TLD: Record<string, string> = {
  vn: 'vn', id: 'co.id', th: 'co.th', my: 'com.my', sg: 'sg',
  ph: 'ph', br: 'com.br', tw: 'tw', mx: 'com.mx',
};

export function shopeeShopInput(shopUrl: string, limit: number): Record<string, unknown> {
  return { country: shopeeCountry(shopUrl), shop: shopeeShopIdent(shopUrl), maxProducts: limit };
}

// Listing của shop-scraper: name/price/rating đúng hàng nhưng field `url` bị LỆCH MỘT HÀNG
// (đã xác minh 07-2026) → TỰ DỰNG URL canonical từ shop_id + item_id, bỏ qua url của actor.
export function normalizeShopProducts(items: unknown[], shopUrl: string): ShopeeProduct[] {
  const tld = SHOPEE_TLD[shopeeCountry(shopUrl)] ?? 'vn';
  const out: ShopeeProduct[] = [];
  for (const v of items) {
    const r = asRaw(v);
    const itemId = firstNum(r, ['item_id']) ?? Number(firstStr(r, ['item_id']));
    const shopId = firstNum(r, ['shop_id']) ?? Number(firstStr(r, ['shop_id']));
    const name = firstStr(r, ['name', 'title']);
    if (!name || !Number.isFinite(itemId) || !Number.isFinite(shopId)) continue;
    const discount = firstNum(r, ['discount_pct']);
    out.push({
      name,
      url: `https://shopee.${tld}/product/${shopId}/${itemId}`,
      itemId: String(itemId),
      shopId: String(shopId),
      currency: firstStr(r, ['currency']),
      priceMin: firstNum(r, ['price', 'price_min']),
      priceMax: firstNum(r, ['price_max']),
      discount: discount !== undefined && discount > 0 ? `${discount}%` : undefined,
      ratingStar: firstNum(r, ['rating', 'rating_star']),
      ratingCount: firstNum(r, ['rating_count']),
      sold: firstNum(r, ['sold_count', 'sold']),
      images: firstStr(r, ['image_url']) ? [firstStr(r, ['image_url'])!] : undefined,
    });
  }
  return out;
}

// Info shop rút từ field shop{} của actor product-detail (chạy trên 1 sản phẩm của shop).
export function normalizeShopeeShopInfo(items: unknown[], shopUrl: string): ShopeeShopInfo | undefined {
  for (const v of items) {
    const r = asRaw(v);
    if (r._warning !== undefined) continue;
    const shop = asRaw(r.shop);
    const name = firstStr(shop, ['name', 'username']);
    if (!name) continue;
    const username = firstStr(shop, ['username']);
    const tld = SHOPEE_TLD[shopeeCountry(shopUrl)] ?? 'vn';
    return {
      name,
      url: username ? `https://shopee.${tld}/${username}` : shopUrl,
      username,
      rating: firstNum(shop, ['rating_star', 'rating']),
      followers: firstNum(shop, ['follower_count', 'followers']),
      itemCount: firstNum(shop, ['item_count']),
      responseRate: firstNum(shop, ['response_rate']),
      location: firstStr(shop, ['location']),
      isOfficialShop: shop.is_official_shop === true || undefined,
      isVerified: shop.is_shopee_verified === true || undefined,
    };
  }
  return undefined;
}

// Đánh giá của NHIỀU sản phẩm (top sản phẩm của shop) trong 1 run zen-studio.
export function shopeeShopReviewsInput(productUrls: string[], perProduct: number): Record<string, unknown> {
  return {
    startUrls: productUrls.map((url) => ({ url })),
    maxReviewsPerProduct: perProduct,
    contentFilter: 'with comments',
  };
}

// ═══ TikTok Shop (báo cáo SẢN PHẨM + SHOP - tái dùng kiểu dữ liệu Shopee) ═══

// Khu vực 3 actor (detail/reviews/search) ĐỀU hỗ trợ - giao của 3 enum (đã đối chiếu schema).
export const TTS_REGIONS = ['VN', 'US', 'JP', 'ID', 'MY', 'PH', 'SG', 'TH', 'MX'] as const;

export function ttsRegion(v: string | undefined): string {
  const r = (v ?? '').toUpperCase();
  return (TTS_REGIONS as readonly string[]).includes(r) ? r : 'VN';
}

const TTS_CURRENCY: Record<string, string> = {
  VN: 'VND', US: 'USD', JP: 'JPY', ID: 'IDR', MY: 'MYR', PH: 'PHP', SG: 'SGD', TH: 'THB', MX: 'MXN',
};

// Tách ID sản phẩm (18-19 số) từ các dạng link TikTok Shop:
// www.tiktok.com/view/product/ID · shop.tiktok.com/view/product/ID · tiktok.com/shop/pdp/<slug>/ID
// · shop.tiktok.com/<cc>/pdp/ID (KHÔNG có slug - dạng thật user dán 07-2026) hoặc ID trần.
// (Link rút gọn vt.tiktok.com được route giải redirect TRƯỚC khi tới đây.)
export function ttsProductId(input: string): string | undefined {
  const m =
    input.match(/\/(?:view\/product|product)\/(\d{15,20})/i) ??
    input.match(/\/pdp\/(?:[^/?#]*\/)?(\d{15,20})/i) ??
    input.match(/^(\d{15,20})$/);
  return m?.[1];
}

export function ttsProductUrl(productId: string): string {
  return `https://www.tiktok.com/view/product/${productId}`;
}

// Detail qua cunning_soil (mobile API): productInput = ID, output full_readable (đã xác minh).
export function ttsDetailInput(productId: string, region: string): Record<string, unknown> {
  return { productInput: productId, region: ttsRegion(region), outputMode: 'full_readable' };
}

// Đánh giá qua web_wanderer: nhận MẢNG product_ids (báo cáo shop truyền top sản phẩm);
// include_personal_information để có tên người đánh giá (đã xác minh output).
export function ttsReviewsInput(
  productIds: string[],
  region: string,
  perProduct: number,
): Record<string, unknown> {
  return {
    region: ttsRegion(region),
    product_ids: productIds,
    reviews_limit: perProduct,
    include_personal_information: true,
  };
}

// Search qua pratikdani (backend analytics, kèm seller + tổng đã bán/GMV). limit TỐI ĐA 10.
export function ttsSearchInput(keyword: string, region: string, page: number): Record<string, unknown> {
  return { country_code: ttsRegion(region), keyword, limit: 10, page: Math.max(1, page) };
}

// Giá hiển thị dạng chuỗi → số thật: "68.000₫"/"145.000" (chấm nghìn) · "$15.60" (chấm thập
// phân) · "409335" (số trần). Nhóm 3 chữ số lặp lại = phân tách nghìn.
function parsePriceDisplay(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/[^\d.,]/g, '');
  if (!s) return undefined;
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ''));
  if (/^\d+([.,]\d{1,2})?$/.test(s)) return Number(s.replace(',', '.'));
  return undefined;
}

// Output cunning_soil (đã xác minh 07-2026): 1 item {product_info:{products:[{title, category,
// pricing{currency, sale_price, original_price, discount:"-53%"}, sales{sold_count}, inventory
// {total_stock, skus[{sku_sale_props[{prop_value}], stock, price{real_price{price_val}}}]},
// media{image_urls}, seller{seller_id, name, rating, location}, reviews{product_rating,
// review_count}}]}}. Giá sku ở price_val là số TRẦN → nguồn giá đáng tin nhất.
export function normalizeTtsProduct(items: unknown[], inputUrl: string): ShopeeProduct | undefined {
  for (const v of items) {
    const info = asRaw(asRaw(v).product_info);
    const list = Array.isArray(info.products) ? (info.products as unknown[]).map(asRaw) : [];
    for (const p of list) {
      const name = firstStr(p, ['title', 'name']);
      if (!name) continue;
      const pricing = asRaw(p.pricing);
      const sales = asRaw(p.sales);
      const inventory = asRaw(p.inventory);
      const media = asRaw(p.media);
      const seller = asRaw(p.seller);
      const reviews = asRaw(p.reviews);
      const skus = Array.isArray(inventory.skus) ? (inventory.skus as unknown[]).map(asRaw) : [];
      const skuPrices = skus
        .map((s0) => num(asRaw(asRaw(asRaw(s0).price).real_price).price_val))
        .filter((n): n is number => n !== undefined);
      const priceMin =
        (skuPrices.length ? Math.min(...skuPrices) : undefined) ??
        parsePriceDisplay(pricing.sale_price) ??
        parsePriceDisplay(asRaw(pricing.raw).min_sku_price);
      const priceMax = skuPrices.length ? Math.max(...skuPrices) : undefined;
      const discountRaw = firstStr(pricing, ['discount']);
      const productId = firstStr(p, ['product_id']) ?? ttsProductId(inputUrl);
      const rating = num(reviews.product_rating);
      const variants = skus
        .map((s0) => {
          const props = Array.isArray(s0.sku_sale_props)
            ? (s0.sku_sale_props as unknown[]).map(asRaw)
            : [];
          return {
            name: props.map((pr) => firstStr(pr, ['prop_value']) ?? '').filter(Boolean).join(' / '),
            price: num(asRaw(asRaw(asRaw(s0).price).real_price).price_val),
            stock: num(s0.stock),
          };
        })
        .filter((x) => x.name)
        .slice(0, 20);
      const catName = firstStr(asRaw(p.category), ['name']);
      return {
        name,
        url: productId ? ttsProductUrl(productId) : inputUrl,
        itemId: productId,
        shopId: firstStr(seller, ['seller_id']),
        description: firstStr(p, ['description']),
        currency: firstStr(pricing, ['currency']),
        priceMin,
        priceMax: priceMax !== undefined && priceMax !== priceMin ? priceMax : undefined,
        discount: discountRaw ? discountRaw.replace(/^-/, '') : undefined,
        ratingStar: rating !== undefined && rating > 0 ? rating : undefined,
        ratingCount: num(reviews.review_count),
        sold: num(sales.sold_count),
        stock: num(inventory.total_stock),
        images: Array.isArray(media.image_urls)
          ? (media.image_urls as unknown[]).map((x) => str(x) ?? '').filter(Boolean).slice(0, 5)
          : undefined,
        variants: variants.length ? variants : undefined,
        categories: catName ? [catName] : undefined,
        shopName: firstStr(seller, ['name']),
        shopRating: num(seller.rating),
        shopLocation: firstStr(seller, ['location']),
      };
    }
  }
  return undefined;
}

// Output web_wanderer (đã xác minh): review_rating/review_text/reviewer_name/review_time
// (epoch MILI GIÂY dạng chuỗi)/sku_specification/review_images/product_id/product_name.
export function normalizeTtsReview(v: unknown): ShopeeReview | undefined {
  const r = asRaw(v);
  const rating = num(r.review_rating);
  const text = firstStr(r, ['review_text']);
  if (rating === undefined && !text) return undefined;
  const imgs = Array.isArray(r.review_images) ? r.review_images.length : 0;
  const epoch = num(r.review_time);
  return {
    rating,
    text,
    author: firstStr(r, ['reviewer_name']),
    time: epoch !== undefined ? iso(epoch) : iso(r.review_time),
    variant: firstStr(r, ['sku_specification']),
    mediaCount: imgs > 0 ? imgs : undefined,
    itemId: firstStr(r, ['product_id']),
  };
}

// Bỏ dấu + thường hóa để so khớp tên shop ("Cỏ Mềm" ≈ "co mem").
function foldName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

// 1 row kết quả search TikTok Shop → ShopeeProduct (dùng chung cho danh mục shop đã lọc
// seller VÀ search thị trường của tổng thể e-commerce - không lọc).
function ttsRowToProduct(r: Raw, seller: Raw, region: string): ShopeeProduct | undefined {
  const id = firstStr(r, ['product_id']);
  const name = firstStr(r, ['product_name', 'product_title']);
  if (!id || !name) return undefined;
  const off = num(r.off);
  const rating = num(r.product_rating);
  const cover = firstStr(r, ['cover_url']);
  return {
    name,
    url: ttsProductUrl(id),
    itemId: id,
    shopId: firstStr(seller, ['seller_id']),
    currency: TTS_CURRENCY[ttsRegion(region)],
    priceMin: num(r.real_price),
    discount: off !== undefined && off > 0 ? `${off}%` : undefined,
    ratingStar: rating !== undefined && rating > 0 ? rating : undefined,
    ratingCount: parseApproxCount(firstStr(r, ['review_count'])),
    sold: parseApproxCount(firstStr(r, ['total_sale_cnt'])),
    // Nhịp bán gần đây (chuỗi "106.32K") → biểu đồ tăng/giảm của báo cáo thị trường.
    sold7d: parseApproxCount(firstStr(r, ['total_sale_7d_cnt'])),
    sold30d: parseApproxCount(firstStr(r, ['total_sale_30d_cnt'])),
    images: cover ? [cover] : undefined,
    shopName: firstStr(seller, ['seller_name']),
  };
}

// Search thị trường TikTok Shop (tổng thể e-commerce): GIỮ MỌI seller, kèm tên shop.
export function normalizeTtsSearchProducts(items: unknown[], region: string): ShopeeProduct[] {
  return items
    .map(asRaw)
    .map((r) => ttsRowToProduct(r, asRaw(r.seller), region))
    .filter((p): p is ShopeeProduct => p !== undefined);
}

// Danh mục shop TikTok Shop từ kết quả SEARCH theo tên shop: lọc theo SELLER ĐA SỐ
// (ưu tiên seller có tên khớp tên nhập; đã kiểm thực tế 9-10/10 item đúng seller với shop
// có tên riêng). Output search (đã xác minh): product_id/product_name/real_price (số trần)/
// original_price/product_rating/review_count ("12.5K")/total_sale_cnt ("951.59K")/cover_url/
// seller{seller_id, seller_name, total_sale_cnt, total_sale_gmv_amt}.
export function normalizeTtsShopItems(
  items: unknown[],
  shopNameQuery: string,
  region: string,
): { products: ShopeeProduct[]; shopInfo?: ShopeeShopInfo } {
  const rows = items
    .map(asRaw)
    .map((r) => ({ r, seller: asRaw(r.seller) }))
    .filter((x) => firstStr(x.r, ['product_id']) && firstStr(x.seller, ['seller_id']));
  if (!rows.length) return { products: [] };
  // Gom theo seller → chọn nhóm tên khớp (chứa/được chứa) đông nhất, không có thì nhóm đông nhất.
  const bySeller = new Map<string, typeof rows>();
  for (const x of rows) {
    const id = firstStr(x.seller, ['seller_id'])!;
    bySeller.set(id, [...(bySeller.get(id) ?? []), x]);
  }
  const q = foldName(shopNameQuery);
  let best: typeof rows | undefined;
  let bestMatched = false;
  for (const group of bySeller.values()) {
    const name = foldName(firstStr(group[0].seller, ['seller_name']) ?? '');
    const matched = !!q && !!name && (name.includes(q) || q.includes(name));
    if (
      !best ||
      (matched && !bestMatched) ||
      (matched === bestMatched && group.length > best.length)
    ) {
      best = group;
      bestMatched = matched;
    }
  }
  if (!best) return { products: [] };
  const products = best
    .map(({ r, seller }) => ttsRowToProduct(r, seller, region))
    .filter((p): p is ShopeeProduct => p !== undefined);
  const s0 = best[0].seller;
  const sellerName = firstStr(s0, ['seller_name']);
  const shopInfo: ShopeeShopInfo | undefined = sellerName
    ? {
        name: sellerName,
        url: '', // TikTok Shop không có URL shop công khai trên web
        totalSold: firstStr(s0, ['total_sale_cnt']),
        gmv: firstStr(s0, ['total_sale_gmv_amt']) ?? firstStr(s0, ['total_sale_gmv_amt_fz']),
      }
    : undefined;
  return { products, shopInfo };
}

// ═══ Lazada (sản phẩm + shop + search - fatihtahta all-in-one) ═══

// Mã quốc gia Lazada suy từ domain (6 nước SEA; mặc định vn).
export function lazadaCountry(url: string): string {
  const m = url.match(/lazada\.(vn|co\.id|co\.th|com\.my|sg|com\.ph)/i);
  const map: Record<string, string> = {
    vn: 'vn', 'co.id': 'id', 'co.th': 'th', 'com.my': 'my', sg: 'sg', 'com.ph': 'ph',
  };
  return map[(m?.[1] ?? 'vn').toLowerCase()] ?? 'vn';
}

const LAZADA_CURRENCY: Record<string, string> = {
  vn: 'VND', id: 'IDR', th: 'THB', my: 'MYR', sg: 'SGD', ph: 'PHP',
};

// ID sản phẩm từ link Lazada: .../ten-san-pham-i3199369524.html (có thể kèm -sSKU) hoặc
// dạng canonical pdp-i3199369524.html.
export function lazadaProductId(url: string): string | undefined {
  const m = url.match(/-i(\d{6,16})(?:-s\d+)?\.html/i);
  return m?.[1];
}

// Từ khóa search rút từ SLUG của link sản phẩm (PDP bị chặn → tìm lại sản phẩm qua catalog).
// "https://www.lazada.vn/products/combo-2-tay-trang-i319..html" → "combo 2 tay trang".
// Link dạng canonical "pdp-iID.html" KHÔNG có slug → undefined (route chặn từ đầu).
export function lazadaSlugKeyword(url: string): string | undefined {
  const m = url.match(/\/products\/(.+?)-i\d{6,16}(?:-s\d+)?\.html/i);
  if (!m) return undefined;
  let slug = m[1];
  try {
    slug = decodeURIComponent(slug);
  } catch {
    /* giữ nguyên nếu decode lỗi */
  }
  const words = slug.split(/[-\s]+/).filter(Boolean);
  if (!words.length || (words.length === 1 && words[0].toLowerCase() === 'pdp')) return undefined;
  // Cắt bớt slug quá dài - search Lazada khớp tốt với ~12 từ ĐẦU của tên sản phẩm.
  return words.slice(0, 12).join(' ');
}

// Input sản phẩm: search theo từ khóa slug + đánh giá inline (limit tối thiểu 10 của actor).
export function lzProductInput(
  keyword: string,
  country: string,
  maxReviews: number,
): Record<string, unknown> {
  return { queries: [keyword], country, limit: 10, sort: 'best', getReviews: true, maxReviews };
}

// Input shop: URL shop → danh mục + đánh giá inline (maxReviews là TRÊN MỖI sản phẩm).
export function lzShopInput(
  shopUrl: string,
  limit: number,
  maxReviewsPerProduct: number,
): Record<string, unknown> {
  return {
    startUrls: [{ url: shopUrl }],
    country: lazadaCountry(shopUrl),
    limit: Math.max(10, limit),
    getReviews: true,
    maxReviews: maxReviewsPerProduct,
  };
}

// Input search cho tổng thể e-commerce (không lấy đánh giá - chỉ bức tranh sản phẩm).
export function lzEcomSearchInput(keyword: string, country: string, limit: number): Record<string, unknown> {
  return { queries: [keyword], country, limit: Math.max(10, limit), sort: 'best', getReviews: false };
}

// 1 record sản phẩm của fatihtahta (record_type='product', đã xác minh 07-2026):
// pricing{current_price,original_price,discount:"42% Off"}, inventory{item_sold:"11.1K sold"},
// ratings{rating_score,review_count}, vendor{seller_name,seller_id,location}, brand, media.
function normalizeLzProduct(r: Raw, country: string): ShopeeProduct | undefined {
  const id = firstStr(r, ['product_id']) ?? String(firstNum(r, ['product_id', 'id']) ?? '');
  const name = firstStr(r, ['product_name']);
  if (!id || !name) return undefined;
  const pricing = asRaw(r.pricing);
  const inventory = asRaw(r.inventory);
  const ratings = asRaw(r.ratings);
  const vendor = asRaw(r.vendor);
  const media = asRaw(r.media);
  const discount = firstStr(pricing, ['discount']);
  const ratingRaw = num(ratings.rating_score);
  const rating = ratingRaw !== undefined && ratingRaw > 0 ? Math.round(ratingRaw * 100) / 100 : undefined;
  const img = firstStr(media, ['primary_image']);
  return {
    name,
    url: firstStr(r, ['product_url', 'url']) ?? `https://www.lazada.vn/products/pdp-i${id}.html`,
    itemId: id,
    shopId: firstStr(vendor, ['seller_id']),
    currency: LAZADA_CURRENCY[country] ?? 'VND',
    priceMin: num(pricing.current_price),
    discount: discount ? discount.replace(/\s*off\s*$/i, '').trim() : undefined,
    ratingStar: rating,
    ratingCount: num(ratings.review_count),
    sold: parseApproxCount(firstStr(inventory, ['item_sold'])),
    images: img ? [img] : undefined,
    shopName: firstStr(vendor, ['seller_name']),
    shopLocation: firstStr(vendor, ['location']),
  };
}

// 1 record đánh giá (record_type='review'): review{buyer_name,rating,review_content_list,
// like_count,media}; review_time là CHUỖI TƯƠNG ĐỐI ("2 weeks ago") → không đổi được ISO.
function normalizeLzReview(r: Raw): ShopeeReview | undefined {
  const rv = asRaw(r.review);
  const rating = num(rv.rating);
  const contents = Array.isArray(rv.review_content_list)
    ? (rv.review_content_list as unknown[])
        .map((c) => firstStr(asRaw(c), ['content']) ?? '')
        .filter(Boolean)
    : [];
  const text = contents.join('\n') || undefined;
  if (rating === undefined && !text) return undefined;
  const mediaCount = Array.isArray(rv.media) ? rv.media.length : 0;
  return {
    rating,
    text,
    author: firstStr(rv, ['buyer_name']),
    variant: firstStr(rv, ['sku_info', 'skuInfo']),
    likes: firstNum(rv, ['like_count']),
    mediaCount: mediaCount > 0 ? mediaCount : undefined,
    itemId: firstStr(r, ['product_id']) ?? String(firstNum(r, ['product_id']) ?? ''),
  };
}

// Tách dataset trộn của fatihtahta (record_type 'product' | 'review') → sản phẩm + đánh giá.
export function normalizeLzItems(
  items: unknown[],
  country: string,
): { products: ShopeeProduct[]; reviews: ShopeeReview[] } {
  const products: ShopeeProduct[] = [];
  const reviews: ShopeeReview[] = [];
  for (const v of items) {
    const r = asRaw(v);
    const type = firstStr(r, ['record_type', 'type']);
    if (type === 'review') {
      const rv = normalizeLzReview(r);
      if (rv) reviews.push(rv);
    } else if (type === 'product') {
      const p = normalizeLzProduct(r, country);
      if (p) products.push(p);
    }
  }
  return { products, reviews };
}

// Info shop Lazada dựng từ vendor của danh mục (actor không trả record shop riêng):
// seller đa số + địa điểm; không có sao/follower cấp shop → ô header dùng chỉ số danh mục.
export function lazadaShopInfoFromProducts(
  products: ShopeeProduct[],
  shopUrl: string,
): ShopeeShopInfo | undefined {
  const byName = new Map<string, number>();
  for (const p of products) if (p.shopName) byName.set(p.shopName, (byName.get(p.shopName) ?? 0) + 1);
  const top = [...byName.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return undefined;
  const sample = products.find((p) => p.shopName === top[0]);
  return { name: top[0], url: shopUrl, location: sample?.shopLocation };
}

// ═══ Search Shopee theo keyword (tổng thể e-commerce - xtracto~shopee-search) ═══

// fetchDetail=true → mỗi item là DETAIL đầy đủ (title/price/rating_star/shop{name...}) thay
// cho record search bị Shopee chặn field (sold/rating_count/shop_name null - đã xác minh).
export function shopeeSearchInput(keyword: string, country: string, limit: number): Record<string, unknown> {
  return {
    country,
    mode: 'keyword',
    keyword,
    sort: 'sales', // nghiên cứu thị trường → ưu tiên sản phẩm BÁN CHẠY
    maxProducts: limit,
    fetchDetail: true,
  };
}

// Mỗi item detail → tái dùng normalizeShopeeProduct (schema xtracto detail); URL tự dựng
// từ shop_id+item_id (item detail không có field url).
export function normalizeShopeeSearchItems(items: unknown[], country: string): ShopeeProduct[] {
  const tld = SHOPEE_TLD[country] ?? 'vn';
  const out: ShopeeProduct[] = [];
  for (const v of items) {
    const r = asRaw(v);
    const itemId = firstNum(r, ['item_id']);
    const shopId = firstNum(r, ['shop_id']);
    const url =
      firstStr(r, ['url']) ??
      (itemId !== undefined && shopId !== undefined
        ? `https://shopee.${tld}/product/${shopId}/${itemId}`
        : '');
    const p = normalizeShopeeProduct([v], url);
    if (p) out.push(p);
  }
  return out;
}

// ═══ Facebook search theo keyword (best-effort, actor cộng đồng) ═══

// Facebook KHÔNG hỗ trợ sort theo tương tác khi search → dùng ranking "độ liên quan"
// (recent_posts: false - thuật toán FB vốn ưu tiên bài tương tác cao) + giới hạn 12 tháng
// gần nhất để tránh bài viral quá cũ; lớp topByEngagement của ta lọc chính xác phần còn lại.
export function fbSearchInput(keyword: string, limit: number): Record<string, unknown> {
  const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  return {
    query: keyword,
    search_type: 'posts',
    max_results: limit,
    recent_posts: false,
    start_date: yearAgo,
  };
}

export function normalizeFbSearchPost(v: unknown): SocialPost | undefined {
  const r = asRaw(v);
  const url = firstStr(r, ['url', 'post_url']);
  const text = firstStr(r, ['message', 'text']);
  if (!url && !text) return undefined;
  return {
    id: firstStr(r, ['post_id', 'id']) ?? url ?? text!.slice(0, 40),
    type: 'text',
    url: url ?? '',
    time: iso(r.timestamp ?? r.time),
    text,
    reactions: firstNum(r, ['reactions_count', 'reactionsCount', 'likes']),
    comments: firstNum(r, ['comments_count', 'commentsCount']),
    shares: firstNum(r, ['reshare_count', 'sharesCount', 'shares']),
  };
}

// ═══ Instagram (bộ chính thức của Apify) ═══

// Lấy username từ URL profile / @handle / handle trần.
export function igUsername(input: string): string {
  const m = input.match(/instagram\.com\/([\w.]+)/i);
  if (m) return m[1];
  return input.replace(/^@/, '').trim();
}

export function igProfileInput(profileUrl: string): Record<string, unknown> {
  return { usernames: [igUsername(profileUrl)] };
}

// Thông tin profile IG (fullName/followersCount/biography... - đã xác minh output 07-2026).
export function normalizeIgProfile(items: unknown[], profileUrl: string): SocialPageInfo | undefined {
  const r = asRaw(items[0]);
  if (!Object.keys(r).length) return undefined;
  const cat = firstStr(r, ['businessCategoryName']);
  return {
    name: firstStr(r, ['fullName', 'username']) ?? profileUrl,
    url: firstStr(r, ['url']) ?? profileUrl,
    followers: firstNum(r, ['followersCount']),
    categories: cat ? [cat] : undefined,
    intro: firstStr(r, ['biography']),
    profilePicture: firstStr(r, ['profilePicUrlHD', 'profilePicUrl']),
  };
}

export function igPostsInput(profileUrl: string, limit: number): Record<string, unknown> {
  return { username: [igUsername(profileUrl)], resultsLimit: limit };
}

// includeTranscript ($): lời thoại reel trả inline trong field `transcript` (đã xác minh).
export function igReelsInput(profileUrl: string, limit: number): Record<string, unknown> {
  return { username: [igUsername(profileUrl)], resultsLimit: limit, includeTranscript: true };
}

export function igCommentsInput(postUrls: string[], limit: number): Record<string, unknown> {
  return { directUrls: postUrls, resultsLimit: limit };
}

// Search theo keyword (báo cáo tổng thể): hashtag-scraper chế độ keywordSearch.
export function igSearchInput(keyword: string, limit: number): Record<string, unknown> {
  return { hashtags: [keyword], keywordSearch: true, resultsType: 'posts', resultsLimit: limit };
}

// Bài IG: type 'Image'|'Video'|'Sidecar'; likesCount = -1 khi chủ bài ẨN số like → bỏ.
export function normalizeIgPost(v: unknown): SocialPost | undefined {
  const r = asRaw(v);
  const url = firstStr(r, ['url']) ?? '';
  const id = firstStr(r, ['id', 'shortCode']) ?? url;
  if (!id && !url) return undefined;
  const t = (firstStr(r, ['type', 'productType']) ?? '').toLowerCase();
  const type: SocialPostType = t.includes('video') || t.includes('reel')
    ? 'video'
    : t.includes('image') || t.includes('sidecar') || t.includes('carousel')
      ? 'image'
      : 'other';
  const likes = firstNum(r, ['likesCount']);
  return {
    id: id || url,
    type,
    url,
    time: iso(r.timestamp),
    text: firstStr(r, ['caption']),
    reactions: likes !== undefined && likes >= 0 ? likes : undefined,
    comments: firstNum(r, ['commentsCount']),
    views: firstNum(r, ['videoPlayCount', 'videoViewCount']),
    thumbnail: firstStr(r, ['displayUrl']),
    transcript: firstStr(r, ['transcript']),
  };
}

export function normalizeIgReel(v: unknown): SocialPost | undefined {
  const p = normalizeIgPost(v);
  if (!p) return undefined;
  return { ...p, type: 'reel' };
}

export function normalizeIgComment(v: unknown): SocialComment | undefined {
  const r = asRaw(v);
  const text = firstStr(r, ['text']);
  if (!text) return undefined;
  return {
    postUrl: firstStr(r, ['postUrl']) ?? '',
    text,
    likes: firstNum(r, ['likesCount']),
    author: firstStr(r, ['ownerUsername']),
  };
}

// ═══ Threads (automation-lab + pro100chok) ═══

export function threadsUsername(input: string): string {
  const m = input.match(/threads\.(?:net|com)\/@?([\w.]+)/i);
  if (m) return m[1];
  return input.replace(/^@/, '').trim();
}

export function threadsPostsInput(profileUrl: string, limit: number): Record<string, unknown> {
  return { mode: 'posts', usernames: [threadsUsername(profileUrl)], maxPosts: limit, includeProfile: true };
}

export function threadsSearchInput(keyword: string, limit: number): Record<string, unknown> {
  return { mode: 'search', searchQueries: [keyword], maxPosts: limit, includeProfile: false };
}

// Dataset trộn: item type='profile' (kênh) + type='post' (bài) - đã xác minh output 07-2026.
// Threads thuần chữ: shares = repost + quote (2 chỉ số lan truyền đặc trưng cộng lại).
export function normalizeThreadsItems(items: unknown[]): {
  page?: SocialPageInfo;
  posts: SocialPost[];
} {
  const posts: SocialPost[] = [];
  let page: SocialPageInfo | undefined;
  for (const v of items) {
    const r = asRaw(v);
    const kind = firstStr(r, ['type']);
    if (kind === 'profile') {
      page ??= {
        name: firstStr(r, ['fullName', 'username']) ?? '',
        url: firstStr(r, ['url']) ?? '',
        followers: firstNum(r, ['followerCount']),
        intro: firstStr(r, ['biography']),
        profilePicture: firstStr(r, ['profilePicUrl']),
      };
      continue;
    }
    const rawUrl = firstStr(r, ['url']);
    // Actor trả URL dạng /t/CODE; dựng lại dạng /@user/post/CODE - cần cho actor replies
    // (dạng /t/ bị trả rỗng - đã thử) và cũng là URL canonical để hiển thị.
    const code = firstStr(r, ['code']);
    const user = firstStr(r, ['username']);
    const url = code && user ? `https://www.threads.net/@${user}/post/${code}` : rawUrl;
    if (!url) continue;
    const mediaType = (firstStr(r, ['mediaType']) ?? 'text').toLowerCase();
    const media = Array.isArray(r.media) ? (r.media as unknown[]).map(asRaw) : [];
    const repost = firstNum(r, ['repostCount']) ?? 0;
    const quote = firstNum(r, ['quoteCount']) ?? 0;
    posts.push({
      id: firstStr(r, ['postId', 'code']) ?? url,
      type: mediaType.includes('video') ? 'video' : mediaType.includes('photo') ? 'image' : 'text',
      url,
      time: firstStr(r, ['date']) ?? iso(r.timestamp),
      text: firstStr(r, ['text']),
      reactions: firstNum(r, ['likeCount']),
      comments: firstNum(r, ['replyCount']),
      shares: repost + quote > 0 ? repost + quote : undefined,
      thumbnail: media.length ? firstStr(media[0], ['url']) : undefined,
      author: firstStr(r, ['username']), // search theo keyword: bài của nhiều tác giả
    });
  }
  return { page, posts };
}

// pro100chok: URL bài PHẢI dạng threads.net/@user/post/CODE (dạng /t/CODE trả rỗng - đã thử).
export function threadsRepliesInput(postUrls: string[], maxItems: number): Record<string, unknown> {
  return { action: 'post_replies', posts: postUrls, maxItems };
}

export function normalizeThreadsReply(v: unknown): SocialComment | undefined {
  const r = asRaw(v);
  const text = firstStr(r, ['text', 'text_from_fragments']);
  if (!text) return undefined;
  return {
    postUrl: firstStr(r, ['post_url']) ?? '',
    text,
    likes: firstNum(r, ['like_count']),
    author: firstStr(r, ['username']),
  };
}

// ═══ NHÓM Facebook công khai (báo cáo nhóm) ═══

// Bài viết trong nhóm. groupSort 'top' = bài NỔI BẬT (TOP_POSTS) giới hạn 6 tháng gần nhất
// (tránh bài viral quá cũ làm lệch bức tranh hiện tại); 'new' = mới nhất (CHRONOLOGICAL).
export function groupPostsInput(
  groupUrl: string,
  limit: number,
  groupSort: SocialReportOptions['groupSort'],
): Record<string, unknown> {
  const input: Record<string, unknown> = {
    startUrls: [{ url: groupUrl }],
    resultsLimit: limit,
    viewOption: groupSort === 'new' ? 'CHRONOLOGICAL' : 'TOP_POSTS',
  };
  if (groupSort !== 'new') {
    input.onlyPostsNewerThan = new Date(Date.now() - 182 * 86_400_000).toISOString().slice(0, 10);
  }
  return input;
}

// Trần chi phí cho run info nhóm (actor pay-per-event, 1 nhóm/run) - đủ rộng, vẫn khóa phí.
export const GROUP_INFO_MAX_USD = 0.3;

// Trần chi phí cho actor BÊN THỨ BA tính phí pay-per-event (xtracto/zen-studio/automation-lab/
// pro100chok): nếu CHỈ đặt maxItems, Apify tự suy trần tiền quá thấp và ABORT run trước khi
// trả dữ liệu ("Aborted automatically after reaching the maximum cost" - đã dính thực tế 2 lần:
// info nhóm FB và sản phẩm Shopee). Actor chính chủ apify~* không cần (nền tảng biết đơn giá).
// Scale theo số item, tối thiểu $0.5 - vẫn là chốt khóa chi phí.
export function ppeChargeCap(items: number): number {
  return Math.max(0.5, Math.ceil(items) / 100); // ~$0.01/item, sàn $0.5
}

// Actor search nhóm nhận trực tiếp URL nhóm trong startUrls (query 'direct_urls').
export function groupInfoInput(groupUrl: string): Record<string, unknown> {
  return { startUrls: [groupUrl], maxItems: 1 };
}

// Actor trả text HTML-encode (tên nhóm tiếng Việt thành &#x1ed9;... - đã xác minh 07-2026).
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// Đọc số thành viên từ chuỗi hiển thị: "127,920 total members" / "21K members" / "1.3M members".
function parseApproxCount(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const m = s.replace(/,/g, '').match(/([\d.]+)\s*([KMB])?/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return undefined;
  const mul = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] ?? '').toUpperCase() as 'K' | 'M' | 'B'] ?? 1;
  return Math.round(n * mul);
}

// Thông tin nhóm: tên, SỐ THÀNH VIÊN (map vào followers), quyền riêng tư.
// Output thật (đã xác minh 07-2026): {id, name, url, visibility, memberInfo, postFrequency}.
export function normalizeGroupInfo(items: unknown[], groupUrl: string): SocialPageInfo | undefined {
  for (const v of items) {
    const r = asRaw(v);
    if ((firstStr(r, ['status']) ?? '').toLowerCase() === 'error') continue;
    const rawName = firstStr(r, ['name', 'group_name', 'groupName', 'title']);
    const members =
      parseApproxCount(firstStr(r, ['memberInfo', 'members'])) ??
      firstNum(r, ['members_count', 'membersCount', 'memberCount', 'totalMembers']);
    const intro = firstStr(r, ['description', 'about', 'intro']);
    if (!rawName && members === undefined && !intro) continue;
    const privacy = firstStr(r, ['visibility', 'privacy', 'groupPrivacy']);
    const pic = firstStr(r, ['profilePictureUri', 'profilePicture', 'cover_photo', 'coverPhotoUrl']);
    return {
      name: rawName ? decodeEntities(rawName) : '', // rỗng → runner giữ tên từ bước bài viết
      url: firstStr(r, ['url', 'group_url', 'groupUrl', 'facebookUrl']) ?? groupUrl,
      followers: members,
      categories: privacy ? [privacy] : undefined,
      intro: intro ? decodeEntities(intro) : undefined,
      profilePicture: pic ? decodeEntities(pic) : undefined,
    };
  }
  return undefined;
}

// 1 item = 1 bài trong nhóm, kèm topComments inline → tách thành posts + comments
// (bình luận gắn với bài qua postUrl - "bình luận đi theo bài viết").
// groupId = ID SỐ của nhóm (field `facebookId` của item) - cần cho actor info nhóm.
export function normalizeGroupItems(items: unknown[]): {
  posts: SocialPost[];
  comments: SocialComment[];
  groupTitle?: string;
  groupId?: string;
} {
  const posts: SocialPost[] = [];
  const comments: SocialComment[] = [];
  let groupTitle: string | undefined;
  let groupId: string | undefined;
  for (const v of items) {
    const r = asRaw(v);
    const url = firstStr(r, ['url', 'postUrl', 'topLevelUrl', 'facebookUrl']) ?? '';
    const id = firstStr(r, ['postId', 'legacyId', 'id']) ?? url;
    if (!id && !url) continue;
    groupTitle ??= firstStr(r, ['groupTitle', 'groupName']);
    // facebookId của item bài trong nhóm = ID số của NHÓM (đã xác minh; ID bài là legacyId/id).
    const gid = firstStr(r, ['facebookId']);
    if (gid && /^\d+$/.test(gid)) groupId ??= gid;
    const user = asRaw(r.user);
    posts.push({
      id: id || url,
      type: detectPostType(r, url),
      url,
      time: iso(r.time ?? r.timestamp ?? r.date),
      text: firstStr(r, ['text', 'message']),
      reactions: firstNum(r, ['topReactionsCount', 'likesCount', 'likes', 'reactionsCount']),
      comments: firstNum(r, ['commentsCount', 'comments']),
      shares: firstNum(r, ['sharesCount', 'shares']),
      views: firstNum(r, ['viewsCount', 'views']),
      thumbnail: firstStr(r, ['thumbnail', 'thumbnailUrl']),
      author: firstStr(user, ['name']) ?? firstStr(r, ['userName', 'authorName']),
      transcript: firstStr(r, ['transcript', 'captionsText', 'caption_text']),
    });
    const top = Array.isArray(r.topComments) ? (r.topComments as unknown[]).map(asRaw) : [];
    for (const c of top) {
      const text = firstStr(c, ['text', 'commentText']);
      if (!text) continue;
      comments.push({
        postUrl: url,
        text,
        likes: firstNum(c, ['likesCount', 'likes']),
        author: firstStr(c, ['profileName', 'authorName', 'name']),
      });
    }
  }
  return { posts, comments, groupTitle, groupId };
}
