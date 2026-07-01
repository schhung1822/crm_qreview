// Parse robots.txt + kiểm bot AI có được phép vào không (để được ChatGPT/Perplexity/
// AI Overviews… đọc & trích dẫn). Theo ngữ nghĩa longest-match của Google.

// Danh sách bot AI quan trọng (muốn được TRÍCH DẪN thì nên ALLOW các bot này).
export const AI_BOTS: Array<{ id: string; vendor: string }> = [
  { id: 'GPTBot', vendor: 'OpenAI' }, // huấn luyện + ChatGPT
  { id: 'OAI-SearchBot', vendor: 'OpenAI' }, // ChatGPT search
  { id: 'ChatGPT-User', vendor: 'OpenAI' }, // khi người dùng hỏi
  { id: 'ClaudeBot', vendor: 'Anthropic' },
  { id: 'anthropic-ai', vendor: 'Anthropic' },
  { id: 'PerplexityBot', vendor: 'Perplexity' },
  { id: 'Perplexity-User', vendor: 'Perplexity' },
  { id: 'Google-Extended', vendor: 'Google (Gemini)' },
  { id: 'Googlebot', vendor: 'Google (AI Overviews)' },
  { id: 'Bingbot', vendor: 'Microsoft (Copilot)' },
  { id: 'CCBot', vendor: 'Common Crawl' },
  { id: 'Applebot-Extended', vendor: 'Apple' },
  { id: 'Amazonbot', vendor: 'Amazon' },
  { id: 'Bytespider', vendor: 'ByteDance' },
  { id: 'Meta-ExternalAgent', vendor: 'Meta' },
];

interface RobotsRule {
  type: 'allow' | 'disallow';
  path: string;
}
interface RobotsGroup {
  agents: string[]; // chữ thường
  rules: RobotsRule[];
}
export interface ParsedRobots {
  groups: RobotsGroup[];
  sitemaps: string[];
  raw: string;
}

export function parseRobots(txt: string): ParsedRobots {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let cur: RobotsGroup | null = null;
  let lastWasAgent = false;

  for (const line of txt.split(/\r?\n/)) {
    const clean = line.replace(/#.*$/, '').trim();
    if (!clean) continue;
    const idx = clean.indexOf(':');
    if (idx === -1) continue;
    const field = clean.slice(0, idx).trim().toLowerCase();
    const value = clean.slice(idx + 1).trim();

    if (field === 'user-agent') {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (field === 'allow' || field === 'disallow') {
      if (!cur) {
        cur = { agents: ['*'], rules: [] };
        groups.push(cur);
      }
      cur.rules.push({ type: field, path: value });
      lastWasAgent = false;
    } else if (field === 'sitemap') {
      if (value) sitemaps.push(value);
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return { groups, sitemaps, raw: txt };
}

// Chọn nhóm khớp UA: ưu tiên khớp tên cụ thể, else '*'.
function groupFor(robots: ParsedRobots, ua: string): RobotsGroup | null {
  const low = ua.toLowerCase();
  let specific: RobotsGroup | null = null;
  let star: RobotsGroup | null = null;
  for (const g of robots.groups) {
    for (const a of g.agents) {
      if (a === '*') star = star ?? g;
      else if (low.includes(a) || a.includes(low)) specific = specific ?? g;
    }
  }
  return specific ?? star;
}

// Longest-match: rule có path dài nhất khớp prefix sẽ thắng; hòa → Allow thắng.
export function isAllowed(robots: ParsedRobots, ua: string, path: string): boolean {
  const g = groupFor(robots, ua);
  if (!g || g.rules.length === 0) return true; // không có luật → cho phép
  let best: { type: 'allow' | 'disallow'; len: number } | null = null;
  for (const r of g.rules) {
    if (r.path === '') {
      // "Disallow:" rỗng = cho phép tất cả; bỏ qua trong so khớp độ dài.
      if (r.type === 'disallow') continue;
    }
    if (matchPath(r.path, path)) {
      const len = r.path.length;
      if (!best || len > best.len || (len === best.len && r.type === 'allow')) {
        best = { type: r.type, len };
      }
    }
  }
  if (!best) return true;
  return best.type === 'allow';
}

// Khớp pattern robots (hỗ trợ * và $).
function matchPath(pattern: string, path: string): boolean {
  if (pattern === '' || pattern === '/') return pattern === '' ? false : path.startsWith('/');
  const esc = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\\\$$/, '$');
  try {
    return new RegExp('^' + esc).test(path);
  } catch {
    return path.startsWith(pattern.split('*')[0]);
  }
}

// Trạng thái từng bot AI: allowed/blocked.
export function aiBotStatus(robots: ParsedRobots): Array<{ id: string; vendor: string; allowed: boolean }> {
  return AI_BOTS.map((b) => ({ ...b, allowed: isAllowed(robots, b.id, '/') }));
}
