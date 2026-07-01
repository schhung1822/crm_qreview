// Google PageSpeed Insights - lấy ĐẦY ĐỦ như pagespeed.web.dev: 4 điểm Lighthouse
// (Performance/Accessibility/Best Practices/SEO), các CHỈ SỐ lab (FCP/LCP/TBT/CLS/SI/TTI),
// và dữ liệu NGƯỜI DÙNG THẬT (CrUX field). Trả null nếu lỗi.
import { safeFetch } from '../security/safe-fetch';
import { getIntegrationKey } from '../store/integrations';

export interface PsMetric {
  value: string; // hiển thị (vd "0.8 s", "0.05")
  score?: number; // 0-1 (để tô màu)
}
export interface PageSpeedResult {
  scores: {
    performance?: number;
    accessibility?: number;
    bestPractices?: number;
    seo?: number;
  };
  metrics: {
    fcp?: PsMetric;
    lcp?: PsMetric;
    tbt?: PsMetric;
    cls?: PsMetric;
    si?: PsMetric;
    tti?: PsMetric;
  };
  // Dữ liệu người dùng thật (CrUX) - cái Google dùng để xếp hạng.
  field?: { category?: 'FAST' | 'AVERAGE' | 'SLOW'; lcp?: number; inp?: number; cls?: number };
}

export async function pageSpeed(
  url: string,
  strategy: 'mobile' | 'desktop' = 'mobile',
): Promise<PageSpeedResult | null> {
  const key = await getIntegrationKey('pagespeed');
  const api = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  api.searchParams.set('url', url);
  api.searchParams.set('strategy', strategy);
  for (const c of ['performance', 'accessibility', 'best-practices', 'seo']) {
    api.searchParams.append('category', c);
  }
  if (key) api.searchParams.set('key', key);

  try {
    const res = await safeFetch(api.toString(), { timeoutMs: 60_000 });
    if (!res.ok) return null;
    type Audit = { displayValue?: string; numericValue?: number; score?: number };
    type CruxMetric = { percentile?: number; category?: string };
    const data = (await res.json()) as {
      lighthouseResult?: {
        categories?: Record<string, { score?: number }>;
        audits?: Record<string, Audit>;
      };
      loadingExperience?: { overall_category?: string; metrics?: Record<string, CruxMetric> };
    };
    const lh = data.lighthouseResult;
    const cats = lh?.categories ?? {};
    const audits = lh?.audits ?? {};

    const cat = (id: string): number | undefined =>
      typeof cats[id]?.score === 'number' ? Math.round((cats[id]!.score as number) * 100) : undefined;
    const metric = (id: string): PsMetric | undefined => {
      const a = audits[id];
      if (!a) return undefined;
      return { value: a.displayValue ?? (a.numericValue != null ? String(a.numericValue) : ''), score: a.score };
    };

    // CrUX (người dùng thật).
    const le = data.loadingExperience;
    const fm = le?.metrics ?? {};
    const fcls = fm['CUMULATIVE_LAYOUT_SHIFT_SCORE']?.percentile;
    const field =
      le?.overall_category && le.overall_category !== 'NONE'
        ? {
            category: le.overall_category as 'FAST' | 'AVERAGE' | 'SLOW',
            lcp: fm['LARGEST_CONTENTFUL_PAINT_MS']?.percentile,
            inp: (fm['INTERACTION_TO_NEXT_PAINT'] ?? fm['EXPERIMENTAL_INTERACTION_TO_NEXT_PAINT'])?.percentile,
            cls: fcls != null ? fcls / 100 : undefined,
          }
        : undefined;

    return {
      scores: {
        performance: cat('performance'),
        accessibility: cat('accessibility'),
        bestPractices: cat('best-practices'),
        seo: cat('seo'),
      },
      metrics: {
        fcp: metric('first-contentful-paint'),
        lcp: metric('largest-contentful-paint'),
        tbt: metric('total-blocking-time'),
        cls: metric('cumulative-layout-shift'),
        si: metric('speed-index'),
        tti: metric('interactive'),
      },
      field,
    };
  } catch {
    return null;
  }
}
