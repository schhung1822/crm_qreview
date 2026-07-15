// Kiểu dữ liệu tính năng PHÂN TÍCH KỊCH BẢN VIDEO/REELS (TikTok/YouTube/Facebook).
// Dán link → lấy transcript (Apify) → AI phân tích sâu → lưu làm tài liệu tham khảo.
import type { VideoPlatform } from '../social/detect';

export type { VideoPlatform };
export type ScriptStatus = 'running' | 'done' | 'error';
export type ScriptPhase = 'transcript' | 'analyzing' | 'done' | 'error';
export type TranscriptSource = 'subtitle' | 'stt' | 'inline' | 'none';

// Chỉ số tương tác của video (lấy từ metadata Apify trả kèm). Trường nào không có → bỏ.
export interface VideoMetrics {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  author?: string;
}

// 1 đoạn timeline "từ giây .. đến giây .. làm gì".
export interface ScriptTimelineSeg {
  from: string; // vd "0:00"
  to: string; // vd "0:03"
  segment: string; // đang diễn ra gì
  purpose: string; // mục đích của đoạn (giữ chân, dẫn dắt, chốt...)
}

// Kết quả phân tích kịch bản (nhiều mục — dùng làm tài liệu tham khảo).
export interface ScriptAnalysis {
  summary: string; // tóm tắt nội dung video
  contentType: string; // dạng nội dung (review, kể chuyện, hướng dẫn, so sánh...)
  targetAudience: string; // đối tượng nhắm tới
  successReasons: string[]; // vì sao nội dung này thành công
  formula: string; // công thức / cấu trúc kịch bản tổng quát
  hookText: string; // câu/đoạn hook mở đầu
  hookWhy: string; // vì sao hook hiệu quả
  intro: string; // cách giới thiệu/dẫn nhập
  tone: string; // tông giọng, phong cách nói
  pacing: string; // nhịp độ, cách cắt cảnh/chuyển ý
  timeline: ScriptTimelineSeg[]; // bóc tách theo mốc thời gian
  cta: string; // kêu gọi hành động / cách chốt
  strengths: string[]; // điểm mạnh
  improvements: string[]; // điểm có thể cải thiện
  takeaways: string[]; // rút ra để áp dụng cho nội dung của mình
}

export interface ScriptAnalysisRecord {
  id: string;
  url: string;
  platform: VideoPlatform;
  status: ScriptStatus;
  phase: ScriptPhase;
  ai?: { provider?: string; model?: string };
  title?: string; // tiêu đề video (nếu lấy được)
  metrics?: VideoMetrics; // chỉ số tương tác (view/like/comment/share...)
  transcript?: string; // lời thoại đã lấy (đã parse text thuần)
  transcriptSource?: TranscriptSource;
  analysis?: ScriptAnalysis;
  // Chia sẻ công khai (chỉ-xem). Có giá trị = đã bật link. token thô lưu ở đây (dữ liệu của chủ,
  // cô lập theo biz) để chủ copy lại; INDEX toàn cục chỉ lưu HASH (script-shares).
  share?: { token: string; createdAt: string };
  locale: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

// Bản nhẹ cho danh sách lịch sử (không kèm transcript/analysis nặng).
export interface ScriptAnalysisSummary {
  id: string;
  url: string;
  platform: VideoPlatform;
  status: ScriptStatus;
  phase: ScriptPhase;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

export function toScriptSummary(r: ScriptAnalysisRecord): ScriptAnalysisSummary {
  return {
    id: r.id,
    url: r.url,
    platform: r.platform,
    status: r.status,
    phase: r.phase,
    title: r.title,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
