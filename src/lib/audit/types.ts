// Kiểu dữ liệu cho audit toàn website (SEO/AEO/GEO + khả năng AI đọc & trích dẫn).
import type { AuditPatch } from './fix';
import type { PageSpeedResult } from './pagespeed';

export type CheckState = 'pass' | 'warn' | 'fail' | 'info';
export type CheckGroup = 'ai' | 'seo' | 'onpage' | 'aeo' | 'perf';

export interface AuditCheck {
  id: string; // khóa i18n nhãn: audit.c.<id>
  group: CheckGroup;
  state: CheckState;
  value?: string; // dữ liệu ĐỘNG (không dịch): URL, số, danh sách bot…
}

export interface SampledPage {
  url: string;
  seo: number;
  aeo: number;
  geo: number;
  desc?: string; // mô tả do AI sinh (nếu chọn AI khi quét)
}

export interface AuditReport {
  url: string; // URL người dùng nhập
  finalUrl: string; // sau redirect
  fetchedAt: string; // ISO
  checks: AuditCheck[];
  scores: { seo: number; aeo: number; geo: number }; // trung bình trang mẫu
  pages: SampledPage[];
  pagesScanned: number;
  notes: string[]; // mã thông báo (i18n audit.note.<x>)
  fixes: AuditPatch[]; // bản vá copy-paste cho lỗi hạ tầng/site
  // Nếu host của site trùng 1 kết nối CMS đã lưu → cho phép "Sửa bằng AI".
  connection?: { id: string; label: string; provider: string };
  // Kết quả PageSpeed đầy đủ (4 điểm Lighthouse + chỉ số lab + CrUX) cho 2 chiến lược.
  performance?: { mobile?: PageSpeedResult; desktop?: PageSpeedResult };
}
