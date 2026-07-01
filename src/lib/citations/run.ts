// Chạy kiểm tra Lượt AI trích dẫn: với mỗi câu hỏi GEO, hỏi engine (Perplexity…) và đếm
// xem domain của mình có nằm trong nguồn được trích dẫn không. Server-only.
import { getIntegrationKey } from '../store/integrations';
import { perplexitySources, type Source } from './engines';
import type { CitationHit, CitationRun, PerQuery } from './store';

// Chuẩn hóa domain: bỏ scheme/www/đường dẫn → "example.com".
export function normalizeDomain(raw: string): string {
  let d = raw.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '').replace(/^www\./, '');
  d = d.split('/')[0].split('?')[0].split('#')[0];
  return d;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

// URL có thuộc domain mình không (khớp đúng hoặc subdomain).
export function matchesDomain(domain: string, url: string): boolean {
  const target = normalizeDomain(domain);
  if (!target) return false;
  const host = hostOf(url);
  if (!host) return false;
  return host === target || host.endsWith(`.${target}`);
}

export interface EngineAvailability {
  perplexity: boolean;
}

export async function citationEngines(): Promise<EngineAvailability> {
  return { perplexity: Boolean(await getIntegrationKey('perplexity')) };
}

// Chạy toàn bộ: trả CitationRun (đếm lượt trích dẫn + chi tiết từng câu hỏi).
export async function runCitationCheck(domain: string, queries: string[]): Promise<CitationRun> {
  const target = normalizeDomain(domain);
  if (!target) throw new Error('Thiếu domain theo dõi.');
  const qs = queries.map((q) => q.trim()).filter(Boolean).slice(0, 20);
  if (!qs.length) throw new Error('Chưa có câu hỏi nào để kiểm tra.');

  const pplxKey = await getIntegrationKey('perplexity');
  const engines: string[] = [];
  if (pplxKey) engines.push('perplexity');
  if (!engines.length) {
    throw new Error('Chưa cấu hình engine nào (cần API key Perplexity ở phần API Keys & AI).');
  }

  const perQuery: PerQuery[] = [];
  let citations = 0;
  let checks = 0;

  for (const query of qs) {
    const hits: CitationHit[] = [];
    if (pplxKey) {
      checks += 1;
      try {
        const sources: Source[] = await perplexitySources(query, pplxKey);
        for (const s of sources) {
          if (matchesDomain(target, s.url)) hits.push({ engine: 'perplexity', url: s.url, title: s.title });
        }
      } catch {
        /* lỗi 1 câu hỏi → bỏ qua, vẫn tiếp tục các câu khác */
      }
    }
    citations += hits.length;
    perQuery.push({ query, hits });
  }

  return { at: new Date().toISOString(), engines, citations, checks, perQuery };
}
