// Gọi AI phân tích kịch bản video từ transcript, ép JSON theo schema Zod KHOAN DUNG (field lỗi →
// rỗng, chỉ fail khi rỗng toàn phần) + thử 2 lần. Model do user chọn (override), tier 'writer' (sâu).
import { z } from 'zod';
import { complete, type AiOverride } from '../ai/providers';
import { extractJson } from '../ai/json';
import { renderPrompt } from '../ai/prompt-store';
import type { ScriptAnalysis, VideoPlatform } from './types';

const str = (def = '') => z.string().catch(def);
// Mảng chuỗi khoan dung: item không phải string → lấy .text/.reason hoặc bỏ.
const strArr = () =>
  z
    .array(z.any())
    .catch([])
    .transform((a) =>
      a
        .map((x) => (typeof x === 'string' ? x : (x?.text ?? x?.reason ?? '')))
        .map((s2) => String(s2 ?? '').trim())
        .filter(Boolean),
    );
const SegSchema = z
  .object({ from: str(), to: str(), segment: str(), purpose: str() })
  .catch({ from: '', to: '', segment: '', purpose: '' });

const ScriptSchema = z.object({
  summary: str(),
  contentType: str(),
  targetAudience: str(),
  successReasons: strArr(),
  formula: str(),
  hookText: str(),
  hookWhy: str(),
  intro: str(),
  tone: str(),
  pacing: str(),
  timeline: z
    .array(SegSchema)
    .catch([])
    .transform((t) => t.filter((s2) => s2.segment || s2.from || s2.to)),
  cta: str(),
  strengths: strArr(),
  improvements: strArr(),
  takeaways: strArr(),
});

export interface AnalyzeResult {
  analysis?: ScriptAnalysis;
  noKey?: boolean;
  error?: string;
}

const TRANSCRIPT_CAP = 14_000; // cắt transcript để kiểm soát token (đủ cho video ngắn/vừa)

export async function analyzeScript(input: {
  platform: VideoPlatform;
  title?: string;
  transcript: string;
  locale: string;
  override?: AiOverride;
}): Promise<AnalyzeResult> {
  const rp = await renderPrompt('script_analysis', {
    nen_tang: input.platform,
    ma_ngon_ngu: input.locale,
    tieu_de: input.title ?? '',
    transcript: input.transcript.slice(0, TRANSCRIPT_CAP),
  });
  const STRICT = '\n\nCHỈ trả về JSON hợp lệ (bắt đầu "{"), không markdown/giải thích.';
  let lastErr: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await complete(
        'analysis',
        {
          system: rp.system,
          prompt: attempt === 0 ? rp.user : rp.user + STRICT,
          maxTokens: 4096,
          json: true,
        },
        'writer',
        input.override,
      );
      if (!res) return { noKey: true };
      const parsed = ScriptSchema.safeParse(extractJson(res.text));
      // Chỉ chấp nhận khi có tóm tắt (tránh nhận về object rỗng do parse hỏng).
      if (parsed.success && parsed.data.summary) return { analysis: parsed.data };
      lastErr = 'AI trả về không đúng định dạng. Thử lại hoặc đổi model.';
    } catch (e) {
      // BudgetError/PlanError được ném tiếp từ provider → hiện thông báo thật.
      return { error: e instanceof Error ? e.message : 'Lỗi gọi AI' };
    }
  }
  return { error: lastErr ?? 'Lỗi gọi AI' };
}
