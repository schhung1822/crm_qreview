// Dữ liệu seed (in-memory) để app chạy ngay không cần DB.
// Khi đã thiết lập Postgres + Prisma, thay các getter trong ./index.ts bằng truy vấn thật.

export interface SeedArticle {
  id: string;
  title: string;
  locale: string;
  seo: number;
  aeo: number;
  geo: number;
  status: 'draft' | 'review' | 'published' | 'needsWork';
}

export interface SeedKeyword {
  term: string;
  cluster: string;
  volume: number;
  difficulty: number;
  intent: string;
  type: 'seo' | 'geo';
}

export interface SeedPlanItem {
  title: string;
  target: string;
  type: string;
  priority: 'high' | 'medium' | 'low';
  pillar?: boolean;
}

export interface SeedConnection {
  id: string;
  provider: 'wordpress' | 'wix';
  label: string;
  locale: string;
  pathStrategy: 'subdir' | 'subdomain';
  seoPlugin?: string;
  status: 'active' | 'warning';
}

export interface SeedTranslation {
  locale: string;
  title?: string;
  seo?: number;
  aeo?: number;
  geo?: number;
  state: 'published' | 'outdated' | 'draft' | 'missing';
  origin?: boolean;
  version?: number;
}

export const project = {
  id: 'demo',
  name: 'Blog Công ty ABC',
  defaultLocale: 'vi',
  supportedLocales: ['vi', 'en', 'zh', 'ja', 'ko', 'fr', 'de', 'id', 'hi', 'th'],
};

export const stats = {
  published: 248,
  avgSeo: 82,
  avgAeo: 79,
  avgGeo: 76,
  citations: '1.34K',
  impressions: '412K',
  avgPosition: '8.4',
  topKeywords: 156,
};

export const recentArticles: SeedArticle[] = [
  { id: 'a1', title: 'Cách tối ưu GEO cho website 2026', locale: 'vi', seo: 88, aeo: 85, geo: 84, status: 'published' },
  { id: 'a2', title: 'What is Generative Engine Optimization', locale: 'en', seo: 91, aeo: 83, geo: 79, status: 'review' },
  { id: 'a3', title: '生成式引擎优化完整指南', locale: 'zh', seo: 74, aeo: 70, geo: 71, status: 'draft' },
  { id: 'a4', title: 'AIと検索エンジン最適化の違い', locale: 'ja', seo: 69, aeo: 66, geo: 62, status: 'needsWork' },
];

export const coverage: Array<{ locale: string; name: string; pct: number }> = [
  { locale: 'vi', name: 'Tiếng Việt', pct: 92 },
  { locale: 'en', name: 'English', pct: 78 },
  { locale: 'zh', name: '中文', pct: 54 },
  { locale: 'ja', name: '日本語', pct: 31 },
  { locale: 'ko', name: '한국어', pct: 18 },
];

export const sampleKeywords: SeedKeyword[] = [
  { term: 'geo là gì', cluster: 'Khái niệm', volume: 2400, difficulty: 22, intent: 'Informational', type: 'seo' },
  { term: 'làm sao để xuất hiện trong câu trả lời của ChatGPT', cluster: 'Khái niệm', volume: 880, difficulty: 15, intent: 'Informational', type: 'geo' },
  { term: 'tối ưu seo và geo khác nhau thế nào', cluster: 'So sánh', volume: 1300, difficulty: 38, intent: 'Commercial', type: 'geo' },
  { term: 'công cụ tối ưu geo', cluster: 'Công cụ', volume: 590, difficulty: 41, intent: 'Commercial', type: 'seo' },
  { term: 'cách viết bài cho ai overview', cluster: 'Hướng dẫn', volume: 720, difficulty: 19, intent: 'Informational', type: 'geo' },
  { term: 'schema markup cho geo', cluster: 'Kỹ thuật', volume: 320, difficulty: 12, intent: 'Informational', type: 'seo' },
];

export const planPillar: SeedPlanItem = {
  title: 'Hướng dẫn toàn diện tối ưu GEO cho website 2026',
  target: 'geo là gì',
  type: 'Pillar',
  priority: 'high',
  pillar: true,
};

export const planItems: SeedPlanItem[] = [
  { title: 'GEO và SEO khác nhau thế nào?', target: 'seo vs geo', type: 'So sánh', priority: 'high' },
  { title: 'Cách viết bài để lọt AI Overview', target: 'cách viết bài cho ai overview', type: 'How-to', priority: 'high' },
  { title: '7 công cụ tối ưu GEO tốt nhất', target: 'công cụ tối ưu geo', type: 'Listicle', priority: 'medium' },
  { title: 'Schema markup cho Generative Engine', target: 'schema markup cho geo', type: 'Kỹ thuật', priority: 'low' },
];

export const connections: SeedConnection[] = [
  { id: 'c1', provider: 'wordpress', label: 'blog.example.com', locale: 'vi', pathStrategy: 'subdir', seoPlugin: 'Yoast', status: 'active' },
  { id: 'c2', provider: 'wordpress', label: 'en.example.com', locale: 'en', pathStrategy: 'subdomain', seoPlugin: 'RankMath', status: 'active' },
  { id: 'c3', provider: 'wix', label: 'shop.example.com', locale: 'ja', pathStrategy: 'subdir', status: 'warning' },
];

export const translationGroup = {
  origin: 'GEO và SEO khác nhau thế nào?',
  originLocale: 'vi',
  version: 3,
  rows: [
    { locale: 'vi', title: 'GEO và SEO khác nhau thế nào?', seo: 88, geo: 84, state: 'published', origin: true, version: 3 },
    { locale: 'en', title: "SEO vs GEO: What's the Difference?", seo: 91, geo: 79, state: 'outdated', version: 2 },
    { locale: 'zh', title: 'SEO 与 GEO 有何不同？', seo: 74, geo: 71, state: 'draft' },
    { locale: 'ja', state: 'missing' },
    { locale: 'ko', state: 'missing' },
    { locale: 'fr', state: 'missing' },
  ] as SeedTranslation[],
};

export const upcoming = [
  { date: '29/06 · 09:00', title: '7 công cụ tối ưu GEO tốt nhất', locale: 'vi', site: 'blog.example.com' },
  { date: '30/06 · 14:00', title: "SEO vs GEO: What's the Difference?", locale: 'en', site: 'en.example.com' },
  { date: '02/07 · 10:00', title: '生成式引擎优化完整指南', locale: 'zh', site: '/zh/' },
];

export const topCited = [
  { title: 'Cách tối ưu GEO cho website 2026', locale: 'vi', cites: 418 },
  { title: 'What is Generative Engine Optimization', locale: 'en', cites: 356 },
  { title: 'GEO và SEO khác nhau thế nào?', locale: 'vi', cites: 241 },
  { title: 'Schema markup cho GEO', locale: 'vi', cites: 187 },
];

// Bài mẫu cho trình soạn thảo
export const sampleArticle = {
  id: 'a-editor',
  title: 'GEO và SEO khác nhau thế nào?',
  locale: 'vi',
  seo: 88,
  geo: 71,
  slug: 'geo-va-seo-khac-nhau',
  metaDescription:
    'So sánh SEO và GEO: điểm khác biệt, khi nào dùng cái nào, và cách tối ưu cả hai cho website 2026.',
  markdown: `**Trả lời nhanh:** SEO tối ưu để website *xếp hạng* trên Google, còn GEO tối ưu để nội dung được các engine AI như ChatGPT, Perplexity *trích dẫn* trong câu trả lời. Một bài tốt cần cả hai.

## SEO là gì?

Search Engine Optimization là tập hợp kỹ thuật giúp trang web hiển thị cao hơn trên trang kết quả tìm kiếm.

## GEO là gì?

Generative Engine Optimization tập trung vào việc giúp nội dung được mô hình AI tham chiếu và trích dẫn.

## Bảng so sánh nhanh

| Tiêu chí | SEO | GEO |
|----------|-----|-----|
| Mục tiêu | Xếp hạng | Được trích dẫn |
| Đo lường | Vị trí, CTR | Lượt AI trích |
`,
};
