// Theo dõi "Lượt AI trích dẫn" THẬT: lưu domain cần theo dõi + danh sách câu hỏi GEO,
// và kết quả mỗi lần chạy kiểm tra (engine nào trích dẫn domain cho câu hỏi nào).
// Lưu .data/citations.json. Server-only.
import { bizFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';

export interface CitationHit {
  engine: string; // 'perplexity' | …
  url: string; // URL nguồn được trích dẫn (thuộc domain mình)
  title?: string;
}
export interface PerQuery {
  query: string;
  hits: CitationHit[]; // rỗng = không được trích dẫn cho câu hỏi này
}
export interface CitationRun {
  at: string; // ISO thời điểm chạy
  engines: string[]; // engine đã dùng
  citations: number; // tổng lượt domain được trích dẫn (headline)
  checks: number; // số (câu hỏi × engine) đã kiểm tra
  perQuery: PerQuery[];
}
export interface CitationConfig {
  domain: string; // domain theo dõi (vd example.com)
  queries: string[]; // câu hỏi GEO cần kiểm tra
  lastRun?: CitationRun;
  history: Array<{ at: string; citations: number }>; // để tính xu hướng/delta
}

const NAME = 'citations.json'; // CÔ LẬP THEO BIZ
const DEFAULT: CitationConfig = { domain: '', queries: [], history: [] };

export async function getCitationConfig(): Promise<CitationConfig> {
  const c = await readJson<CitationConfig>(bizFile(NAME), DEFAULT);
  return { ...DEFAULT, ...c, history: c.history ?? [] };
}

export async function setCitationConfig(domain: string, queries: string[]): Promise<CitationConfig> {
  return mutateJson<CitationConfig, CitationConfig>(bizFile(NAME), DEFAULT, (cur) => {
    const next = { ...DEFAULT, ...cur, domain: domain.trim(), queries };
    return [next, next];
  });
}

export async function saveCitationRun(run: CitationRun): Promise<CitationConfig> {
  return mutateJson<CitationConfig, CitationConfig>(bizFile(NAME), DEFAULT, (cur) => {
    const history = [...(cur.history ?? []), { at: run.at, citations: run.citations }].slice(-30);
    const next = { ...DEFAULT, ...cur, lastRun: run, history };
    return [next, next];
  });
}
