// Các "engine AI có trích dẫn nguồn" để đo Lượt AI trích dẫn. Hiện hỗ trợ Perplexity
// (API trả về danh sách URL nguồn rõ ràng → khớp domain chính xác). Server-only.

export interface Source {
  url: string;
  title?: string;
}

const AI_TIMEOUT_MS = 60_000;

// Hỏi Perplexity 1 câu và lấy danh sách URL nguồn nó trích dẫn.
export async function perplexitySources(query: string, key: string): Promise<Source[]> {
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'sonar',
      messages: [{ role: 'user', content: query }],
      max_tokens: 500,
    }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Perplexity ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    citations?: string[];
    search_results?: Array<{ url?: string; title?: string }>;
  };
  const out: Source[] = [];
  for (const u of data.citations ?? []) if (typeof u === 'string') out.push({ url: u });
  for (const r of data.search_results ?? []) if (r?.url) out.push({ url: r.url, title: r.title });
  // Khử trùng theo URL.
  const seen = new Set<string>();
  return out.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
}
