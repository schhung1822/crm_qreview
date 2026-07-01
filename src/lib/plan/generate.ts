// Sinh content plan từ một bộ từ khóa. Heuristic thuần (luôn chạy, không cần AI):
// - Pillar: từ khóa volume cao nhất, intent informational (bài trụ tổng quan).
// - Vệ tinh: gom theo cluster, mỗi cluster lấy vài từ khóa tốt nhất → 1 bài/từ khóa.
// - Loại bài suy từ intent/isQuestion; độ ưu tiên từ volume & độ khó.
import type { StoredKeyword } from '../store/keywordsets';
import type { PlanItem } from '../store/plans';

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Slug URL từ từ khóa (không dấu) - để nối internal link giữa các bài.
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

function contentType(k: StoredKeyword): string {
  const t = k.term.toLowerCase();
  if (/(là gì|khái niệm|định nghĩa)/.test(t)) return 'Định nghĩa';
  if (k.type === 'geo' || /(làm sao|cách|hướng dẫn|how)/.test(t)) return 'How-to';
  if (/(so sánh| vs |khác nhau)/.test(t)) return 'So sánh';
  if (/(tốt nhất|top|công cụ|review|best)/.test(t)) return 'Listicle';
  if (k.intent === 'Commercial' || k.intent === 'Transactional') return 'Thương mại';
  return 'Hướng dẫn';
}

function priority(k: StoredKeyword): PlanItem['priority'] {
  const score = k.volume / 1000 - k.difficulty / 50;
  if (score > 1.2) return 'high';
  if (score > 0.3) return 'medium';
  return 'low';
}

function titleFor(k: StoredKeyword): string {
  const term = titleCase(k.term);
  const type = contentType(k);
  if (type === 'Định nghĩa') return term; // "X là gì" giữ nguyên
  if (type === 'How-to') return /^cách|^làm sao/i.test(k.term) ? term : `Cách ${k.term}`;
  if (type === 'Listicle') return /top|tốt nhất/i.test(k.term) ? term : `Top ${k.term} tốt nhất`;
  if (type === 'So sánh') return term;
  return `${term}: hướng dẫn chi tiết`;
}

export function generatePlanItems(seed: string, keywords: StoredKeyword[]): PlanItem[] {
  if (!keywords.length) return [];
  const sorted = [...keywords].sort((a, b) => b.volume - a.volume);

  // Pillar: ưu tiên informational volume cao; fallback từ khóa volume cao nhất.
  const pillarKw =
    sorted.find((k) => k.intent === 'Informational') ?? sorted[0];

  const pillar: PlanItem = {
    title: `Hướng dẫn toàn diện về ${titleCase(seed)} (${new Date().getFullYear() + 0})`,
    target: pillarKw.term,
    type: 'Pillar',
    priority: 'high',
    isPillar: true,
    slug: slugify(seed),
    cluster: 'pillar',
  };

  // Vệ tinh: mỗi cluster tối đa 3 bài, bỏ trùng target với pillar.
  const byCluster = new Map<string, StoredKeyword[]>();
  for (const k of sorted) {
    if (k.term === pillarKw.term) continue;
    const arr = byCluster.get(k.cluster) ?? [];
    if (arr.length < 3) arr.push(k);
    byCluster.set(k.cluster, arr);
  }

  const seen = new Set<string>([pillarKw.term]);
  const items: PlanItem[] = [];
  for (const arr of byCluster.values()) {
    for (const k of arr) {
      if (seen.has(k.term)) continue;
      seen.add(k.term);
      items.push({
        title: titleFor(k),
        target: k.term,
        type: contentType(k),
        priority: priority(k),
        slug: slugify(k.term),
        cluster: k.cluster,
      });
      if (items.length >= 11) break;
    }
    if (items.length >= 11) break;
  }

  // Sắp xếp vệ tinh theo ưu tiên.
  const order = { high: 0, medium: 1, low: 2 } as const;
  items.sort((a, b) => order[a.priority] - order[b.priority]);

  return [pillar, ...items];
}
