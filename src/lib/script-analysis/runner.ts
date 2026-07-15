// Runner PHÂN TÍCH KỊCH BẢN: (1) lấy transcript 1 URL qua Apify (đổi key khi lỗi hạn mức/tải), rồi
// (2) gọi AI phân tích sâu. Chạy nền in-process trong runWithBiz (route fire-and-forget), poll qua store.
import {
  APIFY_ACTORS,
  fetchDatasetItems,
  fetchSubtitleFile,
  normalizeTranscriptItems,
  pollRun,
  ppeChargeCap,
  shouldRotateApifyKey,
  startActorRun,
  transcriptInput,
} from '../social/apify';
import { shuffledApifyPool } from '../social/apify-keys';
import { parseSubtitles } from '../social/subtitles';
import { getScriptAnalysis, updateScriptAnalysis } from '../store/script-analyses';
import { analyzeScript } from './analyze';
import type { AiOverride } from '../ai/providers';
import type { TranscriptSource, VideoMetrics, VideoPlatform } from './types';

const POLL_TIMEOUT_MS = 5 * 60 * 1000; // tối đa chờ transcript 5 phút

// Quét text transcript từ dataset THÔ (dự phòng khi normalize/tải file không ra text).
// Lấy chuỗi dài nhất trong các field khả dĩ (kể cả lồng trong videoMeta, hoặc mảng segment).
function extractInlineTranscript(items: unknown[]): string | undefined {
  const KEYS = [
    'transcript_only_text', 'transcriptOnlyText', 'transcript', 'transcription', 'transcriptText',
    'transcriptionText', 'text', 'captionText', 'caption', 'vttSubtitles', 'srtSubtitles', 'subtitles',
  ];
  let best = '';
  const consider = (v: unknown) => {
    if (typeof v === 'string') {
      const s = v.trim();
      if (s.length > best.length) best = s;
    } else if (Array.isArray(v)) {
      const joined = v
        .map((x) =>
          typeof x === 'string' ? x : x && typeof x === 'object' ? String((x as Record<string, unknown>).text ?? '') : '',
        )
        .filter(Boolean)
        .join(' ')
        .trim();
      if (joined.length > best.length) best = joined;
    }
  };
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const o = it as Record<string, unknown>;
    for (const k of KEYS) consider(o[k]);
    const meta = o.videoMeta;
    if (meta && typeof meta === 'object') for (const k of KEYS) consider((meta as Record<string, unknown>)[k]);
  }
  return best || undefined;
}

// Chuyển "1.2M" / "12K" / "3,456" / số → số nguyên. Không nhận dạng được → undefined.
function parseCount(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') {
    const s = v.trim().replace(/,/g, '');
    const m = /^([\d.]+)\s*([KkMmBb])?$/.exec(s);
    if (!m) return undefined;
    const n = parseFloat(m[1]);
    if (!Number.isFinite(n)) return undefined;
    const mult = m[2] ? ({ k: 1e3, m: 1e6, b: 1e9 } as Record<string, number>)[m[2].toLowerCase()] : 1;
    return Math.round(n * (mult ?? 1));
  }
  return undefined;
}
function pickStr(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}
function pickCount(o: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const n = parseCount(o[k]);
    if (n !== undefined) return n;
  }
  return undefined;
}

// Trích chỉ số tương tác + tiêu đề từ dataset THÔ của actor transcript (metadata thường đi kèm).
// Không có metadata → trả rỗng (UI ẩn phần chỉ số). Không tốn thêm run Apify.
function extractVideoInfo(items: unknown[]): { metrics?: VideoMetrics; title?: string } {
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const o = it as Record<string, unknown>;
    const meta = (o.videoMeta && typeof o.videoMeta === 'object' ? o.videoMeta : {}) as Record<string, unknown>;
    const authorMeta = (o.authorMeta && typeof o.authorMeta === 'object' ? o.authorMeta : {}) as Record<string, unknown>;
    const src = { ...meta, ...o }; // ưu tiên field top-level
    const views = pickCount(src, ['playCount', 'viewCount', 'views', 'videoViewCount', 'aggregateViewCount', 'playcount']);
    const likes = pickCount(src, ['diggCount', 'likes', 'likeCount', 'likesCount', 'reactionsCount', 'reactions']);
    const comments = pickCount(src, ['commentCount', 'commentsCount', 'comments']);
    const shares = pickCount(src, ['shareCount', 'sharesCount', 'shares']);
    const saves = pickCount(src, ['collectCount', 'saveCount', 'bookmarkCount', 'bookmarks']);
    const title = pickStr(src, ['title', 'text', 'desc', 'description', 'caption']);
    const author = pickStr({ ...authorMeta, ...o }, ['channelName', 'authorName', 'nickName', 'uniqueId', 'ownerUsername', 'pageName', 'author']);
    if (views ?? likes ?? comments ?? shares ?? saves ?? title ?? author) {
      const metrics: VideoMetrics = {};
      if (views !== undefined) metrics.views = views;
      if (likes !== undefined) metrics.likes = likes;
      if (comments !== undefined) metrics.comments = comments;
      if (shares !== undefined) metrics.shares = shares;
      if (saves !== undefined) metrics.saves = saves;
      if (author) metrics.author = author;
      return { metrics: Object.keys(metrics).length ? metrics : undefined, title };
    }
  }
  return {};
}

// Actor transcript theo nền tảng. yt/fb là actor bên thứ ba (pay-per-event) → đặt trần chi phí nhỏ.
function actorFor(platform: VideoPlatform): { actorId: string; charge?: number } {
  if (platform === 'youtube') return { actorId: APIFY_ACTORS.ytTranscripts, charge: ppeChargeCap(1) };
  if (platform === 'tiktok') return { actorId: APIFY_ACTORS.tiktokTranscripts };
  return { actorId: APIFY_ACTORS.fbTranscripts, charge: ppeChargeCap(1) };
}

type TranscriptOut =
  | { text: string; source: TranscriptSource; metrics?: VideoMetrics; title?: string }
  | { error: string };

async function fetchTranscript(platform: VideoPlatform, url: string): Promise<TranscriptOut> {
  const pool = await shuffledApifyPool();
  if (!pool.length) return { error: 'Chưa cấu hình Apify API key. Thêm ở Quản lý kết nối.' };

  const input = transcriptInput(platform, [url]);
  const { actorId, charge } = actorFor(platform);

  let lastErr = 'Không lấy được transcript.';
  for (const key of pool) {
    try {
      const { runId, datasetId } = await startActorRun(key.token, actorId, input, 1, charge);
      const started = Date.now();
      let done = false;
      while (Date.now() - started < POLL_TIMEOUT_MS) {
        const st = await pollRun(key.token, runId, 20);
        if (st.state === 'succeeded') {
          done = true;
          break;
        }
        // Actor chạy xong nhưng THẤT BẠI (video riêng tư/không có phụ đề...) → không đổi key (vô ích).
        if (st.state === 'failed') return { error: `Không lấy được transcript (actor: ${st.statusText}).` };
      }
      if (!done) return { error: 'Quá thời gian lấy transcript. Thử lại sau.' };

      const items = await fetchDatasetItems(key.token, datasetId, 5);
      const first = normalizeTranscriptItems(platform, items)[0];
      let text = '';
      let source: TranscriptSource = 'none';
      if (first?.text) {
        text = parseSubtitles(first.text) || first.text;
        source = platform === 'tiktok' ? 'stt' : 'inline';
      } else if (first?.fileUrl) {
        // Truyền token để tải được file transcript nằm trên storage Apify (cần ?token=).
        const raw = await fetchSubtitleFile(first.fileUrl, key.token);
        if (raw) {
          text = parseSubtitles(raw) || raw;
          source = 'subtitle';
        }
      }
      // Dự phòng: tải file lỗi / actor trả text ở field khác → quét text inline trong dataset thô.
      if (text.trim().length < 20) {
        const inline = extractInlineTranscript(items);
        if (inline) {
          text = parseSubtitles(inline) || inline;
          source = source === 'none' ? 'inline' : source;
        }
      }
      if (text.trim().length < 20) {
        return { error: 'Video này không có phụ đề/lời thoại để phân tích. Hãy thử một video khác có lời nói rõ.' };
      }
      const info = extractVideoInfo(items);
      return { text, source, metrics: info.metrics, title: info.title };
    } catch (e) {
      // Lỗi hạn mức/token/tải (401/402/429/5xx) → thử key kế tiếp; lỗi khác → dừng.
      if (shouldRotateApifyKey(e)) {
        lastErr = e instanceof Error ? e.message : lastErr;
        continue;
      }
      return { error: e instanceof Error ? e.message : 'Lỗi lấy transcript' };
    }
  }
  return { error: lastErr };
}

export async function runScriptAnalysis(id: string): Promise<void> {
  const fail = (error: string) => updateScriptAnalysis(id, { status: 'error', phase: 'error', error });
  try {
    const rec = await getScriptAnalysis(id);
    if (!rec) return;

    // (1) Transcript — TÁI DÙNG nếu đã lấy được ở lần trước (phân tích lại với AI khác KHÔNG tốn
    // Apify/transcript nữa). Chỉ gọi lấy transcript khi record chưa có.
    let transcript = rec.transcript;
    let title = rec.title;
    if (!transcript || transcript.trim().length < 20) {
      const tr = await fetchTranscript(rec.platform, rec.url);
      if ('error' in tr) return void (await fail(tr.error));
      if (!tr.text || tr.text.trim().length < 20) return void (await fail('Transcript quá ngắn hoặc rỗng.'));
      transcript = tr.text;
      title = tr.title;
      await updateScriptAnalysis(id, {
        transcript: tr.text,
        transcriptSource: tr.source,
        title: tr.title,
        metrics: tr.metrics,
        phase: 'analyzing',
      });
    } else {
      await updateScriptAnalysis(id, { phase: 'analyzing' });
    }

    // (2) AI phân tích
    const override: AiOverride | undefined = rec.ai?.provider
      ? { provider: rec.ai.provider as AiOverride['provider'], model: rec.ai.model || undefined }
      : undefined;
    const r = await analyzeScript({
      platform: rec.platform,
      title,
      transcript,
      locale: rec.locale,
      override,
    });
    if (r.noKey) return void (await fail('Provider AI được chọn chưa có API key.'));
    if (r.error || !r.analysis) return void (await fail(r.error ?? 'Lỗi phân tích'));

    await updateScriptAnalysis(id, { analysis: r.analysis, phase: 'done', status: 'done', error: undefined });
  } catch (e) {
    await fail(e instanceof Error ? e.message : 'Lỗi phân tích kịch bản');
  }
}
