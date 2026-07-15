// Bộ máy chạy Báo cáo Social theo TỪNG BƯỚC của KẾ HOẠCH ĐỘNG (plan[] + stepIndex).
// Client điều khiển qua /api/social-report/[id]/step: mỗi lần gọi xử lý đúng 1 "tick" ngắn
// - bắt đầu 1 run Apify, poll run đang chạy, hoặc chạy 1 bước phân tích AI - rồi lưu.
// Đa kênh: bước thu thập gắn với channels[step.ch] (Facebook/TikTok/YouTube hoặc search
// theo keyword cho báo cáo tổng thể).
import {
  getApifyTokenById,
  shuffledApifyPool,
  type ApifyPoolMember,
} from './apify-keys';
import { getSocialReport, updateSocialReport } from '../store/social-reports';
import {
  analyzeBrand,
  analyzeCompare,
  analyzeEcomCompetitors,
  analyzeEcomMarket,
  analyzeEcomSummary,
  analyzeGroupAudience,
  analyzeGroupSummary,
  analyzeGroupTopics,
  analyzeProfileAudience,
  analyzeProfileSummary,
  analyzeProfileTopics,
  analyzeShopCatalog,
  analyzeShopCustomers,
  analyzeShopeeProduct,
  analyzeShopeeReviews,
  analyzeShopeeSummary,
  analyzeShopSummary,
  analyzeSummary,
  analyzeTactics,
} from './analyze';
import {
  APIFY_ACTORS,
  adsInput,
  commentsInput,
  fbProfileInfoFromPosts,
  fbSearchInput,
  fetchDatasetItems,
  fetchSubtitleFile,
  GROUP_INFO_MAX_USD,
  groupInfoInput,
  groupPostsInput,
  igCommentsInput,
  igPostsInput,
  igProfileInput,
  igReelsInput,
  igSearchInput,
  normalizeAd,
  normalizeComment,
  normalizeFbSearchPost,
  normalizeGroupInfo,
  normalizeGroupItems,
  normalizeIgComment,
  normalizeIgPost,
  normalizeIgProfile,
  normalizeIgReel,
  normalizePageInfo,
  normalizePost,
  normalizeReel,
  normalizeShopeeProduct,
  normalizeShopeeReview,
  normalizeShopeeShopInfo,
  normalizeShopProducts,
  lazadaCountry,
  lazadaProductId,
  lazadaShopInfoFromProducts,
  lazadaSlugKeyword,
  lzEcomSearchInput,
  lzProductInput,
  lzShopInput,
  normalizeLzItems,
  normalizeShopeeSearchItems,
  normalizeThreadsItems,
  normalizeThreadsReply,
  normalizeTtsProduct,
  normalizeTtsReview,
  normalizeTtsSearchProducts,
  normalizeTtsShopItems,
  ppeChargeCap,
  shopeeCountry,
  shopeeProductInput,
  shopeeReviewsInput,
  shopeeSearchInput,
  shopeeShopInput,
  shopeeShopReviewsInput,
  ttsDetailInput,
  ttsProductId,
  ttsReviewsInput,
  ttsSearchInput,
  threadsPostsInput,
  threadsRepliesInput,
  threadsSearchInput,
  normalizeTiktokComment,
  normalizeTiktokVideos,
  normalizeYoutubeComment,
  normalizeYoutubeVideos,
  pageInfoInput,
  pollRun,
  postsInput,
  reelsInput,
  normalizeTranscriptItems,
  shouldRotateApifyKey,
  startActorRun,
  tiktokCommentsInput,
  tiktokProfileInput,
  tiktokSearchInput,
  transcriptInput,
  youtubeChannelInput,
  youtubeCommentsInput,
  youtubeSearchInput,
} from './apify';
import {
  canonicalUrl,
  computeMetrics,
  computeReportMetrics,
  computeShopeeMetrics,
  computeShopeeShopMetrics,
  filterByKeyword,
  mergePosts,
  topByEngagement,
} from './metrics';
import { parseSubtitles } from './subtitles';
import type { SocialChannelData, SocialPlanStep, SocialReportRecord } from './types';
import { ANALYZE_ACTIONS, ECOM_KINDS, ECOM_SEARCH_KINDS, ECOM_SHOP_KINDS } from './types';

// Mã nước dùng cho search Shopee/Lazada của tổng thể e-commerce - suy từ khu vực đã chọn
// (dùng chung select với TikTok Shop), rơi về 'vn' nếu sàn không hỗ trợ nước đó.
function ecomCountry(region: string | undefined, supported: string[]): string {
  const cc = (region ?? 'VN').toLowerCase();
  return supported.includes(cc) ? cc : 'vn';
}
const SHOPEE_COUNTRIES = ['id', 'sg', 'my', 'th', 'ph', 'vn', 'br', 'tw', 'mx'];
const LAZADA_COUNTRIES = ['vn', 'id', 'th', 'my', 'sg', 'ph'];

const RUN_STUCK_MS = 15 * 60_000; // run Apify quá 15 phút → coi như hỏng, đi tiếp

function defined<T>(x: T | undefined): x is T {
  return x !== undefined;
}

// Video còn THIẾU lời thoại của 1 kênh (ưu tiên tương tác cao) - đầu vào cho bước transcript.
const TRANSCRIPT_STEP_MAX = 12;
function videosMissingTranscript(ch: SocialChannelData): string[] {
  return mergePosts(ch.posts, ch.reels)
    .filter((p) => p.url && !p.transcript && (p.type === 'video' || p.type === 'reel'))
    .sort((a, b) => ((b.views ?? b.reactions ?? 0) - (a.views ?? a.reactions ?? 0)))
    .slice(0, TRANSCRIPT_STEP_MAX)
    .map((p) => p.url);
}

// Top N sản phẩm BÁN CHẠY nhất đã thu của shop TikTok Shop (fallback thứ tự danh sách).
function topTtsShopProducts(ch: SocialChannelData, n: number) {
  return [...(ch.shopProducts ?? [])]
    .sort((a, b) => (b.sold ?? 0) - (a.sold ?? 0))
    .slice(0, n);
}

// Top 3 bài tương tác cao nhất của MỘT kênh (có URL) để lấy bình luận.
function topPostUrls(ch: SocialChannelData): string[] {
  return mergePosts(ch.posts, ch.reels)
    .filter((p) => p.url)
    .sort((a, b) => ((b.reactions ?? 0) + (b.comments ?? 0)) - ((a.reactions ?? 0) + (a.comments ?? 0)))
    .slice(0, 3)
    .map((p) => p.url);
}

// Bắt đầu run Apify cho 1 bước thu thập. Trả null nếu bước không có gì để chạy (→ skip).
async function startCollect(
  token: string,
  r: SocialReportRecord,
  step: SocialPlanStep,
): Promise<{ runId: string; datasetId: string } | null> {
  const o = r.options;
  const ch = step.ch !== undefined ? r.channels[step.ch] : undefined;
  if (!ch) return null;

  switch (step.action) {
    case 'page': {
      // Facebook/Instagram có bước page riêng (TikTok/YouTube/Threads nhúng thông tin kênh
      // trong bước bài đăng); nhóm Facebook dùng actor info nhóm riêng. Actor info nhóm:
      // - cần URL dạng ID SỐ (URL slug bị trả lỗi) → ưu tiên groupId lấy từ bước posts;
      // - tính phí pay-per-event → phải đặt trần tiền tường minh, nếu không Apify tự suy
      //   trần quá thấp từ maxItems và ABORT run (đã dính thực tế).
      if (ch.kind === 'fbgroup') {
        const groupUrl = ch.groupId ? `https://www.facebook.com/groups/${ch.groupId}/` : ch.url;
        return startActorRun(token, APIFY_ACTORS.groupInfo, groupInfoInput(groupUrl), 3, GROUP_INFO_MAX_USD);
      }
      if (ch.kind === 'instagram')
        return startActorRun(token, APIFY_ACTORS.igProfile, igProfileInput(ch.url), 3);
      if (ch.kind === 'shopeeshop') {
        // Info shop rút từ field shop{} khi lấy detail 1 sản phẩm của shop (bước 'shop'
        // đã chạy trước). Không có sản phẩm → skip (info shop chỉ mất phần header).
        const first = ch.shopProducts?.find((p) => p.itemId && p.shopId);
        if (!first) return null;
        return startActorRun(
          token,
          APIFY_ACTORS.shopeeDetail,
          { country: shopeeCountry(ch.url), shopId: first.shopId, itemId: first.itemId },
          3,
          ppeChargeCap(3),
        );
      }
      if (ch.kind === 'tiktokshopshop') {
        // Sao/địa điểm shop TikTok Shop lấy từ seller{} khi detail 1 sản phẩm bán chạy
        // (bước search không trả 2 field này). Không có sản phẩm → skip.
        const first = topTtsShopProducts(ch, 1)[0];
        if (!first?.itemId) return null;
        return startActorRun(
          token,
          APIFY_ACTORS.ttsDetail,
          ttsDetailInput(first.itemId, o.ttsRegion ?? 'VN'),
          3,
          ppeChargeCap(10),
        );
      }
      return startActorRun(token, APIFY_ACTORS.pages, pageInfoInput(ch.url), 3);
    }
    case 'shop': {
      if (ch.kind === 'lazadashop') {
        // 1 run duy nhất: danh mục + đánh giá inline (maxReviews TÍNH TRÊN MỖI sản phẩm
        // → chia đều theo số sản phẩm dự kiến; maxItems trần tổng record product+review).
        const perProduct = Math.max(3, Math.ceil(o.commentsLimit / Math.min(o.postsLimit, 10)));
        return startActorRun(
          token,
          APIFY_ACTORS.lazada,
          lzShopInput(ch.url, o.postsLimit, perProduct),
          o.postsLimit + o.commentsLimit + 10,
          ppeChargeCap(o.postsLimit + o.commentsLimit),
        );
      }
      if (ch.kind === 'tiktokshopshop') {
        // Danh mục qua SEARCH theo tên shop (ch.url = TÊN shop) - actor tối đa 10 kết quả/
        // lượt → bước 'shop' lặp theo trang; trang hiện tại = số bước 'shop' đã đi qua.
        const page = r.plan
          .slice(0, r.stepIndex + 1)
          .filter((s) => s.action === 'shop').length;
        return startActorRun(
          token,
          APIFY_ACTORS.ttsSearch,
          ttsSearchInput(ch.url, o.ttsRegion ?? 'VN', page),
          10,
          ppeChargeCap(10),
        );
      }
      // Danh mục sản phẩm của shop Shopee (actor bên thứ ba PPE → trần tiền).
      return startActorRun(
        token,
        APIFY_ACTORS.shopeeShop,
        shopeeShopInput(ch.url, o.postsLimit),
        o.postsLimit,
        ppeChargeCap(o.postsLimit),
      );
    }
    case 'posts':
      if (ch.kind === 'fbgroup')
        return startActorRun(
          token,
          APIFY_ACTORS.groupPosts,
          groupPostsInput(ch.url, o.postsLimit, o.groupSort),
          o.postsLimit,
        );
      if (ch.kind === 'facebook' || ch.kind === 'fbprofile')
        return startActorRun(token, APIFY_ACTORS.posts, postsInput(ch.url, o.postsLimit), o.postsLimit);
      if (ch.kind === 'instagram')
        return startActorRun(token, APIFY_ACTORS.igPosts, igPostsInput(ch.url, o.postsLimit), o.postsLimit);
      if (ch.kind === 'threads')
        // +1 vì dataset kèm 1 item profile (includeProfile). Actor bên thứ ba PPE → trần tiền.
        return startActorRun(
          token,
          APIFY_ACTORS.threads,
          threadsPostsInput(ch.url, o.postsLimit),
          o.postsLimit + 1,
          ppeChargeCap(o.postsLimit + 1),
        );
      if (ch.kind === 'tiktok')
        return startActorRun(
          token,
          APIFY_ACTORS.tiktokProfile,
          tiktokProfileInput(ch.url, o.postsLimit),
          o.postsLimit,
        );
      return startActorRun(
        token,
        APIFY_ACTORS.youtube,
        youtubeChannelInput(ch.url, o.postsLimit),
        o.postsLimit,
      );
    case 'reels':
      if (ch.kind === 'instagram')
        return startActorRun(token, APIFY_ACTORS.igReels, igReelsInput(ch.url, o.reelsLimit), o.reelsLimit);
      return startActorRun(token, APIFY_ACTORS.reels, reelsInput(ch.url, o.reelsLimit), o.reelsLimit);
    case 'ads':
      return startActorRun(token, APIFY_ACTORS.ads, adsInput(ch.url, o.adsLimit), o.adsLimit);
    case 'comments': {
      const urls = topPostUrls(ch);
      if (!urls.length) return null;
      const perPost = Math.max(1, Math.ceil(o.commentsLimit / urls.length));
      // Bài trong nhóm cũng là bài Facebook → dùng chung actor bình luận (best-effort với
      // URL dạng /groups/, lỗi thì đã có topComments inline từ bước posts).
      if (ch.kind === 'facebook' || ch.kind === 'fbgroup' || ch.kind === 'fbprofile')
        return startActorRun(token, APIFY_ACTORS.comments, commentsInput(urls, perPost), o.commentsLimit);
      if (ch.kind === 'instagram')
        return startActorRun(token, APIFY_ACTORS.igComments, igCommentsInput(urls, o.commentsLimit), o.commentsLimit);
      if (ch.kind === 'threads')
        return startActorRun(
          token,
          APIFY_ACTORS.threadsReplies,
          threadsRepliesInput(urls, o.commentsLimit),
          o.commentsLimit,
          ppeChargeCap(o.commentsLimit),
        );
      if (ch.kind === 'tiktok')
        return startActorRun(
          token,
          APIFY_ACTORS.tiktokComments,
          tiktokCommentsInput(urls, perPost),
          o.commentsLimit,
        );
      return startActorRun(
        token,
        APIFY_ACTORS.youtubeComments,
        youtubeCommentsInput(urls, o.commentsLimit),
        o.commentsLimit,
      );
    }
    case 'search': {
      const kw = r.keyword ?? '';
      if (!kw) return null;
      // TỔNG THỂ E-COMMERCE: search top sản phẩm BÁN CHẠY theo keyword trên từng sàn.
      if (r.platform === 'ecom') {
        if (ch.kind === 'shopee')
          return startActorRun(
            token,
            APIFY_ACTORS.shopeeSearch,
            shopeeSearchInput(kw, ecomCountry(o.ttsRegion, SHOPEE_COUNTRIES), o.postsLimit),
            o.postsLimit,
            ppeChargeCap(o.postsLimit * 3), // fetchDetail ~$0.012/sản phẩm - trần rộng hơn
          );
        if (ch.kind === 'lazada')
          return startActorRun(
            token,
            APIFY_ACTORS.lazada,
            lzEcomSearchInput(kw, ecomCountry(o.ttsRegion, LAZADA_COUNTRIES), o.postsLimit),
            Math.max(10, o.postsLimit),
            ppeChargeCap(Math.max(10, o.postsLimit)),
          );
        // tiktokshop: actor tối đa 10 kết quả/lượt → trang hiện tại = số bước search đã đi
        // qua của CHÍNH kênh này (plan đã đặt sẵn số bước theo postsLimit).
        const page = r.plan
          .slice(0, r.stepIndex + 1)
          .filter((s) => s.action === 'search' && s.ch === step.ch).length;
        return startActorRun(
          token,
          APIFY_ACTORS.ttsSearch,
          ttsSearchInput(kw, o.ttsRegion ?? 'VN', page),
          10,
          ppeChargeCap(10),
        );
      }
      // Lấy DƯ ~3 lần số cần để có pool chọn TOP TƯƠNG TÁC (applyCollected lọc lại).
      const fetchLimit = Math.min(50, Math.max(o.postsLimit * 3, o.postsLimit));
      if (ch.kind === 'tiktok')
        return startActorRun(token, APIFY_ACTORS.tiktokSearch, tiktokSearchInput(kw, fetchLimit), fetchLimit);
      if (ch.kind === 'youtube')
        return startActorRun(token, APIFY_ACTORS.youtube, youtubeSearchInput(kw, fetchLimit), fetchLimit);
      if (ch.kind === 'instagram')
        return startActorRun(token, APIFY_ACTORS.igSearch, igSearchInput(kw, fetchLimit), fetchLimit);
      if (ch.kind === 'threads')
        return startActorRun(
          token,
          APIFY_ACTORS.threads,
          threadsSearchInput(kw, fetchLimit),
          fetchLimit,
          ppeChargeCap(fetchLimit),
        );
      return startActorRun(token, APIFY_ACTORS.fbSearch, fbSearchInput(kw, fetchLimit), fetchLimit);
    }
    case 'product': {
      if (ch.kind === 'lazada') {
        // PDP Lazada bị chặn → search theo từ khóa rút từ SLUG link, kèm đánh giá inline;
        // applyCollected khớp lại đúng sản phẩm qua product_id.
        const kw = lazadaSlugKeyword(ch.url);
        if (!kw) return null;
        return startActorRun(
          token,
          APIFY_ACTORS.lazada,
          lzProductInput(kw, lazadaCountry(ch.url), o.commentsLimit),
          10 + o.commentsLimit * 2,
          ppeChargeCap(10 + o.commentsLimit * 2),
        );
      }
      if (ch.kind === 'tiktokshop') {
        // Info sản phẩm TikTok Shop - cần ID sản phẩm tách từ link (route đã giải link rút gọn).
        const id = ttsProductId(ch.url);
        if (!id) return null;
        return startActorRun(
          token,
          APIFY_ACTORS.ttsDetail,
          ttsDetailInput(id, o.ttsRegion ?? 'VN'),
          3,
          ppeChargeCap(10),
        );
      }
      // Info sản phẩm Shopee - cần shopId/itemId tách từ URL (URL sai dạng → skip, cảnh báo).
      // Actor bên thứ ba PPE → PHẢI truyền trần tiền, không sẽ bị ABORT (đã dính thực tế).
      const input = shopeeProductInput(ch.url);
      if (!input) return null;
      return startActorRun(token, APIFY_ACTORS.shopeeDetail, input, 3, ppeChargeCap(3));
    }
    case 'reviews': {
      // Đánh giá của khách - độc lập với bước product (product kẹt vẫn có review).
      if (ch.kind === 'tiktokshop') {
        const id = ch.product?.itemId ?? ttsProductId(ch.url);
        if (!id) return null;
        return startActorRun(
          token,
          APIFY_ACTORS.ttsReviews,
          ttsReviewsInput([id], o.ttsRegion ?? 'VN', o.commentsLimit),
          o.commentsLimit,
          ppeChargeCap(o.commentsLimit),
        );
      }
      if (ch.kind === 'tiktokshopshop') {
        // Đánh giá của TOP 3 sản phẩm BÁN CHẠY nhất của shop (theo tổng đã bán từ search).
        const ids = topTtsShopProducts(ch, 3)
          .map((p) => p.itemId)
          .filter((x): x is string => !!x);
        if (!ids.length) return null;
        const perProduct = Math.max(3, Math.ceil(o.commentsLimit / ids.length));
        return startActorRun(
          token,
          APIFY_ACTORS.ttsReviews,
          ttsReviewsInput(ids, o.ttsRegion ?? 'VN', perProduct),
          o.commentsLimit,
          ppeChargeCap(o.commentsLimit),
        );
      }
      // Báo cáo SHOP Shopee: gom đánh giá của TOP 3 sản phẩm (thứ tự listing của shop).
      if (ch.kind === 'shopeeshop') {
        const urls = (ch.shopProducts ?? []).slice(0, 3).map((p) => p.url).filter(Boolean);
        if (!urls.length) return null;
        const perProduct = Math.max(3, Math.ceil(o.commentsLimit / urls.length));
        return startActorRun(
          token,
          APIFY_ACTORS.shopeeReviews,
          shopeeShopReviewsInput(urls, perProduct),
          o.commentsLimit,
          ppeChargeCap(o.commentsLimit),
        );
      }
      return startActorRun(
        token,
        APIFY_ACTORS.shopeeReviews,
        shopeeReviewsInput(ch.url, o.commentsLimit),
        o.commentsLimit,
        ppeChargeCap(o.commentsLimit),
      );
    }
    case 'transcript': {
      // Bù lời thoại qua actor transcript chuyên dụng - chỉ chạy cho video còn thiếu.
      const urls = videosMissingTranscript(ch);
      if (!urls.length) return null;
      const actor =
        ch.kind === 'youtube'
          ? APIFY_ACTORS.ytTranscripts
          : ch.kind === 'tiktok'
            ? APIFY_ACTORS.tiktokTranscripts
            : APIFY_ACTORS.fbTranscripts;
      return startActorRun(token, actor, transcriptInput(ch.kind, urls), urls.length);
    }
    default:
      return null;
  }
}

// Nhét kết quả dataset của bước vừa xong vào kênh tương ứng.
function applyCollected(
  r: SocialReportRecord,
  step: SocialPlanStep,
  items: unknown[],
): void {
  const ch = step.ch !== undefined ? r.channels[step.ch] : undefined;
  if (!ch) return;
  const warn = (s: string) => r.warnings.push(`${ch.kind}:${s}`);

  if (step.action === 'page') {
    if (ch.kind === 'fbgroup') {
      // Bước posts chạy TRƯỚC đã đặt tên nhóm từ bài viết → merge info (thành viên, mô tả,
      // quyền riêng tư), giữ tên cũ khi actor info không trả tên thật.
      const info = normalizeGroupInfo(items, ch.url);
      if (info) {
        const name = info.name || ch.page?.name || ch.url;
        ch.page = { ...ch.page, ...info, name };
        if (!r.customTitle) r.title = name;
      } else warn('page:empty');
      return;
    }
    if (ch.kind === 'shopeeshop') {
      // Info shop từ field shop{} của detail 1 sản phẩm.
      const info = normalizeShopeeShopInfo(items, ch.url);
      if (info) {
        ch.shopInfo = info;
        if (!r.customTitle) r.title = info.name;
      } else warn('page:empty');
      return;
    }
    if (ch.kind === 'tiktokshopshop') {
      // Sao/địa điểm shop từ seller{} của detail 1 sản phẩm - GỘP vào shopInfo đã có
      // (tổng đã bán/GMV đến từ bước search, không ghi đè).
      const detail = normalizeTtsProduct(items, ch.url);
      if (detail) {
        const prev = ch.shopInfo;
        ch.shopInfo = {
          name: prev?.name ?? detail.shopName ?? ch.url,
          url: prev?.url ?? '',
          rating: detail.shopRating ?? prev?.rating,
          location: detail.shopLocation ?? prev?.location,
          totalSold: prev?.totalSold,
          gmv: prev?.gmv,
        };
        if (!r.customTitle) r.title = ch.shopInfo.name;
      } else warn('page:empty');
      return;
    }
    const info =
      ch.kind === 'instagram' ? normalizeIgProfile(items, ch.url) : normalizePageInfo(items, ch.url);
    if (info) {
      ch.page = info;
      if (r.platform !== 'overall' && !r.customTitle) r.title = info.name;
    } else warn('page:empty');
    return;
  }
  if (step.action === 'shop') {
    if (ch.kind === 'lazadashop') {
      // Dataset trộn product+review của 1 run: tách, gắn đánh giá theo sản phẩm (itemId),
      // info shop dựng từ vendor đa số (actor không có record shop riêng).
      const { products, reviews } = normalizeLzItems(items, lazadaCountry(ch.url));
      ch.shopProducts = products.slice(0, r.options.postsLimit);
      const byId = new Map(ch.shopProducts.map((p) => [p.itemId, p.name]));
      ch.productReviews = reviews.map((rv) =>
        rv.itemId && byId.has(rv.itemId) ? { ...rv, ofProduct: byId.get(rv.itemId) } : rv,
      );
      const info = lazadaShopInfoFromProducts(ch.shopProducts, ch.url);
      if (info) {
        ch.shopInfo = info;
        if (!r.customTitle) r.title = info.name;
      }
      if (!ch.shopProducts.length) warn('shop:empty');
      return;
    }
    if (ch.kind === 'tiktokshopshop') {
      // Mỗi bước 'shop' = 1 trang search theo tên shop → GỘP + khử trùng theo itemId
      // (không ghi đè trang trước); info shop (tổng đã bán/GMV) chốt từ trang đầu có dữ liệu.
      const { products, shopInfo } = normalizeTtsShopItems(items, ch.url, r.options.ttsRegion ?? 'VN');
      const seen = new Set((ch.shopProducts ?? []).map((p) => p.itemId));
      ch.shopProducts = [
        ...(ch.shopProducts ?? []),
        ...products.filter((p) => !seen.has(p.itemId)),
      ].slice(0, r.options.postsLimit);
      if (shopInfo && !ch.shopInfo) {
        ch.shopInfo = shopInfo;
        if (!r.customTitle) r.title = shopInfo.name;
      }
      if (!ch.shopProducts.length) warn('shop:empty');
      return;
    }
    ch.shopProducts = normalizeShopProducts(items, ch.url);
    if (!ch.shopProducts.length) warn('shop:empty');
    return;
  }
  if (step.action === 'posts') {
    if (ch.kind === 'fbgroup') {
      // Bài trong nhóm kèm topComments inline - bình luận GẮN VỚI BÀI qua postUrl.
      const { posts, comments, groupTitle, groupId } = normalizeGroupItems(items);
      ch.posts = posts;
      ch.comments = comments;
      if (groupId) ch.groupId = groupId; // ID số của nhóm - bước info nhóm cần URL dạng ID
      if (!ch.page && groupTitle) {
        ch.page = { name: groupTitle, url: ch.url };
        if (!r.customTitle) r.title = groupTitle; // bước info nhóm lỗi/rỗng → vẫn có tên nhóm từ bài viết
      }
    } else if (ch.kind === 'facebook') {
      ch.posts = items.map(normalizePost).filter(defined);
    } else if (ch.kind === 'fbprofile') {
      // Profile cá nhân: bài dùng chung normalizer facebook; KHÔNG có bước 'page' riêng nên suy
      // thông tin trang (tên chủ trang, follower nếu công khai) từ chính output actor bài đăng.
      ch.posts = items.map(normalizePost).filter(defined);
      const info = fbProfileInfoFromPosts(items, ch.url);
      if (info && !ch.page) {
        ch.page = info;
        if (!r.customTitle) r.title = info.name;
      }
    } else if (ch.kind === 'instagram') {
      ch.posts = items.map(normalizeIgPost).filter(defined);
    } else if (ch.kind === 'threads') {
      // Dataset trộn: 1 item profile (kênh) + các item bài (includeProfile=true).
      const { page, posts } = normalizeThreadsItems(items);
      ch.posts = posts;
      if (page) {
        ch.page = page;
        if (r.platform !== 'overall' && !r.customTitle) r.title = page.name;
      }
    } else if (ch.kind === 'tiktok') {
      const { page, posts } = normalizeTiktokVideos(items, r.locale);
      ch.posts = posts;
      if (page) {
        ch.page = page;
        if (r.platform !== 'overall' && !r.customTitle) r.title = page.name;
      }
    } else {
      const { page, posts } = normalizeYoutubeVideos(items, r.locale);
      // Phụ đề YouTube trả SRT thô inline → parse thành lời thoại thuần ngay tại đây.
      ch.posts = posts.map((p) => (p.transcript ? { ...p, transcript: parseSubtitles(p.transcript) } : p));
      if (page) {
        ch.page = page;
        if (r.platform !== 'overall' && !r.customTitle) r.title = page.name;
      }
    }
    if (!ch.posts.length) warn('posts:empty');
    return;
  }
  if (step.action === 'reels') {
    ch.reels =
      ch.kind === 'instagram'
        ? items.map(normalizeIgReel).filter(defined)
        : items.map(normalizeReel).filter(defined);
    return;
  }
  if (step.action === 'ads') {
    ch.ads = items.map(normalizeAd).filter(defined);
    return;
  }
  if (step.action === 'comments') {
    const fn =
      ch.kind === 'facebook' || ch.kind === 'fbgroup' || ch.kind === 'fbprofile'
        ? normalizeComment
        : ch.kind === 'instagram'
          ? normalizeIgComment
          : ch.kind === 'threads'
            ? normalizeThreadsReply
            : ch.kind === 'tiktok'
              ? normalizeTiktokComment
              : normalizeYoutubeComment;
    const found = items.map(fn).filter(defined);
    if (ch.kind === 'fbgroup') {
      // Nhóm đã có topComments inline từ bước posts → GỘP thêm (khử trùng theo bài + nội dung),
      // không ghi đè để không mất bình luận đã gắn với bài.
      const seen = new Set(ch.comments.map((c) => `${canonicalUrl(c.postUrl)}|${c.text}`));
      for (const c of found) {
        const key = `${canonicalUrl(c.postUrl)}|${c.text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        ch.comments.push(c);
      }
    } else {
      ch.comments = found;
    }
    return;
  }
  if (step.action === 'search') {
    // TỔNG THỂ E-COMMERCE: kết quả search là SẢN PHẨM → gộp vào shopProducts của kênh
    // (khử trùng theo itemId - TikTok Shop chạy nhiều trang).
    if (r.platform === 'ecom' && ECOM_SEARCH_KINDS.includes(ch.kind)) {
      const found =
        ch.kind === 'shopee'
          ? normalizeShopeeSearchItems(items, ecomCountry(r.options.ttsRegion, SHOPEE_COUNTRIES))
          : ch.kind === 'lazada'
            ? normalizeLzItems(items, ecomCountry(r.options.ttsRegion, LAZADA_COUNTRIES)).products
            : normalizeTtsSearchProducts(items, r.options.ttsRegion ?? 'VN');
      const seen = new Set((ch.shopProducts ?? []).map((p) => p.itemId));
      ch.shopProducts = [
        ...(ch.shopProducts ?? []),
        ...found.filter((p) => !seen.has(p.itemId)),
      ].slice(0, r.options.postsLimit);
      if (!ch.shopProducts.length) warn('search:empty');
      return;
    }
    let found: typeof ch.posts;
    if (ch.kind === 'tiktok') found = normalizeTiktokVideos(items, r.locale).posts;
    else if (ch.kind === 'youtube')
      found = normalizeYoutubeVideos(items, r.locale).posts.map((p) =>
        p.transcript ? { ...p, transcript: parseSubtitles(p.transcript) } : p,
      );
    else if (ch.kind === 'instagram') found = items.map(normalizeIgPost).filter(defined);
    else if (ch.kind === 'threads') found = normalizeThreadsItems(items).posts;
    else {
      found = items.map(normalizeFbSearchPost).filter(defined);
      // Search Facebook hay trả kết quả dính hờ → lọc bài THẬT SỰ khớp từ khóa trước.
      // Lọc xong quá ít (dưới 3 bài) mới nới lại pool gốc để báo cáo không rỗng + cảnh báo.
      const matched = filterByKeyword(found, r.keyword ?? '');
      if (matched.length >= Math.min(3, r.options.postsLimit)) found = matched;
      else if (matched.length < found.length) warn('search:loose-match');
    }
    // Pool đã lấy dư → chỉ giữ TOP TƯƠNG TÁC CAO NHẤT đúng số người dùng chọn.
    ch.posts = topByEngagement(found, r.options.postsLimit);
    if (!ch.posts.length) warn('search:empty');
    return;
  }
  if (step.action === 'product') {
    if (ch.kind === 'lazada') {
      // Kết quả search theo slug: khớp ĐÚNG sản phẩm qua product_id của link; đánh giá
      // inline của chính sản phẩm đó (các listing khác trong dataset bị bỏ).
      const { products, reviews } = normalizeLzItems(items, lazadaCountry(ch.url));
      const id = lazadaProductId(ch.url);
      const product = products.find((p) => p.itemId === id);
      if (product) {
        ch.product = product;
        ch.productReviews = reviews.filter((rv) => rv.itemId === id);
        if (!r.customTitle) r.title = product.name;
      } else warn('product:not-found-in-search');
      return;
    }
    // Info sản phẩm Shopee/TikTok Shop. Actor có thể trả item cảnh báo (không tính phí)
    // → cảnh báo, vẫn đi tiếp: bước reviews độc lập vẫn thu được đánh giá.
    const product =
      ch.kind === 'tiktokshop'
        ? normalizeTtsProduct(items, ch.url)
        : normalizeShopeeProduct(items, ch.url);
    if (product) {
      ch.product = product;
      if (product.name && product.name !== ch.url && !r.customTitle) r.title = product.name;
    } else warn('product:empty');
    return;
  }
  if (step.action === 'reviews') {
    const isTts = ch.kind === 'tiktokshop' || ch.kind === 'tiktokshopshop';
    ch.productReviews = items.map(isTts ? normalizeTtsReview : normalizeShopeeReview).filter(defined);
    // Báo cáo SHOP: "đánh giá đi theo sản phẩm" - gắn tên sản phẩm vào từng review qua itemId.
    if ((ch.kind === 'shopeeshop' || ch.kind === 'tiktokshopshop') && ch.shopProducts?.length) {
      const byId = new Map(ch.shopProducts.map((p) => [p.itemId, p.name]));
      for (const rv of ch.productReviews) {
        if (rv.itemId && byId.has(rv.itemId)) rv.ofProduct = byId.get(rv.itemId);
      }
    }
    if (!ch.productReviews.length) warn('reviews:empty');
    return;
  }
  if (step.action === 'transcript') {
    // Khớp transcript về đúng video theo URL chuẩn hóa. Text dạng VTT/SRT → parse;
    // TikTok trả link file → để transcriptUrl cho enrichTranscripts tải ngay sau đó.
    const found = normalizeTranscriptItems(ch.kind, items);
    const byUrl = new Map(found.map((f) => [canonicalUrl(f.url), f]));
    for (const p of [...ch.posts, ...ch.reels]) {
      if (p.transcript || !p.url) continue;
      const f = byUrl.get(canonicalUrl(p.url));
      if (!f) continue;
      if (f.text) {
        const t = /^WEBVTT|-->/m.test(f.text) ? parseSubtitles(f.text) : f.text.trim();
        if (t) p.transcript = t;
      } else if (f.fileUrl) {
        p.transcriptUrl = f.fileUrl;
      }
    }
  }
}

// Số file phụ đề tối đa tải về mỗi bước (URL ký tên có hạn → tải ngay sau run).
const TRANSCRIPT_FETCH_MAX = 12;

// Tải + parse các file phụ đề (TikTok .vtt / Facebook Reels .srt) cho bài vừa thu của 1 kênh.
// Best-effort: file lỗi/hết hạn chỉ bị bỏ qua, không chặn báo cáo.
async function enrichTranscripts(
  id: string,
  chIndex: number,
  current: SocialReportRecord,
): Promise<SocialReportRecord | null> {
  const ch = current.channels[chIndex];
  if (!ch) return current;
  const targets = [...ch.posts, ...ch.reels]
    .filter((p) => p.transcriptUrl && !p.transcript)
    .slice(0, TRANSCRIPT_FETCH_MAX);
  if (!targets.length) return current;
  const fetched = await Promise.all(
    targets.map(async (p) => ({
      postId: p.id,
      text: parseSubtitles((await fetchSubtitleFile(p.transcriptUrl!)) ?? ''),
    })),
  );
  return updateSocialReport(id, (x) => {
    const c = x.channels[chIndex];
    if (!c) return;
    for (const f of fetched) {
      const p = c.posts.find((pp) => pp.id === f.postId) ?? c.reels.find((pp) => pp.id === f.postId);
      if (!p) continue;
      if (f.text) p.transcript = f.text;
      p.transcriptUrl = undefined; // URL hết hạn nhanh - không giữ lại trong bản ghi
    }
  });
}

function advance(x: SocialReportRecord): void {
  x.stepIndex += 1;
  if (x.stepIndex >= x.plan.length) x.status = 'done';
}

// Chạy đúng 1 tick. Trả về bản ghi mới nhất (hoặc null nếu không tồn tại).
// Start 1 run thu thập với FALLBACK KEY: thử lần lượt các key trong pool (đã xáo trộn ngẫu nhiên).
// - Lỗi KEY (token hỏng/hết hạn mức...) → thử key kế tiếp.
// - Lỗi input/actor (400/403/404) → ném luôn (đổi key vô ích).
// - startCollect trả null (bước không có gì để chạy) → trả null (không phải lỗi key).
async function startCollectWithFallback(
  pool: ApifyPoolMember[],
  r: SocialReportRecord,
  step: SocialPlanStep,
): Promise<{ runId: string; datasetId: string; keyId: string } | null> {
  let lastErr: unknown;
  for (const { id, token } of pool) {
    try {
      const started = await startCollect(token, r, step);
      if (!started) return null;
      return { ...started, keyId: id };
    } catch (err) {
      lastErr = err;
      if (!shouldRotateApifyKey(err)) throw err;
      // lỗi key → thử key kế tiếp trong pool
    }
  }
  throw lastErr ?? new Error('Không còn key thu thập dữ liệu khả dụng.');
}

export async function runSocialReportStep(id: string): Promise<SocialReportRecord | null> {
  const r = await getSocialReport(id);
  if (!r) return null;
  if (r.status !== 'running') return r;

  // Pool key Apify theo THỨ TỰ NGẪU NHIÊN: mỗi run chọn 1 key ngẫu nhiên, start lỗi thì đổi key khác.
  const pool = await shuffledApifyPool();
  if (!pool.length) {
    return updateSocialReport(id, (x) => {
      x.status = 'error';
      x.error = 'Chưa cấu hình kết nối thu thập dữ liệu trong Quản lý kết nối.';
    });
  }

  try {
    // 1) Có run Apify đang chạy dở → poll (PHẢI dùng ĐÚNG key đã start run này).
    if (r.apifyRun) {
      const run = r.apifyRun;
      const step = r.plan[run.stepIndex];
      const stuck = Date.now() - new Date(run.startedAt).getTime() > RUN_STUCK_MS;
      const runToken = run.keyId ? await getApifyTokenById(run.keyId) : pool[0].token;
      if (!runToken) {
        // Key đã bị xóa khỏi pool → không poll được run cũ; bỏ qua bước (start lại với key khác ở tick sau).
        return updateSocialReport(id, (x) => {
          const ch = step?.ch !== undefined ? x.channels[step.ch] : undefined;
          x.warnings.push(`${ch?.kind ?? '?'}:${step?.action ?? '?'}:key-removed`);
          x.apifyRun = undefined;
          advance(x);
        });
      }
      const st = stuck ? ({ state: 'failed' as const, statusText: 'STUCK' }) : await pollRun(runToken, run.runId, 20);
      if (st.state === 'running') return r; // client chờ rồi gọi tiếp

      if (st.state === 'succeeded') {
        // Bước search lấy dư (tối đa 50) để lọc top tương tác → nâng trần fetch tương ứng.
        // Bước product/shop của Lazada trả dataset TRỘN sản phẩm + đánh giá trong 1 run
        // → trần fetch phải đủ CẢ HAI (max từng limit riêng sẽ cắt mất đánh giá).
        const limit =
          step?.action === 'search'
            ? 50
            : step?.action === 'product' || step?.action === 'shop'
              ? r.options.postsLimit + r.options.commentsLimit + 10
              : Math.max(
                  r.options.postsLimit,
                  r.options.reelsLimit,
                  r.options.adsLimit,
                  r.options.commentsLimit,
                  10,
                );
        const items = await fetchDatasetItems(runToken, run.datasetId, limit);
        const updated = await updateSocialReport(id, (x) => {
          applyCollected(x, step, items);
          x.apifyRun = undefined;
          advance(x);
        });
        // Bài/video vừa thu có URL file phụ đề/transcript (TikTok/Reels) → tải + parse NGAY
        // khi URL còn hạn (áp cho cả bước transcript chuyên dụng của TikTok).
        if (
          updated &&
          step?.ch !== undefined &&
          ['posts', 'reels', 'search', 'transcript'].includes(step.action)
        )
          return (await enrichTranscripts(id, step.ch, updated)) ?? updated;
        return updated;
      }
      // failed: chỉ cảnh báo rồi đi tiếp (bước lõi rỗng sẽ bị chặn ở cuối pha thu thập).
      return updateSocialReport(id, (x) => {
        const ch = step?.ch !== undefined ? x.channels[step.ch] : undefined;
        x.warnings.push(`${ch?.kind ?? '?'}:${step?.action ?? '?'}:failed:${st.statusText}`);
        x.apifyRun = undefined;
        advance(x);
      });
    }

    const step = r.plan[r.stepIndex];
    if (!step) {
      return updateSocialReport(id, (x) => {
        x.status = 'done';
      });
    }

    // 2) Kết thúc pha THU THẬP: chốt chỉ số, chặn báo cáo rỗng, rồi DỪNG ở 'collected'
    // chờ người dùng chọn AI/model. (r.ai có giá trị = đã bấm Phân tích, kể cả Tự động.)
    if (ANALYZE_ACTIONS.includes(step.action) && !r.ai) {
      // Báo cáo sản phẩm/shop Shopee: "có dữ liệu" = có info/danh mục HOẶC có đánh giá.
      const anyData = r.channels.some(
        (c) =>
          mergePosts(c.posts, c.reels).length > 0 ||
          c.product !== undefined ||
          (c.productReviews?.length ?? 0) > 0 ||
          (c.shopProducts?.length ?? 0) > 0,
      );
      if (!anyData) {
        return updateSocialReport(id, (x) => {
          x.status = 'error';
          x.error =
            r.platform === 'shopee'
              ? 'Không thu được dữ liệu sản phẩm. Kiểm tra link sản phẩm (phải là link sản phẩm Shopee còn bán) rồi tạo báo cáo mới.'
              : r.platform === 'shopeeshop'
                ? 'Không thu được danh mục sản phẩm của shop. Kiểm tra link shop (vd https://shopee.vn/tenshop) rồi tạo báo cáo mới.'
                : r.platform === 'tiktokshop'
                  ? 'Không thu được dữ liệu sản phẩm. Kiểm tra link sản phẩm TikTok Shop (còn bán, đúng khu vực đã chọn) rồi tạo báo cáo mới.'
                  : r.platform === 'tiktokshopshop'
                    ? 'Không tìm thấy sản phẩm nào của shop này. Kiểm tra TÊN shop đúng như hiển thị trên TikTok Shop (và đúng khu vực) rồi tạo báo cáo mới.'
                    : r.platform === 'lazada'
                      ? 'Không tìm thấy sản phẩm này trên Lazada. Kiểm tra link sản phẩm (dán link đầy đủ có tên sản phẩm trong đường dẫn, sản phẩm còn bán) rồi tạo báo cáo mới.'
                      : r.platform === 'lazadashop'
                        ? 'Không thu được danh mục sản phẩm của shop. Kiểm tra link shop Lazada (vd https://www.lazada.vn/shop/tenshop) rồi tạo báo cáo mới.'
                        : r.platform === 'ecom'
                          ? 'Không thu được sản phẩm nào từ các sàn với từ khóa này. Thử từ khóa phổ biến hơn hoặc kiểm tra khu vực đã chọn.'
                          : 'Không thu được nội dung nào từ các kênh. Kiểm tra URL kênh (phải công khai) hoặc hạn mức thu thập dữ liệu.';
        });
      }
      // Kênh e-commerce dùng bộ chỉ số riêng; chỉ số danh mục tính cho kênh SHOP và kênh
      // search của tổng thể e-commerce (mọi kênh có danh mục sản phẩm).
      const isEcomKind = (k: string) => ECOM_KINDS.includes(k as (typeof ECOM_KINDS)[number]);
      return updateSocialReport(id, (x) => {
        for (const c of x.channels) {
          if (isEcomKind(c.kind)) {
            c.productMetrics = computeShopeeMetrics(c.productReviews ?? []);
            if (
              ECOM_SHOP_KINDS.includes(c.kind) ||
              (x.platform === 'ecom' && (c.shopProducts?.length ?? 0) > 0)
            )
              c.shopMetrics = computeShopeeShopMetrics(c.shopProducts ?? []);
          } else {
            c.metrics = computeMetrics(c);
          }
        }
        if (!isEcomKind(x.platform) && x.platform !== 'ecom')
          x.metrics = computeReportMetrics(x.channels);
        x.status = 'collected';
      });
    }

    // 3) Bước thu thập: start run Apify với KEY NGẪU NHIÊN + fallback (null → skip bước).
    if (!ANALYZE_ACTIONS.includes(step.action)) {
      const started = await startCollectWithFallback(pool, r, step).catch((err) => {
        // Mọi key trong pool đều lỗi (hoặc lỗi input/actor) → cảnh báo, đi tiếp.
        r.warnings.push(
          `${step.ch !== undefined ? r.channels[step.ch]?.kind : '?'}:${step.action}:start-failed:${
            err instanceof Error ? err.message.slice(0, 120) : 'unknown'
          }`,
        );
        return null;
      });
      if (!started) {
        return updateSocialReport(id, (x) => {
          x.warnings = r.warnings;
          advance(x);
        });
      }
      return updateSocialReport(id, (x) => {
        x.apifyRun = { stepIndex: x.stepIndex, ...started, startedAt: new Date().toISOString() };
      });
    }

    // 4) Pha PHÂN TÍCH AI.
    if (step.action === 'analyzeBrand') {
      const brand = await analyzeBrand(r);
      return updateSocialReport(id, (x) => {
        x.analysis.brand = brand;
        advance(x);
      });
    }
    if (step.action === 'analyzeTactics') {
      const tactics = await analyzeTactics(r);
      return updateSocialReport(id, (x) => {
        x.analysis.tactics = tactics;
        advance(x);
      });
    }
    if (step.action === 'analyzeSummary') {
      const summary = await analyzeSummary(r);
      return updateSocialReport(id, (x) => {
        x.analysis.summary = summary;
        advance(x);
      });
    }
    if (step.action === 'analyzeCompare') {
      const compare = await analyzeCompare(r);
      return updateSocialReport(id, (x) => {
        x.analysis.compare = compare;
        advance(x);
      });
    }
    // 3 bước phân tích riêng của báo cáo NHÓM Facebook (góc nhìn cộng đồng).
    if (step.action === 'analyzeGroupTopics') {
      const groupTopics = await analyzeGroupTopics(r);
      return updateSocialReport(id, (x) => {
        x.analysis.groupTopics = groupTopics;
        advance(x);
      });
    }
    if (step.action === 'analyzeGroupAudience') {
      const groupAudience = await analyzeGroupAudience(r);
      return updateSocialReport(id, (x) => {
        x.analysis.groupAudience = groupAudience;
        advance(x);
      });
    }
    if (step.action === 'analyzeGroupSummary') {
      const groupSummary = await analyzeGroupSummary(r);
      return updateSocialReport(id, (x) => {
        x.analysis.groupSummary = groupSummary;
        advance(x);
      });
    }
    // 3 bước phân tích riêng của báo cáo FACEBOOK CÁ NHÂN.
    if (step.action === 'analyzeProfileTopics') {
      const profileTopics = await analyzeProfileTopics(r);
      return updateSocialReport(id, (x) => {
        x.analysis.profileTopics = profileTopics;
        advance(x);
      });
    }
    if (step.action === 'analyzeProfileAudience') {
      const profileAudience = await analyzeProfileAudience(r);
      return updateSocialReport(id, (x) => {
        x.analysis.profileAudience = profileAudience;
        advance(x);
      });
    }
    if (step.action === 'analyzeProfileSummary') {
      const profileSummary = await analyzeProfileSummary(r);
      return updateSocialReport(id, (x) => {
        x.analysis.profileSummary = profileSummary;
        advance(x);
      });
    }
    // 3 bước phân tích riêng của báo cáo SẢN PHẨM Shopee (góc nhìn e-commerce).
    if (step.action === 'analyzeShopeeProduct') {
      const shopeeProduct = await analyzeShopeeProduct(r);
      return updateSocialReport(id, (x) => {
        x.analysis.shopeeProduct = shopeeProduct;
        advance(x);
      });
    }
    if (step.action === 'analyzeShopeeReviews') {
      const shopeeReviews = await analyzeShopeeReviews(r);
      return updateSocialReport(id, (x) => {
        x.analysis.shopeeReviews = shopeeReviews;
        advance(x);
      });
    }
    if (step.action === 'analyzeShopeeSummary') {
      const shopeeSummary = await analyzeShopeeSummary(r);
      return updateSocialReport(id, (x) => {
        x.analysis.shopeeSummary = shopeeSummary;
        advance(x);
      });
    }
    // 3 bước phân tích riêng của báo cáo SHOP Shopee.
    if (step.action === 'analyzeShopCatalog') {
      const shopCatalog = await analyzeShopCatalog(r);
      return updateSocialReport(id, (x) => {
        x.analysis.shopCatalog = shopCatalog;
        advance(x);
      });
    }
    if (step.action === 'analyzeShopCustomers') {
      const shopCustomers = await analyzeShopCustomers(r);
      return updateSocialReport(id, (x) => {
        x.analysis.shopCustomers = shopCustomers;
        advance(x);
      });
    }
    if (step.action === 'analyzeShopSummary') {
      const shopSummary = await analyzeShopSummary(r);
      return updateSocialReport(id, (x) => {
        x.analysis.shopSummary = shopSummary;
        advance(x);
      });
    }
    // 3 bước phân tích riêng của báo cáo TỔNG THỂ E-COMMERCE (nghiên cứu thị trường).
    if (step.action === 'analyzeEcomMarket') {
      const ecomMarket = await analyzeEcomMarket(r);
      return updateSocialReport(id, (x) => {
        x.analysis.ecomMarket = ecomMarket;
        advance(x);
      });
    }
    if (step.action === 'analyzeEcomCompetitors') {
      const ecomCompetitors = await analyzeEcomCompetitors(r);
      return updateSocialReport(id, (x) => {
        x.analysis.ecomCompetitors = ecomCompetitors;
        advance(x);
      });
    }
    if (step.action === 'analyzeEcomSummary') {
      const ecomSummary = await analyzeEcomSummary(r);
      return updateSocialReport(id, (x) => {
        x.analysis.ecomSummary = ecomSummary;
        advance(x);
      });
    }
    return r;
  } catch (err) {
    // Lỗi bước hiện tại → dừng với thông điệp rõ; người dùng bấm "Thử lại" để chạy tiếp.
    return updateSocialReport(id, (x) => {
      x.status = 'error';
      x.error = err instanceof Error ? err.message : 'Lỗi không xác định khi chạy báo cáo.';
    });
  }
}

// Thử lại sau lỗi: đưa về trạng thái running, giữ nguyên bước hiện tại (dữ liệu đã thu vẫn còn).
export async function retrySocialReport(id: string): Promise<SocialReportRecord | null> {
  return updateSocialReport(id, (x) => {
    if (x.status === 'error') {
      x.status = 'running';
      x.error = undefined;
      x.apifyRun = undefined; // run cũ có thể đã chết → bắt đầu lại bước
    }
  });
}

// Bắt đầu pha phân tích: lưu AI/model người dùng chọn ('' = Tự động) và chạy tiếp.
// Cho phép gọi lại khi đã 'done' (phân tích lại bằng AI khác) hoặc khi lỗi giữa pha phân tích.
export async function startSocialAnalysis(
  id: string,
  ai: { provider: string; model?: string },
): Promise<SocialReportRecord | null> {
  return updateSocialReport(id, (x) => {
    if (x.status === 'running') return; // đang chạy thì không chen ngang
    if (!['collected', 'done', 'error'].includes(x.status)) return;
    if (x.status === 'error' && !x.metrics) return; // lỗi từ pha thu thập → dùng Thử lại
    x.ai = { provider: ai.provider, model: ai.model };
    x.status = 'running';
    x.error = undefined;
    // Phân tích lại từ bước analyze đầu tiên để các phần nhất quán cùng một AI.
    const firstAnalyze = x.plan.findIndex((s) => ANALYZE_ACTIONS.includes(s.action));
    x.stepIndex = firstAnalyze === -1 ? x.plan.length : firstAnalyze;
    x.analysis = {};
  });
}
