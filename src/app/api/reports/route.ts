import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { locales } from '@/i18n/config';
import { listArticles } from '@/lib/store/articles';
import { listKeywordSets } from '@/lib/store/keywordsets';
import { listPlans } from '@/lib/store/plans';

export const dynamic = 'force-dynamic';

const RANGE_DAYS: Record<string, number> = { '7': 7, '30': 30, '90': 90 };

// GET /api/reports?range=7|30|90|all → số liệu THẬT từ dữ liệu nội bộ (bài, plan, keyword).
// Lưu ý: traffic/impressions thật cần nối Google Search Console - chưa có ở đây.
export async function GET(req: Request) {
  const g = await guard();
  if ('response' in g) return g.response;

  const range = new URL(req.url).searchParams.get('range') ?? '30';
  const days = RANGE_DAYS[range];
  const now = Date.now();
  const cutoff = days ? now - days * 86400_000 : 0;

  const allArticles = await listArticles();
  const articles = allArticles.filter((a) => new Date(a.updatedAt).getTime() >= cutoff);
  const withContent = articles.filter((a) => a.markdown?.trim().length);

  const published = articles.filter((a) => a.status === 'published');
  const drafts = articles.filter((a) => a.status !== 'published');

  const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((s, n) => s + n, 0) / arr.length) : 0);
  const avgSeo = avg(withContent.map((a) => a.seoScore));
  const avgAeo = avg(withContent.map((a) => a.aeoScore ?? 0));
  const avgGeo = avg(withContent.map((a) => a.geoScore));

  // Theo locale.
  const byLocaleMap = new Map<string, number>();
  for (const a of articles) byLocaleMap.set(a.locale, (byLocaleMap.get(a.locale) ?? 0) + 1);
  const byLocale = [...byLocaleMap.entries()]
    .map(([locale, count]) => ({ locale, count }))
    .sort((a, b) => b.count - a.count);

  // Chuỗi thời gian: số bài cập nhật theo ngày (lấp đầy ngày trống).
  const span = days ?? 30;
  const series: Array<{ date: string; count: number; published: number }> = [];
  for (let i = span - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400_000);
    const key = d.toISOString().slice(0, 10);
    const dayArticles = articles.filter((a) => a.updatedAt.slice(0, 10) === key);
    series.push({
      date: key,
      count: dayArticles.length,
      published: dayArticles.filter((a) => a.status === 'published').length,
    });
  }

  // Top bài theo điểm tổng (SEO+AEO+GEO).
  const top = [...withContent]
    .sort(
      (a, b) =>
        b.seoScore + (b.aeoScore ?? 0) + b.geoScore -
        (a.seoScore + (a.aeoScore ?? 0) + a.geoScore),
    )
    .slice(0, 8)
    .map((a) => ({
      id: a.id,
      title: a.title,
      locale: a.locale,
      seoScore: a.seoScore,
      aeoScore: a.aeoScore ?? 0,
      geoScore: a.geoScore,
      status: a.status,
    }));

  const keywordSets = await listKeywordSets();
  const plans = await listPlans();

  // Phủ nội dung theo ngôn ngữ: đếm bài THẬT theo từng locale (toàn bộ, không lọc range),
  // pct so với ngôn ngữ có nhiều bài nhất (ngôn ngữ dẫn đầu = 100%).
  const localeCount = new Map<string, number>();
  for (const a of allArticles) localeCount.set(a.locale, (localeCount.get(a.locale) ?? 0) + 1);
  const maxLocaleCount = Math.max(1, ...locales.map((l) => localeCount.get(l) ?? 0));
  const coverage = locales.map((l) => {
    const count = localeCount.get(l) ?? 0;
    return { locale: l, count, pct: Math.round((count / maxLocaleCount) * 100) };
  });

  return NextResponse.json({
    range,
    coverage,
    totals: {
      articles: articles.length,
      published: published.length,
      drafts: drafts.length,
      avgSeo,
      avgAeo,
      avgGeo,
      keywordSets: keywordSets.length,
      plans: plans.length,
    },
    byLocale,
    series,
    top,
  });
}
