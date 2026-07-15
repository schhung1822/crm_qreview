// Kho LỊCH SỬ phân tích kịch bản video, cô lập theo biz (.data/biz/<id>/script-analyses.json).
// Bền qua reload: UI poll để hiện tiến độ + xem lại các video đã phân tích. Server-only.
import { randomBytes } from 'node:crypto';
import { bizFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';
import {
  toScriptSummary,
  type ScriptAnalysisRecord,
  type ScriptAnalysisSummary,
  type VideoPlatform,
} from '../script-analysis/types';

const NAME = 'script-analyses.json';
const MAX = 100; // giữ tối đa 100 bản gần nhất
// Bản 'running' quá lâu (tiến trình chết giữa chừng) → coi là treo để UI cho phân tích lại.
export const STALE_MS = 10 * 60 * 1000;

function asc(a: ScriptAnalysisRecord, b: ScriptAnalysisRecord) {
  return a.createdAt < b.createdAt ? 1 : -1; // mới nhất trước
}

export async function listScriptAnalyses(): Promise<ScriptAnalysisSummary[]> {
  return (await readJson<ScriptAnalysisRecord[]>(bizFile(NAME), [])).sort(asc).map(toScriptSummary);
}

export async function getScriptAnalysis(id: string): Promise<ScriptAnalysisRecord | null> {
  return (await readJson<ScriptAnalysisRecord[]>(bizFile(NAME), [])).find((r) => r.id === id) ?? null;
}

export async function createScriptAnalysis(input: {
  url: string;
  platform: VideoPlatform;
  locale: string;
  ai?: { provider?: string; model?: string };
}): Promise<ScriptAnalysisRecord> {
  const now = new Date().toISOString();
  const rec: ScriptAnalysisRecord = {
    id: 'vsa_' + randomBytes(8).toString('hex'),
    url: input.url,
    platform: input.platform,
    status: 'running',
    phase: 'transcript',
    ai: input.ai,
    locale: input.locale,
    createdAt: now,
    updatedAt: now,
  };
  await mutateJson<ScriptAnalysisRecord[], void>(bizFile(NAME), [], (rows) => {
    const all = [rec, ...rows];
    // Cắt bớt: giữ mọi bản đang chạy + các bản xong mới nhất, tối đa MAX.
    const running = all.filter((r) => r.status === 'running');
    const finished = all.filter((r) => r.status !== 'running').sort(asc);
    const keep = [...running, ...finished].slice(0, MAX);
    return [keep, undefined];
  });
  return rec;
}

export async function updateScriptAnalysis(
  id: string,
  patch: Partial<ScriptAnalysisRecord>,
): Promise<void> {
  await mutateJson<ScriptAnalysisRecord[], void>(bizFile(NAME), [], (rows) => {
    const r = rows.find((x) => x.id === id);
    if (r) Object.assign(r, patch, { updatedAt: new Date().toISOString() });
    return [rows, undefined];
  });
}

export async function deleteScriptAnalysis(id: string): Promise<boolean> {
  return mutateJson<ScriptAnalysisRecord[], boolean>(bizFile(NAME), [], (rows) => {
    const next = rows.filter((r) => r.id !== id);
    return [next, next.length !== rows.length];
  });
}
