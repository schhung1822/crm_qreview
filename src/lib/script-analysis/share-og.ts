// Helper dựng thẻ OG cho link chia sẻ PHÂN TÍCH KỊCH BẢN (dùng chung: /share/video, /api/og/video,
// link rút gọn /api/link). Trả title/description/image (có thể override). HTML OG dùng chung
// buildShareOgHtml của social (định dạng tối giản cho bot MXH).
import type { ScriptAnalysisRecord } from './types';
import type { Branding } from '../store/branding';

const PLATFORM_LABEL: Record<string, string> = {
  tiktok: 'TikTok',
  youtube: 'YouTube',
  facebook: 'Facebook',
};

function scriptDescription(rec: ScriptAnalysisRecord): string {
  const s = rec.analysis?.summary?.trim() || '';
  if (s) return s.length > 200 ? `${s.slice(0, 197)}…` : s;
  const p = PLATFORM_LABEL[rec.platform] ?? '';
  return `Phân tích kịch bản video${p ? ` ${p}` : ''}: hook, cấu trúc, timeline, điểm mạnh và bài học rút ra.`;
}

export interface OgOverrides {
  title?: string;
  description?: string;
  image?: string;
}

// Tính title/description/image cuối cùng: override (nếu có) > dữ liệu bản phân tích/branding.
export function resolveScriptOgFields(
  rec: ScriptAnalysisRecord,
  branding: Branding,
  ov?: OgOverrides,
): { title: string; description: string; image: string } {
  const name = (rec.title || '').trim();
  return {
    title: ov?.title?.trim() || (name ? `Phân tích kịch bản: ${name}` : 'Phân tích kịch bản video'),
    description: ov?.description?.trim() || scriptDescription(rec),
    image: ov?.image?.trim() || rec.shareCover || branding.ogImage || branding.logoDuongBan || '',
  };
}
