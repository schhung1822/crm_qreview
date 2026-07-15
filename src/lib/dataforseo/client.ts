// Client dùng chung cho DataForSEO API (https://api.dataforseo.com/v3).
// Xác thực Basic (login:password). Mọi request ra ngoài qua safeFetch (chắn SSRF + timeout).
// DataForSEO trả HTTP 200 kể cả khi task lỗi → phải kiểm status_code trong body (20000 = OK).
import { safeFetch } from '../security/safe-fetch';
import { getDataForSeoCreds, type DataForSeoCreds } from '../store/dataforseo';

const BASE = 'https://api.dataforseo.com/v3';

export class DataForSeoError extends Error {}

// Map locale i18n → location/language code của DataForSEO (dùng chung cho keyword + SERP).
const DFS_LOCALE: Record<string, { location: number; language: string }> = {
  vi: { location: 2704, language: 'vi' }, // Vietnam (mã quốc gia Labs; 1028581 là mã vùng → Labs từ chối)
  en: { location: 2840, language: 'en' }, // United States
  zh: { location: 2156, language: 'zh' },
  ja: { location: 2392, language: 'ja' },
  ko: { location: 2410, language: 'ko' },
  fr: { location: 2250, language: 'fr' },
  de: { location: 2276, language: 'de' },
  id: { location: 2360, language: 'id' },
  hi: { location: 2356, language: 'hi' },
  th: { location: 2764, language: 'th' },
};

export function localeToDfs(locale: string): { location: number; language: string } {
  return DFS_LOCALE[locale] ?? DFS_LOCALE.en;
}

function authHeader(login: string, password: string): string {
  return `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`;
}

// Lấy credential đang dùng (store → env). Ném lỗi rõ ràng nếu chưa cấu hình.
async function requireCreds(override?: DataForSeoCreds): Promise<{ login: string; password: string }> {
  const creds = override ?? (await getDataForSeoCreds());
  if (creds.source === 'none' || !creds.login || !creds.password) {
    throw new DataForSeoError('Chưa cấu hình DataForSEO. Vào Cài đặt để thêm kết nối.');
  }
  return { login: creds.login, password: creds.password };
}

interface DfsEnvelope<T> {
  status_code?: number;
  status_message?: string;
  tasks?: Array<{
    status_code?: number;
    status_message?: string;
    result?: T[] | null;
  }>;
}

// POST một endpoint "live" với mảng task. Trả về result[] của task đầu tiên (đã kiểm lỗi).
export async function dfsPost<T>(
  endpoint: string,
  tasks: unknown[],
  override?: DataForSeoCreds,
): Promise<T[]> {
  const { login, password } = await requireCreds(override);
  const res = await safeFetch(`${BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(login, password),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(tasks),
  });

  if (res.status === 401) throw new DataForSeoError('Sai login hoặc password DataForSEO.');
  if (!res.ok) throw new DataForSeoError(`DataForSEO lỗi HTTP ${res.status} ${res.statusText}`);

  const json = (await res.json()) as DfsEnvelope<T>;
  if (json.status_code && json.status_code !== 20000) {
    throw new DataForSeoError(`DataForSEO: ${json.status_message ?? json.status_code}`);
  }
  const task = json.tasks?.[0];
  if (task && task.status_code && task.status_code !== 20000) {
    throw new DataForSeoError(`DataForSEO: ${task.status_message ?? task.status_code}`);
  }
  return task?.result ?? [];
}

interface DfsAccount {
  login?: string;
  balance: number;
  currency: string;
}

// GET /appendix/user_data → dùng để KIỂM TRA credential (rẻ) + hiển thị số dư tài khoản.
export async function accountInfo(override?: DataForSeoCreds): Promise<DfsAccount> {
  const { login, password } = await requireCreds(override);
  const res = await safeFetch(`${BASE}/appendix/user_data`, {
    method: 'GET',
    headers: { Authorization: authHeader(login, password) },
  });
  if (res.status === 401) throw new DataForSeoError('Sai login hoặc password DataForSEO.');
  if (!res.ok) throw new DataForSeoError(`DataForSEO lỗi HTTP ${res.status} ${res.statusText}`);

  const json = (await res.json()) as DfsEnvelope<{
    login?: string;
    money?: { balance?: number; currency?: string };
  }>;
  if (json.status_code && json.status_code !== 20000) {
    throw new DataForSeoError(`DataForSEO: ${json.status_message ?? json.status_code}`);
  }
  const result = json.tasks?.[0]?.result?.[0];
  return {
    login: result?.login ?? login,
    balance: result?.money?.balance ?? 0,
    currency: result?.money?.currency ?? 'USD',
  };
}

interface SerpResult {
  items?: Array<{
    type?: string;
    // people_also_ask.items[].title = câu hỏi thật; related_searches.items[] = chuỗi cụm từ.
    items?: Array<{ title?: string } | string>;
  }>;
}

function dedupeKeep(list: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const s = (raw || '').trim();
    const k = s.toLowerCase();
    if (s && !seen.has(k)) {
      seen.add(k);
      out.push(s);
      if (out.length >= max) break;
    }
  }
  return out;
}

// SERP thật cho 1 từ khóa: trích "People Also Ask" (câu hỏi thật người dùng gõ Google)
// + "Related searches" (cụm từ liên quan). Dùng làm dữ liệu THẬT cho gợi ý câu hỏi GEO.
export async function serpQuestions(
  keyword: string,
  locale: string,
): Promise<{ paa: string[]; related: string[] }> {
  const loc = localeToDfs(locale);
  const result = await dfsPost<SerpResult>('/serp/google/organic/live/advanced', [
    { keyword, location_code: loc.location, language_code: loc.language, depth: 10 },
  ]);
  const items = result[0]?.items ?? [];
  const paa: string[] = [];
  const related: string[] = [];
  for (const it of items) {
    if (it.type === 'people_also_ask' && Array.isArray(it.items)) {
      for (const sub of it.items) {
        if (sub && typeof sub === 'object' && sub.title) paa.push(sub.title);
      }
    } else if (it.type === 'related_searches' && Array.isArray(it.items)) {
      for (const r of it.items) {
        if (typeof r === 'string') related.push(r);
      }
    }
  }
  return { paa: dedupeKeep(paa, 10), related: dedupeKeep(related, 12) };
}
