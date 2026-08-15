import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { listArticles } from '@/lib/store/articles';
import { listKeywordSets } from '@/lib/store/keywordsets';
import { listPlans } from '@/lib/store/plans';
import { listSocialPostsSince } from '@/lib/store/social-posts';

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
      seoScore: a.seoScore,
      aeoScore: a.aeoScore ?? 0,
      geoScore: a.geoScore,
      status: a.status,
    }));

  const keywordSets = await listKeywordSets();
  const plans = await listPlans();
  // Chỉ kéo bài trong khoảng thống kê thay vì toàn bộ lịch sử.
  const socialPosts = await listSocialPostsSince(new Date(cutoff).toISOString());
  // Một lần đăng nhiều kênh = một bài; batchId là mốc gom nhóm chuẩn.
  const socialUniquePosts = new Set(socialPosts.map((post) => post.batchId)).size;
  const socialSuccess = socialPosts.filter((post) => post.status === 'published').length;
  const socialPending = socialPosts.filter((post) => post.status === 'pending_review').length;
  const socialProcessing = socialPosts.filter((post) => post.status === 'processing').length;
  const socialFailed = socialPosts.filter((post) => post.status === 'failed').length;
  const byProvider = Object.entries(
    socialPosts.reduce<Record<string, { total: number; pending_review: number; published: number; processing: number; failed: number }>>((acc, post) => {
      acc[post.provider] ??= { total: 0, pending_review: 0, published: 0, processing: 0, failed: 0 };
      acc[post.provider].total += 1;
      acc[post.provider][post.status] += 1;
      return acc;
    }, {}),
  )
    .map(([provider, stats]) => ({ provider, ...stats }))
    .sort((a, b) => b.total - a.total);
  const byMediaType = Object.entries(
    socialPosts.reduce<Record<string, number>>((acc, post) => {
      acc[post.mediaType] = (acc[post.mediaType] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([mediaType, total]) => ({ mediaType, total }))
    .sort((a, b) => b.total - a.total);
  const socialSeries = series.map((item) => {
    const dayPosts = socialPosts.filter((post) => post.createdAt.slice(0, 10) === item.date);
    return {
      date: item.date,
      total: dayPosts.length,
      published: dayPosts.filter((post) => post.status === 'published').length,
      pendingReview: dayPosts.filter((post) => post.status === 'pending_review').length,
      failed: dayPosts.filter((post) => post.status === 'failed').length,
    };
  });

  // Phủ nội dung theo ngôn ngữ: đếm bài THẬT theo từng locale (toàn bộ, không lọc range),
  // pct so với ngôn ngữ có nhiều bài nhất (ngôn ngữ dẫn đầu = 100%).
  return NextResponse.json({
    range,
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
    series,
    top,
    social: {
      totals: {
        attempts: socialPosts.length,
        uniquePosts: socialUniquePosts,
        pendingReview: socialPending,
        published: socialSuccess,
        processing: socialProcessing,
        failed: socialFailed,
        successRate: pct(socialSuccess, socialPosts.length),
      },
      series: socialSeries,
      byProvider,
      byMediaType,
      recent: socialPosts.slice(0, 8).map((post) => ({
        id: post.id,
        provider: post.provider,
        connectionLabel: post.connectionLabel,
        title: post.title,
        text: post.text,
        mediaType: post.mediaType,
        status: post.status,
        publishedUrl: post.publishedUrl,
        createdAt: post.createdAt,
      })),
    },
  });
}

function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}
