// Chuyển file phụ đề (WebVTT / SRT / JSON captions) thành LỜI THOẠI text thuần cho
// phân tích AI - THUẦN (không I/O) → test được. Dùng khi actor chỉ trả URL file phụ đề
// (TikTok subtitleLinks, Facebook Reels caption file...) thay vì text sẵn.

// Bỏ header/timestamps/số thứ tự/tag, gộp dòng, khử lặp liên tiếp (phụ đề cuộn hay lặp câu).
export function parseSubtitles(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();

  // JSON captions (một số nguồn trả {captions:[{text}...]} hoặc mảng [{text}...]).
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const arr = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { captions?: unknown[] }).captions)
          ? (parsed as { captions: unknown[] }).captions
          : Array.isArray((parsed as { utterances?: unknown[] }).utterances)
            ? (parsed as { utterances: unknown[] }).utterances
            : [];
      const texts = arr
        .map((c) => (c && typeof c === 'object' ? String((c as { text?: unknown }).text ?? '') : ''))
        .filter(Boolean);
      if (texts.length) return dedupJoin(texts);
    } catch {
      /* không phải JSON hợp lệ → thử dạng VTT/SRT */
    }
  }

  const lines = trimmed.split(/\r?\n/);
  const out: string[] = [];
  for (let line of lines) {
    const l = line.trim();
    if (!l) continue;
    if (/^WEBVTT/i.test(l)) continue; // header VTT
    if (/^(NOTE|STYLE|REGION)\b/.test(l)) continue; // khối metadata VTT
    if (/^\d+$/.test(l)) continue; // số thứ tự SRT
    if (/-->/.test(l)) continue; // dòng timestamp
    line = l
      .replace(/<[^>]+>/g, '') // tag <c>, <i>, <00:00:01.000>...
      .replace(/\{\\[^}]*\}/g, '') // tag ASS {\an8}
      .trim();
    if (line) out.push(line);
  }
  return dedupJoin(out);
}

// Nối câu, bỏ câu lặp LIÊN TIẾP (phụ đề cuộn thường lặp lại dòng trước).
function dedupJoin(parts: string[]): string {
  const out: string[] = [];
  for (const p of parts) {
    if (out.length && out[out.length - 1] === p) continue;
    out.push(p);
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}
