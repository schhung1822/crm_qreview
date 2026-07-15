// Tính chỉ số tổng hợp cho Báo cáo Social - THUẦN (không AI, không I/O) → test được.
import type {
  ShopeeMetrics,
  ShopeeProduct,
  ShopeeReview,
  ShopeeShopMetrics,
  SocialChannelData,
  SocialMetrics,
  SocialPost,
} from './types';

function avg(nums: number[]): number | undefined {
  if (!nums.length) return undefined;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function sumDefined(nums: Array<number | undefined>): number | undefined {
  const xs = nums.filter((n): n is number => n !== undefined);
  return xs.length ? xs.reduce((a, b) => a + b, 0) : undefined;
}

// URL chuẩn hóa để khớp bài giữa 2 nguồn dữ liệu (bỏ query + slash cuối) - dùng chung
// cho runner (khớp transcript) và analyze/report (ghép bình luận theo bài của báo cáo nhóm).
export function canonicalUrl(u: string): string {
  return u.split('?')[0].replace(/\/+$/, '').toLowerCase();
}

// Chuẩn hóa chuỗi để so khớp từ khóa: thường hóa + bỏ dấu tiếng Việt (mỹ phẩm ≈ my pham).
function normText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

// Lọc bài THẬT SỰ khớp từ khóa (search của Facebook trả cả kết quả dính hờ):
// giữ bài chứa NGUYÊN CỤM từ khóa, hoặc chứa ĐỦ MỌI token (token ≥ 2 ký tự) của từ khóa.
export function filterByKeyword(posts: SocialPost[], keyword: string): SocialPost[] {
  const kw = normText(keyword.trim());
  if (!kw) return posts;
  const tokens = kw.split(/\s+/).filter((t) => t.length >= 2);
  return posts.filter((p) => {
    const text = normText(p.text ?? '');
    if (!text) return false;
    if (text.includes(kw)) return true;
    return tokens.length > 0 && tokens.every((t) => text.includes(t));
  });
}

// Điểm tương tác của 1 bài để xếp hạng nội dung (search theo keyword lấy TOP tương tác):
// reaction + bình luận + chia sẻ tính đủ; view tính 1% (view rẻ hơn tương tác chủ động).
export function engagementScore(p: SocialPost): number {
  return (p.reactions ?? 0) + (p.comments ?? 0) + (p.shares ?? 0) + (p.views ?? 0) / 100;
}

// Giữ lại n bài TƯƠNG TÁC CAO NHẤT (dùng cho kết quả search theo keyword).
export function topByEngagement(posts: SocialPost[], n: number): SocialPost[] {
  return [...posts].sort((a, b) => engagementScore(b) - engagementScore(a)).slice(0, n);
}

// Gộp posts + reels, khử trùng lặp theo id/url (reel có thể xuất hiện ở cả 2 actor).
export function mergePosts(posts: SocialPost[], reels: SocialPost[]): SocialPost[] {
  const seen = new Set<string>();
  const out: SocialPost[] = [];
  for (const p of [...posts, ...reels]) {
    const key = p.id || p.url;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  // Mới nhất trước; bài không có time xếp cuối.
  return out.sort((a, b) => (b.time ?? '').localeCompare(a.time ?? ''));
}

// Chỉ số của MỘT kênh.
export function computeMetrics(input: {
  page?: SocialChannelData['page'];
  posts: SocialPost[];
  reels: SocialPost[];
  ads: SocialChannelData['ads'];
  comments: SocialChannelData['comments'];
}): SocialMetrics {
  const all = mergePosts(input.posts, input.reels);

  const formatDist: Record<string, number> = {};
  const weekdayDist: Record<string, number> = {};
  const times: number[] = [];
  for (const p of all) {
    formatDist[p.type] = (formatDist[p.type] ?? 0) + 1;
    if (p.time) {
      const d = new Date(p.time);
      if (!Number.isNaN(d.getTime())) {
        weekdayDist[String(d.getDay())] = (weekdayDist[String(d.getDay())] ?? 0) + 1;
        times.push(d.getTime());
      }
    }
  }

  // Tần suất đăng: số bài / số ngày giữa bài cũ nhất và mới nhất (≥1 ngày).
  let postsPerDay: number | undefined;
  if (times.length >= 2) {
    const spanDays = Math.max(1, (Math.max(...times) - Math.min(...times)) / 86_400_000);
    postsPerDay = Math.round((all.length / spanDays) * 100) / 100;
  }

  const reactions = all.map((p) => p.reactions).filter((n): n is number => n !== undefined);
  const comments = all.map((p) => p.comments).filter((n): n is number => n !== undefined);
  const shares = all.map((p) => p.shares).filter((n): n is number => n !== undefined);
  const views = all.map((p) => p.views).filter((n): n is number => n !== undefined);
  const totalEngagement =
    reactions.length + comments.length + shares.length
      ? [...reactions, ...comments, ...shares].reduce((a, b) => a + b, 0)
      : undefined;

  const adFormatDist: Record<string, number> = {};
  const ctaDist: Record<string, number> = {};
  for (const ad of input.ads) {
    const f = (ad.format ?? 'other').toLowerCase();
    adFormatDist[f] = (adFormatDist[f] ?? 0) + 1;
    if (ad.cta) ctaDist[ad.cta] = (ctaDist[ad.cta] ?? 0) + 1;
  }

  // Thành viên đăng bài nổi bật - chỉ tính được khi bài có author (báo cáo NHÓM Facebook).
  const byAuthor = new Map<string, { posts: number; engagement: number }>();
  for (const p of all) {
    if (!p.author) continue;
    const cur = byAuthor.get(p.author) ?? { posts: 0, engagement: 0 };
    cur.posts += 1;
    cur.engagement += (p.reactions ?? 0) + (p.comments ?? 0) + (p.shares ?? 0);
    byAuthor.set(p.author, cur);
  }
  const topContributors = byAuthor.size
    ? [...byAuthor.entries()]
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.engagement - a.engagement || b.posts - a.posts)
        .slice(0, 5)
    : undefined;

  const likes = input.page?.likes;
  const followers = input.page?.followers;
  return {
    totalLikes: likes,
    totalFollowers: followers,
    lfRatio:
      likes !== undefined && followers ? Math.round((likes / followers) * 10000) / 100 : undefined,
    rating: input.page?.rating,
    postCount: all.length,
    formatDist,
    weekdayDist,
    avgReactions: avg(reactions),
    avgComments: avg(comments),
    avgShares: avg(shares),
    avgViews: avg(views),
    totalViews: views.length ? views.reduce((a, b) => a + b, 0) : undefined,
    totalEngagement,
    postsPerDay,
    adFormatDist,
    ctaDist,
    commentCount: input.comments.length,
    topContributors,
  };
}

// Chỉ số đánh giá của SẢN PHẨM Shopee - tính từ các review ĐÃ THU (không phải toàn bộ
// review trên Shopee; con số tổng nằm ở product.ratingCount).
export function computeShopeeMetrics(reviews: ShopeeReview[]): ShopeeMetrics {
  const dist: Record<string, number> = {};
  let sum = 0;
  let rated = 0;
  let withText = 0;
  let withMedia = 0;
  let sellerReplies = 0;
  const variants = new Map<string, number>();
  for (const r of reviews) {
    if (typeof r.rating === 'number' && r.rating >= 1 && r.rating <= 5) {
      dist[String(Math.round(r.rating))] = (dist[String(Math.round(r.rating))] ?? 0) + 1;
      sum += r.rating;
      rated += 1;
    }
    if (r.text?.trim()) withText += 1;
    if ((r.mediaCount ?? 0) > 0) withMedia += 1;
    if (r.sellerReply) sellerReplies += 1;
    if (r.variant) variants.set(r.variant, (variants.get(r.variant) ?? 0) + 1);
  }
  return {
    ratingAvg: rated ? Math.round((sum / rated) * 100) / 100 : undefined,
    ratingDist: dist,
    reviewsCollected: reviews.length,
    withText,
    withMedia,
    sellerReplies,
    topVariants: variants.size
      ? [...variants.entries()]
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)
      : undefined,
  };
}

// Chỉ số DANH MỤC của shop Shopee - tính từ các sản phẩm đã thu.
export function computeShopeeShopMetrics(products: ShopeeProduct[]): ShopeeShopMetrics {
  const prices = products.map((p) => p.priceMin).filter((n): n is number => n !== undefined);
  const ratings = products.map((p) => p.ratingStar).filter((n): n is number => n !== undefined);
  const topRated = products
    .filter((p) => p.ratingStar !== undefined)
    .sort((a, b) => (b.ratingStar ?? 0) - (a.ratingStar ?? 0))
    .slice(0, 5)
    .map((p) => ({ name: p.name, rating: p.ratingStar! }));
  return {
    productsCollected: products.length,
    currency: products.find((p) => p.currency)?.currency,
    priceMin: prices.length ? Math.min(...prices) : undefined,
    priceMax: prices.length ? Math.max(...prices) : undefined,
    priceAvg: prices.length
      ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
      : undefined,
    ratingAvg: ratings.length
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100
      : undefined,
    withDiscount: products.filter((p) => p.discount).length,
    topRated: topRated.length ? topRated : undefined,
  };
}

// Chỉ số TOÀN BÁO CÁO = cộng gộp các kênh (follower/like cộng dồn, phân bổ gộp, trung bình
// tính lại trên toàn bộ bài của mọi kênh).
export function computeReportMetrics(channels: SocialChannelData[]): SocialMetrics {
  if (channels.length === 1) return computeMetrics(channels[0]);
  const allPosts = channels.flatMap((c) => mergePosts(c.posts, c.reels));
  const merged = computeMetrics({
    page: undefined,
    posts: allPosts,
    reels: [],
    ads: channels.flatMap((c) => c.ads),
    comments: channels.flatMap((c) => c.comments),
  });
  merged.totalLikes = sumDefined(channels.map((c) => c.page?.likes));
  merged.totalFollowers = sumDefined(channels.map((c) => c.page?.followers));
  merged.lfRatio = undefined; // gộp nhiều nền tảng → tỷ lệ L/F không còn ý nghĩa
  merged.rating = undefined;
  return merged;
}
