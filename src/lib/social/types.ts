// Kiểu dữ liệu cho tính năng Báo cáo Social - thu thập qua Apify, phân tích bằng AI.
// V2: ĐA KÊNH - một báo cáo gồm 1..3 kênh (Facebook/TikTok/YouTube) hoặc "tổng thể";
// tiến trình là KẾ HOẠCH BƯỚC ĐỘNG (plan[]) thay vì chuỗi bước cố định.
// Server + client dùng chung (chỉ type + hàm thuần, không I/O).

// 'fbgroup' = NHÓM Facebook công khai (cộng đồng nhiều người đăng - khác fanpage của 1 thương hiệu).
// 'instagram'/'threads' = kênh thương hiệu (như fanpage/TikTok). 'shopee' = SẢN PHẨM Shopee
// (thông tin + đánh giá của 1 sản phẩm). 'shopeeshop' = SHOP Shopee (info shop + danh mục
// sản phẩm + đánh giá của top sản phẩm - phân tích góc nhìn vận hành shop).
// 'tiktokshop'/'tiktokshopshop' = SẢN PHẨM / SHOP trên TikTok Shop - TÁI DÙNG toàn bộ mô hình
// dữ liệu Shopee (ShopeeProduct/Review/ShopInfo + cùng actions/analysis), chỉ khác actor + prompt.
// 'lazada'/'lazadashop' = SẢN PHẨM / SHOP trên Lazada (cùng mô hình Shopee).
export type SocialChannelKind =
  | 'facebook'
  | 'tiktok'
  | 'youtube'
  | 'fbgroup'
  | 'fbprofile'
  | 'instagram'
  | 'threads'
  | 'shopee'
  | 'shopeeshop'
  | 'tiktokshop'
  | 'tiktokshopshop'
  | 'lazada'
  | 'lazadashop';
// 'overall' = tổng thể SOCIAL (nhiều kênh social); 'ecom' = tổng thể E-COMMERCE: nghiên cứu
// thị trường theo TỪ KHÓA - top sản phẩm bán chạy trên Shopee + TikTok Shop + Lazada.
export type SocialPlatform = SocialChannelKind | 'overall' | 'ecom';

// Kind e-commerce (dùng chung khắp nơi: gate dữ liệu, metrics, render, ẩn nút style).
export const ECOM_KINDS: SocialChannelKind[] = [
  'shopee', 'shopeeshop', 'tiktokshop', 'tiktokshopshop', 'lazada', 'lazadashop',
];
export const ECOM_SHOP_KINDS: SocialChannelKind[] = ['shopeeshop', 'tiktokshopshop', 'lazadashop'];
// 3 sàn tham gia báo cáo TỔNG THỂ E-COMMERCE theo keyword.
export const ECOM_SEARCH_KINDS: SocialChannelKind[] = ['shopee', 'tiktokshop', 'lazada'];
// Các nền tảng tham gia báo cáo "tổng thể" theo keyword (nhóm FB không search được;
// Shopee là sản phẩm, không phải kênh → cả hai không gồm). Instagram search theo
// keyword→hashtag (best-effort), Threads search text tự do.
export const SOCIAL_CHANNEL_KINDS: SocialChannelKind[] = [
  'facebook',
  'instagram',
  'threads',
  'tiktok',
  'youtube',
];

// ── Dữ liệu đã chuẩn hóa từ Apify (chung cho mọi kênh) ──

export interface SocialPageInfo {
  name: string;
  url: string;
  likes?: number; // FB: like trang · TikTok: tổng tim · YouTube: (không có)
  followers?: number; // FB: theo dõi · TikTok: follower · YouTube: subscriber · Nhóm FB: THÀNH VIÊN
  categories?: string[]; // Nhóm FB: kèm nhãn quyền riêng tư (Public...)
  rating?: string; // FB: "92% recommend (1,609)"
  intro?: string;
  profilePicture?: string;
}

export type SocialPostType = 'reel' | 'video' | 'image' | 'event' | 'text' | 'other';

export interface SocialPost {
  id: string;
  type: SocialPostType;
  url: string;
  time?: string; // ISO
  text?: string;
  reactions?: number; // FB reaction · TikTok tim · YouTube like
  comments?: number;
  shares?: number;
  views?: number;
  thumbnail?: string;
  author?: string; // người đăng - chỉ có ở bài trong NHÓM (fanpage/kênh thì chính chủ đăng)
  transcript?: string; // lời thoại video/reel (text thuần, đã parse nếu nguồn là file phụ đề)
  transcriptUrl?: string; // URL file phụ đề (VTT/SRT) do actor trả - runner tải về rồi parse
}

export interface SocialAd {
  id: string;
  text?: string;
  cta?: string;
  format?: string;
  status?: string;
  startDate?: string;
  url?: string;
}

export interface SocialComment {
  postUrl: string;
  text: string;
  likes?: number;
  author?: string;
}

// ── Chỉ số tổng hợp (tính thuần, không AI) ──

export interface SocialMetrics {
  totalLikes?: number;
  totalFollowers?: number;
  lfRatio?: number; // likes/followers %
  rating?: string;
  postCount: number;
  formatDist: Record<string, number>;
  weekdayDist: Record<string, number>; // '0'..'6' (CN..T7)
  avgReactions?: number;
  avgComments?: number;
  avgShares?: number;
  avgViews?: number;
  totalViews?: number;
  totalEngagement?: number;
  postsPerDay?: number;
  adFormatDist: Record<string, number>;
  ctaDist: Record<string, number>;
  commentCount: number;
  // Thành viên đăng bài nổi bật (chỉ có khi bài đăng có author - tức báo cáo NHÓM).
  topContributors?: Array<{ name: string; posts: number; engagement: number }>;
}

// ── Dữ liệu SẢN PHẨM Shopee (báo cáo platform 'shopee') ──

export interface ShopeeVariant {
  name: string;
  price?: number;
  stock?: number;
}

export interface ShopeeProduct {
  name: string;
  url: string;
  itemId?: string;
  shopId?: string;
  description?: string;
  currency?: string;
  priceMin?: number;
  priceMax?: number;
  discount?: string;
  ratingStar?: number; // sao trung bình hiển thị trên listing
  ratingCount?: number; // tổng lượt đánh giá của sản phẩm
  sold?: number;
  // Riêng TikTok Shop (nguồn analytics): nhịp bán gần đây → biểu đồ tăng/giảm.
  sold7d?: number;
  sold30d?: number;
  stock?: number;
  images?: string[];
  variants?: ShopeeVariant[];
  categories?: string[];
  attributes?: Record<string, string>; // thông số (chất liệu, xuất xứ...)
  shopName?: string;
  shopRating?: number;
  shopLocation?: string;
}

export interface ShopeeReview {
  rating?: number; // 1..5
  text?: string;
  author?: string;
  time?: string; // ISO
  variant?: string; // phân loại đã mua
  likes?: number;
  mediaCount?: number; // số ảnh/video người mua đính kèm
  sellerReply?: string;
  aspects?: Record<string, string>; // sao/nhận xét theo khía cạnh (chất lượng, giao hàng...)
  itemId?: string; // id sản phẩm (báo cáo SHOP: khớp review về đúng sản phẩm)
  ofProduct?: string; // tên sản phẩm (báo cáo SHOP: đánh giá xuyên nhiều sản phẩm)
}

// ── Dữ liệu SHOP Shopee (báo cáo platform 'shopeeshop') ──

export interface ShopeeShopInfo {
  name: string;
  url: string;
  username?: string;
  rating?: number; // sao trung bình của shop
  followers?: number;
  itemCount?: number; // tổng số sản phẩm của shop
  responseRate?: number; // % phản hồi chat
  location?: string;
  isOfficialShop?: boolean; // Shopee Mall
  isVerified?: boolean;
  // Riêng shop TikTok Shop (nguồn analytics trả CHUỖI hiển thị "303.02M" / "₫18983.88B").
  totalSold?: string; // tổng lượt bán của shop
  gmv?: string; // doanh số ước tính (GMV) của shop
}

// Chỉ số tính THUẦN từ danh mục sản phẩm đã thu (không AI).
export interface ShopeeShopMetrics {
  productsCollected: number;
  currency?: string;
  priceMin?: number;
  priceMax?: number;
  priceAvg?: number;
  ratingAvg?: number; // sao TB trên các sản phẩm đã thu
  withDiscount: number; // số sản phẩm đang giảm giá
  topRated?: Array<{ name: string; rating: number }>;
}

// Chỉ số tính THUẦN từ đánh giá đã thu (không AI).
export interface ShopeeMetrics {
  ratingAvg?: number; // trung bình trên các review ĐÃ THU
  ratingDist: Record<string, number>; // '1'..'5'
  reviewsCollected: number;
  withText: number;
  withMedia: number;
  sellerReplies: number;
  topVariants?: Array<{ name: string; count: number }>; // phân loại được mua/nhắc nhiều nhất
}

// ── Một KÊNH trong báo cáo ──

export interface SocialChannelData {
  kind: SocialChannelKind;
  url: string; // URL kênh; RỖNG khi thu theo keyword (kênh = "kết quả tìm kiếm nền tảng")
  groupId?: string; // ID SỐ của nhóm FB (lấy từ output bài viết) - actor info nhóm cần URL dạng ID
  page?: SocialPageInfo;
  posts: SocialPost[];
  reels: SocialPost[]; // Facebook + Instagram
  ads: SocialAd[]; // chỉ Facebook
  comments: SocialComment[];
  metrics?: SocialMetrics;
  // Riêng kênh 'shopee' (báo cáo sản phẩm) - posts/reels/ads/comments để rỗng.
  product?: ShopeeProduct;
  productReviews?: ShopeeReview[]; // kênh 'shopeeshop' dùng chung (đánh giá top sản phẩm)
  productMetrics?: ShopeeMetrics;
  // Riêng kênh 'shopeeshop' (báo cáo shop).
  shopInfo?: ShopeeShopInfo;
  shopProducts?: ShopeeProduct[];
  shopMetrics?: ShopeeShopMetrics;
}

export function emptyChannel(kind: SocialChannelKind, url: string): SocialChannelData {
  return { kind, url, posts: [], reels: [], ads: [], comments: [] };
}

// ── Kết quả phân tích AI ──

export interface AnalyzedItem {
  name: string;
  desc: string;
  effectiveness?: string;
  posts?: string; // "Bài 2, Bài 3"
}

export interface SocialBrandAnalysis {
  positioning: string;
  voice: string;
  targetAudience: string;
  contentPillars: AnalyzedItem[];
  contentFormulas: AnalyzedItem[];
}

export interface SocialTacticsAnalysis {
  hooks: AnalyzedItem[];
  leading: AnalyzedItem[];
  ctas: AnalyzedItem[];
  adStrategy: {
    objective: string;
    formulas: AnalyzedItem[];
    angles: AnalyzedItem[];
  };
  funnel: { tofu: string; mofu: string; bofu: string };
}

export interface SocialSummaryAnalysis {
  summary: string;
  strengths: AnalyzedItem[];
  weaknesses: AnalyzedItem[];
  avoid: AnalyzedItem[];
  learnFrom: AnalyzedItem[];
  contentIdeas: Array<{ title: string; desc: string; reason: string }>;
}

// So sánh xuyên kênh - CHỈ có ở báo cáo "tổng thể" (≥2 kênh).
export interface SocialCompareAnalysis {
  overview: string; // bức tranh chung giữa các nền tảng
  channels: AnalyzedItem[]; // đánh giá từng kênh (name = tên kênh)
  bestFormats: AnalyzedItem[]; // định dạng/loại nội dung hiệu quả nhất xuyên nền tảng
  allocation: string; // đề xuất phân bổ nội dung/nguồn lực giữa các kênh
}

// ── Phân tích dành riêng cho NHÓM Facebook (cộng đồng - không phải kênh thương hiệu) ──

// Bước 1: nội dung của nhóm - chủ đề nóng, kiểu bài hiệu quả, yếu tố kéo tương tác.
export interface SocialGroupTopicsAnalysis {
  overview: string; // bức tranh nội dung của nhóm
  hotTopics: AnalyzedItem[]; // chủ đề nóng/lặp lại (kèm dẫn chứng bài)
  formats: AnalyzedItem[]; // kiểu bài/định dạng hiệu quả trong nhóm
  engagementDrivers: AnalyzedItem[]; // yếu tố kéo tương tác (từ bài + bình luận)
}

// Bước 2: insight thành viên - chân dung, nhu cầu, nỗi đau, câu hỏi, ngôn ngữ.
export interface SocialGroupAudienceAnalysis {
  memberProfile: string; // chân dung thành viên nhóm
  needs: AnalyzedItem[]; // nhu cầu nổi bật
  painPoints: AnalyzedItem[]; // nỗi đau/vấn đề hay than phiền
  questions: AnalyzedItem[]; // câu hỏi thường gặp (chủ yếu từ bình luận)
  language: string; // ngôn ngữ/cách nói đặc trưng của thành viên
}

// Bước 3: tổng kết & cơ hội - đánh giá nhóm, cơ hội content/seeding, ý tưởng, điều nên tránh.
export interface SocialGroupSummaryAnalysis {
  summary: string;
  opportunities: AnalyzedItem[]; // cơ hội content/seeding cho thương hiệu
  engagementTips: AnalyzedItem[]; // cách tham gia nhóm hiệu quả
  avoid: AnalyzedItem[]; // điều nên tránh (văn hóa/luật nhóm)
  contentIdeas: Array<{ title: string; desc: string; reason: string }>;
}

// ── Phân tích dành riêng cho SẢN PHẨM Shopee (góc nhìn e-commerce) ──

// Bước 1: sản phẩm & listing - điểm mạnh/khoảng trống của trang sản phẩm, định vị giá.
export interface SocialShopeeProductAnalysis {
  overview: string; // đánh giá tổng quan sản phẩm + listing
  listingStrengths: AnalyzedItem[]; // listing đang làm tốt gì
  listingGaps: AnalyzedItem[]; // thiếu/yếu gì cần cải thiện
  pricingPosition: string; // nhận định giá/biến thể/khuyến mãi
}

// Bước 2: insight từ đánh giá của khách - khen/chê, nhu cầu, ngôn ngữ người mua.
export interface SocialShopeeReviewsAnalysis {
  sentiment: string; // bức tranh cảm xúc chung từ đánh giá
  praises: AnalyzedItem[]; // điểm được khen (kèm khía cạnh)
  complaints: AnalyzedItem[]; // điểm bị chê/vấn đề lặp lại
  customerNeeds: AnalyzedItem[]; // nhu cầu/mối quan tâm khi mua
  language: string; // ngôn ngữ/cách nói của người mua
}

// Bước 3: tổng kết & đề xuất - cải thiện, ý tưởng content bán hàng, FAQ cần trả lời.
export interface SocialShopeeSummaryAnalysis {
  summary: string;
  improvements: AnalyzedItem[]; // đề xuất cải thiện sản phẩm/listing/vận hành
  contentIdeas: Array<{ title: string; desc: string; reason: string }>; // content bán hàng
  faq: AnalyzedItem[]; // câu hỏi/rào cản mua nên trả lời sẵn
}

// ── Phân tích dành riêng cho SHOP Shopee ──

// Bước 1: danh mục & giá của shop.
export interface SocialShopCatalogAnalysis {
  overview: string; // bức tranh shop: bán gì, quy mô, vị thế
  priceStrategy: string; // nhận định chiến lược giá/khuyến mãi
  strongProducts: AnalyzedItem[]; // sản phẩm chủ lực (kèm dẫn chứng)
  gaps: AnalyzedItem[]; // khoảng trống/điểm yếu của danh mục
}

// Bước 2: insight khách hàng xuyên sản phẩm - TÁI DÙNG SocialShopeeReviewsAnalysis.

// Bước 3: tổng kết & đề xuất cho shop.
export interface SocialShopSummaryAnalysis {
  summary: string;
  opportunities: AnalyzedItem[]; // cơ hội tăng trưởng (sản phẩm/giá/content)
  improvements: AnalyzedItem[]; // đề xuất cải thiện vận hành/danh mục
  contentIdeas: Array<{ title: string; desc: string; reason: string }>;
}

// ── Phân tích TỔNG THỂ E-COMMERCE (nghiên cứu thị trường theo keyword, 3 sàn) ──

// Bước 1: bức tranh thị trường - nhu cầu, giá, đặc điểm từng sàn.
export interface SocialEcomMarketAnalysis {
  overview: string; // bức tranh chung của thị trường ngách này
  platforms: AnalyzedItem[]; // đánh giá từng sàn (name = tên sàn): mức cạnh tranh, giá, đặc thù
  pricing: string; // phân tích mặt bằng giá xuyên sàn (dải giá, phân khúc, mức giảm giá)
  demand: AnalyzedItem[]; // tín hiệu nhu cầu (sản phẩm bán chạy, kiểu sản phẩm được chuộng)
}

// Bước 2: đối thủ nổi bật xuyên sàn.
export interface SocialEcomCompetitorsAnalysis {
  overview: string; // cục diện cạnh tranh
  competitors: AnalyzedItem[]; // đối thủ/shop nổi bật (kèm sàn + số liệu)
  strategies: AnalyzedItem[]; // chiến lược nhận thấy (giá, combo, branding, khuyến mãi)
}

// Bước 3: tổng kết & kế hoạch gia nhập thị trường.
export interface SocialEcomSummaryAnalysis {
  summary: string;
  opportunities: AnalyzedItem[]; // cơ hội/khoảng trống thị trường
  risks: AnalyzedItem[]; // rủi ro/rào cản khi gia nhập
  entryPlan: string; // đề xuất kế hoạch: sàn ưu tiên, giá đề xuất, cách khác biệt hóa
  contentIdeas: Array<{ title: string; desc: string; reason: string }>;
}

export interface SocialAnalysis {
  brand?: SocialBrandAnalysis;
  tactics?: SocialTacticsAnalysis;
  summary?: SocialSummaryAnalysis;
  compare?: SocialCompareAnalysis;
  // Bộ phân tích riêng của báo cáo NHÓM Facebook.
  groupTopics?: SocialGroupTopicsAnalysis;
  groupAudience?: SocialGroupAudienceAnalysis;
  groupSummary?: SocialGroupSummaryAnalysis;
  // Bộ phân tích riêng của báo cáo FACEBOOK CÁ NHÂN (tái dùng cấu trúc của nhóm: nội dung + tệp
  // người theo dõi/tương tác suy từ bình luận công khai).
  profileTopics?: SocialGroupTopicsAnalysis;
  profileAudience?: SocialGroupAudienceAnalysis;
  profileSummary?: SocialGroupSummaryAnalysis;
  // Bộ phân tích riêng của báo cáo SẢN PHẨM Shopee.
  shopeeProduct?: SocialShopeeProductAnalysis;
  shopeeReviews?: SocialShopeeReviewsAnalysis;
  shopeeSummary?: SocialShopeeSummaryAnalysis;
  // Bộ phân tích riêng của báo cáo SHOP Shopee (bước 2 tái dùng kiểu insight đánh giá).
  shopCatalog?: SocialShopCatalogAnalysis;
  shopCustomers?: SocialShopeeReviewsAnalysis;
  shopSummary?: SocialShopSummaryAnalysis;
  // Bộ phân tích riêng của báo cáo TỔNG THỂ E-COMMERCE (nghiên cứu thị trường).
  ecomMarket?: SocialEcomMarketAnalysis;
  ecomCompetitors?: SocialEcomCompetitorsAnalysis;
  ecomSummary?: SocialEcomSummaryAnalysis;
}

// Hồ sơ STYLE thương hiệu - rút từ bài viết/video của các kênh (chạy theo yêu cầu,
// độc lập với 3 bước phân tích chính). Xuất được thành Markdown hoặc prompt tái sử dụng.
export interface SocialStyleProfile {
  summary: string; // nhận diện tổng quan phong cách
  toneOfVoice: string; // tông giọng
  addressing: string; // cách xưng hô với khán giả
  vocabulary: string; // đặc điểm từ ngữ (từ đặc trưng, emoji, hashtag, thuật ngữ)
  sentencePatterns: string; // cấu trúc câu, nhịp điệu, độ dài
  argumentation: string; // cách lập luận/thuyết phục, dùng dẫn chứng
  contentFormulas: string; // công thức nội dung đặc trưng (hook - thân - CTA...)
  storytelling: string; // cách kể chuyện/dẫn dắt
  signatureTraits: string; // đặc điểm riêng nhận diện thương hiệu
  signaturePhrases: string[]; // câu/cụm đặc trưng trích NGUYÊN VĂN từ nội dung thật
  doList: string[]; // nên làm khi viết theo style này
  dontList: string[]; // cần tránh
}

// ── Kế hoạch bước động ──

// Hành động 1 bước: thu thập (gắn với 1 kênh qua `ch`) hoặc phân tích AI (toàn báo cáo).
export type SocialAction =
  | 'page'
  | 'posts'
  | 'reels'
  | 'transcript' // lấy lời thoại các video còn thiếu qua actor transcript chuyên dụng
  | 'ads'
  | 'comments'
  | 'search' // thu top nội dung theo keyword trên 1 nền tảng (báo cáo tổng thể option keyword)
  | 'product' // thông tin sản phẩm Shopee (kèm đánh giá inline)
  | 'reviews' // đánh giá sản phẩm Shopee (báo cáo shop: đánh giá của TOP sản phẩm)
  | 'shop' // danh mục sản phẩm của shop Shopee
  | 'analyzeBrand'
  | 'analyzeTactics'
  | 'analyzeSummary'
  | 'analyzeCompare'
  // 3 bước phân tích riêng của báo cáo NHÓM Facebook.
  | 'analyzeGroupTopics'
  | 'analyzeGroupAudience'
  | 'analyzeGroupSummary'
  // 3 bước phân tích riêng của báo cáo FACEBOOK CÁ NHÂN (trang cá nhân + tệp người theo dõi/tương tác).
  | 'analyzeProfileTopics'
  | 'analyzeProfileAudience'
  | 'analyzeProfileSummary'
  // 3 bước phân tích riêng của báo cáo SẢN PHẨM Shopee.
  | 'analyzeShopeeProduct'
  | 'analyzeShopeeReviews'
  | 'analyzeShopeeSummary'
  // 3 bước phân tích riêng của báo cáo SHOP Shopee.
  | 'analyzeShopCatalog'
  | 'analyzeShopCustomers'
  | 'analyzeShopSummary'
  // 3 bước phân tích riêng của báo cáo TỔNG THỂ E-COMMERCE.
  | 'analyzeEcomMarket'
  | 'analyzeEcomCompetitors'
  | 'analyzeEcomSummary';

export const ANALYZE_ACTIONS: SocialAction[] = [
  'analyzeBrand',
  'analyzeTactics',
  'analyzeSummary',
  'analyzeCompare',
  'analyzeGroupTopics',
  'analyzeGroupAudience',
  'analyzeGroupSummary',
  'analyzeProfileTopics',
  'analyzeProfileAudience',
  'analyzeProfileSummary',
  'analyzeShopeeProduct',
  'analyzeShopeeReviews',
  'analyzeShopeeSummary',
  'analyzeShopCatalog',
  'analyzeShopCustomers',
  'analyzeShopSummary',
  'analyzeEcomMarket',
  'analyzeEcomCompetitors',
  'analyzeEcomSummary',
];

export interface SocialPlanStep {
  action: SocialAction;
  ch?: number; // index kênh trong channels[] (bước thu thập)
}

export interface SocialReportOptions {
  postsLimit: number; // số bài/video mỗi kênh
  reelsLimit: number;
  adsLimit: number;
  commentsLimit: number;
  includeReels: boolean; // chỉ Facebook
  includeAds: boolean; // chỉ Facebook
  includeComments: boolean;
  // Chỉ báo cáo NHÓM: lấy bài NỔI BẬT ('top', kèm giới hạn 6 tháng gần nhất) hay MỚI NHẤT ('new').
  groupSort?: 'top' | 'new';
  // Chỉ báo cáo TikTok Shop: khu vực chợ (mã nước) - 3 actor đều cần; mặc định VN.
  ttsRegion?: string;
}

// AI người dùng chọn cho pha phân tích. provider '' = Tự động.
export interface SocialAiChoice {
  provider: string;
  model?: string;
}

// Run Apify đang chạy dở của một bước (để poll ở lần gọi /step kế tiếp).
export interface ApifyRunRef {
  stepIndex: number;
  runId: string;
  datasetId: string;
  keyId?: string; // key Apify đã start run (poll/dataset PHẢI dùng đúng key này). Vắng = run cũ trước khi có pool.
  startedAt: string; // ISO - quá 15 phút coi như hỏng để không kẹt vô hạn
}

export interface SocialReportRecord {
  id: string;
  platform: SocialPlatform;
  title: string; // tên hiển thị: tên kênh chính / keyword / tên tổng hợp
  customTitle?: boolean; // true = user tự đặt tên → runner KHÔNG ghi đè bằng tên kênh/sản phẩm
  keyword?: string; // báo cáo tổng thể theo keyword
  locale: string; // ngôn ngữ đầu ra của phần phân tích
  // 2 pha: 'running' (thu thập HOẶC phân tích) → 'collected' (đã có dữ liệu thô, chờ chọn
  // AI/model) → 'running' → 'done'. 'error' dừng ở bước lỗi, Thử lại được.
  status: 'running' | 'collected' | 'done' | 'error';
  plan: SocialPlanStep[];
  stepIndex: number; // bước hiện tại trong plan
  ai?: SocialAiChoice; // có giá trị = người dùng ĐÃ yêu cầu phân tích (kể cả Tự động)
  error?: string;
  warnings: string[];
  options: SocialReportOptions;
  apifyRun?: ApifyRunRef;
  channels: SocialChannelData[];
  metrics?: SocialMetrics; // tổng hợp toàn báo cáo (cộng gộp các kênh)
  analysis: SocialAnalysis;
  style?: SocialStyleProfile; // hồ sơ style thương hiệu (tạo theo yêu cầu)
  // Chia sẻ công khai: có giá trị = đã bật link chia sẻ (chỉ-xem). token thô lưu ở đây (dữ liệu
  // của chủ, đã cô lập theo biz) để chủ copy lại link; INDEX toàn cục chỉ lưu HASH (social-shares).
  share?: { token: string; createdAt: string; slug?: string; locked?: boolean };
  // Ảnh bìa RIÊNG cho link chia sẻ (OG) - do người dùng tạo bằng AI. URL tuyệt đối. Ưu tiên cao
  // nhất khi dựng thẻ og:image của trang /share (trên cả avatar kênh và ảnh bìa nền tảng).
  shareCover?: string;
  createdAt: string;
  updatedAt: string;
}

// Bản tóm tắt cho danh sách quản lý báo cáo (không kèm dữ liệu nặng).
export interface SocialReportSummary {
  id: string;
  platform: SocialPlatform;
  title: string;
  keyword?: string;
  channelKinds: SocialChannelKind[];
  locale: string;
  status: 'running' | 'collected' | 'done' | 'error';
  action?: SocialAction; // hành động của bước hiện tại (hiện tiến trình)
  actionChannel?: SocialChannelKind; // kênh của bước hiện tại (nếu là bước thu thập)
  stepIndex: number;
  stepCount: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export function currentStep(r: SocialReportRecord): SocialPlanStep | undefined {
  return r.plan[r.stepIndex];
}

export function toSummary(r: SocialReportRecord): SocialReportSummary {
  const step = currentStep(r);
  return {
    id: r.id,
    platform: r.platform,
    title: r.title,
    keyword: r.keyword,
    channelKinds: r.channels.map((c) => c.kind),
    locale: r.locale,
    status: r.status,
    action: step?.action,
    actionChannel: step?.ch !== undefined ? r.channels[step.ch]?.kind : undefined,
    stepIndex: r.stepIndex,
    stepCount: r.plan.length,
    error: r.error,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// ── Dựng kế hoạch bước từ cấu hình báo cáo (thuần → test được) ──

export function buildPlan(input: {
  platform: SocialPlatform;
  channels: Array<{ kind: SocialChannelKind }>;
  keyword?: string;
  options: SocialReportOptions;
}): SocialPlanStep[] {
  const plan: SocialPlanStep[] = [];
  if (input.platform === 'lazada') {
    // Báo cáo SẢN PHẨM Lazada: trang sản phẩm (PDP) bị Lazada chặn với mọi nguồn khả dụng
    // (đã xác minh 3 lần) → 1 bước 'product' duy nhất: SEARCH theo từ khóa rút từ SLUG của
    // link + khớp product_id, actor trả kèm ĐÁNH GIÁ inline (getReviews) → 3 bước AI.
    plan.push({ action: 'product', ch: 0 });
    plan.push(
      { action: 'analyzeShopeeProduct' },
      { action: 'analyzeShopeeReviews' },
      { action: 'analyzeShopeeSummary' },
    );
    return plan;
  }
  if (input.platform === 'lazadashop') {
    // Báo cáo SHOP Lazada: 1 bước 'shop' duy nhất - URL shop trả danh mục sản phẩm + đánh
    // giá gắn theo từng sản phẩm trong CÙNG 1 run (getReviews inline) → 3 bước AI shop.
    plan.push({ action: 'shop', ch: 0 });
    plan.push(
      { action: 'analyzeShopCatalog' },
      { action: 'analyzeShopCustomers' },
      { action: 'analyzeShopSummary' },
    );
    return plan;
  }
  if (input.platform === 'ecom') {
    // TỔNG THỂ E-COMMERCE theo keyword: top sản phẩm BÁN CHẠY trên từng sàn (1 bước search/
    // kênh; TikTok Shop tối đa 10 kết quả/lượt → lặp theo trang) → 3 bước AI nghiên cứu
    // thị trường (bức tranh thị trường → đối thủ xuyên sàn → tổng kết & kế hoạch gia nhập).
    input.channels.forEach((c, i) => {
      const pages =
        c.kind === 'tiktokshop'
          ? Math.max(1, Math.min(4, Math.ceil(input.options.postsLimit / 10)))
          : 1;
      for (let p = 0; p < pages; p++) plan.push({ action: 'search', ch: i });
    });
    plan.push(
      { action: 'analyzeEcomMarket' },
      { action: 'analyzeEcomCompetitors' },
      { action: 'analyzeEcomSummary' },
    );
    return plan;
  }
  if (input.platform === 'tiktokshop') {
    // Báo cáo SẢN PHẨM TikTok Shop: cùng khung với Shopee (detail đã kèm đã bán/tồn kho/sao
    // + seller) → đánh giá → 3 bước AI e-commerce (prompt riêng cho TikTok Shop).
    plan.push({ action: 'product', ch: 0 }, { action: 'reviews', ch: 0 });
    plan.push(
      { action: 'analyzeShopeeProduct' },
      { action: 'analyzeShopeeReviews' },
      { action: 'analyzeShopeeSummary' },
    );
    return plan;
  }
  if (input.platform === 'tiktokshopshop') {
    // Báo cáo SHOP TikTok Shop: TikTok Shop VN KHÔNG có trang shop công khai trên web
    // (đã xác minh: mọi actor danh mục shop đều khóa US) → danh mục dựng bằng SEARCH theo
    // tên shop rồi LỌC theo seller đa số; actor search trả tối đa 10 sản phẩm/lượt → lặp
    // bước 'shop' theo số trang cần. Sau đó detail 1 sản phẩm lấy sao/địa điểm shop ('page')
    // → đánh giá top sản phẩm → 3 bước AI góc nhìn shop (prompt riêng TikTok Shop).
    const pages = Math.max(1, Math.min(4, Math.ceil(input.options.postsLimit / 10)));
    for (let i = 0; i < pages; i++) plan.push({ action: 'shop', ch: 0 });
    plan.push({ action: 'page', ch: 0 }, { action: 'reviews', ch: 0 });
    plan.push(
      { action: 'analyzeShopCatalog' },
      { action: 'analyzeShopCustomers' },
      { action: 'analyzeShopSummary' },
    );
    return plan;
  }
  if (input.platform === 'shopee') {
    // Báo cáo SẢN PHẨM Shopee: info sản phẩm (actor trả kèm đánh giá inline) → đánh giá
    // sâu hơn (bỏ qua nếu bước 1 đã thu đủ) → 3 bước AI góc nhìn e-commerce
    // (sản phẩm & listing → insight từ đánh giá → tổng kết & đề xuất).
    plan.push({ action: 'product', ch: 0 }, { action: 'reviews', ch: 0 });
    plan.push(
      { action: 'analyzeShopeeProduct' },
      { action: 'analyzeShopeeReviews' },
      { action: 'analyzeShopeeSummary' },
    );
    return plan;
  }
  if (input.platform === 'shopeeshop') {
    // Báo cáo SHOP Shopee: danh mục sản phẩm TRƯỚC (cần itemId để lấy info shop + review)
    // → info shop (qua detail 1 sản phẩm - field shop{} rất đầy đủ) → đánh giá của TOP
    // sản phẩm → 3 bước AI góc nhìn shop (danh mục & giá → insight khách → tổng kết).
    plan.push({ action: 'shop', ch: 0 }, { action: 'page', ch: 0 }, { action: 'reviews', ch: 0 });
    plan.push(
      { action: 'analyzeShopCatalog' },
      { action: 'analyzeShopCustomers' },
      { action: 'analyzeShopSummary' },
    );
    return plan;
  }
  if (input.platform === 'fbprofile') {
    // Báo cáo FACEBOOK CÁ NHÂN: bài công khai TRƯỚC (actor facebook-posts-scraper, thông tin trang
    // suy từ chính bài) → bù lời thoại video → bình luận (để suy tệp người theo dõi/tương tác)
    // → 3 bước AI: chủ đề & nội dung → tệp người theo dõi (chân dung/nhu cầu/ngôn ngữ) → tổng kết.
    // KHÔNG có bước 'page' riêng (profile cá nhân không có actor info đáng tin - lấy tên từ bài).
    plan.push({ action: 'posts', ch: 0 }, { action: 'transcript', ch: 0 });
    if (input.options.includeComments) plan.push({ action: 'comments', ch: 0 });
    plan.push(
      { action: 'analyzeProfileTopics' },
      { action: 'analyzeProfileAudience' },
      { action: 'analyzeProfileSummary' },
    );
    return plan;
  }
  if (input.platform === 'fbgroup') {
    // Báo cáo NHÓM Facebook: bài viết TRƯỚC (kèm top bình luận inline + ID số của nhóm)
    // → info nhóm (thành viên/mô tả - actor cần URL dạng ID số, lấy từ bước posts)
    // → bù lời thoại video → bình luận sâu hơn (tùy chọn) → 3 bước AI riêng
    // góc nhìn CỘNG ĐỒNG (chủ đề → insight thành viên → tổng kết & cơ hội).
    plan.push({ action: 'posts', ch: 0 }, { action: 'page', ch: 0 }, { action: 'transcript', ch: 0 });
    if (input.options.includeComments) plan.push({ action: 'comments', ch: 0 });
    plan.push(
      { action: 'analyzeGroupTopics' },
      { action: 'analyzeGroupAudience' },
      { action: 'analyzeGroupSummary' },
    );
    return plan;
  }
  // Kênh có bước transcript bù lời thoại riêng (Instagram lấy transcript INLINE trong bước
  // reels qua option includeTranscript; Threads thuần chữ → cả hai không cần).
  const TRANSCRIPT_KINDS: SocialChannelKind[] = ['facebook', 'tiktok', 'youtube'];
  if (input.platform === 'overall' && input.keyword) {
    // Option keyword: mỗi kênh là "kết quả tìm kiếm" trên 1 nền tảng → 1 bước search/kênh
    // + 1 bước transcript bù lời thoại cho video còn thiếu (kênh có hỗ trợ).
    input.channels.forEach((c, i) => {
      plan.push({ action: 'search', ch: i });
      if (TRANSCRIPT_KINDS.includes(c.kind)) plan.push({ action: 'transcript', ch: i });
    });
  } else {
    input.channels.forEach((c, i) => {
      // TikTok/YouTube/Threads: actor bài đăng trả kèm thông tin kênh → không cần bước 'page'.
      if (c.kind === 'facebook' || c.kind === 'instagram') plan.push({ action: 'page', ch: i });
      plan.push({ action: 'posts', ch: i });
      if ((c.kind === 'facebook' || c.kind === 'instagram') && input.options.includeReels)
        plan.push({ action: 'reels', ch: i });
      // Bù lời thoại qua actor transcript chuyên dụng cho video chưa có (bỏ qua nếu đủ).
      if (TRANSCRIPT_KINDS.includes(c.kind)) plan.push({ action: 'transcript', ch: i });
      if (c.kind === 'facebook' && input.options.includeAds) plan.push({ action: 'ads', ch: i });
      if (input.options.includeComments) plan.push({ action: 'comments', ch: i });
    });
  }
  plan.push({ action: 'analyzeBrand' }, { action: 'analyzeTactics' }, { action: 'analyzeSummary' });
  if (input.channels.length >= 2) plan.push({ action: 'analyzeCompare' });
  return plan;
}
