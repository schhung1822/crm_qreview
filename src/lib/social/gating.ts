// Giới hạn theo GÓI CƯỚC cho Báo cáo Social.
// - Gói FREE: KHÔNG cho xuất file (PDF/DOC/Drive) với mọi báo cáo.
// - Gói FREE + báo cáo FANPAGE Facebook: chỉ xem được phần đầu (định vị, giọng thương hiệu,
//   chân dung khách hàng mục tiêu). Phần phân tích sâu (trụ cột & công thức nội dung, chiến thuật,
//   tổng kết & SWOT) bị KHÓA - server KHÔNG gửi nội dung này về client (ẩn hẳn, không xem lén được).
import type { PlanId } from '../billing/plans';
import type { SocialReportRecord } from './types';

export interface SocialGate {
  viewLocked: boolean; // ẩn phần phân tích sâu ở trang xem (fanpage FREE)
  exportLocked: boolean; // chặn xuất file PDF/DOC/Drive (mọi báo cáo FREE)
}

// Báo cáo có phần phân tích thương hiệu (fanpage) để khóa hay chưa.
function hasFanpageAnalysis(a: SocialReportRecord['analysis'] | undefined): boolean {
  return !!(a && (a.brand || a.tactics || a.summary));
}

export function socialGate(
  planId: PlanId,
  r: Pick<SocialReportRecord, 'platform' | 'analysis'>,
): SocialGate {
  const free = planId === 'free';
  return {
    exportLocked: free,
    viewLocked: free && r.platform === 'facebook' && hasFanpageAnalysis(r.analysis),
  };
}

// Trả về BẢN SAO báo cáo đã BỎ nội dung phân tích sâu (giữ định vị/giọng/chân dung khách hàng).
// Dùng cho gói FREE ở báo cáo fanpage: server gửi bản này thay vì bản đầy đủ.
export function redactFanpageAnalysis(r: SocialReportRecord): SocialReportRecord {
  if (!r.analysis) return r;
  const a = r.analysis;
  return {
    ...r,
    analysis: {
      ...a,
      // Giữ 3 field đầu của brand (positioning/voice/targetAudience), khóa trụ cột & công thức.
      brand: a.brand ? { ...a.brand, contentPillars: [], contentFormulas: [] } : a.brand,
      tactics: undefined,
      summary: undefined,
      compare: undefined,
    },
  };
}
