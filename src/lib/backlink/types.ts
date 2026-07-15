// Kiểu dữ liệu cho tính năng BACKLINK (đi link giữa các bài trên các CMS/site KHÁC NHAU đã kết nối).
// Khác internal link (cùng 1 site): backlink chỉ nối các bài KHÁC SITE và phải thật sự liên quan.

export type BacklinkScanStatus = 'running' | 'done' | 'error';
export type BacklinkPhase = 'fetching' | 'analyzing' | 'done' | 'error';
export type SuggestionStatus = 'suggested' | 'applied' | 'rejected';

// 1 bài trong sơ đồ. id toàn cục = `${connectionId}::${postId}` để không đụng giữa các site.
export interface BacklinkNode {
  id: string;
  connectionId: string;
  siteLabel: string;
  postId: string;
  title: string;
  url?: string;
  inLinks: number;
  outLinks: number;
}

// Cạnh backlink ĐÃ TỒN TẠI (dò được trong HTML): from → to, luôn KHÁC site.
export interface BacklinkEdge {
  from: string;
  to: string;
}

// 1 đề xuất backlink 2 chiều giữa bài A và B (khác site). anchorA = cụm neo trong bài A trỏ tới B.
export interface BacklinkSuggestion {
  id: string;
  aId: string;
  bId: string;
  score: number; // 0-100, chỉ giữ >= NGƯỠNG
  reason: string;
  anchorA: string; // cụm từ trong bài A (trỏ tới B); '' nếu không tìm được neo hợp lệ
  anchorB: string; // cụm từ trong bài B (trỏ tới A)
  status: SuggestionStatus;
  appliedAt?: string;
  error?: string;
}

// Toàn bộ kết quả 1 lần quét (1 biz giữ 1 bản mới nhất). Có tiến độ để UI poll.
export interface BacklinkScan {
  id: string;
  status: BacklinkScanStatus;
  phase: BacklinkPhase;
  sitesTotal: number;
  sitesDone: number;
  postsFound: number;
  nodes: BacklinkNode[];
  edges: BacklinkEdge[];
  suggestions: BacklinkSuggestion[];
  aiError?: string | null;
  siteErrors?: Array<{ connectionId: string; siteLabel: string; error: string }>;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

// Ngưỡng điểm liên quan tối thiểu để giữ 1 đề xuất (chống "đi link bừa").
export const BACKLINK_MIN_SCORE = 70;
